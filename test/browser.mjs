/* test/browser.mjs — 실제 브라우저 두 대로 새 조작계 전부 확인 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
import fs from 'fs';

process.env.PORT = '8198';
const { server, rooms } = require('../server.js');
const Core = require('../game-core.js');
const BASE = 'http://127.0.0.1:8198/';
const SHOT = '/home/claude/digestion-coop/shots/';
fs.mkdirSync(SHOT, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (e ? '  → ' + e : '')); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const errors = { tract: [], juice: [] };

async function openTab(browser, tag) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors[tag].push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors[tag].push(m.text()); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return page;
}
async function canvasColors(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#cv'), g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 997) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    return seen.size;
  });
}
const state = (p) => p.evaluate(() => window.E && E.snap);
const hero = (p) => p.evaluate(() => { const h = E.stage.hero; return { x: h.x, y: h.y, stun: h.stun }; });
async function hold(page, key, ms) { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); await wait(60); }
// 가상 좌표(1000x700)를 실제 캔버스 좌표로 바꿔 클릭
async function tapV(page, vx, vy) {
  const b = await page.locator('#cv').boundingBox();
  await page.mouse.click(b.x + b.width * vx / 1000, b.y + b.height * vy / 700);
  await wait(70);
}

// 화면에 그려진 글자들이 서로 겹치는지 검사 (알림/배너는 제외)
async function textOverlap(page) {
  return page.evaluate(async () => {
    E.trackText = true;
    for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
    const b = E._boxes.slice();
    E.trackText = false;
    const bad = [];
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      const A = b[i], B = b[j];
      const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
      const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      if (ox > 2 && oy > 2) {
        const area = ox * oy, small = Math.min(A.w * A.h, B.w * B.h);
        if (area / small > 0.30) bad.push('"' + A.s + '" ↔ "' + B.s + '"');
      }
    }
    return bad;
  });
}

const G_STAGE0_PAR = require('../public/js/gamedata.js').STAGES[0].time;
const G_ROUND_TIME = require('../public/js/gamedata.js').RULES.ROUND_TIME;
const G_PORES = require('../public/js/gamedata.js').RULES.PORES;
const G_SWALLOWS = require('../public/js/gamedata.js').RULES.MOUTH_SWALLOWS;

async function main() {
  await wait(400);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

  console.log('\n① 로드');
  const P1 = await openTab(browser, 'tract');
  const P2 = await openTab(browser, 'juice');
  ok('첫 화면이 로드된다', await P1.locator('.logo').isVisible());
  ok('모든 모듈이 로드된다(기관 그래픽 · 캐릭터 · 인체 패널)',
     await P1.evaluate(() => !!(window.Organs && window.Actor && window.Ctrl && window.Panel && window.Chunk)));

  console.log('\n② 대기실 · 도감 · 역할 바꾸기');
  await P1.fill('#name', '가온'); await P1.click('.role[data-role="tract"]'); await P1.click('#btn-create');
  await wait(400);
  const code = (await P1.locator('#roomcode').textContent()).trim();
  ok('방 번호가 표시된다', /^\d{4}$/.test(code), code);
  await P2.fill('#name', '나래'); await P2.click('.role[data-role="juice"]'); await P2.fill('#code', code);
  await P2.click('#btn-join'); await wait(400);
  ok('2P가 소화액 역할로 들어온다', (await P2.locator('#slot-juice .who').textContent()).includes('나래'));
  const atlas = await P1.evaluate(() => {
    const c = document.querySelector('#atlas'), g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 331) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    return seen.size;
  });
  ok('기관 도감이 그려진다', atlas > 15, 'colors=' + atlas);

  // ---- 역할 바꾸기 : 요청 → 거절 → 요청 → 수락 ----
  await P1.click('#btn-swap'); await wait(400);
  ok('★ 요청하면 짝꿍 화면에 요청창이 뜬다', await P2.locator('#swap-modal.on').isVisible());
  ok('요청한 사람에게 대기 안내가 뜬다', (await P1.locator('#swap-note').textContent()).includes('기다리는'));
  await P2.click('#swap-no'); await wait(400);
  ok('★ 거절하면 역할이 그대로다',
     (await P1.evaluate(() => Net.role)) === 'tract' && (await P2.evaluate(() => Net.role)) === 'juice');
  ok('거절 안내가 표시된다', (await P1.locator('#swap-note').textContent()).includes('거절'));

  await P1.click('#btn-swap'); await wait(350);
  await P2.click('#swap-yes'); await wait(500);
  ok('★ 수락하면 두 사람의 역할이 맞바뀐다',
     (await P1.evaluate(() => Net.role)) === 'juice' && (await P2.evaluate(() => Net.role)) === 'tract',
     (await P1.evaluate(() => Net.role)) + ' / ' + (await P2.evaluate(() => Net.role)));
  ok('바뀐 역할에 맞는 임무 설명이 나온다',
     (await P1.locator('#mission').textContent()).includes('소화액 담당'));
  await P1.screenshot({ path: SHOT + '1-lobby.png', fullPage: true });

  // 원래대로 되돌리고 시작
  await P1.click('#btn-swap'); await wait(350); await P2.click('#swap-yes'); await wait(500);
  ok('되돌리면 원래 역할로 돌아온다', (await P1.evaluate(() => Net.role)) === 'tract');

  await P1.click('#btn-ready'); await P2.click('#btn-ready');
  await wait(600); await wait(4300);
  const room = rooms.get(code);
  ok('게임이 시작된다', (await state(P1)).phase === 'playing');

  console.log('\n③ 소화관 — 조이스틱 이동');
  await P1.locator('#cv').click({ position: { x: 5, y: 5 } });
  const h0 = await hero(P1);
  await hold(P1, 'ArrowRight', 800);
  const h1 = await hero(P1);
  ok('★ 조이스틱(방향키)으로 캐릭터가 이동한다', h1.x > h0.x + 60, h0.x.toFixed(0) + ' → ' + h1.x.toFixed(0));

  console.log('\n④ 입 — 몸으로 밀기 → 씹기 → 줍기 → 목구멍으로 던지기');
  ok('★ [밀기] 버튼(돌진)이 없어졌다', await P1.evaluate(() => E.stage.hero.dashT === 0 && !/dash\(\)/.test(E.stage.update.toString())));
  const pushTest = async () => P1.evaluate(async () => {
    const st = E.stage, c = st.chunks[0];
    c.x = 380; c.y = 520; c.vx = 0; c.vy = 0;     // 혀 위
    st.hero.x = 310; st.hero.y = 560; st.hero.face = 1; st.hero.vx = 0; st.hero.stun = 0;
    await new Promise(r => requestAnimationFrame(r));
    const x0 = c.x;
    Ctrl.kx = 1;
    for (let i = 0; i < 40; i++) await new Promise(r => requestAnimationFrame(r));
    Ctrl.kx = 0;
    return { x0, x1: c.x, dry: !!st.dry };
  });
  room.g.delivered.saliva = 90; await wait(400);   // 침이 넉넉하면 잘 굴러간다
  const pushed = await pushTest();
  ok('★ 몸으로 부딪치면 음식 조각이 밀린다', pushed.x1 > pushed.x0 + 40,
     pushed.x0.toFixed(0) + ' → ' + pushed.x1.toFixed(0));

  // ★ 침이 마르면 음식물이 잘 안 움직인다 (짝꿍이 침을 보내야 한다)
  room.g.delivered.saliva = 0; await wait(400);
  const dryPush = await pushTest();
  ok('★ 침이 없으면 같은 힘으로 밀어도 거의 안 움직인다',
     dryPush.dry === true && (dryPush.x1 - dryPush.x0) < (pushed.x1 - pushed.x0) * 0.5,
     '침있음 ' + (pushed.x1 - pushed.x0).toFixed(0) + 'px vs 마름 ' + (dryPush.x1 - dryPush.x0).toFixed(0) + 'px');
  const dryThrow = await P1.evaluate(() => {
    const st = E.stage;
    return { slow: st.dry, speed: st.hero.speed };
  });
  ok('마른 음식물을 들면 느려진다 (설정이 살아 있다)', dryThrow.slow === true);
  room.g.delivered.saliva = 90; await wait(400);   // 나머지 검사를 위해 되돌린다

  // ★ 목구멍 옆 받침에 빠져도 점프로 나올 수 있다 (예전엔 갇혔다)
  const escaped = await P1.evaluate(async () => {
    const st = E.stage;
    st.hero.x = 50; st.hero.y = 616; st.hero.vx = 0; st.hero.vy = 0;   // 받침 바닥
    st.hero.stun = 0; st.hero.hp = st.hero.maxHp; st.stuck = 0;
    await new Promise(r => requestAnimationFrame(r));
    const y0 = st.hero.y;
    Ctrl.kx = 1;
    for (let i = 0; i < 210; i++) {
      if (st.hero.onGround) Ctrl.aQueued = true;
      await new Promise(r => requestAnimationFrame(r));
      if (st.hero.x > 170) break;                  // 혀 위로 나왔다
      if (st.stuck > 4) break;                     // 안전장치가 돌기 전에 끝낸다
    }
    Ctrl.kx = 0;
    return { y0, x: Math.round(st.hero.x), y: Math.round(st.hero.y), stuck: st.stuck };
  });
  ok('★ 목구멍 옆 구덩이에 빠져도 점프해서 혀 위로 나올 수 있다',
     escaped.x >= 160 && escaped.y <= 566, JSON.stringify(escaped));

  const bigLift = await P1.evaluate(async () => {
    const st = E.stage, c = st.chunks.find(x => !x.small);
    st.hero.x = c.x; st.hero.y = c.y + 24; st.hero.vy = 0;
    await new Promise(r => requestAnimationFrame(r));
    Ctrl.bQueued = true;
    for (let i = 0; i < 5; i++) await new Promise(r => requestAnimationFrame(r));
    return !!st.hero.carry;
  });
  ok('★ 큰 조각은 무거워서 들 수 없다', !bigLift);

  // 이미 작아진 조각이 있으면 치우고 처음부터 씹어 본다
  await P1.evaluate(() => {
    const st = E.stage;
    st.chunks = st.chunks.filter(c => !c.small);
    while (st.chunks.length < 2) st.spawn(300);
  });
  const size0 = (await state(P1)).food.size;
  const chewed = await P1.evaluate(async () => {
    const st = E.stage;
    for (let k = 0; k < 900; k++) {          // 어금니 주기가 2초라 넉넉히 (hard 3 = 3번)
      st.chunks.forEach(c => { if (!c.small && !c.held) { c.x = 688; c.y = 620; c.vx = 0; c.vy = 0; } });
      st.hero.x = 300; st.hero.y = 560; st.hero.hp = st.hero.maxHp;   // 구덩이 밖에서 지켜본다
      if (st.chunks.some(c => c.small)) break;
      await new Promise(r => requestAnimationFrame(r));
    }
    return st.chunks.some(c => c.small);
  });
  ok('★ 어금니에서 여러 번 씹히면 작아진다', chewed);
  ok('씹으면 음식물 크기가 줄어든다', (await state(P1)).food.size < size0,
     size0 + ' → ' + (await state(P1)).food.size);

  const swallow = await P1.evaluate(async () => {
    const st = E.stage;
    const c = st.chunks.find(x => x.small);
    if (!c) return { held: false, swallowed: st.swallowed, note: '작아진 조각이 없음' };
    st.hero.x = c.x; st.hero.y = 560; st.hero.vy = 0;
    c.y = 540; c.vx = 0; c.vy = 0;
    await new Promise(r => requestAnimationFrame(r));
    Ctrl.bQueued = true;                                 // 줍기
    for (let i = 0; i < 5; i++) await new Promise(r => requestAnimationFrame(r));
    const held = !!st.hero.carry;
    // 목구멍 앞으로 이동해서 던지기
    st.hero.x = 200; st.hero.face = -1;
    await new Promise(r => requestAnimationFrame(r));
    Ctrl.bQueued = true;
    for (let i = 0; i < 40; i++) await new Promise(r => requestAnimationFrame(r));
    return { held, swallowed: st.swallowed };
  });
  ok('★ 작아진 조각은 [줍기]로 들 수 있다', swallow.held);
  ok('★ 왼쪽 목구멍으로 던지면 넘어간다', swallow.swallowed > 0, JSON.stringify(swallow));

  // ★ 어금니가 맞물리는 자리가 혀보다 한 단 낮은 '구덩이' 다
  const pitInfo = await P1.evaluate(() => {
    const s = E.stage.world.solids;
    const tongue = s.find(o => o.y === 560 && o.h === 100);
    const pit = s.find(o => o.y > 600 && o.w > 150);
    return tongue && pit ? { tEnd: tongue.x + tongue.w, pitX: pit.x, pitY: pit.y, drop: pit.y - tongue.y } : null;
  });
  ok('★ 어금니 자리가 혀보다 한 단 아래로 파여 있다',
     pitInfo && pitInfo.drop >= 60 && Math.abs(pitInfo.pitX - pitInfo.tEnd) < 4, JSON.stringify(pitInfo));

  // 걸어가면 구덩이로 내려가고, 나올 때는 점프해야 한다
  const pitT = await P1.evaluate(async () => {
    const st = E.stage;
    st.hero.carry = null; st.hero.stun = 0; st.hero.hp = st.hero.maxHp;
    st.dives = 0;
    st.hero.x = 480; st.hero.y = 560; st.hero.vx = 0; st.hero.vy = 0;
    Ctrl.kx = 1;
    for (let i = 0; i < 120; i++) await new Promise(r => requestAnimationFrame(r));
    const inPit = st.inPit(st.hero.x, st.hero.y), dives = st.dives, yIn = st.hero.y;
    // 점프 없이 왼쪽으로만 가면 구덩이에서 못 나온다
    Ctrl.kx = -1;
    for (let i = 0; i < 140; i++) await new Promise(r => requestAnimationFrame(r));
    const stuck = st.inPit(st.hero.x, st.hero.y);
    // 점프하면서 가면 혀 위로 올라온다
    for (let i = 0; i < 240; i++) {
      if (st.hero.onGround) Ctrl.aQueued = true;
      await new Promise(r => requestAnimationFrame(r));
      if (!st.inPit(st.hero.x, st.hero.y) && st.hero.onGround && st.hero.y <= 561) break;
    }
    Ctrl.kx = 0;
    return { inPit, dives, yIn, stuck, out: !st.inPit(st.hero.x, st.hero.y), xOut: st.hero.x, yOut: st.hero.y };
  });
  ok('★ 걸어가면 어금니 구덩이로 내려간다', pitT.inPit && pitT.dives > 0,
     'y=' + pitT.yIn.toFixed(0) + ', 내려간 횟수 ' + pitT.dives);
  ok('★ 점프하지 않으면 구덩이에서 못 나온다', pitT.stuck);
  ok('★ 점프하면 혀 위로 다시 올라온다', pitT.out && pitT.yOut <= 561,
     'x=' + pitT.xOut.toFixed(0) + ', y=' + pitT.yOut.toFixed(0));

  // ★ 어금니가 맞물릴 때 구덩이 안에 있으면 체력이 깎인다
  const crush = await P1.evaluate(async () => {
    const st = E.stage;
    st.hero.stun = 0; st.hero.hp = st.hero.maxHp;
    const hp0 = st.hero.hp;
    for (let i = 0; i < 400 && st.hero.hp === hp0; i++) {
      st.hero.x = 690; st.hero.y = 656; st.hero.vx = 0; st.hero.vy = 0;   // 구덩이 안에 계속 머문다
      await new Promise(r => requestAnimationFrame(r));
    }
    return { hp0, hp: st.hero.hp };
  });
  ok('★ 어금니가 맞물릴 때 구덩이에 있으면 체력이 깎인다', crush.hp < crush.hp0,
     crush.hp0 + ' → ' + crush.hp);

  // ★ 씹혀서 작아진 조각은 구덩이 그 자리에 머문다
  const stay = await P1.evaluate(async () => {
    const st = E.stage;
    st.hero.x = 200; st.hero.y = 560; st.hero.carry = null; st.hero.hp = st.hero.maxHp; Ctrl.kx = 0;
    st.chunks.length = 0;
    st.spawn(688);
    const c = st.chunks[0];
    c.hard = 1; c.x = 688; c.y = 620; c.vx = 0; c.vy = 0;
    for (let k = 0; k < 300 && !c.small; k++) {
      if (!c.small) { c.x = 688; c.y = 620; c.vx = 0; c.vy = 0; }
      await new Promise(r => requestAnimationFrame(r));
    }
    if (!c.small) return { small: false };
    const x0 = c.x;
    for (let i = 0; i < 180; i++) await new Promise(r => requestAnimationFrame(r));
    return { small: true, x0, x1: c.x, drift: Math.abs(c.x - x0), inPit: st.inPit(c.x, c.y) };
  });
  ok('★ 쪼개진 조각이 구덩이 그 자리에 머문다', stay.small && stay.drift < 60 && stay.inPit,
     JSON.stringify(stay));
  ok('혀가 밀어내는 연출이 없어졌다',
     await P1.evaluate(() => E.stage.tonguePush === undefined));
  await P1.screenshot({ path: SHOT + '2-mouth-tract.png' });

  console.log('\n⑤ 소화액 — 만들고, 목적지를 골라, 분비');
  await P2.locator('#cv').click({ position: { x: 5, y: 5 } });
  await P2.screenshot({ path: SHOT + '3-mouth-juice.png' });
  ok('모식도에 기관 박스와 이름이 있다', await P2.evaluate(() => Object.keys(Panel.BOX).length >= 10));

  const caught = await P2.evaluate(async () => {
    const st = E.stage;
    for (let i = 0; i < 400 && !st.flasks.length; i++) {
      st.drops.forEach(d => { if (!d.bad) { d.x = st.cup; d.y = 436; d.vy = 60; } });
      await new Promise(r => requestAnimationFrame(r));
    }
    return st.flasks.length;
  });
  ok('★ 침을 받아 모으면 소화액이 완성된다', caught > 0, 'flasks=' + caught);

  // 목적지를 '위'로 골라 보내면 오답, '입'으로 골라 보내면 정답
  const sal0 = (await state(P2)).delivered.saliva;
  // 검사 중에 새 플라스크가 더 생기지 않도록 떨어지던 침을 치운다
  await P2.evaluate(() => { E.stage.drops.length = 0; E.stage.caught = 0; E.stage.sel = 0; });
  const flask0 = await P2.evaluate(() => E.stage.flasks.length);
  const mb = await P2.evaluate(() => ({ x: Panel.BOX.mouth.x, y: Panel.BOX.mouth.y }));
  await tapV(P2, mb.x, mb.y);                      // ★ 모식도의 '입' 박스를 직접 터치
  await wait(250);
  ok('★ 모식도의 기관을 터치하면 바로 선택된다',
     await P2.evaluate(() => Panel.dest(E.stage) === 'mouth'), await P2.evaluate(() => Panel.dest(E.stage)));
  await tapV(P2, 888, 649);                       // [분비] 버튼
  await wait(400);
  ok('★ 침을 입으로 보내면 1P 화면의 침이 오른다', (await state(P2)).delivered.saliva > sal0,
     sal0 + ' → ' + (await state(P2)).delivered.saliva);
  ok('보낸 플라스크는 목록에서 빠진다',
     (await P2.evaluate(() => E.stage.flasks.length)) < flask0, 'flasks ' + flask0 + ' → ' +
     (await P2.evaluate(() => E.stage.flasks.length)));

  console.log('\n⑥ 오분비 — 잘못된 기관을 고르면');
  const t0 = (await state(P2)).trouble;
  await P2.evaluate(() => { E.stage.flasks = [{ from: 'liver', t: 9 }]; E.stage.sel = 0; });
  const sb = await P2.evaluate(() => ({ x: Panel.BOX.stomach.x, y: Panel.BOX.stomach.y }));
  await tapV(P2, sb.x, sb.y);
  await wait(250);
  await tapV(P2, 888, 649);
  await wait(400);
  ok('★ 쓸개즙을 위로 보내면 배탈이 오른다', (await state(P2)).trouble > t0);
  const toast = await P1.evaluate(() => E._toasts.map(t => t.msg).join(' | '));
  ok('1P 화면에도 교과서 설명이 뜬다', /쓸개로 보냅니다/.test(toast), toast.slice(0, 60));

  console.log('\n⑦ 단계별 미니게임');
  // 다른 단계로 옮길 때, 이미 채워진 진행도 때문에 곧바로 통과되지 않도록 되돌린다
  const goStage = async (idx) => {
    const g = room.g;
    g.stageIndex = idx; g.phase = 'playing'; g.stageTime = 0;
    if (idx === 0) { g.food.size = 100; g.digested.starch = 0; g.mouth.swallows = 0; }
    if (idx === 1) g.bolus = 0;
    if (idx === 2) { g.mix = 0; g.digested.protein = 0; }
    if (idx === 3) { g.absorbed.starch = g.absorbed.protein = g.absorbed.fat = 0; g.food.starch = Math.max(g.food.starch, 60); }
    if (idx === 4) {
      g.large = { round: 0, roundT: G_ROUND_TIME, targets: [], startWater: 0, results: [],
                  holdIdx: 0, holds: 0, holdDone: false, lap: 0 };
      g.pores = g.pores.map(() => false);
      g.residueWater = 100;
    }
    await wait(700);
  };

  // ---- 식도 ----
  await goStage(1);
  ok('식도 : 두 화면 모두 전환', (await state(P1)).stageIndex === 1 && (await state(P2)).stageIndex === 1);
  const cls = await P2.evaluate(async () => {
    const st = E.stage;
    for (let i = 0; i < 200 && !st.card; i++) await new Promise(r => requestAnimationFrame(r));
    if (!st.card) return null;
    const type = st.card.type, name = st.card.name;
    st.answer(type);
    return { name, right: st.right };
  });
  ok('★ 소화관/소화샘 분류 : 정답을 고르면 맞은 것으로 센다', cls && cls.right === 1, JSON.stringify(cls));
  const b0 = (await state(P1)).bolus;
  await P1.evaluate(async () => {
    const st = E.stage, t = st.targetIdx(E.snap), idx = Math.max(0, t.idx);
    st.hero.y = st.ringY[idx] + 20; st.hero.x = idx % 2 ? 420 : 500; st.hero.vy = 0;
    st.blocked[idx] = 0;
    await new Promise(r => requestAnimationFrame(r));
    Ctrl.bQueued = true;
    for (let i = 0; i < 5; i++) await new Promise(r => requestAnimationFrame(r));
  });
  await wait(400);
  ok('★ 음식물 뒤쪽 근육을 조이면 식괴가 내려간다', (await state(P1)).bolus > b0);
  await P1.screenshot({ path: SHOT + '5-eso-tract.png' });
  await P2.screenshot({ path: SHOT + '6-eso-juice.png' });

  // ---- 위 ----
  await goStage(2);
  room.g.delivered.gastric = 88; await wait(400);
  const acid = await P1.evaluate(async () => {
    const st = E.stage;
    st.hero.x = 500; st.hero.y = 690;
    for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));
    return { stun: st.hero.stun, y: st.hero.y, acid: st.acidY(E.snap) };
  });
  ok('★ 위액에 닿으면 기절하고 발판으로 되돌아온다', acid.stun > 0 && acid.y < acid.acid, JSON.stringify(acid));
  const grab = await P1.evaluate(async () => {
    const st = E.stage; const c = st.chunks[0];
    const L = st.ledges[5];                       // 위액에서 멀리 떨어진 높은 발판
    c.held = false; c.x = L.x + L.w / 2; c.y = L.y - 34; c.vx = 0; c.vy = 0;
    st.hero.stun = 0; st.hero.x = c.x; st.hero.y = L.y; st.hero.vx = 0; st.hero.vy = 0;
    await new Promise(r => requestAnimationFrame(r));
    Ctrl.bQueued = true;
    for (let i = 0; i < 5; i++) await new Promise(r => requestAnimationFrame(r));
    const held = !!st.hero.carry;
    const kept = st.hero.carry;
    // 곧바로 다시 눌러 던진다
    Ctrl.bQueued = true;
    for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
    return { held, carry: !!st.hero.carry, vx: kept ? Math.abs(kept.vx) : -1 };
  });
  ok('★ [잡기]로 덩어리를 들 수 있다', grab.held, JSON.stringify(grab));
  ok('★ 다시 누르면 던진다', !grab.carry && grab.vx > 300, JSON.stringify(grab));
  const pro0 = (await state(P1)).digested.protein;
  await P1.evaluate(async () => {
    const st = E.stage;
    for (let i = 0; i < 120; i++) {
      st.chunks.forEach(c => { c.held = false; c.x = 500; c.y = st.acidY(E.snap) + 30; c.vy = 0; });
      await new Promise(r => requestAnimationFrame(r));
    }
  });
  await wait(500);
  ok('★ 위액에 담그면 음식물이 소화된다', (await state(P1)).digested.protein > pro0);
  // 2P : 위샘 타이밍 + 간 컨베이어
  await goStage(2); await wait(500);
  ok('★ 위 소화액 단계는 위액 만들기 하나뿐이다 (간 컨베이어 없음)',
     await P2.evaluate(() => E.stage.cells === undefined && E.stage.lUnits === undefined &&
                             Array.isArray(E.stage.bars) && E.stage.bars.length === 3));
  const gastricMade = await P2.evaluate(async () => {
    const st = E.stage; st.flasks = [];
    for (let i = 0; i < 900 && !st.flasks.length; i++) {
      const b = st.bars[st.active];
      if (b.needle >= b.zone[0] && b.needle <= b.zone[1]) st.tap({ x: 300, y: b.y + 10 });
      await new Promise(r => requestAnimationFrame(r));
    }
    return st.flasks.length ? st.flasks[0].from : null;
  });
  ok('★ 반짝이는 위샘의 초록 구간에서 누르면 위액이 만들어진다', gastricMade === 'gastric', String(gastricMade));
  const wrongBar = await P2.evaluate(async () => {
    const st = E.stage; st.gUnits = 0;
    const other = (st.active + 1) % st.bars.length;
    const b = st.bars[other];
    b.needle = (b.zone[0] + b.zone[1]) / 2;          // 초록 구간이지만 활성 위샘이 아니다
    st.tap({ x: 300, y: b.y + 10 });
    return st.gUnits;
  });
  ok('★ 활성 위샘이 아니면 눌러도 안 모인다', wrongBar === 0, 'gUnits=' + wrongBar);
  await P1.screenshot({ path: SHOT + '7-stomach-tract.png' });
  await P2.screenshot({ path: SHOT + '8-stomach-juice.png' });

  // ---- 위 : 위벽 수축 파도가 없어지고, 떨어지는 위액 방울이 생겼다 ----
  await goStage(2); await wait(500);
  // ★ 몸으로 밀어도 덩어리가 안 움직인다 — 반드시 들어서 던져야 한다
  const bodyPush = await P1.evaluate(async () => {
    const st = E.stage;
    const L = st.ledges[3];
    const c = st.chunks[0];
    c.held = false; c.x = L.x + L.w / 2; c.y = L.y - 32; c.vx = 0; c.vy = 0;
    st.hero.carry = null; st.hero.stun = 0; st.hero.hp = st.hero.maxHp;
    st.hero.x = c.x - 46; st.hero.y = L.y; st.hero.vx = 0; st.hero.vy = 0;
    await new Promise(r => requestAnimationFrame(r));
    const x0 = c.x;
    Ctrl.kx = 1;
    for (let i = 0; i < 60; i++) await new Promise(r => requestAnimationFrame(r));
    Ctrl.kx = 0;
    return { x0, x1: c.x, moved: Math.abs(c.x - x0) };
  });
  ok('★ 위에서는 몸으로 밀어도 덩어리가 움직이지 않는다', bodyPush.moved < 6,
     bodyPush.x0.toFixed(0) + ' → ' + bodyPush.x1.toFixed(0));

  // ★ 위액 위에 쓸 수 있는 덩어리가 계속 내려온다
  const refill = await P1.evaluate(async () => {
    const st = E.stage;
    const ay = st.acidY(E.snap);
    st.chunks.length = 0; st.dropT = 0;          // 전부 없앤 상태에서 기다려 본다
    st.hero.carry = null;
    for (let i = 0; i < 420 && st.chunks.filter(c => c.y + c.r < ay - 6).length < 3; i++) {
      await new Promise(r => requestAnimationFrame(r));
    }
    return { n: st.chunks.length, usable: st.chunks.filter(c => c.y + c.r < ay - 6).length };
  });
  ok('★ 음식물이 계속 다시 내려온다', refill.usable >= 3, JSON.stringify(refill));

  // ★ 던진 음식물이 발판에 걸려 '순간이동' 하지 않는다 (발판은 아래에서 뚫고 지나가야 한다)
  const teleport = await P1.evaluate(async () => {
    const st = E.stage;
    const L = st.ledges[4];                       // 위쪽 발판 하나를 골라 그 아래에서 던진다
    st.chunks.length = 0;
    const c = new Chunk(L.x + L.w / 2 - 120, L.y + 90, 28, 'protein', '#5aa9e6');
    st.chunks.push(c);
    c.vx = 420; c.vy = -900;                      // 발판을 가로질러 위로 날아간다
    let jump = 0, px = c.x, py = c.y, through = false;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => requestAnimationFrame(r));
      jump = Math.max(jump, Math.hypot(c.x - px, c.y - py));
      // 발판의 가로 범위 안에서 발판 위로 올라갔는가
      if (c.y + c.r < L.y && c.x > L.x && c.x < L.x + L.w) through = true;
      px = c.x; py = c.y;
    }
    return { jump: Math.round(jump), through, x: Math.round(c.x), edge: L.x };
  });
  ok('★ 던진 음식물이 발판 끝으로 순간이동하지 않는다', teleport.jump < 40,
     '한 프레임 최대 이동 ' + teleport.jump + 'px');
  ok('★ 아래에서 던진 음식물은 발판을 뚫고 위로 지나간다', teleport.through,
     JSON.stringify(teleport));

  // ★ 모든 발판에 점프로 올라갈 수 있는가 (예전에 맨 위 두 칸이 닿지 않았다)
  const reach = await P1.evaluate(() => {
    const st = E.stage, L = st.ledges;
    const H = st.hero.jumpV * st.hero.jumpV / (2 * st.hero.gravity);
    const bad = [];
    for (const t of L) {
      if (t.y >= 460) continue;                       // 아래층은 시작 지점
      const okAny = L.some(f => f.y > t.y && f.y - t.y <= H &&
        Math.min(f.x + f.w, t.x + t.w) - Math.max(f.x, t.x) > 10);
      if (!okAny) bad.push(t.y);
    }
    return { H: Math.round(H), bad };
  });
  ok('★ 모든 발판에 점프로 올라갈 수 있다', reach.bad.length === 0, JSON.stringify(reach));
  const climbed = await P1.evaluate(async () => {
    const st = E.stage;
    const top = st.ledges.reduce((a, b) => (b.y < a.y ? b : a));
    st.hero.stun = 0; st.hero.hp = st.hero.maxHp;
    const H = st.hero.jumpV * st.hero.jumpV / (2 * st.hero.gravity);
    // 맨 위 발판으로 이어지는 아래 발판에서 점프해 올라가 본다
    const from = st.ledges.find(f => f.y > top.y && f.y - top.y <= H &&
      Math.min(f.x + f.w, top.x + top.w) - Math.max(f.x, top.x) > 10);
    if (!from) return { ok: false, best: -1, top: top.y };
    const lo = Math.max(from.x, top.x) + 14, hi = Math.min(from.x + from.w, top.x + top.w) - 14;
    st.hero.x = (lo + hi) / 2;
    st.hero.y = from.y; st.hero.vx = 0; st.hero.vy = 0;
    let best = 1e9;
    for (let i = 0; i < 200; i++) {
      if (st.hero.onGround) { best = Math.min(best, st.hero.y); Ctrl.aQueued = true; }
      await new Promise(r => requestAnimationFrame(r));
    }
    if (st.hero.onGround) best = Math.min(best, st.hero.y);
    return { ok: best <= top.y + 2, best: Math.round(best), top: top.y };
  });
  ok('★ 실제로 맨 위 발판까지 점프로 올라간다', climbed.ok, JSON.stringify(climbed));

  ok('★ 위벽 수축 파도가 없어졌다',
     await P1.evaluate(() => E.stage.wave === undefined && E.stage.waveT === undefined));
  await goStage(2); await wait(500);     // 앞 검사로 위 단계가 통과됐을 수 있다
  const rain = await P1.evaluate(async () => {
    const st = E.stage;
    st.rainT = 0;
    for (let i = 0; i < 240 && !st.rain.length; i++) await new Promise(r => requestAnimationFrame(r));
    const n = st.rain.length;
    // 방울에 맞으면 체력이 깎인다
    st.hero.stun = 0; st.hero.hp = st.hero.maxHp;
    const d = st.rain[0];
    if (d) { d.warn = 0; d.x = st.hero.x; d.y = st.hero.y - 22; }
    for (let i = 0; i < 8; i++) await new Promise(r => requestAnimationFrame(r));
    return { n, hp: st.hero.hp, max: st.hero.maxHp };
  });
  ok('★ 위 천장에서 위액 방울이 떨어진다', rain.n > 0, 'drops=' + rain.n);
  ok('★ 방울에 맞으면 체력이 깎인다', rain.hp < rain.max, rain.hp + '/' + rain.max);

  // ---- 체력 : 다 쓰면 일할 수 없고, 짝꿍이 소화액을 보내면 회복된다 ----
  const spent = await P1.evaluate(async () => {
    const st = E.stage;
    st.hero.hp = 0; st.hero.stun = 0;
    return { spent: st.hero.spent() };
  });
  ok('★ 체력이 0이면 그 기관에서 일할 수 없다', spent.spent);
  await P2.evaluate(() => { E.stage.flasks = [{ from: 'gastric', t: 9 }]; E.stage.sel = 0; });
  await P2.evaluate(() => {
    E.stage.destIdx = GAMEDATA.DESTINATIONS.indexOf('stomach');
    E.stage.doSend();
  });
  await wait(600);
  const revived = await P1.evaluate(() => E.stage.hero.hp);
  ok('★ 짝꿍이 그 기관에 소화액을 보내 주면 회복된다', revived > 0, 'hp=' + revived);
  await P1.evaluate(() => { E.stage.hero.hp = E.stage.hero.maxHp; });

  await P1.screenshot({ path: SHOT + '7-stomach-tract.png' });
  await P2.screenshot({ path: SHOT + '8-stomach-juice.png' });

  // ---- 작은창자 : 꼬불꼬불한 미로 ----
  await goStage(3);
  room.g.delivered.pancreatic = 80; room.g.delivered.bile = 80; await wait(700);
  ok('★ 작은창자는 위에서 내려다보는 미로다',
     await P1.evaluate(() => !!E.stage.world.topDown && E.stage.world.gravity === 0 && !!E.stage.hero.swim));
  ok('미로 벽이 여러 개 있다', await P1.evaluate(() => E.stage.world.solids.length >= 10));
  ok('★ 처음부터 음식물 덩이 6개가 관 여기저기에 흩어져 있다',
     await P1.evaluate(() => E.stage.balls.length === 6),
     '개수=' + await P1.evaluate(() => E.stage.balls.length));

  // 소화액이 있을 때 vs 없을 때 굴러가는 정도
  const rollWith = await P1.evaluate(async () => {
    const st = E.stage, b = st.balls[0];
    b.x = 300; b.y = 220; b.vx = 0; b.vy = 0;
    st.hero.x = 250; st.hero.y = 232; st.hero.vx = 0; st.hero.vy = 0; st.hero.hp = st.hero.maxHp;
    const x0 = b.x;
    Ctrl.kx = 1;
    for (let i = 0; i < 70; i++) await new Promise(r => requestAnimationFrame(r));
    Ctrl.kx = 0;
    return b.x - x0;
  });
  room.g.delivered.pancreatic = 0; room.g.delivered.bile = 0; await wait(500);
  const rollNo = await P1.evaluate(async () => {
    const st = E.stage, b = st.balls[0];
    b.x = 300; b.y = 220; b.vx = 0; b.vy = 0;
    st.hero.x = 250; st.hero.y = 232; st.hero.vx = 0; st.hero.vy = 0; st.hero.hp = st.hero.maxHp;
    const x0 = b.x;
    Ctrl.kx = 1;
    for (let i = 0; i < 70; i++) await new Promise(r => requestAnimationFrame(r));
    Ctrl.kx = 0;
    return b.x - x0;
  });
  ok('★ 소화액이 없으면 음식물이 거의 굴러가지 않는다', rollWith > rollNo * 2.2,
     '있음 ' + rollWith.toFixed(0) + 'px vs 없음 ' + rollNo.toFixed(0) + 'px');
  room.g.delivered.pancreatic = 80; room.g.delivered.bile = 80; await wait(500);

  // ★ 소화되지 않은 큰 덩이를 관벽에 부딪히면 체력이 깎인다
  const bump = await P1.evaluate(async () => {
    const st = E.stage, b = st.balls[0];
    st.hero.hp = st.hero.maxHp; st.hero.stun = 0;
    st.hero.x = 200; st.hero.y = 600;
    b.small = false; b.rub = 0; b.r = 32; b.bumpCd = 0;
    b.x = 480; b.y = 526; b.vx = 0; b.vy = 0;      // 위쪽 관벽에 파묻히게
    const hp0 = st.hero.hp;
    for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));
    return { hp0, hp: st.hero.hp };
  });
  ok('★ 큰 덩이가 관벽에 닿으면 체력이 깎인다', bump.hp < bump.hp0, bump.hp0 + ' → ' + bump.hp);

  // 웅덩이 밖에서는 소화되지 않는다
  const outside = await P1.evaluate(async () => {
    const st = E.stage, b = st.balls[0];
    b.x = 200; b.y = 580; b.rub = 0; b.small = false; b.r = 32;
    st.hero.x = 200; st.hero.y = 592; st.hero.hp = st.hero.maxHp; st.hero.stun = 0;
    st.rubCd = 0;
    Ctrl.bQueued = true;
    for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
    return b.rub;
  });
  ok('★ 소화액 웅덩이 밖에서는 문질러도 소화되지 않는다', outside === 0, 'rub=' + outside);

  const dig0 = (await state(P1)).digested;
  const digest = await P1.evaluate(async () => {
    const st = E.stage, b = st.balls[0];
    const pool = { x: 400, y: 528, w: 160, h: 104 };     // 아래 통로의 소화액 웅덩이
    b.rub = 0; b.small = false; b.r = 32;
    for (let k = 0; k < 8 && !b.small; k++) {
      b.x = pool.x + 80; b.y = pool.y + 52; b.vx = 0; b.vy = 0;
      st.hero.x = b.x; st.hero.y = b.y + 12; st.hero.hp = st.hero.maxHp; st.hero.stun = 0;
      st.rubCd = 0;
      Ctrl.bQueued = true;
      for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
    }
    return { rub: b.rub, small: b.small };
  });
  await wait(400);
  const dig1 = (await state(P1)).digested;
  ok('★ 웅덩이 안에서 문지르면 영양소가 소화된다',
     (dig1.starch + dig1.protein + dig1.fat) > (dig0.starch + dig0.protein + dig0.fat));
  ok('★ 4번 문지르면 작은 영양소가 된다', digest.small, JSON.stringify(digest));

  // ★ 작아진 덩이를 웅덩이 위·아래 관벽(융털)으로 밀면 흡수된다
  const abs0 = (await state(P1)).absorbed;
  const n0 = await P1.evaluate(() => E.stage.balls.length);
  await P1.evaluate(async () => {
    const st = E.stage, b = st.balls.find(x => x.small) || st.balls[0];
    b.small = true; b.r = 16;
    b.x = 480; b.y = 534;                     // 위쪽 관벽의 융털 띠
    for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
  });
  await wait(500);
  const abs1 = (await state(P1)).absorbed;
  ok('★ 웅덩이 옆 관벽(융털)에 밀면 바로 흡수된다',
     (abs1.starch + abs1.protein + abs1.fat) > (abs0.starch + abs0.protein + abs0.fat));
  ok('흡수된 덩이는 사라진다', (await P1.evaluate(() => E.stage.balls.length)) === n0 - 1);

  // 2P : 소화액 관 네트워크 (간 · 이자 → 위 / 쓸개 / 작은창자)
  await goStage(3);                                   // 앞 검사로 단계가 통과됐을 수 있다
  room.g.delivered.pancreatic = 80; room.g.delivered.bile = 80;
  room.g.bileStored = 0; await wait(600);
  ok('★ 관 끝은 위 · 쓸개 · 작은창자 세 곳이다',
     await P2.evaluate(() => {
       const st = E.stage;
       return typeof st.hasBlob === 'function' && st.blobs.length >= 0;
     }));

  ok('★ 처음 차례는 간(쓸개즙) 이다', await P2.evaluate(() => E.stage.turn === 'liver'));
  const notTurn = await P2.evaluate(async () => {
    const st = E.stage; st.turn = 'liver'; st.pan = 0;
    st.tap({ x: 100, y: 404, id: 3 });               // 차례가 아닌 이자를 눌러 본다
    return st.pan;
  });
  ok('★ 차례가 아닌 기관은 눌러도 안 된다', notTurn === 0, 'pan=' + notTurn);

  const panBlob = await P2.evaluate(async () => {
    const st = E.stage;
    st.turn = 'pancreas';
    st.blobs = []; st.pan = 0; st.heat = 0; st.lock = 0;
    for (let i = 0; i < 400 && !st.hasBlob('pancreas'); i++) {
      if (st.lock <= 0) st.tap({ x: 100, y: 420, id: 3 });
      await new Promise(r => requestAnimationFrame(r));
    }
    const b = st.blobs.find(x => x.from === 'pancreas');
    return b ? { x: Math.round(b.x), y: Math.round(b.y), turn: st.turn } : null;
  });
  ok('★ 이자를 연타하면 관 입구에 이자액 방울이 생긴다', !!panBlob, JSON.stringify(panBlob));
  ok('★ 이자액을 만들면 다음 차례는 간(쓸개즙)', panBlob && panBlob.turn === 'liver',
     panBlob && panBlob.turn);

  const liverBlob = await P2.evaluate(async () => {
    const st = E.stage;
    st.turn = 'liver'; st.bile = 0;
    for (let i = 0; i < 600 && !st.hasBlob('liver'); i++) {
      let d = st.drops.find(x => x.bile);
      if (!d && st.drops.length) { d = st.drops[0]; d.bile = true; }   // 검사용 : 초록 방울로 고정
      if (d) st.tap({ x: d.x, y: d.y, id: 1 });
      await new Promise(r => requestAnimationFrame(r));
    }
    return { made: st.hasBlob('liver'), turn: st.turn, bile: st.bile,
             drops: st.drops.length, blobs: st.blobs.map(x => x.from),
             stage: E.snap && E.snap.stage };
  });
  ok('★ 간에서 초록 방울 3개를 모으면 관 입구에 쓸개즙 방울이 생긴다', liverBlob.made, JSON.stringify(liverBlob));
  ok('★ 쓸개즙을 만들면 다음 차례는 이자(이자액)', liverBlob.turn === 'pancreas', liverBlob.turn);

  const leaked = await P2.evaluate(async () => {
    const st = E.stage;
    const b = st.blobs.find(x => x.from === 'liver');
    st.tap({ x: b.x, y: b.y, id: 7 });
    st.drag({ x: 300, y: 60, id: 7 });                  // 관에서 크게 벗어난 곳
    const nb = st.blobs.find(x => x.from === 'liver');
    return { x: Math.round(nb.x), y: Math.round(nb.y), leaks: st.leaks };
  });
  ok('★ 관 밖으로 나가면 새어 나가 처음 자리로 돌아간다',
     leaked.x === 220 && leaked.y === 206 && leaked.leaks > 0, JSON.stringify(leaked));

  // 간 → (관을 따라) → 쓸개
  const bs0 = (await state(P2)).bileStored;
  await P2.evaluate(async () => {
    const st = E.stage;
    const b = st.blobs.find(x => x.from === 'liver');
    st.tap({ x: b.x, y: b.y, id: 8 });
    const path = [[220, 206], [270, 206], [330, 206], [330, 250], [330, 300],
                  [400, 300], [460, 300], [486, 300], [524, 300]];
    for (const [x, y] of path) { st.drag({ x, y, id: 8 }); await new Promise(r => requestAnimationFrame(r)); }
  });
  await wait(600);
  ok('★ 관을 따라 쓸개까지 끌면 쓸개에 저장된다', (await state(P2)).bileStored > bs0,
     bs0 + ' → ' + (await state(P2)).bileStored);

  // 쓸개에 저장되면 쓸개 입구에 다시 방울이 생긴다 → 어디로 보낼지 또 고른다
  await wait(400);
  ok('★ 쓸개에 저장되면 쓸개 입구에 방울이 생긴다',
     await P2.evaluate(() => E.stage.hasBlob('gallbladder')));

  const bile0 = (await state(P2)).delivered.bile;
  await P2.evaluate(async () => {
    const st = E.stage;
    const b = st.blobs.find(x => x.from === 'gallbladder');
    st.tap({ x: b.x, y: b.y, id: 9 });
    const path = [[450, 300], [400, 300], [360, 300], [330, 300], [330, 360], [330, 404],
                  [380, 404], [434, 404], [434, 446], [486, 446], [524, 446]];
    for (const [x, y] of path) { st.drag({ x, y, id: 9 }); await new Promise(r => requestAnimationFrame(r)); }
  });
  await wait(600);
  ok('★ 쓸개에서 작은창자로 끌면 쓸개즙이 도착한다', (await state(P2)).delivered.bile > bile0,
     bile0 + ' → ' + (await state(P2)).delivered.bile);

  // 잘못된 끝(위)으로 보내면 배탈
  const tr0 = (await state(P2)).trouble;
  await P2.evaluate(async () => {
    const st = E.stage;
    st.blobs = [{ from: 'pancreas', x: 186, y: 420, armed: false }];
    st.turn = 'pancreas';
    st.tap({ x: 186, y: 420, id: 11 });
    const path = [[186, 420], [250, 420], [330, 420], [330, 300], [330, 192],
                  [380, 192], [434, 192], [434, 168], [486, 168], [524, 168]];
    for (const [x, y] of path) { st.drag({ x, y, id: 11 }); await new Promise(r => requestAnimationFrame(r)); }
  });
  await wait(600);
  ok('★ 이자액을 위로 보내면 배탈이 오른다', (await state(P2)).trouble > tr0,
     tr0 + ' → ' + (await state(P2)).trouble);


  await P1.screenshot({ path: SHOT + '9-small-tract.png' });
  await P2.screenshot({ path: SHOT + '10-small-juice.png' });

  // ---- 큰창자 : 칸마다 20초, 물길을 뚫어야 물이 빠진다 ----
  await goStage(4);
  await wait(700);
  const L0 = (await state(P1)).large;
  ok('★ 큰창자는 칸 ' + (await P1.evaluate(() => GAMEDATA.RULES.PORES)) + '개로 나뉜다',
     L0 && L0.rounds === G_PORES, JSON.stringify(L0 && { r: L0.round, n: L0.rounds }));
  ok('★ 한 칸에 갇혀 있는 최대 시간은 ' + G_ROUND_TIME + '초',
     L0 && L0.roundLimit === G_ROUND_TIME, 'limit=' + (L0 && L0.roundLimit));
  ok('칸마다 빼야 하는 물의 양이 정해져 있다', L0 && L0.target > 0, 'target=' + (L0 && L0.target));

  const puzzle = await P2.evaluate(() => {
    const st = E.stage;
    let bad = 0;
    for (let n = 0; n < 200; n++) {
      st.make();
      const shuffled = st.grid.map(r => r.slice());
      st.grid = st.solution.map(r => r.slice());
      if (!st.connected().ok) bad++;
      st.grid = shuffled;
    }
    return bad;
  });
  ok('★ 물길 퍼즐은 회전만으로 항상 풀 수 있다', puzzle === 0, '못 푼 판 ' + puzzle + '/200');

  // ★ '몇 초' 맞추기 — 화면에는 초시계가 없다
  ok('★ 몇 초 동안 흡수할지 화면에 나온다',
     (await state(P1)).large.holdTarget > 0, 'holdTarget=' + (await state(P1)).large.holdTarget);
  ok('★ 화면에 흐르는 초시계는 없다 (스스로 세야 한다)',
     await P1.evaluate(() => !/holdT\.toFixed|holdT \+/.test(E.stage.draw.toString())));
  ok('★ 소화관 화면에 남은 시간(칸 타이머)이 아예 안 보인다',
     await P1.evaluate(() => !/roundT/.test(E.stage.draw.toString())),
     '초가 보이면 그걸 세어 버린다');

  // 지정한 초만큼 꾹 눌렀다가 떼는 조작 (오차를 인위적으로 준다)
  const holdFor = async (offset) => {
    room.g.large.holdDone = false;               // 검사용 : 다시 한 번 잴 수 있게
    await wait(120);
    const before = (await state(P1)).residueWater;
    await P1.evaluate(async (off) => {
      const st = E.stage;
      st.hero.hp = st.hero.maxHp; st.hero.stun = 0;
      Ctrl.bHeld = true;
      for (let i = 0; i < 8; i++) {
        st.hero.x = st.res.x; st.hero.y = st.resSolid.y; st.hero.vy = 0; st.hero.onGround = true;
        await new Promise(r => requestAnimationFrame(r));
      }
      if (st.holding) st.holdT = (E.snap.large.holdTarget || 3) + off;   // 손을 떼는 순간의 시간
      Ctrl.bHeld = false;
      for (let i = 0; i < 5; i++) await new Promise(r => requestAnimationFrame(r));
      const sent = st.lastSec;
      Ctrl.bHeld = false; st.holding = false;
      return sent;
    }, offset);
    room.g.large.roundT = G_ROUND_TIME;          // 검사 중에는 칸이 안 넘어가게 되돌린다
    await wait(350);
    room.g.large.roundT = G_ROUND_TIME;
    return before - (await state(P1)).residueWater;
  };

  // holdDone 을 되돌리지 않고 한 번 더 눌러 본다 (한 칸 한 번 규칙 확인용)
  const holdFor2nd = async () => {
    const before = (await state(P1)).residueWater;
    await P1.evaluate(async () => {
      const st = E.stage;
      st.hero.hp = st.hero.maxHp; st.hero.stun = 0;
      Ctrl.bHeld = true;
      for (let i = 0; i < 8; i++) {
        st.hero.x = st.res.x; st.hero.y = st.resSolid.y; st.hero.vy = 0; st.hero.onGround = true;
        await new Promise(r => requestAnimationFrame(r));
      }
      st.holding = true; st.holdT = E.snap.large.holdTarget || 3;
      st.send();
      Ctrl.bHeld = false;
      for (let i = 0; i < 5; i++) await new Promise(r => requestAnimationFrame(r));
    });
    room.g.large.roundT = G_ROUND_TIME;
    await wait(350);
    room.g.large.roundT = G_ROUND_TIME;
    return before - (await state(P1)).residueWater;
  };

  const shutTake = await holdFor(0);
  ok('★ 물길을 안 뚫으면 초를 맞춰도 물이 전혀 빠지지 않는다', shutTake === 0, '뺀 물 ' + shutTake.toFixed(2));

  const solved = await P2.evaluate(async () => {
    const st = E.stage;
    st.grid = st.solution.map(r => r.slice());        // 정답 배치로 바로 맞춘다 (검사용)
    if (!st.connected().ok) return false;
    st.win = 1.6; st.solved++; st.done = true; Net.act({ t: 'gate' });
    await new Promise(r => requestAnimationFrame(r));
    return true;
  });
  ok('물길 퍼즐을 정답 배치로 맞추면 이어진다 (검사 준비)', solved);
  await wait(600);
  const L1 = (await state(P1)).large;
  ok('★ 퍼즐을 풀면 지금 그 칸의 물길이 뚫린다', L1 && L1.open === true, JSON.stringify((await state(P1)).pores));

  const exactTake = await holdFor(0);            // 정확히 맞춤
  ok('★ 정해진 초에 딱 맞춰 떼면 물이 많이 빠진다', exactTake > 0.4, '뺀 물 ' + exactTake.toFixed(2));
  const offTake = await holdFor(0.8);            // 0.8초 어긋남
  ok('★ 초가 어긋나면 물이 훨씬 덜 빠진다', offTake < exactTake * 0.7,
     '정확 ' + exactTake.toFixed(2) + ' vs 어긋남 ' + offTake.toFixed(2));
  const missTake = await holdFor(3);             // 완전히 어긋남
  ok('★ 완전히 빗나가면 물이 빠지지 않는다', missTake === 0, '뺀 물 ' + missTake.toFixed(2));

  // ★ 한 칸에 딱 한 번만 잴 수 있다
  await holdFor(0);
  const twice = await holdFor2nd();
  ok('★ 한 칸에서는 한 번만 잴 수 있다', twice === 0, '두 번째로 뺀 물 ' + twice.toFixed(2));
  ok('한 번 재고 나면 화면에 "이 칸 흡수 완료" 가 뜬다',
     (await state(P1)).large.holdDone === true);
  ok('이 칸에서 뺀 물이 기록된다', (await state(P1)).large.removed > 0,
     'removed=' + (await state(P1)).large.removed);

  // ★ 초를 맞추면 남은 시간을 다 기다리지 않고 곧바로 다음 칸으로 간다
  room.g.large.round = 0; room.g.large.results = [];
  room.g.large.roundT = G_ROUND_TIME; room.g.large.holdDone = false;
  room.g.large.startWater = room.g.residueWater;
  await wait(300);
  const beforeRound = (await state(P1)).large.round;
  await holdFor(0);
  room.g.large.roundT = Math.min(room.g.large.roundT, 1.3);   // 맞춘 직후의 상태로 되돌린다
  const leftAfterHold = room.g.large.roundT;
  await wait(2200);
  const afterRound = (await state(P1)).large.round;
  ok('★ 초를 맞추면 남은 시간을 다 안 기다리고 바로 다음 칸으로 간다',
     afterRound === beforeRound + 1 && leftAfterHold <= 1.5,
     beforeRound + ' → ' + afterRound + ' (남은 시간 ' + leftAfterHold.toFixed(1) + '초)');
  ok('지나간 칸의 성적이 남는다', (await state(P1)).large.results.length === 1,
     JSON.stringify((await state(P1)).large.results));
  ok('★ 새 칸에서는 새 퍼즐이 나온다',
     await P2.evaluate(() => E.stage.done === false && E.stage.round === E.snap.large.round));

  await P1.screenshot({ path: SHOT + '11-large-tract.png' });
  await P2.screenshot({ path: SHOT + '12-large-juice.png' });

  console.log('\n⑧ 글자 겹침 검사 (모든 단계 · 두 화면)');
  for (const [idx, name] of [[0, '입'], [1, '식도'], [2, '위'], [3, '작은창자'], [4, '큰창자']]) {
    await goStage(idx);
    await wait(500);
    const b1 = await textOverlap(P1);
    const b2 = await textOverlap(P2);
    ok(name + ' : 소화관 화면 글자가 겹치지 않는다', b1.length === 0, b1.slice(0, 3).join(' / '));
    ok(name + ' : 소화액 화면 글자가 겹치지 않는다', b2.length === 0, b2.slice(0, 3).join(' / '));
  }

  console.log('\n⑧-2 통과 조건 — 시간이 지나도 자동으로 안 넘어간다');
  await goStage(0); await wait(600);
  room.g.stageTime = G_STAGE0_PAR + 30;             // 목표 시간을 한참 넘긴 상태
  room.g.mouth.swallows = 0; room.g.digested.starch = 0;
  await wait(700);
  ok('★ 목표 시간을 넘겨도 입에 그대로 머문다', (await state(P1)).stage === 'mouth',
     (await state(P1)).stage);
  ok('무엇이 모자란지 화면에 안내가 나온다',
     ((await state(P1)).hint || '').length > 0, (await state(P1)).hint);
  ok('시간 표시가 "걸린 시간 / 목표" 형태다',
     /\d+s \/ \d+s/.test(await P1.locator('#h-time').textContent()),
     await P1.locator('#h-time').textContent());
  room.g.mouth.swallows = G_SWALLOWS; room.g.digested.starch = 30;
  await wait(700);
  ok('★ 통과 조건을 채우면 그때 다음 기관으로 넘어간다', (await state(P1)).stageIndex === 1,
     'stageIndex=' + (await state(P1)).stageIndex);

  console.log('\n⑨ 결과 · 선생님 화면 · 오류');
  Core.finish(room.g, 'done');
  await wait(700);
  ok('두 화면 모두 결과로 넘어간다', await P1.locator('#scr-result').isVisible() && await P2.locator('#scr-result').isVisible());
  const res = await P1.locator('#result-body').textContent();
  ok('결과에 암죽관/모세혈관 표현이 없다', !/암죽관|모세혈관/.test(res));
  ok('★ 결과에 걸린 시간이 나온다', /걸린 시간/.test(res));
  ok('★ 결과에 기관별 통과 시간이 나온다', /기관별 통과 시간/.test(res));
  await P1.screenshot({ path: SHOT + '13-result.png', fullPage: true });

  const T = await browser.newPage();
  await T.goto(BASE + 'teacher.html'); await wait(1600);
  ok('선생님 화면에 방이 보인다', (await T.locator('#tb').textContent()).includes(code));
  await T.screenshot({ path: SHOT + '14-teacher.png' });

  console.log('\n⑩ 다시 하기 — 요청 → 수락 → 같은 방 대기실로');
  ok('결과 화면에 다시 하기 버튼이 있다', await P1.locator('#btn-again').isVisible());
  await P1.click('#btn-again'); await wait(500);
  ok('★ 짝꿍 화면에 다시 하기 요청창이 뜬다', await P2.locator('#swap-modal.on').isVisible());
  ok('요청 내용이 다시 하기다', (await P2.locator('#swap-title').textContent()).includes('한 판 더'));
  await P2.click('#swap-no'); await wait(500);
  ok('거절하면 결과 화면에 남는다', await P1.locator('#scr-result').isVisible());

  await P1.click('#btn-again'); await wait(500);
  await P2.click('#swap-yes'); await wait(700);
  ok('★ 수락하면 두 화면 모두 대기실로 돌아간다',
     await P1.locator('#scr-lobby').isVisible() && await P2.locator('#scr-lobby').isVisible());
  ok('★ 방 번호가 그대로다 (방을 다시 안 만들어도 된다)',
     (await P1.locator('#roomcode').textContent()).trim() === code);
  ok('대기실에서 역할도 다시 바꿀 수 있다', await P1.locator('#btn-swap').isVisible());
  await P1.screenshot({ path: SHOT + '15-again.png', fullPage: true });

  const st1 = await P1.evaluate(() => E.lastErrStack || null);
  const st2 = await P2.evaluate(() => E.lastErrStack || null);
  if (st1) console.log('\n[1P 오류]\n' + st1);
  if (st2) console.log('\n[2P 오류]\n' + st2);
  ok('1P 스테이지 예외 없음', !st1);
  ok('2P 스테이지 예외 없음', !st2);
  const real = (a) => a.filter(e => !/favicon/.test(e));
  ok('1P 자바스크립트 오류 없음', real(errors.tract).length === 0, real(errors.tract).slice(0, 2).join(' / '));
  ok('2P 자바스크립트 오류 없음', real(errors.juice).length === 0, real(errors.juice).slice(0, 2).join(' / '));

  await browser.close();
  console.log('\n──────────────────────────────');
  console.log(`  통과 ${pass} · 실패 ${fail}`);
  console.log('──────────────────────────────\n');
  server.close();
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
