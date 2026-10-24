/* ============================================================
   game-core.js — 서버가 들고 있는 '진짜' 게임 상태와 과학 규칙
   (미니게임 조작감은 클라이언트, 소화의 성립 여부는 서버)
   ★ 이번 차시 범위만 다룬다 — 모세혈관/암죽관 구분은 다음 차시라 없음
   ============================================================ */
'use strict';
const G = require('./public/js/gamedata.js');
const R = G.RULES;

const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const KINDS = ['starch', 'protein', 'fat'];

function newGame() {
  return {
    phase: 'lobby',
    stageIndex: 0,
    stageTime: 0,
    countdown: 0,

    food: { size: 100, starch: 100, protein: 100, fat: 100 },   // 아직 소화되지 않은 양
    digested: { starch: 0, protein: 0, fat: 0 },                // 소화되어 흡수를 기다리는 양
    absorbed: { starch: 0, protein: 0, fat: 0, water: 0 },      // 흡수한 양
    lost: { starch: 0, protein: 0, fat: 0 },                    // 소화 못 한 채 흘려보낸 양

    // 각 소화관에 도착해 있는 소화액 (시간이 지나면 줄어든다)
    delivered: { saliva: 0, gastric: 0, bile: 0, pancreatic: 0 },
    bileStored: 0,          // 쓸개에 저장된 쓸개즙
    waterGate: 0,           // 큰창자의 물 흡수 통로가 열린 정도(표시용)
    pores: new Array(R.PORES).fill(false),   // 칸마다 물길이 열렸는가 (2P가 뚫는다)

    // 큰창자는 칸(라운드) 방식 — 찌꺼기가 한 칸에 ROUND_TIME 초 갇힌다
    large: { round: 0, roundT: R.ROUND_TIME, targets: [], startWater: 0, results: [], holdIdx: 0, holds: 0, holdDone: false, lap: 0 },

    mouth: { swallows: 0 },   // 입 : 목구멍으로 넘긴 횟수 (통과 조건)
    eso: { blocked: 0, ring: -1, t: 6 },   // 식도 : 막힌 근육 (2P가 문제를 맞혀야 뚫린다)

    mix: 0, bolus: 0, transit: 0,
    residueWater: 100,
    totalTime: 0,          // 게임 전체에 걸린 시간 (등급 기준)

    trouble: 0,
    score: 0, combo: 0, bestCombo: 0,
    mistakes: [],
    stageLog: [],
    result: null,
    _events: []
  };
}

function stage(g) { return G.STAGES[g.stageIndex] || G.STAGES[G.STAGES.length - 1]; }
function ev(g, kind, payload) {
  g._events.push(Object.assign({ k: kind }, payload || {}));
  if (g._events.length > 40) g._events.shift();
}
const foodLeft = (g) => g.food.starch + g.food.protein + g.food.fat;
// 큰창자 물구멍 : i 번째 구멍의 통과 위치(%)
const poreCenter = (i) => (i + 0.5) / R.PORES * 100;
const poreAt = (transit) => {
  const i = Math.floor(transit / 100 * R.PORES);
  return (i >= 0 && i < R.PORES) ? i : -1;
};
const gotAll = (g) => g.absorbed.starch + g.absorbed.protein + g.absorbed.fat;

/* ---------- 큰창자 : 칸별로 빼야 하는 물의 양을 정한다 ----------
   작은창자를 지나온 찌꺼기의 수분에서 목표 수분(WATER_AIM)까지를
   칸 수만큼 나눈다. 앞 칸일수록 조금 더 많이 뺀다. */
function planLargeRounds(g) {
  const need = Math.max(0, g.residueWater - R.WATER_AIM);
  const w = [1.15, 1.1, 1.0, 0.92, 0.83].slice(0, R.PORES);
  while (w.length < R.PORES) w.push(1);
  const sum = w.reduce((a, b) => a + b, 0);
  g.large.targets = w.map(v => Math.round(need * v / sum * 10) / 10);
  g.large.round = 0;
  g.large.roundT = R.ROUND_TIME;
  g.large.startWater = g.residueWater;
  g.large.results = [];
  g.large.holdIdx = 0;
  g.large.holds = 0;
  g.large.holdDone = false;
  g.large.lap = g.large.lap || 0;
}
const roundTarget = (g) => g.large.targets[g.large.round] || 0;
const roundRemoved = (g) => Math.max(0, Math.round((g.large.startWater - g.residueWater) * 10) / 10);
// 이번에 맞춰야 하는 '초' (양쪽 화면에 같은 값이 보이도록 서버가 정한다)
const holdTarget = (g) => R.HOLD_SECS[g.large.holdIdx % R.HOLD_SECS.length];

