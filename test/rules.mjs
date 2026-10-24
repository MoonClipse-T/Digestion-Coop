/* test/rules.mjs — 과학 규칙 검증 (이번 차시 학습 범위 기준) */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Core = require('../game-core.js');
const G = require('../public/js/gamedata.js');
const R = G.RULES;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};
const section = (t) => console.log('\n' + t);

function fresh(stageId) {
  const g = Core.newGame();
  g.phase = 'playing';
  g.stageIndex = G.STAGES.findIndex(s => s.id === stageId);
  return g;
}
const foodLeft = g => g.food.starch + g.food.protein + g.food.fat;
const gotAll = g => g.absorbed.starch + g.absorbed.protein + g.absorbed.fat;

/* ============================================================ */
section('① 소화액이 어디서 만들어져 어디로 가는가');

{
  const g = fresh('stomach');
  ok('간 → 쓸개 : 정답이고 쓸개에 저장된다', Core.trySecrete(g, 'liver', 'gallbladder').ok && g.bileStored > 0);
}
{
  const g = fresh('stomach');
  const r = Core.trySecrete(g, 'liver', 'stomach');
  ok('간 → 위 : 오답이고 배탈이 크게 오른다', !r.ok && g.trouble >= 25, 'trouble=' + g.trouble);
  ok('간 → 위 : "간은 쓸개즙을 만들어 쓸개로 보낸다" 설명이 나온다', /쓸개로 보냅니다/.test(r.msg), r.msg);
}
{
  const g = fresh('small');
  ok('간 → 작은창자 직행 : 오답 (쓸개를 거쳐야 함)', !Core.trySecrete(g, 'liver', 'small').ok);
}
{
  const g = fresh('small');
  const r = Core.trySecrete(g, 'gallbladder', 'small');
  ok('쓸개가 비면 꺼낼 수 없다 (배탈은 안 남)', !r.ok && r.soft === true && g.trouble === 0);
  Core.trySecrete(g, 'liver', 'gallbladder');
  ok('쓸개에 저장한 뒤에는 쓸개 → 작은창자 성공', Core.trySecrete(g, 'gallbladder', 'small').ok && g.delivered.bile > 0);
}
{
  const g = fresh('small');
  ok('쓸개 → 위 : 오답', !Core.trySecrete(g, 'gallbladder', 'stomach').ok);
  const g2 = fresh('small');
  ok('이자 → 작은창자 : 정답', Core.trySecrete(g2, 'pancreas', 'small').ok);
  const g3 = fresh('stomach');
  ok('이자 → 위 : 오답', !Core.trySecrete(g3, 'pancreas', 'stomach').ok);
  const g4 = fresh('small');
  ok('이자 → 쓸개 : 오답 (쓸개에 저장되는 건 쓸개즙)', !Core.trySecrete(g4, 'pancreas', 'gallbladder').ok);
}
{
  const g = fresh('mouth');
  ok('침샘 → 입 : 정답', Core.trySecrete(g, 'salivary', 'mouth').ok);
  const g2 = fresh('stomach');
  ok('위샘 → 위 : 정답', Core.trySecrete(g2, 'gastric', 'stomach').ok);
}
{
  const g = fresh('esophagus');
  const r = Core.trySecrete(g, 'salivary', 'esophagus');
  ok('식도로 분비 : 오답 + "통로일 뿐" 안내', !r.ok && /통로/.test(r.msg), r.msg);
  const g2 = fresh('large');
  const r2 = Core.trySecrete(g2, 'pancreas', 'large');
  ok('큰창자로 분비 : 오답 + "물을 흡수하는 곳" 안내', !r2.ok && /물을 흡수/.test(r2.msg), r2.msg);
}
{
  let all = true;
  for (const [from, to] of Object.entries(G.CORRECT_ROUTE)) {
    const g = fresh('small');
    if (from === 'gallbladder') g.bileStored = 60;
    if (!Core.trySecrete(g, from, to).ok) { all = false; console.log('     ↳ 실패:', from, '→', to); }
  }
  ok('정답 경로 5개가 모두 성립한다', all);
}

/* ============================================================ */
section('② 소화액이 없으면 소화가 일어나지 않는다');

