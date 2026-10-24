/* ============================================================
   gamedata.js — 과학 데이터 · 게임 규칙 (서버/클라이언트 공용)
   중2 과학 Ⅴ. 동물과 에너지 - 1. 소화 : 소화계의 구조와 기능

   ★ 이 차시의 학습 범위 (교과서 그대로)
     · 소화계 = 소화관 + 소화샘
     · 입   : 치아로 음식물을 잘게 부수며, 침에 의해 음식물이 소화된다
     · 침샘 : 소화액인 침을 분비한다
     · 식도 : 음식물이 이동하는 통로이다
     · 간   : 소화액인 쓸개즙을 만들어 쓸개로 보낸다
     · 위   : 주머니 모양으로, 소화액인 위액을 분비하여 음식물을 소화한다
     · 이자 : 소화액인 이자액을 만들어 작은창자로 분비한다
     · 쓸개 : 쓸개즙을 저장하였다가 작은창자로 분비한다
     · 작은창자 : 길고 꼬불꼬불한 관 모양으로, 분비된 소화액에 의해 영양소가
                  소화되며, 소화된 영양소를 흡수한다
     · 큰창자 : 물을 일부 흡수하며, 흡수되지 않은 찌꺼기는 항문으로 배출된다
   ※ 모세혈관·암죽관으로 나뉘는 흡수는 다음 차시 내용이므로 다루지 않는다.
   ============================================================ */