/* ---------- 현재 소화관에서 쓸 수 있는 소화액 ---------- */
function juiceHere(g) {
  const s = stage(g).id;
  if (s === 'mouth') return g.delivered.saliva;
  if (s === 'stomach') return g.delivered.gastric;
  if (s === 'small') return Math.max(g.delivered.pancreatic, g.delivered.bile);
  return 100;
}
function efficiency(g) { return juiceHere(g) >= R.JUICE_OK ? 1 : R.LOW_JUICE_EFFICIENCY; }

/* ---------- 스테이지 진행도 ---------- */
function progress(g) {
  const s = stage(g).id;
  if (s === 'mouth') {
    return clamp01(0.55 * clamp01((100 - g.food.size) / 62) +
                   0.45 * clamp01(g.digested.starch / 26)) * 100;
  }
  if (s === 'esophagus') return clamp(g.bolus, 0, 100);
  if (s === 'stomach') {
    return clamp01(0.45 * clamp01(g.mix / 100) +
                   0.55 * clamp01(g.digested.protein / 42)) * 100;
  }
  if (s === 'small') {
    const digestedFrac = clamp01((300 - foodLeft(g)) / 210);
    const absorbFrac = clamp01(gotAll(g) / 125);
    return clamp01(0.42 * digestedFrac + 0.58 * absorbFrac) * 100;
  }
  if (s === 'large') {
    const done = g.large.round + (1 - clamp01(g.large.roundT / R.ROUND_TIME));
    return clamp01(done / R.PORES) * 100;
  }
  return 0;
}

/* ---------- 통과 조건 (과학적으로 성립해야 넘어간다) ---------- */
function canClear(g) {
  const s = stage(g).id;
  if (s === 'mouth') return g.mouth.swallows >= R.MOUTH_SWALLOWS && g.digested.starch >= 14;
  if (s === 'esophagus') return g.bolus >= 100;
  if (s === 'stomach') return g.mix >= 58 && g.digested.protein >= 22;
  if (s === 'small') return gotAll(g) >= 84 && foodLeft(g) <= 150;
  if (s === 'large') return g.large.round >= R.PORES &&
    (g.residueWater <= R.WATER_TARGET[1] || g.large.lap >= R.LARGE_MAX_LAP);
  return false;
}
// 아직 무엇이 모자라서 못 넘어가는지 (시간이 지나도 자동으로 넘어가지 않는다)
function clearHint(g) {
  const s = stage(g).id;
  if (s === 'mouth') {
    if (g.mouth.swallows < R.MOUTH_SWALLOWS)
      return '잘게 부순 음식물을 목구멍으로 넘기세요 (' + g.mouth.swallows + '/' + R.MOUTH_SWALLOWS + ')';
    if (g.digested.starch < 14) return '침이 있어야 음식물이 소화됩니다! (' + Math.round(g.digested.starch) + '/14)';
  }
  if (s === 'esophagus') {
    if (g.bolus < 100) return '음식물을 위까지 완전히 내려보내세요 (' + Math.round(g.bolus) + '/100)';
  }
  if (s === 'stomach') {
    if (g.mix < 58) return '아직 덜 섞였습니다 (' + Math.round(g.mix) + '/58)';
    if (g.digested.protein < 22) return '위액이 있어야 음식물이 소화됩니다! (' + Math.round(g.digested.protein) + '/22)';
  }
  if (s === 'small') {
    if (foodLeft(g) > 150) return '소화액으로 영양소를 더 소화하세요 (남은 ' + Math.round(foodLeft(g)) + '/150)';
    if (gotAll(g) < 84) return '소화된 영양소를 융털로 흡수하세요 (' + Math.round(gotAll(g)) + '/84)';
  }
  if (s === 'large') {
    if (g.large.round < R.PORES) return (g.large.round + 1) + '/' + R.PORES + '번 칸 진행 중';
    if (g.residueWater > R.WATER_TARGET[1]) return '물이 아직 많습니다 — 한 바퀴 더 돕니다';
  }
  return '';
}

/* ============================================================
   소화액 분비 판정 — 이 게임의 핵심
   ============================================================ */