{
  const dry = fresh('mouth');
  for (let i = 0; i < 10; i++) Core.applyAction(dry, 'tract', { t: 'chew', grade: 'perfect' });
  ok('침 없이 씹기 : 크기는 줄지만 소화되지 않는다', dry.food.size < 100 && dry.digested.starch === 0);

  const wet = fresh('mouth');
  wet.delivered.saliva = 80;
  for (let i = 0; i < 10; i++) Core.applyAction(wet, 'tract', { t: 'chew', grade: 'perfect' });
  ok('★ 침이 있으면 같은 횟수로도 더 잘게 부서진다', wet.food.size < dry.food.size,
     '침없음 ' + dry.food.size.toFixed(1) + ' vs 침있음 ' + wet.food.size.toFixed(1));
  for (let i = 0; i < 20; i++) Core.applyAction(wet, 'tract', { t: 'chew', grade: 'perfect' });
  ok('침이 있으면 음식물이 소화된다', wet.digested.starch > 20);
}
{
  const g = fresh('stomach');
  for (let i = 0; i < 40; i++) Core.applyAction(g, 'tract', { t: 'churn', q: 1 });
  ok('위액 없이 담그기 : 소화되지 않는다', g.digested.protein === 0);
  g.delivered.gastric = 80;
  for (let i = 0; i < 40; i++) Core.applyAction(g, 'tract', { t: 'churn', q: 1 });
  ok('위액이 있으면 음식물이 소화된다', g.digested.protein > 30);
}
{
  const g = fresh('small');
  for (let i = 0; i < 20; i++) Core.applyAction(g, 'tract', { t: 'grind', kind: 'starch', q: 1 });
  ok('작은창자 : 소화액 없이 문지르면 소화되지 않는다', g.digested.starch === 0);

  const one = fresh('small'); one.delivered.pancreatic = 80;
  for (let i = 0; i < 20; i++) Core.applyAction(one, 'tract', { t: 'grind', kind: 'starch', q: 1 });
  const both = fresh('small'); both.delivered.pancreatic = 80; both.delivered.bile = 80;
  for (let i = 0; i < 20; i++) Core.applyAction(both, 'tract', { t: 'grind', kind: 'starch', q: 1 });
  ok('★ 이자액과 쓸개즙이 함께 있으면 훨씬 잘 소화된다',
     both.digested.starch > one.digested.starch * 1.5,
     '한 가지 ' + one.digested.starch.toFixed(1) + ' vs 두 가지 ' + both.digested.starch.toFixed(1));
}
{
  const g = fresh('mouth');
  g.delivered.saliva = 100;
  for (let i = 0; i < 40; i++) Core.tick(g, 0.1);
  ok('소화액은 시간이 지나면 줄어든다 (계속 공급해야 함)', g.delivered.saliva < 80);
}

/* ============================================================ */
section('③ 작은창자 — 소화된 영양소만 흡수된다');

{
  const g = fresh('small');
  g.digested.starch = 30;
  Core.applyAction(g, 'tract', { t: 'absorb', ok: true, kind: 'starch' });
  ok('소화된 영양소는 흡수된다', g.absorbed.starch === 6 && g.digested.starch === 24);
}
{
  const g = fresh('small');
  const t0 = g.trouble;
  Core.applyAction(g, 'tract', { t: 'absorb', ok: false });
  ok('★ 소화되지 않은 큰 영양소는 흡수되지 않고 벌칙을 받는다', g.trouble > t0 && g.absorbed.starch === 0);
  ok('흡수 못 한 양이 기록된다', (g.lost.starch + g.lost.protein + g.lost.fat) > 0);
}
{
  const g = fresh('small');
  g.digested.protein = 3;
  Core.applyAction(g, 'tract', { t: 'absorb', ok: true, kind: 'protein' });
  ok('소화된 양보다 많이 흡수할 수 없다', g.absorbed.protein <= 3.001);
}
{
  const g = fresh('small');
  g.digested.starch = 0; g.digested.protein = 0; g.digested.fat = 0;
  Core.applyAction(g, 'tract', { t: 'absorb', ok: true });
  ok('소화된 것이 하나도 없으면 흡수도 없다', gotAll(g) === 0);
}

/* ============================================================ */
section('④ 배탈 · 역류 · 소화불량');

