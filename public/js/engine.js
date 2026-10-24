/* ============================================================
   engine.js — 캔버스 · 좌표 · 터치 입력 · 그리기 도우미
   가상 해상도 1000 x 700 을 화면 크기에 맞춰 늘린다.
   ============================================================ */
(function () {
  const VW = 1000, VH = 700;

  const E = {
    VW, VH,
    canvas: null, ctx: null, scale: 1, ox: 0, oy: 0,
    stage: null,          // 현재 미니게임 모듈
    snap: null,           // 서버 상태
    t: 0, dt: 0,
    pointers: new Map(),
    _toasts: [],
    _shake: 0,
    trackText: false, _boxes: [],

    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));

      const conv = (e) => {
        const r = this.canvas.getBoundingClientRect();
        return {
          x: (e.clientX - r.left) / r.width * VW,
          y: (e.clientY - r.top) / r.height * VH,
          id: e.pointerId
        };
      };
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
        const p = conv(e); p.x0 = p.x; p.y0 = p.y; p.t0 = performance.now(); p.lx = p.x; p.ly = p.y; p.dist = 0;
        this.pointers.set(e.pointerId, p);
        if (this.stage && this.stage.down) this.stage.down(p);
        e.preventDefault();
      });
      canvas.addEventListener('pointermove', (e) => {
        const old = this.pointers.get(e.pointerId);
        if (!old) return;
        const p = conv(e);
        old.dist += Math.hypot(p.x - old.lx, p.y - old.ly);
        old.dx = p.x - old.lx; old.dy = p.y - old.ly;
        old.lx = old.x; old.ly = old.y;
        old.x = p.x; old.y = p.y;
        if (this.stage && this.stage.move) this.stage.move(old);
        e.preventDefault();
      });
      const end = (e) => {
        const p = this.pointers.get(e.pointerId);
        if (!p) return;
        this.pointers.delete(e.pointerId);
        p.dur = performance.now() - p.t0;
        if (this.stage && this.stage.up) this.stage.up(p);
      };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('pointerleave', end);

      window.addEventListener('keydown', (e) => {
        if (window.Ctrl && Ctrl.key(e, true)) e.preventDefault();
      });
      window.addEventListener('keyup', (e) => {
        if (window.Ctrl && Ctrl.key(e, false)) e.preventDefault();
      });

      let last = performance.now();
      const loop = (now) => {
        this.dt = Math.min(0.05, (now - last) / 1000);
        last = now; this.t += this.dt;
        this.frame();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },

    resize() {
      const c = this.canvas; if (!c) return;
      const parent = c.parentElement;
      const pw = parent.clientWidth, ph = parent.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // 화면비를 유지하며 최대로 채움
      const s = Math.min(pw / VW, ph / VH);
      const w = Math.floor(VW * s), h = Math.floor(VH * s);
      c.style.width = w + 'px'; c.style.height = h + 'px';
      c.width = Math.floor(w * dpr); c.height = Math.floor(h * dpr);
      this.ctx.setTransform(c.width / VW, 0, 0, c.height / VH, 0, 0);
    },

    setStage(mod) {
      if (this.stage && this.stage.exit) try { this.stage.exit(); } catch (e) {}
      this.stage = mod;
      if (mod && mod.enter) mod.enter(this.api);
      this.pointers.clear();
    },

    frame() {
      const g = this.ctx;
      g.save();
      if (this._shake > 0) {
        this._shake -= this.dt * 2.2;
        const a = Math.max(0, this._shake) * 9;
        g.translate((Math.random() - .5) * a, (Math.random() - .5) * a);
      }
      g.clearRect(-30, -30, VW + 60, VH + 60);
      if (this.trackText) this._boxes = [];
      this.toastTop = 0;                 // 경고 띠가 있으면 알림을 그 아래로 내린다
      // 한 프레임에서 오류가 나도 게임 전체가 멈추지 않게 한다 (수업 중 안전장치)
      const depth = g.save.length;
      try {
        if (this.stage) {
          if (this.stage.update) this.stage.update(this.dt, this.snap);
          if (this.stage.draw) this.stage.draw(g, this.snap);
        }
      } catch (err) {
        this.errCount = (this.errCount || 0) + 1;
        if (!this.lastErr || this.lastErr !== String(err)) {
          this.lastErr = String(err);
          this.lastErrStack = err && err.stack;
          console.error('[stage error]', err);
        }
      }
      this.drawToasts(g);
      g.restore();
    },

    shake(a) { this._shake = Math.max(this._shake, a || 1); },

    toast(msg, color, big) {
      this._toasts.push({ msg, color: color || '#fff', life: big ? 3.6 : 2.2, max: big ? 3.6 : 2.2, big: !!big });
      while (this._toasts.length > 2) this._toasts.shift();
    },
    // 긴 문장은 화면 밖으로 나가지 않도록 줄바꿈한다
    wrap(g, text, maxW) {
      const words = String(text).split(' ');
      const lines = []; let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
        else cur = t;
      }
      if (cur) lines.push(cur);
      // 띄어쓰기가 없는 아주 긴 덩어리는 글자 단위로 자른다
      const out = [];
      for (const l of lines) {
        if (g.measureText(l).width <= maxW) { out.push(l); continue; }
        let s = '';
        for (const ch of l) {
          if (g.measureText(s + ch).width > maxW && s) { out.push(s); s = ch; }
          else s += ch;
        }
        if (s) out.push(s);
      }
      return out;
    },
    drawToasts(g) {
      const track = this.trackText; this.trackText = false;
      let y = this.toastTop || 8;
      for (let i = this._toasts.length - 1; i >= 0; i--) {
        const t = this._toasts[i];
        t.life -= this.dt;
        if (t.life <= 0) this._toasts.splice(i, 1);
      }
      this._toasts.forEach((t) => {
        const a = Math.min(1, t.life / 0.45);
        const fs = t.big ? 25 : 19;
        g.save(); g.globalAlpha = a;
        g.font = '700 ' + fs + 'px Pretendard, "Malgun Gothic", sans-serif';
        const maxW = VW - 140;
        const lines = this.wrap(g, t.msg, maxW);
        const lh = fs + 8;
        const w = Math.min(maxW + 40, Math.max(...lines.map(l => g.measureText(l).width)) + 40);
        const h = lines.length * lh + 16;
        this.roundRect(g, VW / 2 - w / 2, y, w, h, 12);
        g.fillStyle = 'rgba(12,14,22,.92)'; g.fill();
        g.strokeStyle = t.color; g.lineWidth = 2; g.stroke();
        g.fillStyle = t.color; g.textAlign = 'center'; g.textBaseline = 'middle';
        lines.forEach((l, i) => g.fillText(l, VW / 2, y + 8 + lh / 2 + i * lh));
        g.restore();
        y += h + 8;
      });
      this.trackText = track;
    },

    /* ---------- 그리기 도우미 ---------- */
    roundRect(g, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    },
    fillRR(g, x, y, w, h, r, fill, stroke, lw) {
      this.roundRect(g, x, y, w, h, r);
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 2; g.stroke(); }
    },
    text(g, s, x, y, size, color, align, weight) {
      g.font = (weight || 700) + ' ' + size + 'px Pretendard, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
      g.fillStyle = color || '#fff';
      g.textAlign = align || 'center';
      g.textBaseline = 'middle';
      g.fillText(s, x, y);
      // 겹침 자동 검사용 기록 (테스트에서만 켠다)
      if (this.trackText && String(s).trim() && (g.globalAlpha === undefined || g.globalAlpha > 0.25)) {
        const w = g.measureText(s).width;
        const a = align || 'center';
        const left = a === 'center' ? x - w / 2 : (a === 'right' ? x - w : x);
        this._boxes.push({ s: String(s), x: left, y: y - size * 0.56, w, h: size * 1.06 });
      }
    },
    gauge(g, x, y, w, h, v, color, bg, label, zone) {
      this.fillRR(g, x, y, w, h, h / 2, bg || 'rgba(255,255,255,.12)');
      if (zone) {  // 목표 구간 표시
        const zx = x + w * zone[0] / 100, zw = w * (zone[1] - zone[0]) / 100;
        g.save(); this.roundRect(g, x, y, w, h, h / 2); g.clip();
        g.fillStyle = 'rgba(90,230,140,.25)'; g.fillRect(zx, y, zw, h); g.restore();
      }
      const p = Math.max(0, Math.min(1, v / 100));
      if (p > 0.002) {
        g.save(); this.roundRect(g, x, y, w, h, h / 2); g.clip();
        g.fillStyle = color; g.fillRect(x, y, w * p, h); g.restore();
      }
      if (label) this.text(g, label, x + w / 2, y + h / 2, Math.min(15, h - 6), '#fff', 'center', 800);
    },
    circle(g, x, y, r, fill, stroke, lw) {
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 2; g.stroke(); }
    },
    // 말랑말랑한 유기체 모양 (장기 그리기용)
    blob(g, cx, cy, r, wob, seed, t) {
      g.beginPath();
      const N = 26;
      for (let i = 0; i <= N; i++) {
        const a = i / N * Math.PI * 2;
        const rr = r * (1 + wob * Math.sin(a * 3 + seed + t * 1.4) * 0.5 + wob * Math.sin(a * 5 - seed * 2 + t) * 0.3);
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
    },
    hit(p, x, y, w, h) { return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h; },
    hitC(p, x, y, r) { return Math.hypot(p.x - x, p.y - y) <= r; },
    lerp(a, b, t) { return a + (b - a) * t; },
    clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  };

  E.api = {
    act: (a) => window.Net && Net.act(a),
    peek: (d) => window.Net && Net.peek(d),
    toast: (m, c, b) => E.toast(m, c, b),
    shake: (a) => E.shake(a)
  };

  window.E = E;
})();