function trySecrete(g, from, to) {
  const gl = G.GLANDS[from];
  if (!gl) return { ok: false, msg: '알 수 없는 기관입니다.', pain: 0 };

  if (from === 'gallbladder' && g.bileStored < R.BILE_DOSE) {
    return { ok: false, soft: true, pain: 0,
      msg: '쓸개가 비었습니다. 간이 만든 쓸개즙을 먼저 쓸개로 보내 저장하세요.' };
  }

  if (to === G.CORRECT_ROUTE[from]) {
    const amt = R.JUICE_PER_DROP;
    if (from === 'liver') {
      g.bileStored = clamp(g.bileStored + amt, 0, 100);
    } else if (from === 'gallbladder') {
      g.bileStored = clamp(g.bileStored - R.BILE_DOSE, 0, 100);
      g.delivered.bile = clamp(g.delivered.bile + amt, 0, R.JUICE_MAX);
    } else {
      const key = { salivary: 'saliva', gastric: 'gastric', pancreas: 'pancreatic' }[from];
      g.delivered[key] = clamp(g.delivered[key] + amt, 0, R.JUICE_MAX);
    }
    g.combo++; g.bestCombo = Math.max(g.bestCombo, g.combo);
    g.score += R.SCORE.dropRight + g.combo * R.SCORE.comboStep;
    g.trouble = clamp(g.trouble - 1.2, 0, R.TROUBLE_MAX);
    return { ok: true, pain: 0, msg: gl.juice + ' → ' + organName(to) + ' 정확!' };
  }

  let rule = G.MISROUTE[from + '>' + to];
  if (!rule && G.NO_GLAND_ORGANS[to]) rule = { pain: 15, msg: G.NO_GLAND_ORGANS[to] };
  if (!rule) rule = G.GENERIC_MISROUTE;

  g.trouble = clamp(g.trouble + rule.pain, 0, R.TROUBLE_MAX);
  g.combo = 0;
  g.score += R.SCORE.dropWrong;
  g.mistakes.push({ from, to, msg: rule.msg, stage: stage(g).name, t: Math.round(g.stageTime) });
  ev(g, 'misroute', { from, to, msg: rule.msg, pain: rule.pain });
  return { ok: false, pain: rule.pain, msg: rule.msg };
}

function organName(id) {
  const t = G.TRACT.find(x => x.id === id);
  if (t) return t.name;
  if (id === 'gallbladder') return '쓸개';
  return id;
}

/* ============================================================
   플레이어 행동
   ============================================================ */