{
  const g = fresh('stomach');
  for (let i = 0; i < 3; i++) Core.trySecrete(g, 'liver', 'stomach');
  ok('오분비 3번이면 역류 기준(70)을 넘는다', g.trouble >= R.TROUBLE_REFLUX, 'trouble=' + g.trouble);
  g.mix = 60; Core.tick(g, 0.05);
  ok('역류가 일어나면 진행이 뒤로 밀린다', g.mix < 60);
}
{
  const g = fresh('stomach');
  for (let i = 0; i < 5; i++) Core.trySecrete(g, 'liver', 'stomach');
  Core.tick(g, 0.05);
  ok('배탈 100 → 급성 소화불량으로 종료', g.phase === 'result' && g.result.reason === 'sick');
  ok('소화불량 결과는 F 등급', g.result.grade === 'F');
}
{
  const g = fresh('stomach');
  for (let i = 0; i < 40; i++) { g.delivered.gastric = 100; Core.tick(g, 0.1); }
  ok('위액이 지나치게 많으면 속쓰림으로 배탈이 오른다', g.trouble > 0);
}
{
  const g = fresh('mouth');
  const s0 = g.score;
  Core.applyAction(g, 'juice', { t: 'waste' });
  ok('만든 소화액을 제때 못 보내면 점수가 깎인다', g.score < s0);
}
{
  const g = fresh('esophagus');
  const s0 = g.score;
  Core.applyAction(g, 'juice', { t: 'classify', ok: true });
  const s1 = g.score;
  Core.applyAction(g, 'juice', { t: 'classify', ok: false });
  ok('소화관/소화샘 분류 : 맞으면 +, 틀리면 −', s1 > s0 && g.score < s1);
}

/* ============================================================ */
section('⑤ 큰창자 · 최종 대변 판정');

