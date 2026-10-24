/* ============================================================
   organs.js — 실제 기관의 생김새를 캔버스로 그린다
   ★ 게임 중에는 이름표를 붙이지 않는다.
     학생이 '모양'을 보고 어느 기관인지 알아내는 것이 학습 목표.
   ============================================================ */
(function () {

  /* ---------- 정규화 좌표(0~1)로 잡은 기관 실루엣 ---------- */
  const SHAPE = {
    // 위 : 분문(좌상) → 저부 → 대만(왼쪽 큰 곡선) → 유문(우하) → 소만
    stomach: [
      [0.36, 0.00], [0.18, 0.05], [0.06, 0.24], [0.03, 0.48], [0.11, 0.72],
      [0.30, 0.90], [0.52, 0.95], [0.72, 0.90], [0.86, 0.76], [0.95, 0.60],
      [0.83, 0.55], [0.72, 0.64], [0.58, 0.66], [0.48, 0.52], [0.45, 0.26], [0.45, 0.04]
    ],
    // 간 : 크고 두꺼운 쐐기 (오른엽이 크고 왼엽이 작다)
    liver: [
      [0.99, 0.38], [0.95, 0.16], [0.78, 0.04], [0.54, 0.02], [0.32, 0.09],
      [0.11, 0.25], [0.02, 0.47], [0.15, 0.61], [0.35, 0.69], [0.31, 0.83],
      [0.50, 0.88], [0.74, 0.84], [0.92, 0.66]
    ],
    // 쓸개 : 서양배 모양 (목이 위로)
    gallbladder: [
      [0.50, 0.02], [0.64, 0.08], [0.72, 0.26], [0.80, 0.50], [0.72, 0.76],
      [0.50, 0.92], [0.28, 0.80], [0.20, 0.56], [0.24, 0.32], [0.36, 0.12]
    ],
    // 이자 : 가늘고 긴 올챙이 (머리가 오른쪽에서 십이지장을 감싼다)
    pancreas: [
      [0.03, 0.44], [0.15, 0.31], [0.36, 0.27], [0.57, 0.30], [0.74, 0.39],
      [0.87, 0.55], [0.91, 0.74], [0.80, 0.88], [0.64, 0.86], [0.59, 0.69],
      [0.47, 0.57], [0.27, 0.54], [0.09, 0.58]
    ],
    // 침샘 — 귀밑샘(불규칙한 큰 덩어리)
    parotid: [
      [0.42, 0.02], [0.68, 0.08], [0.86, 0.26], [0.90, 0.52], [0.78, 0.76],
      [0.56, 0.92], [0.32, 0.86], [0.16, 0.66], [0.12, 0.38], [0.22, 0.14]
    ]
  };

  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

  /* ---------- 점 목록을 부드러운 곡선으로 (Catmull-Rom → 베지에) ---------- */
  function curve(g, pts, box) {
    const P = pts.map(p => ({ x: box.x + p[0] * box.w, y: box.y + p[1] * box.h }));
    const n = P.length;
    const at = i => P[(i % n + n) % n];
    g.beginPath();
    g.moveTo(P[0].x, P[0].y);
    for (let i = 0; i < n; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      g.bezierCurveTo(
        p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
        p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
        p2.x, p2.y
      );
    }
    g.closePath();
  }

  function organFill(g, box, c1, c2, c3) {
    const gr = g.createLinearGradient(box.x, box.y, box.x + box.w * 0.6, box.y + box.h);
    gr.addColorStop(0, c1); gr.addColorStop(0.45, c2); gr.addColorStop(1, c3 || c2);
    g.fillStyle = gr; g.fill();
  }

  // 장기 표면의 얼룩덜룩한 질감
  function speckle(g, box, color, n, seed) {
    g.save(); g.clip();
    g.globalAlpha = 0.10;
    for (let i = 0; i < n; i++) {
      const a = Math.sin(i * 12.9898 + seed) * 43758.5453;
      const b = Math.sin(i * 78.233 + seed) * 12345.678;
      const x = box.x + (a - Math.floor(a)) * box.w;
      const y = box.y + (b - Math.floor(b)) * box.h;
      const r = 4 + (a - Math.floor(a)) * 14;
      g.beginPath(); g.arc(x, y, r, 0, 6.284); g.fillStyle = color; g.fill();
    }
    g.restore();
  }

  const O = {
    curve,

    /* ---------------- 위 ---------------- */
    stomach(g, box, opt) {
      opt = opt || {};
      g.save();
      curve(g, SHAPE.stomach, box);
      organFill(g, box, '#e0a094', '#c07b6d', '#9b5b50');
      speckle(g, box, '#7a4038', 26, 3);
      curve(g, SHAPE.stomach, box);
      g.strokeStyle = '#7d4238'; g.lineWidth = Math.max(3, box.w * 0.014); g.stroke();
      // 세로 근육 결
      g.save(); curve(g, SHAPE.stomach, box); g.clip();
      g.globalAlpha = .16; g.strokeStyle = '#4a221c'; g.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        g.beginPath();
        g.moveTo(box.x + box.w * (0.10 + t * 0.8), box.y);
        g.quadraticCurveTo(box.x + box.w * (0.2 + t * 0.7), box.y + box.h * 0.5,
                           box.x + box.w * (0.16 + t * 0.75), box.y + box.h);
        g.stroke();
      }
      g.restore();
      g.restore();
      return { x: box.x + box.w * 0.1, y: box.y + box.h * 0.1, w: box.w * 0.8, h: box.h * 0.8 };
    },

    /* ---------------- 간 ---------------- */
    liver(g, box) {
      g.save();
      curve(g, SHAPE.liver, box);
      organFill(g, box, '#8e4038', '#6f2f2a', '#54211e');
      speckle(g, box, '#3d1614', 30, 7);
      curve(g, SHAPE.liver, box);
      g.strokeStyle = '#431916'; g.lineWidth = Math.max(3, box.w * 0.012); g.stroke();
      // 낫인대 (오른엽 / 왼엽 경계)
      g.save(); curve(g, SHAPE.liver, box); g.clip();
      g.strokeStyle = 'rgba(255,225,215,.30)'; g.lineWidth = Math.max(4, box.w * 0.018);
      g.beginPath();
      g.moveTo(box.x + box.w * 0.44, box.y + box.h * 0.05);
      g.quadraticCurveTo(box.x + box.w * 0.38, box.y + box.h * 0.48, box.x + box.w * 0.34, box.y + box.h * 0.82);
      g.stroke();
      g.restore();
      g.restore();
    },

    /* ---------------- 쓸개 ---------------- */
    gallbladder(g, box) {
      g.save();
      curve(g, SHAPE.gallbladder, box);
      organFill(g, box, '#a8d46a', '#6ca63f', '#47762a');
      curve(g, SHAPE.gallbladder, box);
      g.strokeStyle = '#33581d'; g.lineWidth = Math.max(2.5, box.w * 0.03); g.stroke();
      // 쓸개관 (목)
      g.strokeStyle = '#5f8f38'; g.lineWidth = Math.max(4, box.w * 0.07); g.lineCap = 'round';
      g.beginPath();
      g.moveTo(box.x + box.w * 0.50, box.y + box.h * 0.04);
      g.quadraticCurveTo(box.x + box.w * 0.70, box.y - box.h * 0.16, box.x + box.w * 0.96, box.y - box.h * 0.22);
      g.stroke();
      // 광택
      g.globalAlpha = .3;
      g.beginPath(); g.ellipse(box.x + box.w * 0.40, box.y + box.h * 0.36, box.w * 0.12, box.h * 0.2, -0.5, 0, 6.284);
      g.fillStyle = '#fff'; g.fill();
      g.restore();
    },

    /* ---------------- 이자 ---------------- */
    pancreas(g, box) {
      g.save();
      curve(g, SHAPE.pancreas, box);
      organFill(g, box, '#f0cf9a', '#d8ab6c', '#b0813f');
      curve(g, SHAPE.pancreas, box);
      g.strokeStyle = '#8d6330'; g.lineWidth = Math.max(2.5, box.w * 0.008); g.stroke();
      // 소엽 (오돌토돌한 표면)
      g.save(); curve(g, SHAPE.pancreas, box); g.clip();
      g.globalAlpha = .35;
      for (let i = 0; i < 22; i++) {
        const t = i / 21;
        const x = box.x + box.w * (0.06 + t * 0.82);
        const y = box.y + box.h * (0.42 + Math.sin(t * 7) * 0.10 + t * 0.16);
        g.beginPath(); g.arc(x, y, box.w * 0.035, 0, 6.284);
        g.fillStyle = '#a8763a'; g.fill();
      }
      g.restore();
      g.restore();
    },

    /* ---------------- 작은창자 (구불구불한 고리) ---------------- */
    smallIntestine(g, box) {
      const g0 = g;
      g0.save();
      const th = box.h * 0.20;
      g0.lineCap = 'round'; g0.lineJoin = 'round';
      const loops = [
        [0.10, 0.22, 0.42, 0.16], [0.46, 0.16, 0.86, 0.28],
        [0.86, 0.38, 0.44, 0.44], [0.12, 0.48, 0.52, 0.62],
        [0.56, 0.62, 0.90, 0.74], [0.86, 0.84, 0.30, 0.86]
      ];
      const drawPass = (color, width) => {
        g0.strokeStyle = color; g0.lineWidth = width;
        for (const L of loops) {
          g0.beginPath();
          const x1 = box.x + L[0] * box.w, y1 = box.y + L[1] * box.h;
          const x2 = box.x + L[2] * box.w, y2 = box.y + L[3] * box.h;
          g0.moveTo(x1, y1);
          g0.quadraticCurveTo((x1 + x2) / 2, y1 - box.h * 0.16, x2, y2);
          g0.stroke();
        }
      };
      drawPass('#8f4a48', th);
      drawPass('#d08b85', th * 0.76);
      drawPass('rgba(255,220,214,.45)', th * 0.28);
      g0.restore();
    },

    /* ---------------- 큰창자 (ㄷ자 + 결장팽대) ---------------- */
    largeIntestine(g, box) {
      g.save();
      const th = box.h * 0.19;
      const pts = [];
      const push = (nx, ny) => pts.push([box.x + nx * box.w, box.y + ny * box.h]);
      push(0.10, 0.95); push(0.10, 0.30); push(0.18, 0.12);
      push(0.82, 0.12); push(0.90, 0.30); push(0.90, 0.95);
      g.lineJoin = 'round'; g.lineCap = 'round';
      const stroke = (c, w) => {
        g.strokeStyle = c; g.lineWidth = w;
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.stroke();
      };
      stroke('#8a5b45', th);
      stroke('#c08a6a', th * 0.78);
      // 결장팽대 (잘록잘록)
      g.globalAlpha = .22; g.fillStyle = '#5d3826';
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        const len = Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.max(1, Math.round(len / (th * 0.85)));
        for (let k = 1; k < steps; k++) {
          const t = k / steps;
          const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
          g.save(); g.translate(x, y);
          g.rotate(Math.atan2(y2 - y1, x2 - x1));
          g.beginPath(); g.ellipse(0, 0, th * 0.06, th * 0.42, 0, 0, 6.284); g.fill();
          g.restore();
        }
      }
      g.restore();
    },

    /* ---------------- 침샘 3종 ---------------- */
    parotid(g, box) {      // 귀밑샘 — 가장 크고 불규칙
      g.save();
      curve(g, SHAPE.parotid, box);
      organFill(g, box, '#f6c8cf', '#e09aa8', '#c07484');
      speckle(g, box, '#a35b6b', 18, 11);
      curve(g, SHAPE.parotid, box);
      g.strokeStyle = '#9c5566'; g.lineWidth = 3; g.stroke();
      g.restore();
    },
    submandibular(g, box) { // 턱밑샘 — 둥근 타원
      g.save();
      g.beginPath(); g.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w * 0.46, box.h * 0.40, 0.24, 0, 6.284);
      organFill(g, box, '#f6c8cf', '#dd94a4', '#bd6f80');
      g.strokeStyle = '#9c5566'; g.lineWidth = 3; g.stroke();
      g.restore();
    },
    sublingual(g, box) {    // 혀밑샘 — 작은 아몬드
      g.save();
      g.beginPath(); g.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w * 0.44, box.h * 0.30, -0.2, 0, 6.284);
      organFill(g, box, '#f6c8cf', '#d98da0', '#b56b7d');
      g.strokeStyle = '#9c5566'; g.lineWidth = 2.5; g.stroke();
      g.restore();
    },

    /* ---------------- 식도 (관) ---------------- */
    esophagus(g, x, yTop, yBot, w) {
      g.save();
      const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      gr.addColorStop(0, '#8c5f66'); gr.addColorStop(0.5, '#c9949c'); gr.addColorStop(1, '#8c5f66');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x - w / 2, yTop);
      g.quadraticCurveTo(x - w / 2 - 8, (yTop + yBot) / 2, x - w / 2, yBot);
      g.lineTo(x + w / 2, yBot);
      g.quadraticCurveTo(x + w / 2 + 8, (yTop + yBot) / 2, x + w / 2, yTop);
      g.closePath(); g.fill();
      g.strokeStyle = '#6b444a'; g.lineWidth = 4; g.stroke();
      g.restore();
    },

    /* ---------------- 구강 단면 (입) ---------------- */
    mouthCavity(g, box) {
      const { x, y, w, h } = box;
      g.save();
      // 볼 안쪽
      g.beginPath();
      g.moveTo(x, y + h * 0.30);
      g.quadraticCurveTo(x + w * 0.10, y, x + w * 0.55, y + h * 0.04);
      g.quadraticCurveTo(x + w * 0.95, y + h * 0.10, x + w, y + h * 0.45);
      g.lineTo(x + w, y + h);
      g.lineTo(x, y + h);
      g.closePath();
      const gr = g.createLinearGradient(x, y, x, y + h);
      gr.addColorStop(0, '#8e3247'); gr.addColorStop(1, '#5b1d2c');
      g.fillStyle = gr; g.fill();
      // 경구개 (입천장)
      g.beginPath();
      g.moveTo(x + w * 0.06, y + h * 0.24);
      g.quadraticCurveTo(x + w * 0.42, y + h * 0.02, x + w * 0.80, y + h * 0.22);
      g.strokeStyle = '#c0637a'; g.lineWidth = 10; g.lineCap = 'round'; g.stroke();
      g.restore();
    },

    // 이 한 개 (어금니 — 뿌리까지)
    molar(g, x, y, w, h, dir) {
      g.save();
      g.translate(x, y); if (dir < 0) g.scale(1, -1);
      g.beginPath();
      g.moveTo(-w / 2, 0);
      g.quadraticCurveTo(-w / 2 - 3, -h * 0.62, -w * 0.30, -h * 0.78);
      g.quadraticCurveTo(-w * 0.12, -h * 1.0, 0, -h * 0.80);
      g.quadraticCurveTo(w * 0.12, -h * 1.0, w * 0.30, -h * 0.78);
      g.quadraticCurveTo(w / 2 + 3, -h * 0.62, w / 2, 0);
      g.closePath();
      const gr = g.createLinearGradient(0, -h, 0, 0);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#f7f0e2'); gr.addColorStop(1, '#ded2bc');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = '#c3b499'; g.lineWidth = 2.5; g.stroke();
      g.restore();
    },

    // 혀 (측면)
    tongue(g, x, y, w, h, t) {
      g.save();
      g.beginPath();
      g.moveTo(x, y + h);
      g.quadraticCurveTo(x + w * 0.04, y + Math.sin(t * 1.6) * 6, x + w * 0.34, y + 4);
      g.quadraticCurveTo(x + w * 0.72, y - 6 + Math.sin(t * 2.1) * 5, x + w * 0.96, y + h * 0.34);
      g.quadraticCurveTo(x + w, y + h * 0.7, x + w * 0.92, y + h);
      g.closePath();
      const gr = g.createLinearGradient(x, y, x, y + h);
      gr.addColorStop(0, '#e0798e'); gr.addColorStop(1, '#a8455c');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = '#8d3049'; g.lineWidth = 3; g.stroke();
      // 유두(오돌토돌)
      g.globalAlpha = .3; g.fillStyle = '#ffd9e2';
      for (let i = 0; i < 26; i++) {
        const p = i / 25;
        g.beginPath(); g.arc(x + w * (0.06 + p * 0.86), y + 10 + Math.sin(p * 9 + t) * 4, 2.6, 0, 6.284); g.fill();
      }
      g.restore();
    },

    /* ---------------- 융털 단면 (작은창자 흡수 학습용) ---------------- */
    villusCutaway(g, box, t) {
      const { x, y, w, h } = box;
      g.save();
      // 융털 몸통
      g.beginPath();
      g.moveTo(x, y + h);
      g.quadraticCurveTo(x + w * 0.02, y + h * 0.32, x + w * 0.26, y + h * 0.06);
      g.quadraticCurveTo(x + w * 0.5, y - h * 0.06, x + w * 0.74, y + h * 0.06);
      g.quadraticCurveTo(x + w * 0.98, y + h * 0.32, x + w, y + h);
      g.closePath();
      const gr = g.createLinearGradient(x, y, x, y + h);
      gr.addColorStop(0, '#f2b8b0'); gr.addColorStop(1, '#c9756e');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = '#a1544e'; g.lineWidth = 4; g.stroke();
      // 상피세포 (겉면 알갱이)
      g.save(); g.globalAlpha = .18;
      for (let i = 0; i < 30; i++) {
        const p = i / 29;
        g.beginPath(); g.arc(x + w * 0.06 + p * w * 0.88, y + h * 0.10 + Math.sin(p * 3.14) * -h * 0.06 + p * 4, 5, 0, 6.284);
        g.fillStyle = '#fff'; g.fill();
      }
      g.restore();
      g.restore();
    },

    // 모세혈관 그물
    capillaryNet(g, box, t) {
      const { x, y, w, h } = box;
      g.save();
      g.strokeStyle = '#c8383f'; g.lineWidth = Math.max(6, w * 0.09); g.lineCap = 'round';
      for (let s = -1; s <= 1; s += 2) {
        g.beginPath();
        g.moveTo(x + w / 2 + s * w * 0.30, y + h);
        for (let i = 0; i <= 8; i++) {
          const p = i / 8;
          g.lineTo(x + w / 2 + s * w * (0.30 - p * 0.10) + Math.sin(p * 9 + t * 2 + s) * w * 0.06, y + h - p * h);
        }
        g.stroke();
      }
      g.strokeStyle = '#e8646a'; g.lineWidth = Math.max(2, w * 0.035);
      for (let i = 0; i < 5; i++) {
        const yy = y + h * (0.18 + i * 0.17);
        g.beginPath();
        g.moveTo(x + w / 2 - w * 0.28, yy);
        g.quadraticCurveTo(x + w / 2, yy + Math.sin(i + t) * 8, x + w / 2 + w * 0.28, yy);
        g.stroke();
      }
      g.restore();
    },

    // 암죽관(중심 림프관)
    lacteal(g, box, t) {
      const { x, y, w, h } = box;
      g.save();
      g.strokeStyle = '#d9c23f'; g.lineWidth = Math.max(10, w * 0.15); g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x + w / 2, y + h);
      g.quadraticCurveTo(x + w / 2 + Math.sin(t) * 4, y + h * 0.4, x + w / 2, y + h * 0.12);
      g.stroke();
      g.strokeStyle = '#f6e57a'; g.lineWidth = Math.max(5, w * 0.08);
      g.beginPath();
      g.moveTo(x + w / 2, y + h);
      g.quadraticCurveTo(x + w / 2 + Math.sin(t) * 4, y + h * 0.4, x + w / 2, y + h * 0.14);
      g.stroke();
      g.restore();
    },

    /* ---------------- 배경 : 몸속 조직 ---------------- */
    fleshBackground(g, c1, c2) {
      const gr = g.createLinearGradient(0, 0, 0, 700);
      gr.addColorStop(0, c1 || '#3a1d22'); gr.addColorStop(1, c2 || '#170a0e');
      g.fillStyle = gr; g.fillRect(0, 0, 1000, 700);
      g.save(); g.globalAlpha = 0.028;
      for (let i = 0; i < 26; i++) {
        const a = Math.sin(i * 31.7) * 43758.5453, b = Math.sin(i * 12.3) * 12345.6;
        const x = (a - Math.floor(a)) * 1000, y = (b - Math.floor(b)) * 700;
        g.beginPath(); g.arc(x, y, 20 + (a - Math.floor(a)) * 44, 0, 6.284);
        g.fillStyle = '#ff9c9c'; g.fill();
      }
      g.restore();
    }
  };

  window.Organs = O;
})();