function applyAction(g, role, a) {
  if (g.phase !== 'playing') return;
  const s = stage(g).id;
  const eff = efficiency(g);

  /* ---------------- 소화관 담당 ---------------- */
  if (role === 'tract') {
    switch (a.t) {

      case 'chew': {                      // 입 : 치아로 부수기
        if (s !== 'mouth') return;
        const power = a.grade === 'perfect' ? 5.2 : a.grade === 'good' ? 2.6 : 0;
        if (power === 0) { g.combo = 0; return; }
        g.food.size = clamp(g.food.size - power * (0.55 + 0.45 * eff), 0, 100);
        if (g.delivered.saliva >= R.JUICE_OK) {     // 침이 있어야 소화된다
          const d = Math.min(g.food.starch, 1.9 * (a.grade === 'perfect' ? 1.4 : 1));
          g.food.starch -= d; g.digested.starch += d;
        }
        g.combo++; g.bestCombo = Math.max(g.bestCombo, g.combo);
        g.score += (a.grade === 'perfect' ? R.SCORE.chewPerfect : R.SCORE.chewGood) + g.combo * R.SCORE.comboStep;
        break;
      }

      case 'wave': {                      // 식도 : 꿈틀운동
        if (s !== 'esophagus') return;
        // ★ 근육이 막혀 있으면 아무리 조여도 안 내려간다 — 짝꿍이 문제를 맞혀야 뚫린다
        if (g.eso.blocked > 0) {
          ev(g, 'hint', { msg: '근육이 막혔습니다! 짝꿍이 분류 문제를 맞혀야 뚫립니다' });
          return;
        }
        const q = clamp01(a.q || 0);
        g.bolus = clamp(g.bolus + 7.5 * q, 0, 100);
        if (q > 0.55) { g.combo++; g.score += R.SCORE.peristalsisWave + g.combo * R.SCORE.comboStep; }
        else g.combo = 0;
        break;
      }
      case 'reflux': {
        if (s !== 'esophagus') return;
        g.bolus = clamp(g.bolus - 9, 0, 100);
        g.trouble = clamp(g.trouble + 3, 0, R.TROUBLE_MAX);
        g.combo = 0;
        break;
      }

      case 'churn': {                     // 위 : 위액에 담가 소화
        if (s !== 'stomach') return;
        const q = clamp01(a.q || 0);
        g.mix = clamp(g.mix + 3.4 * q * (0.4 + 0.6 * eff), 0, 100);
        g.food.size = clamp(g.food.size - 0.55 * q, 0, 100);
        if (g.delivered.gastric >= R.JUICE_OK) {
          const d = Math.min(g.food.protein, 1.75 * q);
          g.food.protein -= d; g.digested.protein += d;
        }
        if (q > 0.5) { g.combo++; g.score += R.SCORE.churnGood + g.combo * R.SCORE.comboStep; }
        break;
      }

      case 'grind': {                     // 작은창자 : 소화액으로 영양소를 소화
        if (s !== 'small') return;
        const pan = g.delivered.pancreatic >= R.JUICE_OK;
        const bile = g.delivered.bile >= R.JUICE_OK;
        if (!pan && !bile) {
          ev(g, 'hint', { msg: '소화액이 없으면 영양소가 소화되지 않습니다!' });
          return;
        }
        const mult = (pan && bile) ? 1.7 : 0.75;
        let kind = (a.kind && g.food[a.kind] > 0.1) ? a.kind : KINDS.find(k => g.food[k] > 0.1);
        if (!kind) return;
        const d = Math.min(g.food[kind], 3.6 * mult * clamp(a.q || 1, 0, 4));
        g.food[kind] -= d; g.digested[kind] += d;
        g.combo++; g.bestCombo = Math.max(g.bestCombo, g.combo);
        g.score += R.SCORE.grind + g.combo * R.SCORE.comboStep;
        break;
      }

      case 'absorb': {                    // 작은창자 : 소화된 영양소만 흡수된다
        if (s !== 'small') return;
        if (a.ok) {
          let kind = (a.kind && g.digested[a.kind] > 0) ? a.kind :
            KINDS.reduce((b, k) => g.digested[k] > g.digested[b] ? k : b, 'starch');
          if (g.digested[kind] <= 0) return;
          const take = Math.min(g.digested[kind], 6 * clamp(a.q || 1, 0, 10));
          g.digested[kind] -= take; g.absorbed[kind] += take;
          g.residueWater = clamp(g.residueWater - 0.7, R.SMALL_WATER_FLOOR, 100);
          g.absorbed.water += 2;
          g.combo++; g.bestCombo = Math.max(g.bestCombo, g.combo);
          g.score += R.SCORE.absorbRight + g.combo * R.SCORE.comboStep;
        } else {
          g.combo = 0;
          g.score += R.SCORE.absorbWrong;
          g.trouble = clamp(g.trouble + 2.5, 0, R.TROUBLE_MAX);
          const kind = KINDS.reduce((b, k) => g.food[k] > g.food[b] ? k : b, 'starch');
          g.lost[kind] += 3;
          ev(g, 'note', { msg: '소화되지 않은 영양소는 흡수되지 않습니다! 소화액으로 먼저 소화하세요.' });
        }
        break;
      }

      case 'squeeze': {                   // 큰창자 : 물길이 뚫린 칸에서만 물이 빠진다
        if (s !== 'large') return;
        const q = clamp01(a.q || 0);
        const i = g.large.round;
        if (!g.pores[i]) {                // 물길이 없으면 아예 빠지지 않는다
          if (!g._shutWarn || g.stageTime - g._shutWarn > 3) {
            g._shutWarn = g.stageTime;
            ev(g, 'shut', { msg: '이 칸은 물길이 아직 뚫리지 않았습니다 — 물이 한 방울도 빠지지 않아요!' });
          }
          g.combo = 0;
          return;
        }
        const take = R.SQUEEZE_BASE * q;
        g.residueWater = clamp(g.residueWater - take, 0, 100);
        g.absorbed.water += take;
        g.combo++; g.score += 25 + g.combo * R.SCORE.comboStep;
        break;
      }

      // ★ 큰창자 : "몇 초 동안 흡수하세요" — 그 초에 맞춰 버튼을 떼면 물이 빠진다
      case 'hold': {
        if (s !== 'large') return;
        const i = g.large.round;
        if (!g.pores[i]) {
          ev(g, 'shut', { msg: '이 칸은 물길이 아직 뚫리지 않았습니다 — 물이 한 방울도 빠지지 않아요!' });
          g.combo = 0;
          return;
        }
        // ★ 한 칸에 한 번만 잰다
        if (g.large.holdDone) {
          ev(g, 'hint', { msg: '이 칸은 이미 흡수를 마쳤습니다 — 다음 칸에서 다시 재세요' });
          return;
        }
        const target = holdTarget(g);
        const sec = clamp(Number(a.sec) || 0, 0, 20);
        const err = Math.abs(sec - target);
        const perfect = err <= R.HOLD_TOL;
        const quality = clamp(1 - err / R.HOLD_MISS, 0, 1);
        const take = quality <= 0 ? 0 : roundTarget(g) * (R.HOLD_BASE + R.HOLD_GAIN * quality);
        g.residueWater = clamp(g.residueWater - take, 0, 100);
        g.absorbed.water += take;
        g.large.holdDone = true;
        g.large.holdIdx++;
        g.large.holds++;
        if (perfect) { g.combo++; g.bestCombo = Math.max(g.bestCombo, g.combo); g.score += 260 + g.combo * R.SCORE.comboStep; }
        else if (quality > 0.45) { g.combo++; g.score += 120; }
        else { g.combo = 0; }
        // ★ 이 칸의 흡수는 끝났다 — 20초를 다 기다리지 않고 곧바로 다음 칸으로 간다
        g.large.roundT = Math.min(g.large.roundT, quality > 0.45 ? 1.3 : 2.2);
        ev(g, 'hold', {
          ok: quality > 0.45, perfect,
          target, sec: Math.round(sec * 100) / 100,
          err: Math.round(err * 100) / 100,
          took: Math.round(take * 10) / 10,
          msg: perfect ? ('정확! ' + target + '초에 딱 맞췄습니다 (오차 ' + err.toFixed(2) + '초)')
             : (sec > target ? ('너무 길었어요 — ' + target + '초인데 ' + sec.toFixed(2) + '초 (+' + err.toFixed(2) + ')')
                             : ('너무 짧았어요 — ' + target + '초인데 ' + sec.toFixed(2) + '초 (−' + err.toFixed(2) + ')'))
        });
        break;
      }

      case 'swallow': {                   // 입 : 잘게 부순 음식물을 목구멍으로 넘긴다
        if (s !== 'mouth') return;
        g.mouth.swallows++;                       // ★ 통과 조건은 '넘긴 횟수'
        g.food.size = clamp(g.food.size - 9.5, 0, 100);
        if (g.delivered.saliva >= R.JUICE_OK) {
          const d = Math.min(g.food.starch, 3.4);
          g.food.starch -= d; g.digested.starch += d;
        }
        g.combo++; g.bestCombo = Math.max(g.bestCombo, g.combo);
        g.score += 90 + g.combo * R.SCORE.comboStep;
        ev(g, 'hint', { msg: '목구멍으로 넘겼습니다 (' + g.mouth.swallows + '/' + R.MOUTH_SWALLOWS + ')' });
        break;
      }

      case 'call': ev(g, 'call', { role: 'tract', msg: a.msg || '소화액이 필요해요!' }); break;
    }
    return;
  }

  /* ---------------- 소화액 담당 ---------------- */
  if (role === 'juice') {
    switch (a.t) {
      case 'drop': {
        const r = trySecrete(g, a.from, a.to);
        ev(g, 'drop', { from: a.from, to: a.to, ok: r.ok, soft: !!r.soft, msg: r.msg });
        break;
      }
      case 'produce': g.score += 18; break;

      case 'classify': {                  // 식도 단계 : 소화관 / 소화샘 분류
        if (a.ok) {
          g.combo++; g.bestCombo = Math.max(g.bestCombo, g.combo);
          g.score += R.SCORE.classifyRight + g.combo * R.SCORE.comboStep;
          // ★ 정답을 맞히면 짝꿍 쪽의 막힌 근육이 뚫린다 (둘의 연계)
          if (s === 'esophagus' && g.eso.blocked > 0) {
            g.eso.blocked = 0; g.eso.ring = -1; g.eso.t = R.ESO_BLOCK_EVERY;
            g.score += 120;
            ev(g, 'unblock', { msg: '짝꿍이 문제를 맞혀 막힌 근육이 뚫렸습니다!' });
          }
        } else { g.combo = 0; g.score += R.SCORE.classifyWrong; }
        break;
      }

      case 'gate': {                      // 큰창자 : 지금 찌꺼기가 갇힌 칸의 물길을 뚫는다
        if (s !== 'large') return;
        const idx = g.large.round;
        if (idx >= g.pores.length || g.pores[idx]) return;
        g.pores[idx] = true;
        g.waterGate = Math.round(g.pores.filter(Boolean).length / g.pores.length * 100);
        g.score += 90;
        ev(g, 'gate', { idx, msg: (idx + 1) + '번 칸 물길이 뚫렸습니다! 이제 물을 뺄 수 있어요' });
        break;
      }

      case 'waste': {                     // 만든 소화액을 제때 못 보내 굳어버림
        g.combo = 0; g.score -= 30;
        ev(g, 'waste', { msg: '소화액이 굳어 버렸습니다 — 만들면 바로 보내세요!' });
        break;
      }

      case 'call': ev(g, 'call', { role: 'juice', msg: a.msg || '준비됐어요!' }); break;
    }
  }
}