{
  const g = fresh('large'); g.trouble = 0;
  const a = g.transit; Core.tick(g, 1); const slow = g.transit - a;
  const g2 = fresh('large'); g2.trouble = 90;
  const b = g2.transit; Core.tick(g2, 1); const fast = g2.transit - b;
  ok('★ 배탈이 심하면 큰창자를 더 빨리 지나간다', fast > slow * 1.5, slow.toFixed(2) + ' vs ' + fast.toFixed(2));
}
{
  const g = fresh('large');
  Core.tick(g, 0.05);                                  // 첫 틱에서 칸별 목표가 정해진다
  ok('큰창자는 칸 ' + R.PORES + '개로 나뉜다', g.pores.length === R.PORES && g.large.targets.length === R.PORES);
  ok('칸마다 빼야 할 물의 양이 정해진다',
     g.large.targets.every(t => t >= 0) && g.large.targets.reduce((a, b) => a + b, 0) > 0,
     JSON.stringify(g.large.targets));
  ok('처음에는 모든 칸의 물길이 막혀 있다', g.pores.every(v => !v));

  // ★ 물길이 없으면 아무리 주물러도 한 방울도 빠지지 않는다
  const a = g.residueWater;
  for (let i = 0; i < 10; i++) Core.applyAction(g, 'tract', { t: 'squeeze', q: 1 });
  ok('★ 물길을 안 뚫으면 주물러도 물이 전혀 빠지지 않는다', g.residueWater === a,
     a.toFixed(2) + ' → ' + g.residueWater.toFixed(2));

  // 짝꿍이 지금 칸의 물길을 뚫으면 빠진다
  Core.applyAction(g, 'juice', { t: 'gate' });
  ok('★ 짝꿍이 퍼즐을 풀면 지금 칸의 물길이 뚫린다', g.pores[g.large.round] === true);
  const b = g.residueWater;
  Core.applyAction(g, 'tract', { t: 'squeeze', q: 1 });
  ok('물길이 뚫린 칸에서는 물이 빠진다', g.residueWater < b - 0.5,
     b.toFixed(2) + ' → ' + g.residueWater.toFixed(2));
}
{
  const g = fresh('large');
  Core.tick(g, 0.05);
  ok('한 칸에 갇혀 있는 최대 시간은 ' + R.ROUND_TIME + '초', R.ROUND_TIME === 18);
  Core.tick(g, R.ROUND_TIME + 0.1);
  ok('★ 시간이 지나면 다음 칸으로 넘어간다', g.large.round === 1, 'round=' + g.large.round);
  ok('지나간 칸의 성적이 기록된다', g.large.results.length === 1 && g.large.results[0].ok === false);

  // 5칸을 모두 지나야 큰창자를 통과한다
  const g2 = fresh('large');
  Core.tick(g2, 0.05);
  // ★ '몇 초' 맞추기
  const gh = fresh('large');
  Core.tick(gh, 0.05);
  Core.applyAction(gh, 'juice', { t: 'gate' });
  const want = R.HOLD_SECS[0];
  const a1 = gh.residueWater;
  Core.applyAction(gh, 'tract', { t: 'hold', sec: want });          // 정확
  const exact = a1 - gh.residueWater;
  ok('★ 정해진 초에 딱 맞춰 떼면 물이 많이 빠진다', exact > 0.5, '뺀 물 ' + exact.toFixed(2));
  ok('한 번 맞출 때마다 다음 목표 초가 바뀐다', gh.large.holdIdx === 1 &&
     R.HOLD_SECS[1] !== undefined);

  const gh2 = fresh('large');
  Core.tick(gh2, 0.05);
  Core.applyAction(gh2, 'juice', { t: 'gate' });
  const a2 = gh2.residueWater;
  Core.applyAction(gh2, 'tract', { t: 'hold', sec: R.HOLD_SECS[0] + 0.7 });   // 0.7초 빗나감
  const off = a2 - gh2.residueWater;
  ok('★ 초가 어긋날수록 물이 덜 빠진다', off > 0 && off < exact * 0.8,
     '정확 ' + exact.toFixed(2) + ' vs 어긋남 ' + off.toFixed(2));
  ok('★ 정확히 맞추면 그 칸 목표를 채운다', exact >= gh.large.targets[0] * R.ROUND_PASS,
     '뺀 물 ' + exact.toFixed(2) + ' / 목표 ' + gh.large.targets[0]);

  // ★ 한 칸에 딱 한 번만 잰다
  const w2 = gh.residueWater;
  Core.applyAction(gh, 'tract', { t: 'hold', sec: R.HOLD_SECS[1] });
  ok('★ 한 칸에서 두 번째로 재면 아무 일도 없다', gh.residueWater === w2 && gh.large.holds === 1,
     'holds=' + gh.large.holds);
  Core.tick(gh, R.ROUND_TIME + 0.1);
  ok('다음 칸으로 가면 다시 한 번 잴 수 있다', gh.large.holdDone === false);

  const gh3 = fresh('large');
  Core.tick(gh3, 0.05);
  Core.applyAction(gh3, 'juice', { t: 'gate' });
  const a3 = gh3.residueWater;
  Core.applyAction(gh3, 'tract', { t: 'hold', sec: R.HOLD_SECS[0] + 3 });     // 완전히 빗나감
  ok('★ 너무 많이 빗나가면 물이 전혀 빠지지 않는다', gh3.residueWater === a3);

  const gh4 = fresh('large');
  Core.tick(gh4, 0.05);                                    // 물길을 안 뚫은 상태
  const a4 = gh4.residueWater;
  Core.applyAction(gh4, 'tract', { t: 'hold', sec: R.HOLD_SECS[0] });
  ok('★ 물길이 없으면 초를 맞춰도 물이 빠지지 않는다', gh4.residueWater === a4);

  let early = true;
  for (let i = 0; i < R.PORES; i++) {
    if (Core.canClear(g2)) early = false;
    Core.tick(g2, R.ROUND_TIME + 0.1);
  }
  ok('칸을 다 지나기 전에는 큰창자를 통과할 수 없다', early);
  // ★ 칸을 다 지났어도 물을 못 뺐으면 한 바퀴 더 돈다 (자동 통과 없음)
  ok('★ 물을 못 빼면 큰창자를 한 바퀴 더 돈다', g2.large.lap >= 1 && !Core.canClear(g2),
     'lap=' + g2.large.lap + ' water=' + g2.residueWater.toFixed(0));
  // 물을 충분히 뺀 상태로 칸을 다 지나면 통과한다
  const g3 = fresh('large');
  Core.tick(g3, 0.05);
  g3.residueWater = 34;
  for (let i = 0; i < R.PORES; i++) Core.tick(g3, R.ROUND_TIME + 0.1);
  ok('★ 칸을 다 지나고 물도 충분히 빼야 큰창자를 통과한다', Core.canClear(g3),
     'round=' + g3.large.round + ' water=' + g3.residueWater.toFixed(0));
}
{
  const g = fresh('mouth');
  g.delivered.saliva = 80;
  const size0 = g.food.size, st0 = g.digested.starch;
  Core.applyAction(g, 'tract', { t: 'swallow' });
  ok('★ 잘게 부순 음식물을 목구멍으로 넘기면 진행된다', g.food.size < size0 && g.digested.starch > st0,
     'size ' + size0 + '→' + g.food.size.toFixed(1));
  const g2 = fresh('stomach');
  const sz = g2.food.size;
  Core.applyAction(g2, 'tract', { t: 'swallow' });
  ok('입 단계가 아니면 목구멍 넘기기가 안 된다', g2.food.size === sz);
}
{
  const mk = (water, absorbed, trouble) => {
    const g = Core.newGame();
    g.residueWater = water;
    g.absorbed.starch = absorbed / 3; g.absorbed.protein = absorbed / 3; g.absorbed.fat = absorbed / 3;
    g.food.starch = g.food.protein = g.food.fat = 0;
    g.trouble = trouble || 0;
    return Core.bristolFromState(g);
  };
  ok('수분 36% + 충분한 흡수 → 4형(최고)', mk(36, 180).type === 4, JSON.stringify(mk(36, 180)));
  ok('수분 26% → 3형(좋음)', mk(26, 180).type === 3);
  ok('수분 8% → 1형(심한 변비)', mk(8, 180).type === 1);
  ok('수분 80% → 7형(설사)', mk(80, 180).type === 7);
  ok('★ 흡수를 거의 못 하면 물을 빼도 좋은 변이 나오지 않는다', mk(36, 30).type >= 5);
}
{
  const g = Core.newGame();
  g.residueWater = 30;
  g.food.starch = 90; g.food.protein = 90; g.food.fat = 90;
  g.absorbed.starch = 10;
  const b = Core.bristolFromState(g);
  ok('★ 소화 안 된 음식이 남으면 물을 끌어당겨 묽어진다', b.water > 30 && b.type >= 5);
}

