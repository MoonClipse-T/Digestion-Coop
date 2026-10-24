/* test/net.mjs — 실제 서버를 띄우고 두 명이 한 방에서 동기화되는지 확인 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

process.env.PORT = '8199';
const { server } = require('../server.js');

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (e ? '  → ' + e : '')); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function client(name) {
  const ws = new WebSocket('ws://127.0.0.1:8199');
  const c = { ws, name, msgs: [], last: null, states: 0, events: [] };
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    c.msgs.push(m);
    if (m.type === 'state') { c.last = m.s; c.states++; (m.ev || []).forEach(x => c.events.push(x)); }
    if (m.type === 'joined') { c.code = m.code; c.role = m.role; }
    if (m.type === 'rooms') c.rooms = m.list;
    if (m.type === 'error') c.err = m.msg;
  });
  c.open = new Promise(r => ws.addEventListener('open', r));
  c.send = (o) => ws.send(JSON.stringify(o));
  c.got = (type) => c.msgs.filter(m => m.type === type);
  return c;
}

async function main() {
  await wait(400);
  console.log('\n① 방 만들기 · 참가 · 역할 배정');

  const A = client('가온'); await A.open;
  A.send({ type: 'create', name: '가온', role: 'tract' });
  await wait(200);
  ok('방이 만들어지고 4자리 번호를 받는다', !!A.code && /^\d{4}$/.test(A.code), A.code);
  ok('방을 만든 사람이 소화관 역할을 받는다', A.role === 'tract');

  const B = client('나래'); await B.open;
  B.send({ type: 'join', name: '나래', code: A.code });
  await wait(200);
  ok('두 번째 사람이 같은 방에 들어간다', B.code === A.code);
  ok('★ 남은 역할(소화액)이 자동으로 배정된다', B.role === 'juice', B.role);

  const C = client('끼어들기'); await C.open;
  C.send({ type: 'join', name: '끼어들기', code: A.code });
  await wait(200);
  ok('세 번째 사람은 거절된다 (2인 전용)', /꽉/.test(C.err || ''), C.err);
  C.ws.close();

  const D = client('오타'); await D.open;
  D.send({ type: 'join', name: '오타', code: '0000' });
  await wait(200);
  ok('없는 방 번호는 안내 메시지가 나온다', /없습니다/.test(D.err || ''), D.err);
  D.ws.close();

  console.log('\n①-2 역할 바꾸기 — 짝꿍이 수락해야 바뀐다');
  A.send({ type: 'swapAsk' });
  await wait(250);
  ok('★ 요청하면 짝꿍 화면에 요청창이 뜬다', B.got('swapAsk').length === 1 && B.got('swapAsk')[0].from === '가온');
  ok('요청한 사람은 대기 상태가 된다', A.got('swapWait').length === 1);
  ok('아직 역할은 그대로다', A.role === 'tract' && B.role === 'juice');

  B.send({ type: 'swapAnswer', ok: false });
  await wait(250);
  ok('★ 거절하면 바뀌지 않는다', A.got('swapDenied').length === 1 && A.role === 'tract');

  A.send({ type: 'swapAsk' });
  await wait(200);
  B.send({ type: 'swapAnswer', ok: true });
  await wait(300);
  ok('★ 수락하면 두 사람의 역할이 맞바뀐다', A.role === 'juice' && B.role === 'tract',
     A.role + ' / ' + B.role);
  ok('역할이 바뀌면 준비 상태가 풀린다',
     A.got('joined').slice(-1)[0].info.players.juice.ready === false);

  // 원래대로 되돌린다
  B.send({ type: 'swapAsk' }); await wait(200);
  A.send({ type: 'swapAnswer', ok: true }); await wait(300);
  ok('다시 바꾸면 원래 역할로 돌아온다', A.role === 'tract' && B.role === 'juice');

  console.log('\n② 둘 다 준비하면 동시에 시작');
  A.send({ type: 'ready', ready: true });
  await wait(150);
  ok('한 명만 준비하면 시작하지 않는다', A.got('start').length === 0);
  B.send({ type: 'ready', ready: true });
  await wait(300);
  ok('둘 다 준비하면 두 화면 모두 시작한다', A.got('start').length === 1 && B.got('start').length === 1);

  await wait(700);
  ok('두 사람 모두 서버 상태를 실시간으로 받는다', A.states > 5 && B.states > 5, A.states + '/' + B.states);
  ok('★ 두 화면이 같은 게임 상태를 본다 (스테이지 일치)',
     A.last && B.last && A.last.stage === B.last.stage && A.last.stageIndex === B.last.stageIndex);

  console.log('\n③ 한쪽 행동이 다른 쪽 화면에 반영된다');
  await wait(3600);   // 카운트다운 끝나기를 기다림
  ok('카운트다운이 끝나고 플레이가 시작된다', A.last.phase === 'playing', A.last.phase);

  const before = A.last.delivered.saliva;
  for (let i = 0; i < 3; i++) { B.send({ type: 'act', a: { t: 'drop', from: 'salivary', to: 'mouth' } }); await wait(60); }
  await wait(300);
  ok('★ 2P가 침을 보내면 1P 화면의 침 게이지가 오른다', A.last.delivered.saliva > before,
     before + ' → ' + A.last.delivered.saliva);

  const sizeBefore = B.last.food.size;
  for (let i = 0; i < 8; i++) { A.send({ type: 'act', a: { t: 'chew', grade: 'perfect' } }); await wait(40); }
  await wait(300);
  ok('★ 1P가 씹으면 2P 화면의 음식물 크기가 줄어든다', B.last.food.size < sizeBefore,
     sizeBefore + ' → ' + B.last.food.size);
  ok('★ 침이 있는 상태로 씹으면 두 화면 모두에서 녹말이 소화된다',
     A.last.digested.starch > 0 && A.last.digested.starch === B.last.digested.starch,
     A.last.digested.starch + '/' + B.last.digested.starch);

  console.log('\n④ 오분비가 두 사람 모두에게 경고로 전달된다');
  const evA = A.events.length, evB = B.events.length;
  B.send({ type: 'act', a: { t: 'drop', from: 'liver', to: 'stomach' } });
  await wait(300);
  const misA = A.events.slice(evA).find(e => e.k === 'misroute');
  const misB = B.events.slice(evB).find(e => e.k === 'misroute');
  ok('★ 소화액을 잘못 보내면 짝꿍(1P) 화면에도 경고가 뜬다', !!misA, JSON.stringify(misA));
  ok('오분비 경고에 과학적 설명이 들어 있다', misA && /쓸개/.test(misA.msg), misA && misA.msg);
  ok('2P 본인 화면에도 같은 경고가 뜬다', !!misB);
  ok('배탈 수치가 두 화면 모두에서 올라간다', A.last.trouble > 0 && A.last.trouble === B.last.trouble);

  console.log('\n⑤ 신호 보내기 (📢)');
  const cA = A.events.length;
  B.send({ type: 'act', a: { t: 'call', msg: '보냈어!' } });
  await wait(250);
  ok('짝꿍에게 보낸 신호가 상대 화면에 도착한다',
     A.events.slice(cA).some(e => e.k === 'call' && e.msg === '보냈어!'));

  console.log('\n⑥ 선생님 화면');
  const T = client('teacher'); await T.open;
  T.send({ type: 'rooms' });
  await wait(250);
  const row = (T.rooms || []).find(r => r.code === A.code);
  ok('선생님 화면에 방 목록이 보인다', !!row);
  ok('두 학생 이름과 접속 인원이 보인다', row && row.tract === '가온' && row.juice === '나래' && row.online === 2);
  ok('진행 상황 · 배탈 · 오분비 횟수가 보인다', row && typeof row.progress === 'number' && row.mistakes === 1,
     row && JSON.stringify({ p: row.progress, m: row.mistakes }));

  console.log('\n⑦ 연결이 끊겼다 다시 들어오기');
  B.ws.close();
  await wait(400);
  const B2 = client('나래'); await B2.open;
  B2.send({ type: 'join', name: '나래', code: A.code });
  await wait(300);
  ok('★ 끊긴 자리로 다시 들어갈 수 있다 (게임은 그대로 진행 중)', B2.role === 'juice', B2.role);
  await wait(300);
  ok('다시 들어오면 진행 중이던 상태를 그대로 이어받는다',
     B2.last && B2.last.stage === A.last.stage && B2.last.trouble === A.last.trouble);

  console.log('\n⑦-2 소화액은 제때 못 보내면 굳는다 · 분류 게임');
  const sc0 = A.last.score;
  B2.send({ type: 'act', a: { t: 'waste' } });
  await wait(300);
  ok('소화액을 낭비하면 점수가 깎인다', A.last.score < sc0, sc0 + ' → ' + A.last.score);

  console.log('\n⑧ 폭주 방지');
  const sw0 = A.last.swallows;
  for (let i = 0; i < 300; i++) A.send({ type: 'act', a: { t: 'swallow' } });
  await wait(400);
  const took = A.last.swallows - sw0;
  ok('1초에 45번을 넘는 행동은 무시된다 (연타 매크로 방지)',
     took > 0 && took <= 50, '받아들인 횟수=' + took + ' / 보낸 횟수=300');

  console.log('\n⑨ 다시 하기 — 역할 바꾸기처럼 요청 → 수락');
  A.send({ type: 'againAsk' });
  await wait(250);
  ok('★ 다시 하기를 누르면 짝꿍 화면에 요청창이 뜬다',
     B2.got('againAsk').length === 1, JSON.stringify(B2.got('againAsk')));
  ok('요청한 사람에게 대기 안내가 뜬다', A.got('againWait').length === 1);

  B2.send({ type: 'againAnswer', ok: false });
  await wait(250);
  ok('거절하면 방이 그대로다', A.got('againDenied').length === 1 && A.got('reset').length === 0);

  A.send({ type: 'againAsk' });
  await wait(250);
  B2.send({ type: 'againAnswer', ok: true });
  await wait(350);
  ok('★ 수락하면 방 번호는 그대로 두고 대기실로 돌아간다',
     A.got('reset').length === 1 && B2.got('reset').length === 1);
  ok('방 번호가 바뀌지 않는다', A.got('reset')[0].info.code === A.code, A.got("reset")[0].info.code + " vs " + A.code);
  ok('둘 다 준비 상태가 풀린다',
     !A.got('reset')[0].info.players.tract.ready && !A.got('reset')[0].info.players.juice.ready);

  T.ws.close(); A.ws.close(); B2.ws.close();
  await wait(200);

  console.log('\n──────────────────────────────');
  console.log(`  통과 ${pass} · 실패 ${fail}`);
  console.log('──────────────────────────────\n');
  server.close();
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