/* ============================================================
   매 틱마다 일어나는 자연 현상
   ============================================================ */
function tick(g, dt) {
  if (g.phase === 'countdown') {
    g.countdown -= dt;
    if (g.countdown <= 0) { g.phase = 'playing'; g.stageTime = 0; ev(g, 'stagestart', { stage: stage(g).id }); }
    return;
  }
  if (g.phase !== 'playing') return;

  g.stageTime += dt;
  g.totalTime += dt;
  const s = stage(g).id;

  if (g.trouble >= R.TROUBLE_MAX) { finish(g, 'sick'); return; }

  for (const k of Object.keys(g.delivered)) {
    const rate = (R.JUICE_DECAY && R.JUICE_DECAY[k]) || R.JUICE_DECAY_PER_SEC;
    g.delivered[k] = clamp(g.delivered[k] - rate * dt, 0, R.JUICE_MAX);
  }

  if (s === 'stomach' && g.delivered.gastric > R.GASTRIC_BURN_ABOVE) {
    g.trouble = clamp(g.trouble + R.GASTRIC_BURN_PAIN * dt, 0, R.TROUBLE_MAX);
  }

  if (s === 'small') {
    // 소화액이 충분하면 저절로도 조금씩 소화된다 (대부분은 플레이어가 직접)
    const pan = g.delivered.pancreatic >= R.JUICE_OK;
    const bile = g.delivered.bile >= R.JUICE_OK;
    if (pan && bile) {
      const kind = KINDS.find(k => g.food[k] > 0);
      if (kind) { const d = Math.min(g.food[kind], 2.0 * dt); g.food[kind] -= d; g.digested[kind] += d; }
    }
    g.residueWater = clamp(g.residueWater - 1.1 * dt, R.SMALL_WATER_FLOOR, 100);
  }

  if (s === 'esophagus') {
    // ★ 가끔 근육이 막힌다. 소화관 담당은 못 뚫는다 — 소화액 담당이 문제를 맞혀야 한다.
    if (g.eso.blocked > 0) {
      g.eso.t -= dt;
      if (g.eso.t <= 0) {                    // 너무 오래 막혀 있으면 음식물이 역류한다
        g.eso.t = 4;
        g.bolus = clamp(g.bolus - 4, 0, 100);
        g.trouble = clamp(g.trouble + 2, 0, R.TROUBLE_MAX);
        ev(g, 'hint', { msg: '아직 막혀 있습니다 — 짝꿍이 분류 문제를 맞혀 주세요!' });
      }
    } else {
      g.eso.t -= dt;
      if (g.eso.t <= 0) {
        g.eso.blocked = 1;
        g.eso.ring = (Math.random() * 7) | 0;
        g.eso.t = R.ESO_BLOCK_HOLD;
        ev(g, 'esoblock', { ring: g.eso.ring,
          msg: '근육이 막혔습니다! 소화액 담당이 분류 문제를 맞혀야 뚫립니다' });
      }
    }
  }

  if (s === 'large') {
    if (!g.large.targets.length) {
      planLargeRounds(g);
      ev(g, 'round', { round: 1, total: R.PORES, target: roundTarget(g),
        msg: '1번 칸에 갇혔습니다! ' + R.ROUND_TIME + '초 안에 물길을 뚫고 물 ' + roundTarget(g).toFixed(1) + '%를 빼세요' });
    }
    // 배탈이 심하면 칸을 지나가는 시간이 짧아진다 (설사의 원리)
    const hurry = 1 + g.trouble * R.TROUBLE_TRANSIT_BOOST * 1.6;
    g.large.roundT -= dt * hurry;
    if (g.large.roundT <= 0) {
      const target = roundTarget(g), got = roundRemoved(g);
      const ok = got >= target * R.ROUND_PASS;
      g.large.results.push({ round: g.large.round + 1, target: Math.round(target * 10) / 10, got: Math.round(got * 10) / 10, ok });
      if (ok) { g.score += 220; g.combo++; }
      else { g.combo = 0; g.trouble = clamp(g.trouble + 4, 0, R.TROUBLE_MAX); }
      ev(g, 'roundend', { round: g.large.round + 1, ok, target: Math.round(target * 10) / 10, got: Math.round(got * 10) / 10,
        msg: ok ? (g.large.round + 1) + '번 칸 통과! (' + got.toFixed(1) + '% / ' + target.toFixed(1) + '%)'
                : (g.large.round + 1) + '번 칸은 물을 덜 뺐습니다 (' + got.toFixed(1) + '% / ' + target.toFixed(1) + '%)' });
      g.large.round++;
      g.large.roundT = R.ROUND_TIME;
      g.large.startWater = g.residueWater;
      g.large.holdDone = false;              // 새 칸 → 다시 한 번 잴 수 있다
      if (g.large.round < R.PORES) {
        ev(g, 'round', { round: g.large.round + 1, total: R.PORES, target: roundTarget(g),
          msg: (g.large.round + 1) + '번 칸으로 이동! 목표 ' + roundTarget(g).toFixed(1) + '%' });
      } else if (g.residueWater > R.WATER_TARGET[1] && g.large.lap < R.LARGE_MAX_LAP) {
        // ★ 물을 충분히 못 뺐으면 큰창자를 한 바퀴 더 돈다 (자동으로 안 넘어간다)
        g.large.lap++;
        const keepLap = g.large.lap;
        planLargeRounds(g);
        g.large.lap = keepLap;
        ev(g, 'lap', { lap: keepLap + 1,
          msg: '물이 아직 ' + Math.round(g.residueWater) + '% 입니다! 큰창자를 한 바퀴 더 돕니다 (' + (keepLap + 1) + '바퀴째)' });
      }
    }
    g.transit = clamp(progress(g), 0, 100);
  }

  g.trouble = clamp(g.trouble - R.TROUBLE_RECOVER_PER_SEC * dt, 0, R.TROUBLE_MAX);

  if (g.trouble >= R.TROUBLE_REFLUX && !g._refluxCd) {
    g._refluxCd = 6;
    if (s === 'mouth') g.food.size = clamp(g.food.size + 6, 0, 100);
    if (s === 'esophagus') g.bolus = clamp(g.bolus - R.REFLUX_SETBACK, 0, 100);
    if (s === 'stomach') g.mix = clamp(g.mix - R.REFLUX_SETBACK, 0, 100);
    if (s === 'small') { const k = KINDS.find(x => g.digested[x] > 6); if (k) { g.digested[k] -= 6; g.food[k] += 6; } }
    ev(g, 'reflux', { msg: '배가 아픕니다! 소화액이 잘못 흘러 역류가 일어났습니다.' });
  }
  if (g._refluxCd) g._refluxCd = Math.max(0, g._refluxCd - dt);

  /* ★ 통과 조건을 채워야만 다음 기관으로 간다 — 시간이 지나도 자동으로 넘어가지 않는다 */
  if (canClear(g)) {
    const par = stage(g).time;
    const t = Math.round(g.stageTime);
    g.stageLog.push({ stage: stage(g).name, time: t, par, over: t > par, score: g.score, trouble: Math.round(g.trouble) });
    g.score += R.SCORE.stageClear + Math.max(0, Math.round((par - g.stageTime) * 12));
    if (g.stageIndex >= G.STAGES.length - 1) { finish(g, 'done'); return; }
    g.stageIndex++; g.stageTime = 0; g._overPar = false;
    g.phase = 'stageclear'; g._clearWait = 4.5;
    ev(g, 'stageclear', { next: stage(g).id, name: stage(g).name });
    return;
  }

  // 목표 시간을 넘기면 한 번만 알려 준다 (넘어가지는 않는다)
  if (g.stageTime > stage(g).time && !g._overPar) {
    g._overPar = true;
    ev(g, 'overpar', { msg: stage(g).name + ' 목표 시간을 넘겼습니다 — 통과 조건을 채워야 넘어갑니다!' });
  }
}