/* ============================================================ */
section('⑥ 스테이지 통과 조건 — 시간이 지나도 자동으로 안 넘어간다');

{
  // ★ 목표 시간을 한참 넘겨도 통과 조건을 못 채우면 그대로 머문다
  const g = fresh('mouth');
  const par = G.STAGES[0].time;
  for (let i = 0; i < (par + 40) / 0.1; i++) Core.tick(g, 0.1);
  ok('★ 목표 시간을 넘겨도 자동으로 다음 기관으로 안 넘어간다',
     g.stageIndex === 0 && g.phase === 'playing',
     'stageIndex=' + g.stageIndex + ' t=' + Math.round(g.stageTime) + 's');
  ok('무엇이 모자란지 안내가 나온다', Core.snapshot(g).hint.length > 0, Core.snapshot(g).hint);

  // 조건을 채우면 그때 넘어간다
  g.mouth.swallows = R.MOUTH_SWALLOWS; g.digested.starch = 30;
  Core.tick(g, 0.1);
  ok('★ 통과 조건을 채우면 그때 넘어간다', g.stageIndex === 1 && g.phase === 'stageclear');
  ok('통과 기록에 걸린 시간이 남는다', g.stageLog[0].time >= par && g.stageLog[0].over === true,
     JSON.stringify(g.stageLog[0]));
}
{
  // ★ 등급은 총 걸린 시간으로 매긴다
  const parTotal = G.STAGES.reduce((a, x) => a + x.time, 0);
  const mk = (secs) => {
    const g = Core.newGame();
    g.totalTime = secs;
    g.residueWater = 34; g.absorbed.starch = 70; g.absorbed.protein = 70; g.absorbed.fat = 40;
    g.food.starch = g.food.protein = g.food.fat = 10;
    Core.finish(g, 'done');
    return g.result;
  };
  const fast = mk(parTotal * 0.7), slow = mk(parTotal * 2.4);
  ok('★ 빨리 끝내면 좋은 등급', fast.grade === 'S', fast.grade + ' (' + fast.totalTime + 's)');
  ok('★ 오래 걸리면 낮은 등급', slow.grade === 'D', slow.grade + ' (' + slow.totalTime + 's)');
  ok('결과에 걸린 시간과 목표 시간이 들어 있다',
     fast.totalTime > 0 && fast.parTime === parTotal, JSON.stringify({ t: fast.totalTime, par: fast.parTime }));
}

section('⑥-1 ★ 식도 : 막힌 근육은 짝꿍이 문제를 맞혀야 뚫린다');

