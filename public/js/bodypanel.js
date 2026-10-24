/* ============================================================
   bodypanel.js — 소화계 모식도 (박스 + 이름)
     · 왼쪽 세로줄 = 소화관 (음식물이 지나가는 길)
     · 양옆 = 소화샘 (소화액을 만드는 기관)
     · 화살표로 "어느 소화액이 어디로 가는가" 가 한눈에 보인다
   보내고 싶은 기관을 그냥 터치하면 선택된다. 플라스크를 끌어다 놓아도 된다.
   ============================================================ */
(function () {
  const VW = 1000, VH = 700;
  const G = window.GAMEDATA;

  const PANEL = { x: 630, y: 52, w: 366, h: 548 };

  /* 한글 조사 — 받침이 없거나 ㄹ 이면 '로', 아니면 '으로' */
  function ro(w) {
    const c = (w || '').charCodeAt((w || '').length - 1);
    const t = (c >= 0xac00 && c <= 0xd7a3) ? (c - 0xac00) % 28 : -1;
    return w + ((t === 0 || t === 8) ? '로' : '으로');
  }

  // 모식도 박스 (x, y = 중심)
  const BOX = {
    // ---- 소화관 (세로줄) ----
    mouth:     { x: 762, y: 124, w: 104, h: 36, label: '입',       tract: true },
    esophagus: { x: 762, y: 184, w: 104, h: 34, label: '식도',     tract: true },
    stomach:   { x: 762, y: 246, w: 104, h: 36, label: '위',       tract: true },
    small:     { x: 762, y: 414, w: 128, h: 40, label: '작은창자', tract: true },
    large:     { x: 762, y: 484, w: 128, h: 40, label: '큰창자',   tract: true },
    anus:      { x: 762, y: 548, w: 104, h: 32, label: '항문',     tract: true, info: true },
    // ---- 소화샘 ----
    salivary:  { x: 900, y: 124, w: 72, h: 32, label: '침샘', gland: true, info: true },
    liver:     { x: 678, y: 304, w: 72, h: 32, label: '간',   gland: true, info: true },
    gallbladder:{x: 678, y: 366, w: 72, h: 32, label: '쓸개', gland: true },
    pancreas:  { x: 900, y: 340, w: 72, h: 32, label: '이자', gland: true, info: true }
  };

  // 소화액이 가는 길 (from → to)
  const FLOW = [
    { from: 'salivary', to: 'mouth', juice: '침' },
    { from: 'liver', to: 'gallbladder', juice: '쓸개즙' },
    { from: 'gallbladder', to: 'small', juice: '쓸개즙' },
    { from: 'pancreas', to: 'small', juice: '이자액' }
  ];

  function rect(b) { return { x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h }; }

  function arrow(g, x1, y1, x2, y2, color, dashed) {
    g.save();
    g.strokeStyle = color; g.lineWidth = 3; g.lineCap = 'round';
    if (dashed) g.setLineDash([6, 5]);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.setLineDash([]);
    const a = Math.atan2(y2 - y1, x2 - x1);
    g.beginPath();
    g.moveTo(x2, y2);
    g.lineTo(x2 - Math.cos(a - 0.42) * 12, y2 - Math.sin(a - 0.42) * 12);
    g.lineTo(x2 - Math.cos(a + 0.42) * 12, y2 - Math.sin(a + 0.42) * 12);
    g.closePath(); g.fillStyle = color; g.fill();
    g.restore();
  }
  // 두 박스의 가장자리를 잇는 화살표
  function link(g, a, b, color, dashed) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const edge = (bx, s) => ({
      x: bx.x + ux * s * (bx.w / 2 + 4),
      y: bx.y + uy * s * (bx.h / 2 + 4)
    });
    const p1 = edge(a, 1), p2 = edge(b, -1);
    arrow(g, p1.x, p1.y, p2.x, p2.y, color, dashed);
  }

  const Panel = {
    PANEL, BOX,
    // 옛 코드 호환용 (테스트에서 organs 로 접근)
    get BODY() { return { organs: BOX }; },

    initSel(host) { host.destIdx = 0; host.dragFlask = null; },
    dest(host) { return G.DESTINATIONS[host.destIdx]; },

    /* ---------- 터치로 목적지 고르기 ---------- */
    hitDest(p) {
      for (const id of G.DESTINATIONS) {
        const b = BOX[id]; if (!b) continue;
        const r = rect(b);
        if (E.hit(p, r.x - 6, r.y - 6, r.w + 12, r.h + 12)) return id;
      }
      return null;
    },
    // 아래 버튼 줄 (스크롤 없이 6칸 고정)
    ROW: { x: 16, y: 610, w: 756, h: 78 },
    BTN: { x: 792, y: 610, w: 192, h: 78 },
    rowRects() {
      const R0 = this.ROW, n = G.DESTINATIONS.length;
      const w = (R0.w - 12) / n;
      return G.DESTINATIONS.map((id, i) => ({ id, x: R0.x + 6 + i * w, y: R0.y + 8, w: w - 6, h: R0.h - 16 }));
    },
    selDown(host, p) {
      if (E.hit(p, this.BTN.x, this.BTN.y, this.BTN.w, this.BTN.h)) return 'send';
      const hit = this.hitDest(p);
      if (hit) { host.destIdx = G.DESTINATIONS.indexOf(hit); return 'pick'; }
      for (const r of this.rowRects()) {
        if (E.hit(p, r.x, r.y, r.w, r.h)) { host.destIdx = G.DESTINATIONS.indexOf(r.id); return 'pick'; }
      }
      return null;
    },
    selMove() { return false; },
    selUp() { return false; },
    syncSel() {},

    /* ============================================================
       모식도 그리기
       ============================================================ */
    draw(g, opt) {
      opt = opt || {};
      const selected = opt.selected;
      E.fillRR(g, PANEL.x, PANEL.y, PANEL.w, PANEL.h, 18, 'rgba(255,255,255,.045)', 'rgba(255,255,255,.13)', 2);
      E.text(g, '소화계 모식도', PANEL.x + PANEL.w / 2, PANEL.y + 20, 16, 'rgba(255,255,255,.55)', 'center', 700);

      // ---- 소화관 세로 연결선 ----
      const chain = ['mouth', 'esophagus', 'stomach', 'small', 'large', 'anus'];
      g.save();
      g.strokeStyle = 'rgba(143,227,255,.35)'; g.lineWidth = 4; g.lineCap = 'round';
      for (let i = 0; i < chain.length - 1; i++) {
        const a = BOX[chain[i]], b = BOX[chain[i + 1]];
        g.beginPath();
        g.moveTo(a.x, a.y + a.h / 2);
        g.lineTo(b.x, b.y - b.h / 2);
        g.stroke();
      }
      g.restore();
      // 위 → 작은창자 사이는 길어서 화살표를 하나 더
      arrow(g, BOX.stomach.x, BOX.stomach.y + BOX.stomach.h / 2 + 6,
            BOX.small.x, BOX.small.y - BOX.small.h / 2 - 6, 'rgba(143,227,255,.45)');

      // ---- 소화액이 가는 길 ----
      FLOW.forEach(f => {
        const hot = opt.flowHot && opt.flowHot.indexOf(f.from) >= 0;
        link(g, BOX[f.from], BOX[f.to], hot ? '#ffd166' : 'rgba(255,179,90,.55)', true);
      });
      // 위는 스스로 위액을 분비한다 (자기 자신 표시)
      g.save();
      g.strokeStyle = 'rgba(255,179,90,.5)'; g.lineWidth = 2.5; g.setLineDash([5, 4]);
      g.beginPath(); g.arc(BOX.stomach.x + BOX.stomach.w / 2 + 16, BOX.stomach.y, 15, -1.9, 1.9); g.stroke();
      g.restore();
      E.text(g, '위샘', BOX.stomach.x + BOX.stomach.w / 2 + 40, BOX.stomach.y, 12, 'rgba(255,179,90,.8)', 'center', 700);

      // ---- 박스 ----
      for (const [id, b] of Object.entries(BOX)) {
        const r = rect(b);
        const sel = selected === id;
        const urgent = opt.urgent === id;
        const pick = G.DESTINATIONS.indexOf(id) >= 0;
        let fill = b.gland ? 'rgba(255,179,90,.14)' : 'rgba(143,227,255,.13)';
        let edge = b.gland ? 'rgba(255,179,90,.6)' : 'rgba(143,227,255,.6)';
        if (sel) { fill = 'rgba(255,209,102,.3)'; edge = '#ffd166'; }
        if (urgent && !sel) { edge = '#ff6b6b'; }
        E.fillRR(g, r.x, r.y, r.w, r.h, 9, fill, edge, sel ? 3.5 : 2);
        E.text(g, b.label, b.x, b.y, b.w > 110 ? 18 : 17, sel ? '#ffd166' : '#fff', 'center', sel ? 800 : 700);
        if (pick && !sel) {
          g.save(); g.globalAlpha = .5;
          E.text(g, '👆', r.x + r.w - 8, r.y + 4, 11, '#fff'); g.restore();
        }
        if (sel) {
          const a = .4 + .6 * Math.abs(Math.sin(E.t * 4));
          g.save(); g.globalAlpha = a; g.strokeStyle = '#ffd166'; g.lineWidth = 3;
          E.roundRect(g, r.x - 6, r.y - 6, r.w + 12, r.h + 12, 12); g.stroke(); g.restore();
        }
        if (urgent) {
          const a = .4 + .6 * Math.abs(Math.sin(E.t * 8));
          g.save(); g.globalAlpha = a;
          E.fillRR(g, b.x - 26, r.y - 25, 52, 21, 6, 'rgba(10,6,10,.85)');
          E.text(g, '급구!', b.x, r.y - 14, 14, '#ff6b6b'); g.restore();
        }
      }

      // ---- 소화액 도착 상태 ----
      if (opt.s) {
        const bar = (id, v, c) => {
          const b = BOX[id], r = rect(b);
          if (v > 1) E.gauge(g, r.x, r.y + r.h + 3, r.w, 6, v, c);
        };
        bar('mouth', opt.s.delivered.saliva, '#8fe3ff');
        bar('stomach', opt.s.delivered.gastric, '#7dff9b');
        bar('small', Math.max(opt.s.delivered.pancreatic, opt.s.delivered.bile), '#ffb35a');
        bar('gallbladder', opt.s.bileStored, '#5cc26a');
      }

      // 범례
      E.text(g, '파랑 = 소화관   주황 = 소화샘', PANEL.x + PANEL.w / 2, PANEL.y + PANEL.h - 14, 13,
        'rgba(255,255,255,.45)', 'center', 600);
    },

    /* ---------- 아래 목적지 버튼 줄 + 분비 ---------- */
    drawSel(g, host, canSend) {
      const R0 = this.ROW, B = this.BTN;
      E.fillRR(g, R0.x, R0.y, R0.w, R0.h, 14, 'rgba(0,0,0,.45)', 'rgba(255,255,255,.14)', 2);
      E.text(g, '어디로 보낼까?  (모식도를 눌러도 됩니다)', R0.x + R0.w / 2, R0.y - 9, 13,
        'rgba(255,255,255,.45)', 'center', 600);
      const names = { mouth: '입', esophagus: '식도', stomach: '위', gallbladder: '쓸개', small: '작은창자', large: '큰창자' };
      this.rowRects().forEach(r => {
        const sel = G.DESTINATIONS[host.destIdx] === r.id;
        E.fillRR(g, r.x, r.y, r.w, r.h, 10,
          sel ? 'rgba(255,209,102,.24)' : 'rgba(255,255,255,.06)',
          sel ? '#ffd166' : 'rgba(255,255,255,.18)', sel ? 3 : 1);
        E.text(g, names[r.id], r.x + r.w / 2, r.y + r.h / 2, sel ? 20 : 17,
          sel ? '#ffd166' : 'rgba(255,255,255,.7)', 'center', sel ? 800 : 600);
      });

      const on = canSend;
      E.fillRR(g, B.x, B.y, B.w, B.h, 14,
        on ? 'rgba(125,255,155,.28)' : 'rgba(255,255,255,.05)',
        on ? '#7dff9b' : 'rgba(255,255,255,.14)', on ? 3 : 1);
      E.text(g, '분 비', B.x + B.w / 2, B.y + B.h / 2 - 9, 26, on ? '#7dff9b' : 'rgba(255,255,255,.28)');
      E.text(g, on ? ro(names[G.DESTINATIONS[host.destIdx]]) + ' 보냅니다' : '소화액을 먼저 만드세요',
        B.x + B.w / 2, B.y + B.h / 2 + 19, 12, on ? 'rgba(255,255,255,.65)' : 'rgba(255,255,255,.25)', 'center', 600);
    }
  };

  window.Panel = Panel;
})();