function tickClear(g, dt) {
  if (g.phase !== 'stageclear') return;
  g._clearWait -= dt;
  if (g._clearWait <= 0) { g.phase = 'playing'; g.combo = 0; ev(g, 'stagestart', { stage: stage(g).id }); }
}

/* ============================================================
   최종 판정 — 브리스톨 대변 척도
   ============================================================ */
function bristolFromState(g) {
  const absorbFrac = clamp01(gotAll(g) / 170);
  let w = g.residueWater;
  w += (foodLeft(g) / 300) * 26;                                  // 소화 못 한 영양소가 물을 끌어당긴다
  w += (g.lost.starch + g.lost.protein + g.lost.fat) * 0.12;
  w = clamp(w, 0, 100);

  let type;
  if (w >= 68) type = 7;
  else if (w >= 56) type = 6;
  else if (w >= 45) type = 5;
  else if (w >= 31) type = 4;
  else if (w >= 22) type = 3;
  else if (w >= 14) type = 2;
  else type = 1;

  if (absorbFrac < 0.42 && type < 5) type = 5;
  if (g.trouble >= 85 && type < 6) type = 6;
  return { type, water: Math.round(w), absorbFrac };
}

function finish(g, reason) {
  const b = bristolFromState(g);
  const info = G.BRISTOL.find(x => x.type === b.type);

  /* ★ 등급은 '얼마나 빨리 끝냈는가' 로 매긴다.
     단, 똥이 나쁘면 C 아래로 내려가고, 오분비가 많으면 한 단계 떨어진다. */
  const ORDER = ['S', 'A', 'B', 'C', 'D', 'F'];
  const down = (gr, n) => ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(gr) + (n || 1))];
  const worst = (a, b2) => ORDER[Math.max(ORDER.indexOf(a), ORDER.indexOf(b2))];

  const parTotal = G.STAGES.reduce((a, x) => a + x.time, 0);
  const ratio = parTotal > 0 ? g.totalTime / parTotal : 9;
  const P = R.PAR_GRADE;
  let grade = ratio <= P.S ? 'S' : ratio <= P.A ? 'A' : ratio <= P.B ? 'B' : ratio <= P.C ? 'C' : 'D';
  if (reason === 'sick') grade = 'F';
  else {
    if (!info.good) grade = worst(grade, 'C');            // 설사·변비면 C 이하
    if (g.mistakes.length >= 3) grade = down(grade, 1);   // 오분비가 잦으면 한 단계 아래
  }

  if (info.good) g.score += R.SCORE.finish;
  g.score += Math.max(0, Math.round((parTotal - g.totalTime) * 10));
  g.score += Math.round(gotAll(g) * 6) - g.mistakes.length * 120 - Math.round(g.trouble * 4);
  g.score = Math.max(0, g.score);

  g.result = {
    reason, grade,
    bristol: b.type, bristolName: info.name, bristolEmoji: info.emoji,
    verdict: reason === 'sick' ? '급성 소화불량' : info.verdict,
    why: reason === 'sick'
      ? '소화액을 엉뚱한 기관으로 계속 보내 소화계가 망가졌습니다. 간이 만든 쓸개즙은 쓸개로, 이자액은 작은창자로!'
      : info.why,
    water: b.water,
    absorbPercent: Math.round(b.absorbFrac * 100),
    absorbed: { starch: Math.round(g.absorbed.starch), protein: Math.round(g.absorbed.protein), fat: Math.round(g.absorbed.fat), water: Math.round(g.absorbed.water) },
    lost: { starch: Math.round(g.lost.starch), protein: Math.round(g.lost.protein), fat: Math.round(g.lost.fat) },
    leftover: { starch: Math.round(g.food.starch), protein: Math.round(g.food.protein), fat: Math.round(g.food.fat) },
    trouble: Math.round(g.trouble),
    mistakes: g.mistakes.slice(0, 12),
    mistakeCount: g.mistakes.length,
    bestCombo: g.bestCombo,
    score: g.score,
    stageLog: g.stageLog,
    totalTime: Math.round(g.totalTime),
    parTime: parTotal,
    timeRatio: Math.round(ratio * 100) / 100,
    largeRounds: g.large.results.slice()
  };
  g.phase = 'result';
  ev(g, 'finish', {});
}