{
  const g = fresh('esophagus');
  for (let i = 0; i < (R.ESO_BLOCK_EVERY + 1) / 0.1; i++) Core.tick(g, 0.1);
  ok('★ 식도에서 시간이 지나면 근육이 막힌다', g.eso.blocked > 0, JSON.stringify(g.eso));

  const b0 = g.bolus;
  for (let i = 0; i < 20; i++) Core.applyAction(g, 'tract', { t: 'wave', q: 1 });
  ok('★ 막혀 있으면 소화관 담당이 아무리 조여도 안 내려간다', g.bolus <= b0,
     b0 + ' → ' + g.bolus);

  Core.applyAction(g, 'juice', { t: 'classify', ok: false });
  ok('짝꿍이 틀리면 아직 안 뚫린다', g.eso.blocked > 0);

  Core.applyAction(g, 'juice', { t: 'classify', ok: true });
  ok('★ 짝꿍이 분류 문제를 맞히면 뚫린다', g.eso.blocked === 0, JSON.stringify(g.eso));

  const b1 = g.bolus;
  Core.applyAction(g, 'tract', { t: 'wave', q: 1 });
  ok('뚫린 뒤에는 다시 내려간다', g.bolus > b1, b1 + ' → ' + g.bolus);

  const snap = Core.snapshot(g);
  ok('두 화면 모두 막힘 상태를 볼 수 있다 (스냅샷에 들어 있다)',
     snap.eso && typeof snap.eso.blocked === 'number', JSON.stringify(snap.eso));
}

section('⑥-1-2 ★ 소화액이 일하는 시간');

{
  const need = (k) => (R.JUICE_PER_DROP - R.JUICE_OK) / (R.JUICE_DECAY[k] || R.JUICE_DECAY_PER_SEC);
  ok('★ 위액은 한 번 보내면 약 7초 동안 일한다', Math.abs(need('gastric') - 7) < 0.6,
     need('gastric').toFixed(1) + '초');
  ok('★ 이자액·쓸개즙은 약 5초 동안 일한다',
     Math.abs(need('pancreatic') - 5) < 0.6 && Math.abs(need('bile') - 5) < 0.6,
     need('pancreatic').toFixed(1) + '초 / ' + need('bile').toFixed(1) + '초');

  // 실제로 시뮬레이션해서 확인한다
  const g = fresh('stomach');
  Core.applyAction(g, 'juice', { t: 'drop', from: 'gastric', to: 'stomach' });
  let alive = 0;
  while (g.delivered.gastric >= R.JUICE_OK && alive < 30) { Core.tick(g, 0.1); alive += 0.1; }
  ok('실제로도 위액이 7초쯤 유지된다', alive > 6.2 && alive < 7.8, alive.toFixed(1) + '초');

  const g2 = fresh('small');
  Core.applyAction(g2, 'juice', { t: 'drop', from: 'pancreas', to: 'small' });
  let a2 = 0;
  while (g2.delivered.pancreatic >= R.JUICE_OK && a2 < 30) { Core.tick(g2, 0.1); a2 += 0.1; }
  ok('실제로도 이자액이 5초쯤 유지된다', a2 > 4.2 && a2 < 5.8, a2.toFixed(1) + '초');
}

section('⑥-2 통과 조건 자체');

{
  const g = fresh('mouth');
  g.mouth.swallows = R.MOUTH_SWALLOWS; g.digested.starch = 5;
  ok('입 : 다 넘겼어도 소화가 안 되면 통과 못 함', !Core.canClear(g));
  g.digested.starch = 30;
  ok('입 : 넘기기 + 소화 둘 다 되면 통과', Core.canClear(g));
  g.mouth.swallows = R.MOUTH_SWALLOWS - 1;
  ok('★ 목구멍으로 ' + R.MOUTH_SWALLOWS + '번은 넘겨야 통과', !Core.canClear(g));
}
{
  const g = fresh('stomach');
  g.mix = 100; g.digested.protein = 10;
  ok('위 : 섞기만 해서는 통과 못 함 (위액 필요)', !Core.canClear(g));
  g.digested.protein = 40;
  ok('위 : 섞기 + 소화로 통과', Core.canClear(g));
}
{
  const g = fresh('small');
  g.absorbed.starch = 60; g.absorbed.protein = 60; g.absorbed.fat = 20;
  g.food.starch = 90; g.food.protein = 90; g.food.fat = 90;
  ok('★ 작은창자 : 소화 안 된 영양소가 많이 남으면 통과 못 함', !Core.canClear(g));
  g.food.starch = 30; g.food.protein = 30; g.food.fat = 30;
  ok('작은창자 : 소화 + 흡수를 마치면 통과', Core.canClear(g));
}

/* ============================================================ */
section('⑦ 실제 플레이 시뮬레이션 — 게임이 클리어 가능한가');