const GAMEDATA = {

  /* ---------- 소화관 (음식물이 지나가는 길) ---------- */
  TRACT: [
    { id: 'mouth',     name: '입',       desc: '치아로 음식물을 잘게 부수며, 침에 의해 음식물이 소화된다' },
    { id: 'esophagus', name: '식도',     desc: '음식물이 이동하는 통로이다' },
    { id: 'stomach',   name: '위',       desc: '주머니 모양으로, 소화액인 위액을 분비하여 음식물을 소화한다' },
    { id: 'small',     name: '작은창자', desc: '길고 꼬불꼬불한 관 모양으로, 분비된 소화액에 의해 영양소가 소화되며 소화된 영양소를 흡수한다' },
    { id: 'large',     name: '큰창자',   desc: '물을 일부 흡수하며, 흡수되지 않은 찌꺼기는 항문으로 배출된다' },
    { id: 'anus',      name: '항문',     desc: '찌꺼기가 대변으로 배출되는 곳' }
  ],

  /* ---------- 소화샘 (소화액을 만드는 기관) ---------- */
  GLANDS: {
    salivary: { name: '침샘', juice: '침',     to: 'mouth',       note: '소화액인 침을 분비한다' },
    gastric:  { name: '위샘', juice: '위액',   to: 'stomach',     note: '위가 스스로 위액을 분비한다' },
    liver:    { name: '간',   juice: '쓸개즙', to: 'gallbladder', note: '★ 소화액인 쓸개즙을 만들어 쓸개로 보낸다' },
    gallbladder: { name: '쓸개', juice: '쓸개즙', to: 'small',    note: '★ 쓸개즙을 저장하였다가 작은창자로 분비한다' },
    pancreas: { name: '이자', juice: '이자액', to: 'small',       note: '소화액인 이자액을 만들어 작은창자로 분비한다' }
  },

  /* ---------- 소화계 분류 (미니게임용) ---------- */
  CLASSIFY: [
    { name: '입',       type: 'tract' }, { name: '식도',     type: 'tract' },
    { name: '위',       type: 'tract' }, { name: '작은창자', type: 'tract' },
    { name: '큰창자',   type: 'tract' }, { name: '항문',     type: 'tract' },
    { name: '침샘',     type: 'gland' }, { name: '간',       type: 'gland' },
    { name: '쓸개',     type: 'gland' }, { name: '이자',     type: 'gland' }
  ],

  /* ---------- ★ 정답 경로 : 어느 소화액이 어디로 가야 하는가 ---------- */
  CORRECT_ROUTE: {
    salivary: 'mouth',
    gastric: 'stomach',
    liver: 'gallbladder',      // 간 → 쓸개 (위나 작은창자로 직행 금지!)
    gallbladder: 'small',      // 쓸개 → 작은창자
    pancreas: 'small'
  },

  /* ---------- 소화액을 보낼 수 있는 목적지 (선택기 순서 = 실제 소화 순서) ---------- */
  DESTINATIONS: ['mouth', 'esophagus', 'stomach', 'gallbladder', 'small', 'large'],

  /* ---------- 오분비(잘못 보냈을 때) 벌칙과 설명 ---------- */
  MISROUTE: {
    'liver>stomach':       { pain: 26, msg: '간이 만든 쓸개즙은 위로 가지 않습니다! 간은 쓸개즙을 만들어 쓸개로 보냅니다.' },
    'liver>small':         { pain: 18, msg: '간에서 작은창자로 바로 갈 수 없습니다. 쓸개즙은 쓸개에 저장되었다가 작은창자로 분비됩니다.' },
    'liver>mouth':         { pain: 22, msg: '입으로 오는 소화액은 침입니다. 쓸개즙은 간 → 쓸개 순서로 갑니다.' },
    'gallbladder>stomach': { pain: 26, msg: '쓸개는 쓸개즙을 저장하였다가 작은창자로 분비합니다. 위가 아닙니다!' },
    'pancreas>stomach':    { pain: 22, msg: '이자는 이자액을 만들어 작은창자로 분비합니다. 위가 아닙니다!' },
    'pancreas>gallbladder':{ pain: 18, msg: '쓸개에 저장되는 것은 간이 만든 쓸개즙입니다. 이자액은 작은창자로 갑니다.' },
    'gastric>small':       { pain: 20, msg: '위액은 위에서 음식물을 소화하는 소화액입니다. 작은창자로 보내면 안 됩니다.' },
    'gastric>mouth':       { pain: 22, msg: '위액이 입으로 올라왔습니다. 이것이 바로 역류입니다!' },
    'salivary>stomach':    { pain: 14, msg: '침은 입에서 음식물을 소화합니다. 위에서는 위액이 일을 합니다.' }
  },
  GENERIC_MISROUTE: { pain: 16, msg: '이 소화액은 그곳으로 가지 않습니다.' },

  NO_GLAND_ORGANS: {
    esophagus: '식도는 음식물이 이동하는 통로일 뿐, 소화액이 나오지 않습니다.',
    large:     '큰창자는 물을 흡수하는 곳입니다. 소화액이 분비되지 않습니다.',
    anus:      '항문은 찌꺼기를 내보내는 곳입니다.'
  },

  /* ---------- 스테이지 ----------
     time = '목표 시간(파)'. 시간이 지나도 자동으로 넘어가지 않는다.
     통과 조건을 채워야만 다음 기관으로 간다. 등급은 총 걸린 시간으로 매긴다. */
  STAGES: [
    { id: 'mouth',     name: '입',       goal: '치아로 잘게 부수고 침으로 소화한다', time: 42 },
    { id: 'esophagus', name: '식도',     goal: '꿈틀운동으로 음식물을 위까지 내려보낸다', time: 30 },
    { id: 'stomach',   name: '위',       goal: '위액을 분비하여 음식물을 소화한다', time: 52 },
    { id: 'small',     name: '작은창자', goal: '길고 꼬불꼬불한 관을 지나며 소화하고 흡수한다', time: 75 },
    { id: 'large',     name: '큰창자',   goal: '물길을 열어 칸마다 물을 알맞게 흡수한다', time: 70 }
  ],

  /* ---------- 영양소 (표시용) ---------- */
  NUTRIENTS: {
    starch:  { name: '녹말',   color: '#f4b942', icon: '🍚' },
    protein: { name: '단백질', color: '#5aa9e6', icon: '🍗' },
    fat:     { name: '지방',   color: '#f4e04d', icon: '🧈' }
  },

  /* ---------- 조절 손잡이 ---------- */
  RULES: {
    TICK_HZ: 20,
    ROLES: ['tract', 'juice'],

    /* ★ 소화액이 '일할 수 있는 상태'로 남아 있는 시간
       한 번 보내면 JUICE_PER_DROP 까지 차고, 초당 JUICE_DECAY 만큼 줄어든다.
       JUICE_OK(35) 아래로 내려가면 소화가 멈춘다.
         → 한 번 보냈을 때 버티는 시간 = (JUICE_PER_DROP - JUICE_OK) / JUICE_DECAY
         위액 7초 · 쓸개즙/이자액 5초 · 침 5.8초 */
    JUICE_DECAY_PER_SEC: 6.0,                 // 기본값 (아래에 없는 소화액용)
    JUICE_DECAY: { saliva: 6.0, gastric: 5.0, bile: 7.0, pancreatic: 7.0 },
    JUICE_PER_DROP: 70,
    BILE_DOSE: 30,
    JUICE_MAX: 100,
    JUICE_OK: 35,
    LOW_JUICE_EFFICIENCY: 0.30,

    // 소화액이 완성되면 이 시간 안에 목적지를 골라 보내야 한다 (안 그러면 버려짐)
    SEND_WINDOW: 10,

    // 입 : 잘게 부순 음식물을 목구멍으로 몇 번 넘겨야 통과하는가
    MOUTH_SWALLOWS: 5,

    // ★ 식도 : 가끔 근육이 막힌다. 소화관 담당은 스스로 못 뚫고,
    //   소화액 담당이 분류 문제를 맞혀야 뚫린다 (둘의 연계).
    ESO_BLOCK_EVERY: 9,       // 뚫린 뒤 다음에 막히기까지의 시간(초)
    ESO_BLOCK_HOLD: 4,        // 막힌 채 이만큼 지나면 음식물이 조금씩 역류한다

    // ---- 큰창자 : 칸(라운드) 방식 ----
    // 찌꺼기는 칸 하나에 ROUND_TIME 초 동안 갇힌다. 그 동안 2P가 물길을 이어 주어야
    // 1P가 물을 뺄 수 있다. 물길이 막힌 칸에서는 아무리 주물러도 물이 빠지지 않는다.
    PORES: 4,                 // = 칸(라운드) 개수. 물길도 4개를 뚫어야 한다
    ROUND_TIME: 18,           // 한 칸에 갇혀 있는 최대 시간(초) — 초를 맞추면 바로 다음 칸으로
    WATER_AIM: 33,            // 최종 목표 수분(%) — 칸별 목표를 이 값에서 역산한다
    ROUND_PASS: 0.8,          // 목표의 이만큼을 빼면 그 칸 성공
    SQUEEZE_BASE: 1.35,       // (옛 방식) 한 번 누를 때 빠지는 물의 양

    // ★ 큰창자 소화관 : "몇 초 동안 흡수하세요" → 버튼을 꾹 눌렀다가 그 초에 맞춰 떼기
    // 화면에 초시계는 보이지 않는다. 스스로 세어야 한다.
    HOLD_SECS: [3, 2.5, 4, 2, 3.5, 4.5, 2.5, 3],
    HOLD_TOL: 0.2,            // 이 오차 안이면 '정확!'
    HOLD_MISS: 1.4,           // 이 오차를 넘으면 물이 한 방울도 빠지지 않는다
    // ★ 한 칸에 딱 한 번만 잰다. 그 한 번으로 그 칸의 수분 흡수가 결정된다.
    //   빠지는 물 = 칸 목표 × (HOLD_BASE + HOLD_GAIN × 정확도)
    //   → 정확히 맞추면 목표를 살짝 넘고, 0.6초쯤 어긋나면 목표에 못 미친다
    HOLD_BASE: 0.35,
    HOLD_GAIN: 0.75,

    GASTRIC_BURN_ABOVE: 92,
    GASTRIC_BURN_PAIN: 0.8,

    // ---- 기관마다 있는 체력 (소화관 담당) ----
    // 위험 요소에 닿으면 깎이고, 0이 되면 그 기관에서는 더 이상 일할 수 없다.
    // 짝꿍이 그 기관에 알맞은 소화액(큰창자는 물길)을 보내 주면 회복된다.
    HP_MAX: 100,
    HP_REVIVE: 55,            // 짝꿍 도움으로 회복되는 양
    HURT: { molar: 26, acid: 25, drop: 22, cramp: 24, reflux: 12, strain: 9 },

    // ★ 등급 기준 : 총 걸린 시간 ÷ 목표 시간 합계
    PAR_GRADE: { S: 0.85, A: 1.15, B: 1.5, C: 2.0 },
    LARGE_MAX_LAP: 3,         // 물을 못 빼면 큰창자를 최대 이만큼 더 돈다

    TROUBLE_MAX: 100,
    TROUBLE_REFLUX: 70,
    TROUBLE_RECOVER_PER_SEC: 0.7,
    REFLUX_SETBACK: 14,

    SCORE: {
      chewPerfect: 60, chewGood: 30,
      peristalsisWave: 40,
      churnGood: 45,
      grind: 40,
      absorbRight: 70, absorbWrong: -50,
      dropRight: 55, dropWrong: -80,
      classifyRight: 45, classifyWrong: -40,
      comboStep: 5,
      stageClear: 400,
      finish: 1000
    },

    WATER_TARGET: [24, 42],
    SMALL_WATER_FLOOR: 62,
    TROUBLE_TRANSIT_BOOST: 0.011
  },

  /* ---------- 결과 판정 : 브리스톨 대변 척도 ---------- */
  BRISTOL: [
    { type: 1, name: '염소똥형',   emoji: '⚫⚫⚫', verdict: '심한 변비', good: false,
      why: '큰창자에서 물을 너무 많이 흡수했습니다. 단단한 덩어리로 끊어집니다.' },
    { type: 2, name: '울퉁불퉁형', emoji: '🟤',     verdict: '변비',      good: false,
      why: '물이 많이 빠져 딱딱합니다. 큰창자를 지나는 시간이 너무 길었습니다.' },
    { type: 3, name: '갈라진형',   emoji: '💩',     verdict: '좋음',      good: true,
      why: '표면에 금이 있지만 건강한 변입니다.' },
    { type: 4, name: '매끈한 뱀형',emoji: '💩✨',   verdict: '최고!',     good: true,
      why: '소화·흡수·수분 조절이 모두 알맞았습니다. 완벽한 소화입니다!' },
    { type: 5, name: '조각형',     emoji: '🟫',     verdict: '조금 묽음', good: false,
      why: '물이 덜 흡수되었습니다. 큰창자에서 조금 더 흡수해야 합니다.' },
    { type: 6, name: '죽형',       emoji: '🟠',     verdict: '무른 변',   good: false,
      why: '음식물이 큰창자를 너무 빨리 지나갔습니다.' },
    { type: 7, name: '물형',       emoji: '💦',     verdict: '설사',      good: false,
      why: '소화가 제대로 안 됐거나 장이 자극을 받아 물을 거의 흡수하지 못했습니다.' }
  ],

  /* ---------- 로딩 중 학습 문구 (전부 이번 차시 범위) ---------- */
  TIPS: [
    '소화계는 음식물이 지나가는 소화관과, 소화액을 만드는 소화샘으로 이루어진다.',
    '소화관 : 입 → 식도 → 위 → 작은창자 → 큰창자 → 항문',
    '소화샘 : 침샘 · 간 · 쓸개 · 이자 (위는 스스로 위액을 분비한다)',
    '입에서는 치아로 음식물을 잘게 부수고, 침에 의해 음식물이 소화된다.',
    '식도는 음식물이 이동하는 통로일 뿐, 소화액이 나오지 않는다.',
    '위는 주머니 모양이고, 위액을 분비하여 음식물을 소화한다.',
    '★ 간은 쓸개즙을 만들어 쓸개로 보낸다. 위나 작은창자로 직접 보내지 않는다!',
    '★ 쓸개는 쓸개즙을 저장하였다가 작은창자로 분비한다.',
    '이자는 이자액을 만들어 작은창자로 분비한다.',
    '작은창자는 길고 꼬불꼬불한 관 모양이다. 소화액으로 영양소를 소화하고, 소화된 영양소를 흡수한다.',
    '소화되지 않은 큰 영양소는 흡수되지 않는다. 그래서 소화가 먼저다!',
    '큰창자는 물을 일부 흡수하고, 흡수되지 않은 찌꺼기는 항문으로 배출된다.'
  ]
};

if (typeof module !== 'undefined' && module.exports) module.exports = GAMEDATA;
if (typeof window !== 'undefined') window.GAMEDATA = GAMEDATA;
