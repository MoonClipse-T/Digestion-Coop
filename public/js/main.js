/* ============================================================
   main.js — 화면 전환 · HUD · 스테이지 연결
   ============================================================ */
(function () {
  const G = window.GAMEDATA;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  let myRole = 'tract';
  let curStage = null, curPhase = null;
  let snap = null;
  let resultShown = false;      // 결과 화면을 이미 그렸는가

  function show(id) {
    $$('.screen').forEach(s => s.classList.toggle('on', s.id === id));
    if (id === 'scr-game') { setTimeout(() => E.resize(), 50); setTimeout(() => E.resize(), 320); }
  }

  /* ---- 전체화면 (태블릿에서 화면을 꽉 채우기) ---- */
  const fs = $('#btn-fs');
  if (fs) fs.onclick = () => {
    const el = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        const p = req.call(el);
        if (p && p.then) p.then(() => {
          if (screen.orientation && screen.orientation.lock) {
            try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
          }
        }).catch(() => {});
      }
    }
    setTimeout(() => E.resize(), 350);
  };
  document.addEventListener('fullscreenchange', () => setTimeout(() => E.resize(), 250));

  /* ================= 시작 화면 ================= */
  $$('.role').forEach(b => b.onclick = () => {
    $$('.role').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    myRole = b.dataset.role;
  });

  const savedName = localStorage.getItem('dg_name');
  if (savedName) $('#name').value = savedName;

  function nameOrWarn() {
    const n = $('#name').value.trim();
    if (!n) { $('#title-err').textContent = '이름을 먼저 적어 주세요.'; return null; }
    localStorage.setItem('dg_name', n);
    return n;
  }
  $('#btn-create').onclick = () => {
    const n = nameOrWarn(); if (!n) return;
    Net.send({ type: 'create', name: n, role: myRole });
  };
  $('#btn-join').onclick = () => {
    const n = nameOrWarn(); if (!n) return;
    const c = $('#code').value.trim();
    if (c.length !== 4) { $('#title-err').textContent = '방 번호 4자리를 입력하세요.'; return; }
    Net.send({ type: 'join', name: n, code: c, role: myRole });
  };
  $('#code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-join').click(); });

  /* ================= 대기실 ================= */
  const MISSION = {
    tract: `<h4>🍚 소화관 담당 — 음식물과 함께 여행합니다</h4>
      <p style="color:#ffd166;margin:0 0 8px">왼쪽 아래를 끌어서 이동 · 초록 버튼 점프 · 노란 버튼 행동</p>
      <ul>
        <li><b>입</b> 어금니 자리는 <u>한 단 아래 구덩이</u>입니다. 혀 위에서 밀어 떨어뜨리고 → <b style="color:#7dff9b">어금니가 열릴 때 뛰어내려 [줍기]</b> → 점프해 나와 목구멍으로 [던지기]</li>
        <li><b>식도</b> 음식물 <u>바로 뒤</u>의 근육 조이기. 막힌 근육은 한 번 더 눌러 뚫기</li>
        <li><b>위</b> ★ <b style="color:#ff9c9c">몸으로 밀어도 안 떨어집니다</b> — <u>[잡기]로 들어 [던지기]</u>! 위액과 천장에서 떨어지는 방울은 피하세요</li>
        <li><b>작은창자</b> 미로에 흩어진 <u>덩이 6개</u>를 웅덩이 3곳으로! [문지르기] ×4 → 위·아래 <u>관벽 융털</u>로 밀기. <b style="color:#ff9c9c">큰 덩이가 벽에 닿으면 체력이 깎입니다</b></li>
        <li><b>큰창자</b> 한 칸에 <u>20초</u> 갇힙니다. 물길이 뚫리면 <b style="color:#7ad7f0">"N.N초 동안 흡수!"</b> — 꾹 누른 채 스스로 초를 세다가 딱 맞춰 떼세요. <b>칸마다 딱 한 번</b>이고 초시계는 없습니다</li>
      </ul>
      <p class="warn">기관마다 <b>체력</b>이 있습니다. 위험 요소에 닿아 체력이 0이 되면 그 기관에서는
      더 일할 수 없고, <b>짝꿍이 소화액(큰창자는 물길)을 보내 주면 회복</b>됩니다. 📢 신호를 보내세요!<br>
      ★ <b>시간이 지나도 자동으로 안 넘어갑니다.</b> 통과 조건을 채워야 다음 기관으로 가고, 등급은 <b>총 걸린 시간</b>으로 정해집니다.</p>`,
    juice: `<h4>💧 소화액 담당 — 소화액을 만들어 알맞은 기관으로 보냅니다</h4>
      <p style="color:#ffd166;margin:0 0 8px">왼쪽에서 만들고 → <b>오른쪽 모식도에서 보낼 기관을 터치</b> → [분비]
      (플라스크를 기관으로 끌어다 놓아도 됩니다)</p>
      <ul>
        <li><b>입</b> 침샘에서 떨어지는 침 받기 (회색 공기방울은 피하기)</li>
        <li><b>식도</b> 소화관 / 소화샘 분류 — 식도에서는 소화액이 나오지 않습니다</li>
        <li><b>위</b> ★ <b>위액 만들기에만 집중!</b> 반짝이는 위샘의 <u>초록 구간</u>에서 누르기 (위샘 3개가 번갈아 일합니다)</li>
        <li><b>작은창자</b> <b style="color:#ffd166">간(쓸개즙) → 이자(이자액) → 간 …</b> 번갈아 만들고,
          <u>관을 따라 끌어서</u> 보냅니다. 끝은 위 · 쓸개 · 작은창자 셋 — 관 밖으로 나가면 새어 나가요!</li>
        <li><b>큰창자</b> 칸마다 <u>20초</u> 안에 물길 퍼즐 풀기 — 못 풀면 그 칸에서는 물이 한 방울도 안 빠집니다</li>
      </ul>
      <p class="warn">만든 소화액은 10초 안에 보내야 하고, 엉뚱한 기관에 보내면 배탈이 납니다!<br>★ <b>시간이 지나도 자동으로 안 넘어갑니다.</b> 통과 조건을 채워야 다음 기관으로 갑니다 — 등급은 <b>총 걸린 시간</b>으로!</p>`
  };

  function renderLobby() {
    const info = Net.info; if (!info) return;
    $('#roomcode').textContent = info.code || Net.code || '----';
    ['tract', 'juice'].forEach(r => {
      const el = $('#slot-' + r), p = info.players[r];
      el.classList.toggle('filled', !!p);
      el.classList.toggle('rdy', !!(p && p.ready));
      el.classList.toggle('me', r === Net.role);
      el.querySelector('.who').textContent = p ? (p.name + (r === Net.role ? ' (나)' : '')) : '비어 있음';
      el.querySelector('.ready').textContent = p ? (p.ready ? '준비 완료 ✔' : '준비 안 됨') : '기다리는 중…';
    });
    $('#mission').innerHTML = MISSION[Net.role] || '';
    drawAtlas();
  }

  /* ---- 기관 도감 (게임 중에는 이름표가 없으므로 여기서 눈에 익힌다) ---- */
  function drawAtlas() {
    const c = $('#atlas'); if (!c || !window.Organs) return;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const items = [
      { n: '침샘 (귀밑샘)', d: (b) => Organs.parotid(g, b) },
      { n: '식도', d: (b) => Organs.esophagus(g, b.x + b.w / 2, b.y, b.y + b.h, b.w * 0.34) },
      { n: '위', d: (b) => Organs.stomach(g, b) },
      { n: '간', d: (b) => Organs.liver(g, b) },
      { n: '쓸개', d: (b) => Organs.gallbladder(g, { x: b.x + b.w * 0.28, y: b.y, w: b.w * 0.44, h: b.h }) },
      { n: '이자', d: (b) => Organs.pancreas(g, b) },
      { n: '작은창자', d: (b) => Organs.smallIntestine(g, b) },
      { n: '큰창자', d: (b) => Organs.largeIntestine(g, b) }
    ];
    const cols = 4, cw = c.width / cols, ch = c.height / 2;
    items.forEach((it, i) => {
      const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch;
      it.d({ x: cx + cw * 0.16, y: cy + 14, w: cw * 0.68, h: ch - 56 });
      g.font = '700 17px Pretendard, "Malgun Gothic", sans-serif';
      g.fillStyle = '#dbe3ee'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(it.n, cx + cw / 2, cy + ch - 20);
    });
  }

  let iAmReady = false;
  $('#btn-ready').onclick = () => {
    iAmReady = !iAmReady;
    Net.send({ type: 'ready', ready: iAmReady });
    $('#btn-ready').textContent = iAmReady ? '준비 취소' : '준비 완료!';
    $('#btn-ready').className = 'big ' + (iAmReady ? 'grey' : 'green');
  };
  $('#btn-swap').onclick = () => {
    Net.send({ type: 'swapAsk' });
    $('#swap-note').textContent = '짝꿍에게 요청했습니다. 대답을 기다리는 중…';
  };
  // 요청 창은 '역할 바꾸기' 와 '다시 하기' 둘 다 쓴다
  let pendingAsk = 'swap';
  function closeSwap() { $('#swap-modal').className = 'modal'; }
  $('#swap-yes').onclick = () => {
    Net.send({ type: pendingAsk === 'again' ? 'againAnswer' : 'swapAnswer', ok: true });
    closeSwap();
  };
  $('#swap-no').onclick = () => {
    Net.send({ type: pendingAsk === 'again' ? 'againAnswer' : 'swapAnswer', ok: false });
    closeSwap();
  };
  function note(txt) {
    $('#swap-note').textContent = txt;
    const rn = $('#again-note'); if (rn) rn.textContent = txt;
  }

  Net.on('swapAsk', (m) => {
    pendingAsk = 'swap';
    $('#swap-title').textContent = '역할을 바꿀까요?';
    $('#swap-body').innerHTML = '<b>' + m.from + '</b> 님이 역할 바꾸기를 요청했습니다.<br>바꾸면 서로의 역할이 맞바뀝니다.';
    $('#swap-yes').textContent = '좋아요, 바꿔요';
    $('#swap-modal').className = 'modal on';
  });
  Net.on('swapWait', (m) => { note(m.to + ' 님의 대답을 기다리는 중…'); });
  Net.on('swapDenied', (m) => { note((m.by || '짝꿍') + ' 님이 거절했습니다.'); });
  Net.on('swapClosed', () => { note(''); });

  /* ---- 다시 하기 : 역할 바꾸기와 똑같이 요청 → 수락 ---- */
  window.askAgain = () => {
    Net.send({ type: 'againAsk' });
    note('짝꿍에게 다시 하기를 요청했습니다. 대답을 기다리는 중…');
  };
  Net.on('againAsk', (m) => {
    pendingAsk = 'again';
    $('#swap-title').textContent = '한 판 더 할까요?';
    $('#swap-body').innerHTML = '<b>' + m.from + '</b> 님이 <b>다시 하기</b>를 요청했습니다.<br>' +
      '방 번호는 그대로 두고 대기실로 돌아갑니다. 거기서 역할도 바꿀 수 있어요.';
    $('#swap-yes').textContent = '좋아요, 다시 해요';
    $('#swap-modal').className = 'modal on';
  });
  Net.on('againWait', (m) => { note(m.to + ' 님의 대답을 기다리는 중…'); });
  Net.on('againDenied', (m) => { note((m.by || '짝꿍') + ' 님이 아직 준비가 안 됐대요.'); });
  Net.on('againClosed', () => { note(''); });

  /* ================= 게임 ================= */
  const STAGE_MAP = {
    tract: { mouth: 'chew', esophagus: 'peristalsis', stomach: 'churn', small: 'villi', large: 'water' },
    juice: { mouth: 'saliva', esophagus: 'travel', stomach: 'dual', small: 'triple', large: 'microbe' }
  };

  const CALLS = {
    tract: [
      { s: 'mouth', m: '침이 필요해!' }, { s: 'stomach', m: '위액 더!' },
      { s: 'stomach', m: '위액 너무 많아!' }, { s: 'small', m: '이자액 부탁!' },
      { s: 'small', m: '소화액이 없어! 이자액·쓸개즙!' }, { s: 'stomach', m: '위액이 묽어서 안 녹아!' },
      { s: 'esophagus', m: '근육이 막혔어! 문제 맞혀줘!' },
      { s: 'large', m: '물길 열어줘!' }, { s: '*', m: '좋아, 잘 되고 있어!' },
      { s: '*', m: '잠깐 멈춰!' }
    ],
    juice: [
      { s: '*', m: '보냈어!' }, { s: '*', m: '만드는 중, 조금만!' },
      { s: 'stomach', m: '위액 만드는 중!' }, { s: 'small', m: '쓸개 비었어, 기다려' }, { s: 'small', m: '이번엔 이자액 차례!' },
      { s: 'esophagus', m: '문제 푸는 중, 곧 뚫려!' },
      { s: 'large', m: '물길 잇는 중!' },
      { s: '*', m: '좋아, 계속 가!' }
    ]
  };

  function renderCalls(stageId) {
    const bar = $('#callbar');
    const list = (CALLS[Net.role] || []).filter(c => c.s === '*' || c.s === stageId);
    bar.innerHTML = '';
    list.forEach(c => {
      const b = document.createElement('button');
      b.textContent = '📢 ' + c.m;
      b.onclick = () => { Net.act({ t: 'call', msg: c.m }); E.toast('보냄: ' + c.m, '#8fe3ff'); };
      bar.appendChild(b);
    });
  }

  function updateHUD(s) {
    $('#h-stage').textContent = s.stageName;
    $('#h-goal').textContent = s.stageGoal || '';
    const p = Math.max(0, Math.min(100, s.progress));
    $('#h-prog').style.width = p + '%';
    $('#h-progtxt').textContent = Math.round(p) + '%' + (s.hint ? ' · ' + s.hint : '');
    // ★ 시간은 '줄어드는 제한시간' 이 아니라 '걸린 시간 / 목표 시간'
    const el = Math.floor(s.stageTime), par = s.stageLimit;
    $('#h-time').textContent = el + 's / ' + par + 's';
    $('#h-time').style.color = el > par ? '#ffb35a' : '';
    $('#h-score').textContent = s.score.toLocaleString();
    $('#h-combo').textContent = s.combo > 1 ? s.combo + ' COMBO' : '';

    const map = { saliva: s.delivered.saliva, gastric: s.delivered.gastric, bile: s.delivered.bile,
                  pancreatic: s.delivered.pancreatic, waterGate: s.waterGate, trouble: s.trouble };
    $$('#juicebar .jg').forEach(el => {
      const k = el.dataset.k, v = map[k] || 0;
      el.querySelector('i').style.setProperty('--v', Math.min(100, v) + '%');
      el.classList.toggle('low', k !== 'trouble' && v < 35 && relevant(k, s.stage));
    });
  }
  function relevant(k, stage) {
    if (stage === 'mouth') return k === 'saliva';
    if (stage === 'stomach') return k === 'gastric';
    if (stage === 'small') return k === 'pancreatic' || k === 'bile';
    return false;
  }

  function overlay(html, cls) {
    const o = $('#overlay');
    o.innerHTML = '<div>' + html + '</div>';
    o.className = 'overlay on ' + (cls || '');
  }
  function hideOverlay() { $('#overlay').className = 'overlay'; }

  function applyStage(s) {
    const want = STAGE_MAP[Net.role][s.stage];
    if (want !== curStage) {
      curStage = want;
      const mod = (Net.role === 'tract' ? window.StageTract : window.StageJuice)[want];
      E.setStage(mod || null);
      renderCalls(s.stage);
      // 신호 버튼 줄의 높이가 바뀌므로 캔버스 크기를 다시 계산한다
      setTimeout(() => E.resize(), 30);
    }
  }

  /* ================= 결과 ================= */
  function renderResult(r) {
    const nut = (o) => `${o.starch}·${o.protein}·${o.fat}`;
    const fmtT = (sec) => Math.floor((sec || 0) / 60) + '분 ' + String(Math.round((sec || 0) % 60)).padStart(2, '0') + '초';
    const stages = (r.stageLog && r.stageLog.length)
      ? `<div class="mistakes" style="background:rgba(143,227,255,.07);border-color:rgba(143,227,255,.25)">
           <h4 style="color:#8fe3ff">⏱ 기관별 통과 시간</h4><ul>` +
        r.stageLog.map(x => `<li><b>${x.stage}</b> — ${x.time}초 ` +
          `(목표 ${x.par}초) ${x.over ? '<span style="color:#ffb35a">목표 초과</span>' : '<span style="color:#7dff9b">목표 안쪽 ✔</span>'}</li>`).join('') +
        '</ul></div>'
      : '';
    const bristol = G.BRISTOL.map(b =>
      `<div class="${b.type === r.bristol ? 'hit' : ''}">${b.type}형<br>${b.name}</div>`).join('');
    const mis = r.mistakes.length
      ? `<div class="mistakes"><h4>⚠ 다시 확인할 점 (${r.mistakeCount}회)</h4><ul>` +
        r.mistakes.map(m => `<li><b>${m.stage}</b> — ${m.msg}</li>`).join('') + '</ul></div>'
      : `<div class="mistakes" style="background:rgba(125,255,155,.08);border-color:rgba(125,255,155,.3)">
           <h4 style="color:#7dff9b">✔ 소화액을 한 번도 잘못 보내지 않았습니다!</h4></div>`;
    const rounds = (r.largeRounds && r.largeRounds.length)
      ? `<div class="mistakes"><h4>🚰 큰창자 칸별 물 흡수</h4><ul>` +
        r.largeRounds.map(x => `<li>${x.round}번 칸 — ${x.ok ? '✔ 통과' : '✖ 부족'} ` +
          `(뺀 물 ${x.got}% / 목표 ${x.target}%)</li>`).join('') + '</ul></div>'
      : '';

    $('#result-body').innerHTML = `
      <div class="grade ${r.grade}">${r.grade}</div>
      <div class="poop">${r.bristolEmoji}</div>
      <div class="verdict">${r.verdict} — 브리스톨 ${r.bristol}형 ${r.bristolName}</div>
      <p class="why">${r.why}</p>
      <div class="bristol">${bristol}</div>
      <div class="stats">
        <div class="stat"><b>${fmtT(r.totalTime)}</b><span>걸린 시간 (목표 ${fmtT(r.parTime)})</span></div>
        <div class="stat"><b>${r.score.toLocaleString()}</b><span>점수</span></div>
        <div class="stat"><b>${r.absorbPercent}%</b><span>영양소 흡수율</span></div>
        <div class="stat"><b>${r.water}%</b><span>대변 수분 (목표 ${G.RULES.WATER_TARGET[0]}~${G.RULES.WATER_TARGET[1]}%)</span></div>
        <div class="stat"><b>${r.trouble}</b><span>배탈 수치</span></div>
        <div class="stat"><b>${r.mistakeCount}</b><span>소화액 오분비</span></div>
        <div class="stat"><b>${r.bestCombo}</b><span>최고 콤보</span></div>
      </div>
      <div class="card" style="margin:12px 0;font-size:14px;line-height:1.8">
        <b>흡수한 영양소</b> 녹말·단백질·지방 = ${nut(r.absorbed)} &nbsp;/&nbsp; 물 ${r.absorbed.water}<br>
        <b>소화되지 않아 흡수 못 함</b> ${nut(r.lost)}<br>
        <b>소화 못 하고 남음</b> ${nut(r.leftover)}
      </div>
      ${stages}
      ${rounds}
      ${mis}
      <div class="row2">
        <button id="btn-again" class="big green">🔁 다시 하기 (방 그대로)</button>
      </div>
      <p id="again-note" class="swapnote"></p>`;
    $('#btn-again').onclick = () => window.askAgain();
    show('scr-result');
  }

  /* ================= 네트워크 ================= */
  Net.on('open', () => { $('#title-err').textContent = ''; });
  Net.on('close', () => { $('#title-err').textContent = '서버와 연결이 끊겼습니다. 다시 연결하는 중…'; });
  Net.on('error', (m) => { $('#title-err').textContent = m.msg; });

  Net.on('joined', (m) => {
    iAmReady = false;
    $('#btn-ready').textContent = '준비 완료!'; $('#btn-ready').className = 'big green';
    if (m && m.swapped) { $('#swap-note').textContent = '역할이 바뀌었습니다! 이제 ' + Net.roleName + ' 담당입니다.'; }
    renderLobby(); show('scr-lobby');
  });
  Net.on('room', () => { renderLobby(); });
  Net.on('reset', () => {
    iAmReady = false; curStage = null; curPhase = null; resultShown = false;
    closeSwap(); note('');
    $('#btn-ready').textContent = '준비 완료!'; $('#btn-ready').className = 'big green';
    renderLobby(); show('scr-lobby');
  });
  Net.on('start', () => { curStage = null; resultShown = false; show('scr-game'); });

  Net.on('state', (m) => {
    snap = m.s; E.snap = snap;
    // 결과 화면은 딱 한 번만 그린다 — 매 프레임 다시 그리면 [다시 하기] 버튼을 누를 수 없다
    if (snap.phase === 'result' && snap.result) {
      if (!resultShown) { resultShown = true; renderResult(snap.result); }
      return;
    }
    resultShown = false;
    if ($('#scr-game').classList.contains('on') === false) show('scr-game');
    updateHUD(snap);
    applyStage(snap);

    if (snap.phase !== curPhase) {
      curPhase = snap.phase;
      if (snap.phase === 'countdown') {
        overlay(`<h2>${snap.stageName}</h2><p>${snap.stageGoal}</p>
                 <div class="big-num" id="cd">${snap.countdown}</div>
                 <p class="tip">💡 ${G.TIPS[Math.floor(Math.random() * G.TIPS.length)]}</p>`);
      } else if (snap.phase === 'stageclear') {
        overlay(`<h2>✅ ${G.STAGES[Math.max(0, snap.stageIndex - 1)].name} 통과!</h2>
                 <p>다음: <b>${snap.stageName}</b> — ${snap.stageGoal}</p>
                 <p class="tip">💡 ${G.TIPS[Math.floor(Math.random() * G.TIPS.length)]}</p>`);
      } else hideOverlay();
    }
    if (snap.phase === 'countdown') { const cd = $('#cd'); if (cd) cd.textContent = snap.countdown; }

    (m.ev || []).forEach(handleEvent);
  });

  function handleEvent(e) {
    switch (e.k) {
      case 'misroute':
        E.toast('❌ ' + e.msg, '#ff6b6b', true); E.shake(1.2);
        break;
      case 'drop':
        if (e.ok) E.toast('✅ ' + e.msg, '#7dff9b');
        else if (e.soft) E.toast('ℹ ' + e.msg, '#ffd166');
        break;
      case 'note': case 'hint':
        E.toast(e.msg, '#ffd166'); break;
      case 'reflux':
        E.toast('🤢 ' + e.msg, '#ff6b6b', true); E.shake(1.6); break;
      case 'timeout':
        E.toast('⏰ ' + e.msg, '#ffb35a', true); break;
      case 'overpar':
        E.toast('⏱ ' + e.msg, '#ffb35a', true); break;
      case 'lap':
        E.toast('🔁 ' + e.msg, '#ffb35a', true); break;
      case 'esoblock':
        E.toast('✖ ' + e.msg, '#ff6b6b', true); E.shake(1.0); break;
      case 'unblock':
        E.toast('✔ ' + e.msg, '#7dff9b', true); break;
      case 'call':
        if (e.role !== Net.role) E.toast('📢 짝꿍: ' + e.msg, '#8fe3ff', true);
        break;
      case 'gate':
        if (e.msg) E.toast('💧 ' + e.msg, '#7ad7f0', true);
        break;
      case 'shut':
        E.toast('🚫 ' + e.msg, '#ff6b6b', true); break;
      case 'round':
        E.toast('🚪 ' + e.msg, '#ffd166', true); break;
      case 'roundend':
        E.toast((e.ok ? '✅ ' : '⚠ ') + e.msg, e.ok ? '#7dff9b' : '#ffb35a', true); break;
      case 'hold':
        if (E.stage && E.stage.showJudge) E.stage.showJudge(e);
        else E.toast((e.perfect ? '🎯 ' : (e.ok ? '👍 ' : '⚠ ')) + e.msg, e.ok ? '#7dff9b' : '#ffb35a');
        if (e.perfect) E.toast('🎯 ' + e.msg, '#7dff9b');
        break;
      case 'stageclear':
        E.toast('스테이지 통과!', '#7dff9b', true); break;
    }
  }

  /* ================= 시작 ================= */
  E.init($('#cv'));
  Net.connect();
  show('scr-title');
})();