function simulate(style) {
  const g = Core.newGame();
  g.phase = 'playing';
  const dt = 0.05;
  let steps = 0;
  const perfect = style === 'perfect';
  while (g.phase !== 'result' && steps < 26000) {
    steps++;
    const s = Core.stage(g).id;

    if (steps % 8 === 0) {                     // 소화액 담당
      if (perfect) {
        if (s === 'mouth' && g.delivered.saliva < 70) Core.applyAction(g, 'juice', { t: 'drop', from: 'salivary', to: 'mouth' });
        if (s === 'esophagus') Core.applyAction(g, 'juice', { t: 'classify', ok: true });
        if (s === 'stomach') {
          if (g.delivered.gastric < 70) Core.applyAction(g, 'juice', { t: 'drop', from: 'gastric', to: 'stomach' });
          else if (g.bileStored < 90) Core.applyAction(g, 'juice', { t: 'drop', from: 'liver', to: 'gallbladder' });
        }
        if (s === 'small') {
          if (g.delivered.bile < 60 && g.bileStored >= R.BILE_DOSE) Core.applyAction(g, 'juice', { t: 'drop', from: 'gallbladder', to: 'small' });
          else if (g.bileStored < 40) Core.applyAction(g, 'juice', { t: 'drop', from: 'liver', to: 'gallbladder' });
          else if (g.delivered.pancreatic < 70) Core.applyAction(g, 'juice', { t: 'drop', from: 'pancreas', to: 'small' });
        }
        if (s === 'large' && steps % 24 === 0 && g.pores.some(v => !v)) Core.applyAction(g, 'juice', { t: 'gate' });
      } else {
        // 엉성해도 최소한은 보낸다 — 안 그러면 통과 조건을 영영 못 채워 게임이 끝나지 않는다
        if (s === 'mouth' && steps % 40 === 0) Core.applyAction(g, 'juice', { t: 'drop', from: 'salivary', to: 'mouth' });
        if (s === 'esophagus' && steps % 24 === 0) Core.applyAction(g, 'juice', { t: 'classify', ok: true });
        if (s === 'stomach') {
          if (steps % 48 === 0) Core.applyAction(g, 'juice', { t: 'drop', from: 'liver', to: 'stomach' });   // 오분비
          else if (steps % 32 === 0) Core.applyAction(g, 'juice', { t: 'drop', from: 'gastric', to: 'stomach' });
        }
        if (s === 'small') {
          if (steps % 40 === 0) Core.applyAction(g, 'juice', { t: 'drop', from: 'pancreas', to: 'small' });
          else if (steps % 56 === 0) Core.applyAction(g, 'juice', { t: 'drop', from: 'liver', to: 'small' });  // 오분비
        }
        if (s === 'large' && steps % 40 === 0 && g.pores.some(v => !v)) Core.applyAction(g, 'juice', { t: 'gate' });
      }
    }

    if (steps % 6 === 0) {                     // 소화관 담당
      if (s === 'mouth') {
        Core.applyAction(g, 'tract', { t: 'chew', grade: perfect ? 'perfect' : 'good' });
        if (steps % (perfect ? 30 : 96) === 0) Core.applyAction(g, 'tract', { t: 'swallow' });
      }
      if (s === 'esophagus') Core.applyAction(g, 'tract', { t: 'wave', q: perfect ? 1 : 0.5 });
      if (s === 'stomach') Core.applyAction(g, 'tract', { t: 'churn', q: perfect ? 1 : 0.5 });
      if (s === 'small') {
        if (perfect) {
          Core.applyAction(g, 'tract', { t: 'grind', q: 1 });
          if (g.digested.starch + g.digested.protein + g.digested.fat > 6) Core.applyAction(g, 'tract', { t: 'absorb', ok: true });
        } else {
          if (steps % 12 === 0) Core.applyAction(g, 'tract', { t: 'grind', q: 1 });
          Core.applyAction(g, 'tract', { t: 'absorb', ok: Math.random() < 0.5 });
        }
      }
      if (s === 'large') {
        // 실제 조작대로 '몇 초 맞추기' 로 물을 뺀다
        const target = (R.WATER_TARGET[0] + R.WATER_TARGET[1]) / 2;
        if (g.residueWater > target && steps % 24 === 0) {
          const want = R.HOLD_SECS[g.large.holdIdx % R.HOLD_SECS.length];
          Core.applyAction(g, 'tract', { t: 'hold', sec: perfect ? want : want + 1.1 });
        }
      }
    }
    Core.tick(g, dt);
    if (g.phase === 'stageclear') Core.tickClear(g, dt);
  }
  return { g, steps };
}