function snapshot(g) {
  return {
    phase: g.phase, stageIndex: g.stageIndex,
    stage: stage(g).id, stageName: stage(g).name, stageGoal: stage(g).goal,
    stageTime: Math.round(g.stageTime * 10) / 10, stageLimit: stage(g).time,
    totalTime: Math.round(g.totalTime),
    parTotal: G.STAGES.reduce((a, x) => a + x.time, 0),
    countdown: Math.max(0, Math.ceil(g.countdown)),
    progress: Math.round(progress(g) * 10) / 10,
    hint: clearHint(g),
    food: round1(g.food), digested: round1(g.digested),
    absorbed: round1(g.absorbed), lost: round1(g.lost),
    delivered: round1(g.delivered),
    bileStored: Math.round(g.bileStored),
    waterGate: Math.round(g.waterGate),
    pores: g.pores.slice(),
    large: {
      round: g.large.round, rounds: R.PORES,
      roundT: Math.round(g.large.roundT * 10) / 10,
      roundLimit: R.ROUND_TIME,
      target: Math.round(roundTarget(g) * 10) / 10,
      removed: roundRemoved(g),
      open: !!g.pores[g.large.round],
      holdTarget: holdTarget(g),
      holdIdx: g.large.holdIdx,
      holdDone: !!g.large.holdDone,
      lap: g.large.lap || 0,
      results: g.large.results.slice()
    },
    swallows: g.mouth.swallows, swallowNeed: R.MOUTH_SWALLOWS,
    eso: { blocked: g.eso.blocked, ring: g.eso.ring },
    mix: Math.round(g.mix), bolus: Math.round(g.bolus), transit: Math.round(g.transit),
    residueWater: Math.round(g.residueWater),
    trouble: Math.round(g.trouble * 10) / 10,
    score: g.score, combo: g.combo,
    result: g.result
  };
}
function round1(o) { const r = {}; for (const k in o) r[k] = Math.round(o[k] * 10) / 10; return r; }
function drainEvents(g) { const e = g._events; g._events = []; return e; }

module.exports = {
  newGame, applyAction, tick, tickClear, snapshot, drainEvents, poreCenter, poreAt, planLargeRounds,
  progress, canClear, trySecrete, bristolFromState, finish, stage, organName, juiceHere, efficiency
};