{
  const { g, steps } = simulate('perfect');
  ok('완벽한 협동 : 게임이 끝까지 진행된다', g.phase === 'result', 'steps=' + steps + ' phase=' + g.phase);
  if (g.result) {
    console.log('     ↳ 결과: ' + g.result.grade + '등급 · 브리스톨 ' + g.result.bristol + '형 ' + g.result.verdict +
      ' · 흡수 ' + g.result.absorbPercent + '% · 수분 ' + g.result.water + '% · 오분비 ' + g.result.mistakeCount + '회');
    ok('★ 완벽한 협동이면 좋은 대변(3형 또는 4형)이 나온다', g.result.bristol === 3 || g.result.bristol === 4,
       'bristol=' + g.result.bristol + ' water=' + g.result.water + ' absorb=' + g.result.absorbPercent + '%');
    ok('완벽한 협동이면 오분비가 0회', g.result.mistakeCount === 0);
    ok('완벽한 협동이면 A 등급 이상', ['S', 'A'].includes(g.result.grade), 'grade=' + g.result.grade);
    ok('모든 스테이지를 통과한다', g.stageLog.filter(x => !x.timeout).length >= 4,
       JSON.stringify(g.stageLog.map(x => x.stage + (x.timeout ? '(시간초과)' : ''))));
  }
}
{
  const { g } = simulate('sloppy');
  ok('엉성한 협동 : 좋은 결과가 나오지 않는다',
     g.result && (g.result.reason === 'sick' || g.result.bristol >= 5 || g.result.grade === 'D' || g.result.grade === 'F'),
     g.result ? (g.result.grade + '/' + g.result.bristol + '형/' + g.result.verdict) : 'no result');
  if (g.result) console.log('     ↳ 결과: ' + g.result.grade + '등급 · ' + g.result.verdict +
    ' · 오분비 ' + g.result.mistakeCount + '회 · 배탈 ' + g.result.trouble);
}

/* ============================================================ */
section('⑧ 학습 범위 확인 (교과서와 일치하는가)');

{
  ok('소화관 6개 : 입·식도·위·작은창자·큰창자·항문',
     G.TRACT.map(t => t.name).join(',') === '입,식도,위,작은창자,큰창자,항문');
  ok('소화샘은 침샘·위샘·간·쓸개·이자 5가지', Object.keys(G.GLANDS).length === 5);
  ok('★ 모세혈관/암죽관 구분은 다루지 않는다 (다음 차시)',
     !JSON.stringify(G).includes('암죽관') && !JSON.stringify(G).includes('모세혈관'));
  ok('분류 게임 항목이 소화관 6 + 소화샘 4 로 되어 있다',
     G.CLASSIFY.filter(c => c.type === 'tract').length === 6 &&
     G.CLASSIFY.filter(c => c.type === 'gland').length === 4);
  ok('목적지 선택기에 소화관 6곳이 순서대로 들어 있다',
     G.DESTINATIONS.join(',') === 'mouth,esophagus,stomach,gallbladder,small,large');
  ok('브리스톨 척도 7단계 · 3·4형만 좋은 변',
     G.BRISTOL.length === 7 && G.BRISTOL.filter(b => b.good).map(b => b.type).join(',') === '3,4');
  ok('모든 소화샘의 to 값이 정답 경로와 일치한다',
     Object.entries(G.GLANDS).every(([k, v]) => v.to === G.CORRECT_ROUTE[k]));
  const snap = Core.snapshot(Core.newGame());
  ok('스냅샷에 필요한 값이 모두 들어 있다',
     ['phase', 'stage', 'progress', 'delivered', 'bileStored', 'waterGate', 'pores', 'trouble', 'residueWater'].every(k => k in snap));
  ok('소화액을 보낼 시간이 넉넉하다 (10초)', R.SEND_WINDOW >= 10, 'SEND_WINDOW=' + R.SEND_WINDOW);
  ok('학습 문구(TIPS)가 전부 이번 차시 범위다',
     G.TIPS.every(t => !/암죽관|모세혈관|아밀레이스|펩신|트립신|라이페이스|유화/.test(t)));
}

console.log('\n──────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fail}`);
console.log('──────────────────────────────\n');
process.exit(fail ? 1 : 0);
