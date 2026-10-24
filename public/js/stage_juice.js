/* ============================================================
   stage_juice.js — 소화액 담당(2P) 미니게임 5종 (전부 다른 방식)
     입   : 침 받기 (공기방울 회피)
     식도 : 소화관 / 소화샘 분류   ← 식도에는 소화액이 없다
     위   : 위샘 타이밍 (위액 만들기 하나만)
     작은창자 : 간(쓸개즙) · 이자(이자액) 번갈아 만들어 관으로 끌어 보내기
     큰창자 : 물길 파이프 퍼즐     ← 큰창자에도 소화액이 없다
   만든 소화액은 오른쪽 인체 그림을 보고 아래 선택기로 목적지를 골라 [분비].
   ============================================================ */
(function () {
  const VW = 1000, VH = 700;
  const G = window.GAMEDATA;
  const R = G.RULES;
  const J = {};

  /* 한글 조사 자동 선택 — '위액 을(를)' 같은 어색한 표기를 없앤다 */
  function jong(w) {
    const c = (w || '').charCodeAt((w || '').length - 1);
    if (!(c >= 0xac00 && c <= 0xd7a3)) return false;
    return (c - 0xac00) % 28 !== 0;
  }
  function eul(w) { return w + (jong(w) ? '을' : '를'); }
  function ro(w) {
    const c = (w || '').charCodeAt((w || '').length - 1);
    const t = (c >= 0xac00 && c <= 0xd7a3) ? (c - 0xac00) % 28 : -1;
    return w + ((t === 0 || t === 8) ? '로' : '으로');   // 받침 없거나 ㄹ이면 '로'
  }

  const JUICE = {
    salivary:    { name: '침',     color: '#8fe3ff', src: '침샘' },
    gastric:     { name: '위액',   color: '#7dff9b', src: '위샘' },
    liver:       { name: '쓸개즙', color: '#c9e04d', src: '간' },
    gallbladder: { name: '쓸개즙', color: '#5cc26a', src: '쓸개' },
    pancreas:    { name: '이자액', color: '#ffb35a', src: '이자' }
  };

  const AREA = { x: 16, y: 74, w: 600, h: 440 };
  const FLASK = { x: 16, y: 524, w: 600, h: 74 };

  function urgentOrgan(s) {
    if (!s) return null;
    if (s.stage === 'mouth' && s.delivered.saliva < 35) return 'mouth';
    if (s.stage === 'stomach' && s.delivered.gastric < 35) return 'stomach';
    if (s.stage === 'small') {
      if (s.bileStored < R.BILE_DOSE && s.delivered.bile < 35) return 'gallbladder';
      if (s.delivered.pancreatic < 35 || s.delivered.bile < 35) return 'small';
    }
    return null;
  }

  /* ============================================================
     공통 베이스
     ============================================================ */
  const Base = {
    initJ(api) {
      this.api = api;
      Panel.initSel(this);
      this.flasks = [];
      this.sel = 0;
      this.fx = [];
      this.msg = ''; this.msgT = 0;
      this.diff = 0;
    },
    say(msg, color) { this.msg = msg; this.msgT = 2.4; if (color) E.toast(msg, color); },

    addFlask(from) {
      if (this.flasks.length >= 3) { this.flasks.shift(); this.api.act({ t: 'waste' }); }
      this.flasks.push({ from, t: R.SEND_WINDOW });
      this.sel = this.flasks.length - 1;
      this.api.act({ t: 'produce' });
      E.toast(JUICE[from].name + ' 완성! 어디로 보낼지 고르고 [분비]', JUICE[from].color);
    },
    doSend() {
      const f = this.flasks[this.sel];
      if (!f) { this.say('보낼 소화액이 없습니다'); return; }
      const to = Panel.dest(this);
      this.api.act({ t: 'drop', from: f.from, to });
      const correct = G.CORRECT_ROUTE[f.from] === to;
      const o = Panel.BOX[to];
      for (let i = 0; i < 18; i++) this.fx.push({
        x: o.x, y: o.y, vx: (Math.random() - .5) * 300, vy: (Math.random() - .5) * 300,
        life: .8, c: correct ? JUICE[f.from].color : '#ff6b6b'
      });
      if (!correct) E.shake(1.3);
      this.flasks.splice(this.sel, 1);
      this.sel = Math.max(0, Math.min(this.sel, this.flasks.length - 1));
    },

    baseUpdate(dt, s) {
      Panel.syncSel(this, dt);
      this.diff = s ? Math.min(1, s.stageTime / 55) : 0;
      for (let i = this.flasks.length - 1; i >= 0; i--) {
        this.flasks[i].t -= dt;
        if (this.flasks[i].t <= 0) {
          this.api.act({ t: 'waste' });
          E.toast('소화액이 굳어 버렸습니다 — 만들면 바로 보내세요!', '#ff9c9c');
          this.flasks.splice(i, 1);
          this.sel = Math.max(0, Math.min(this.sel, this.flasks.length - 1));
        }
      }
      this.fx.forEach(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; });
      this.fx = this.fx.filter(p => p.life > 0);
      if (this.msgT > 0) this.msgT -= dt;
    },

    baseDown(p) {
      const r = Panel.selDown(this, p);
      if (r === 'send') { this.doSend(); return true; }
      if (r) return true;
      for (let i = 0; i < this.flasks.length; i++) {
        const x = FLASK.x + 12 + i * 150;
        if (E.hit(p, x, FLASK.y + 6, 140, 62)) {
          this.sel = i;
          this.dragF = { i, x: p.x, y: p.y, id: p.id };
          return true;
        }
      }
      return false;
    },
    baseMove(p) {
      if (this.dragF && this.dragF.id === p.id) { this.dragF.x = p.x; this.dragF.y = p.y; return true; }
      return false;
    },
    baseUp(p) {
      if (this.dragF && this.dragF.id === p.id) {
        const to = Panel.hitDest(p);
        const d = this.dragF; this.dragF = null;
        if (to && this.flasks[d.i]) {
          this.destIdx = G.DESTINATIONS.indexOf(to);
          this.sel = d.i;
          this.doSend();
        }
        return true;
      }
      return false;
    },

    baseDraw(g, s) {
      const hot = this.flasks.map(f => f.from);
      Panel.draw(g, { s, selected: Panel.dest(this), urgent: urgentOrgan(s), flowHot: hot });
      Panel.drawSel(g, this, this.flasks.length > 0);
      this.fx.forEach(p => { g.save(); g.globalAlpha = p.life * 1.3; E.circle(g, p.x, p.y, 6, p.c); g.restore(); });

      E.fillRR(g, FLASK.x, FLASK.y, FLASK.w, FLASK.h, 12, 'rgba(0,0,0,.35)', 'rgba(255,255,255,.1)', 1);
      if (!this.flasks.length) {
        E.text(g, this.noFlask ? '이 단계에서는 관을 따라 끌어서 바로 보냅니다'
                               : '만든 소화액이 여기에 담깁니다',
          FLASK.x + FLASK.w / 2, FLASK.y + FLASK.h / 2, 17, 'rgba(255,255,255,.3)', 'center', 600);
      }
      this.flasks.forEach((f, i) => {
        const m = JUICE[f.from];
        const x = FLASK.x + 12 + i * 150, y = FLASK.y + 6;
        const on = i === this.sel;
        E.fillRR(g, x, y, 140, 62, 10, on ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)', on ? m.color : 'rgba(255,255,255,.2)', on ? 3 : 1);
        E.text(g, m.src + '에서', x + 70, y + 17, 13, 'rgba(255,255,255,.55)', 'center', 600);
        E.text(g, m.name, x + 70, y + 37, 19, m.color);
        const pr = Math.max(0, f.t / R.SEND_WINDOW);
        E.gauge(g, x + 14, y + 49, 112, 7, pr * 100, pr < .35 ? '#ff6b6b' : m.color);
      });

      if (this.dragF && this.flasks[this.dragF.i]) {
        const m = JUICE[this.flasks[this.dragF.i].from];
        g.save(); g.globalAlpha = .92;
        E.circle(g, this.dragF.x, this.dragF.y, 30, m.color, 'rgba(255,255,255,.85)', 3);
        E.text(g, m.name, this.dragF.x, this.dragF.y, 14, '#111');
        g.restore();
      }
      if (this.msgT > 0) {
        g.save(); g.globalAlpha = Math.min(1, this.msgT);
        E.text(g, this.msg, AREA.x + AREA.w / 2, AREA.y - 14, 18, '#ffd166'); g.restore();
      }
    },
    areaBox(g, title, sub) {
      E.fillRR(g, AREA.x, AREA.y, AREA.w, AREA.h, 14, 'rgba(255,255,255,.04)', 'rgba(255,255,255,.1)', 1);
      E.text(g, title, AREA.x + AREA.w / 2, AREA.y + 22, 20, '#ffd166');
      if (sub) E.text(g, sub, AREA.x + AREA.w / 2, AREA.y + 46, 14, 'rgba(255,255,255,.5)', 'center', 600);
    }
  };

  function wire(mod) {
    mod.down = function (p) { if (this.baseDown(p)) return; if (this.tap) this.tap(p); };
    mod.move = function (p) { if (this.baseMove(p)) return; if (this.drag) this.drag(p); };
    mod.up = function (p) { this.baseUp(p); if (this.release) this.release(p); };
    return mod;
  }
  function bg(g, c1, c2) {
    const gr = g.createLinearGradient(0, 0, 0, VH);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
  }

  /* ============================================================
     1. 입 단계 — 침 받기
     ============================================================ */
  J.saliva = wire(Object.assign({}, Base, {
    enter(api) {
      this.initJ(api);
      this.glands = [{ x: 110, y: 156 }, { x: 316, y: 134 }, { x: 522, y: 160 }];
      this.drops = []; this.spawn = 0.8;
      this.cup = 316; this.caught = 0; this.need = 4;
      this.flash = 0;
    },
    update(dt, s) {
      this.baseUpdate(dt, s);
      const speed = 1 + this.diff * 1.1;
      this.spawn -= dt * speed;
      if (this.spawn <= 0) {
        this.spawn = 0.62 + Math.random() * 0.4;
        const gl = this.glands[(Math.random() * 3) | 0];
        const bad = Math.random() < 0.20 + this.diff * 0.16;
        this.drops.push({
          x: gl.x, y: gl.y + 22, vx: (316 - gl.x) * (0.4 + Math.random() * 0.8) * 0.6,
          vy: -70 - Math.random() * 90, bad
        });
      }
      const CUPY = 430;
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i];
        d.vy += 620 * dt * speed; d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.y > CUPY - 14 && d.y < CUPY + 40 && Math.abs(d.x - this.cup) < 54 && d.vy > 0) {
          this.drops.splice(i, 1);
          if (d.bad) {
            this.caught = Math.max(0, this.caught - 1); E.shake(.7);
            this.say('공기방울! 침이 아닙니다', '#ff9c9c'); this.flash = .4;
          } else {
            this.caught++;
            if (this.caught >= this.need) { this.caught = 0; this.addFlask('salivary'); }
          }
          continue;
        }
        if (d.y > AREA.y + AREA.h) this.drops.splice(i, 1);
      }
      if (this.flash > 0) this.flash -= dt;
    },
    tap(p) { if (E.hit(p, AREA.x, AREA.y, AREA.w, AREA.h)) this.cup = p.x; },
    drag(p) { if (E.hit(p, AREA.x, AREA.y, AREA.w, AREA.h)) this.cup = p.x; },
    draw(g, s) {
      bg(g, '#17293a', '#0a1119');
      this.areaBox(g, '침샘에서 나오는 침을 받으세요', '회색 공기방울은 피하기  ·  화면을 끌어서 컵 이동');

      this.glands.forEach(gl => Organs.parotid(g, { x: gl.x - 44, y: gl.y - 40, w: 88, h: 80 }));

      this.drops.forEach(d => {
        if (d.bad) E.circle(g, d.x, d.y, 13, 'rgba(190,200,210,.45)', 'rgba(255,255,255,.55)', 2);
        else {
          g.save();
          g.beginPath(); g.moveTo(d.x, d.y - 16);
          g.bezierCurveTo(d.x + 13, d.y - 2, d.x + 11, d.y + 13, d.x, d.y + 13);
          g.bezierCurveTo(d.x - 11, d.y + 13, d.x - 13, d.y - 2, d.x, d.y - 16);
          g.fillStyle = '#8fe3ff'; g.fill();
          g.strokeStyle = '#cdf3ff'; g.lineWidth = 2; g.stroke(); g.restore();
        }
      });

      const cy = 430;
      this.cup = Math.max(AREA.x + 56, Math.min(AREA.x + AREA.w - 56, this.cup));
      g.save();
      g.beginPath();
      g.moveTo(this.cup - 54, cy); g.lineTo(this.cup - 40, cy + 54);
      g.lineTo(this.cup + 40, cy + 54); g.lineTo(this.cup + 54, cy);
      g.closePath();
      g.fillStyle = this.flash > 0 ? 'rgba(255,120,120,.5)' : 'rgba(143,227,255,.25)';
      g.fill();
      const lv = this.caught / this.need;
      g.save(); g.clip(); g.globalAlpha = .85; g.fillStyle = '#8fe3ff';
      g.fillRect(this.cup - 54, cy + 54 - 54 * lv, 108, 54 * lv); g.restore();
      g.strokeStyle = '#8fe3ff'; g.lineWidth = 3; g.stroke();
      g.restore();
      E.text(g, this.caught + ' / ' + this.need, this.cup, cy + 76, 17, '#8fe3ff');

      this.baseDraw(g, s);
    }
  }));

  /* ============================================================
     2. 식도 단계 — 소화관 / 소화샘 분류
     ============================================================ */
  J.travel = wire(Object.assign({}, Base, {
    enter(api) {
      this.initJ(api);
      this.card = null; this.next = 0.5;
      this.streak = 0; this.right = 0; this.wrong = 0;
      this.judge = null; this.judgeT = 0;
      this.pool = G.CLASSIFY.slice();
    },
    newCard() {
      if (!this.pool.length) this.pool = G.CLASSIFY.slice();
      const i = (Math.random() * this.pool.length) | 0;
      this.card = Object.assign({}, this.pool.splice(i, 1)[0]);
      const jam = !!(E.snap && E.snap.eso && E.snap.eso.blocked > 0);
      this.card.t = jam ? 8 : Math.max(1.9, 4.4 - this.diff * 2.3);   // 막혔을 땐 서두르지 않게
      this.card.max = this.card.t;
    },
    answer(type) {
      if (!this.card) return;
      const ok = this.card.type === type;
      this.api.act({ t: 'classify', ok });
      const jam = !!(E.snap && E.snap.eso && E.snap.eso.blocked > 0);
      if (ok) {
        this.right++; this.streak++;
        this.judge = jam ? '정답! 막힌 근육을 뚫었습니다' : '정답!';
      }
      else {
        this.wrong++; this.streak = 0; E.shake(.9);
        this.judge = this.card.name + ' 은(는) ' + (this.card.type === 'tract' ? '소화관' : '소화샘') + '입니다';
      }
      this.judgeT = 1.2;
      this.card = null; this.next = 0.4;
    },
    update(dt, s) {
      this.baseUpdate(dt, s);
      if (this.card) {
        this.card.t -= dt;
        if (this.card.t <= 0) {
          this.api.act({ t: 'classify', ok: false });
          this.wrong++; this.streak = 0; this.judge = '시간 초과!'; this.judgeT = 1.2;
          this.card = null; this.next = 0.4;
        }
      } else {
        this.next -= dt;
        if (this.next <= 0) this.newCard();
      }
      if (this.judgeT > 0) this.judgeT -= dt;
    },
    tap(p) {
      if (E.hit(p, 40, 372, 250, 116)) this.answer('tract');
      else if (E.hit(p, 340, 372, 250, 116)) this.answer('gland');
    },
    release(p) {
      if (!this.card) return;
      if (p.dist > 90 && Math.abs(p.x - p.x0) > 60 && p.y0 < 520) this.answer(p.x > p.x0 ? 'gland' : 'tract');
    },
    draw(g, s) {
      bg(g, '#20233a', '#0d0f18');
      const jam = !!(s && s.eso && s.eso.blocked > 0);
      this.areaBox(g, '소화관일까? 소화샘일까?',
        jam ? '★ 짝꿍의 식도 근육이 막혔습니다 — 한 문제만 맞히면 뚫립니다!'
            : '카드를 좌우로 밀거나 아래 칸을 누르세요');
      if (jam) {
        g.save(); g.globalAlpha = .35 + .3 * Math.abs(Math.sin(E.t * 5));
        E.fillRR(g, AREA.x + 4, AREA.y + 4, AREA.w - 8, AREA.h - 8, 12, 'rgba(0,0,0,0)', '#ff6b6b', 4);
        g.restore();
      }

      if (this.card) {
        const x = AREA.x + AREA.w / 2, y = 244;
        E.fillRR(g, x - 150, y - 62, 300, 124, 16, 'rgba(255,255,255,.1)', '#ffd166', 3);
        E.text(g, this.card.name, x, y - 6, 42, '#fff');
        const pr = this.card.t / this.card.max;
        E.gauge(g, x - 120, y + 40, 240, 9, pr * 100, pr < .35 ? '#ff6b6b' : '#ffd166');
      } else if (this.judgeT > 0) {
        g.save(); g.globalAlpha = Math.min(1, this.judgeT * 1.4);
        E.text(g, this.judge, AREA.x + AREA.w / 2, 244, this.judge === '정답!' ? 40 : 24,
          this.judge === '정답!' ? '#7dff9b' : '#ff9c9c');
        g.restore();
      }

      E.fillRR(g, 40, 372, 250, 116, 14, 'rgba(143,227,255,.10)', '#8fe3ff', 2);
      E.text(g, '◀ 소화관', 165, 410, 26, '#8fe3ff');
      E.text(g, '음식물이 지나가는 길', 165, 444, 14, 'rgba(255,255,255,.5)', 'center', 600);
      E.fillRR(g, 340, 372, 250, 116, 14, 'rgba(255,179,90,.10)', '#ffb35a', 2);
      E.text(g, '소화샘 ▶', 465, 410, 26, '#ffb35a');
      E.text(g, '소화액을 만드는 기관', 465, 444, 14, 'rgba(255,255,255,.5)', 'center', 600);

      E.text(g, '맞음 ' + this.right + '   틀림 ' + this.wrong + (this.streak > 2 ? '   ' + this.streak + '연속!' : ''),
        AREA.x + AREA.w / 2, 338, 17, this.streak > 2 ? '#7dff9b' : 'rgba(255,255,255,.55)', 'center', 700);
      E.text(g, '식도에서는 소화액이 나오지 않습니다', AREA.x + AREA.w / 2, AREA.y + AREA.h - 14, 15,
        'rgba(255,255,255,.45)', 'center', 600);

      this.baseDraw(g, s);
    }
  }));

  /* ============================================================
     3. 위 단계 — ★ 위액 만들기 하나에만 집중한다
        위샘 3개가 번갈아 활성화된다. 활성화된 위샘의 초록 구간에서 눌러야 한다.
        (간에서 쓸개즙 만드는 일은 작은창자 단계에서만 한다)
     ============================================================ */
  const BAR = { x: 132, w: 424, h: 34 };
  const BAR_Y = [190, 288, 386];

  J.dual = wire(Object.assign({}, Base, {
    enter(api) {
      this.initJ(api);
      this.bars = BAR_Y.map((y, i) => ({
        y, needle: i * 0.33, dir: i % 2 ? -1 : 1, zone: [0.4, 0.62], hit: 0, miss: 0
      }));
      this.active = 0; this.swapT = 3.0;
      this.gUnits = 0; this.gNeed = 3;
      this.made = 0;
    },
    update(dt, s) {
      this.baseUpdate(dt, s);
      const sp = 0.8 + this.diff * 1.0;
      const w = 0.26 - this.diff * 0.12;
      this.bars.forEach((b, i) => {
        const k = sp * (1 + i * 0.16);
        b.needle += b.dir * k * dt;
        if (b.needle > 1) { b.needle = 1; b.dir = -1; }
        if (b.needle < 0) { b.needle = 0; b.dir = 1; }
        const c = 0.5 + Math.sin(E.t * 0.5 + i * 1.7) * 0.2;
        b.zone = [c - w / 2, c + w / 2];
        if (b.hit > 0) b.hit -= dt;
        if (b.miss > 0) b.miss -= dt;
      });
      // 활성 위샘이 바뀐다
      this.swapT -= dt;
      if (this.swapT <= 0) {
        this.swapT = 3.4 - this.diff * 1.2;
        let n = this.active;
        while (n === this.active) n = (Math.random() * this.bars.length) | 0;
        this.active = n;
      }
    },
    tap(p) {
      for (let i = 0; i < this.bars.length; i++) {
        const b = this.bars[i];
        if (!E.hit(p, BAR.x - 30, b.y - 34, BAR.w + 60, 76)) continue;
        if (i !== this.active) {
          b.miss = .4;
          this.say('지금 일하는 위샘은 ' + (this.active + 1) + '번입니다 — 반짝이는 곳을 누르세요', '#ffd166');
          return;
        }
        const inZone = b.needle >= b.zone[0] && b.needle <= b.zone[1];
        if (inZone) {
          b.hit = .4; this.gUnits++;
          if (this.gUnits >= this.gNeed) {
            this.gUnits = 0; this.made++; this.addFlask('gastric');
          } else this.say('좋아요! 위액 ' + this.gUnits + ' / ' + this.gNeed, '#7dff9b');
          this.swapT = Math.min(this.swapT, 0.8);        // 곧 다른 위샘으로
        } else {
          b.miss = .4;                                    // 실패해도 모은 것은 그대로
          this.say('조금 빗나갔어요 — 초록 구간에서 누르세요', '#ffd166');
        }
        return;
      }
    },
    draw(g, s) {
      bg(g, '#2a1a1a', '#120909');
      this.areaBox(g, '위샘에서 위액을 만들어 위로 보내세요',
        '반짝이는 위샘의 초록 구간에서 누르기  ·  위샘은 번갈아 일합니다');

      this.bars.forEach((b, i) => {
        const on = i === this.active;
        const bx = BAR.x, by = b.y;
        // 위샘 이름표
        g.save(); g.globalAlpha = on ? 1 : .4;
        E.text(g, (i + 1) + '번 위샘', bx - 34, by + BAR.h / 2, 15, on ? '#7dff9b' : 'rgba(255,255,255,.5)', 'right', 800);
        g.restore();

        if (on) {
          g.save(); g.globalAlpha = .18 + .12 * Math.abs(Math.sin(E.t * 5));
          E.fillRR(g, bx - 12, by - 12, BAR.w + 24, BAR.h + 24, 16, '#7dff9b');
          g.restore();
        }
        E.fillRR(g, bx, by, BAR.w, BAR.h, BAR.h / 2, on ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.05)');
        g.save(); E.roundRect(g, bx, by, BAR.w, BAR.h, BAR.h / 2); g.clip();
        g.fillStyle = on ? 'rgba(125,255,155,.42)' : 'rgba(125,255,155,.14)';
        g.fillRect(bx + BAR.w * b.zone[0], by, BAR.w * (b.zone[1] - b.zone[0]), BAR.h);
        g.restore();
        const nx = bx + BAR.w * b.needle;
        g.save();
        g.globalAlpha = on ? 1 : .45;
        g.strokeStyle = b.hit > 0 ? '#7dff9b' : (b.miss > 0 ? '#ff6b6b' : '#fff');
        g.lineWidth = 5; g.beginPath(); g.moveTo(nx, by - 9); g.lineTo(nx, by + BAR.h + 9); g.stroke();
        g.restore();
      });

      // 모은 위액
      E.text(g, '위액 ' + this.gUnits + ' / ' + this.gNeed, AREA.x + AREA.w / 2, 452, 22, '#7dff9b');
      E.gauge(g, AREA.x + 120, 468, AREA.w - 240, 16, this.gUnits / this.gNeed * 100, '#7dff9b');
      E.text(g, '만든 위액 ' + this.made + '병', AREA.x + AREA.w / 2, 498, 14, 'rgba(255,255,255,.5)', 'center', 600);

      this.baseDraw(g, s);
    }
  }));


  /* ============================================================
     4. 작은창자 단계 — ★ 소화액 관 네트워크
        · 간에서 쓸개즙을, 이자에서 이자액을 '동시에' 만든다.
        · 만든 방울은 하나로 이어진 관을 따라 손으로 끌어 옮긴다.
          관 끝은 세 곳 — 위 · 쓸개 · 작은창자. 어디로 보낼지 스스로 골라야 한다.
        · ★ 끌다가 관 밖(관벽)에 닿으면 새어 나가 처음부터 다시.
        · 쓸개에 저장된 쓸개즙은 다시 끌어서 위로 갈지 작은창자로 갈지 또 골라야 한다.
     ============================================================ */
  const LIVER = { x: 30, y: 150, w: 190, h: 112 };      // 간 작업대 (방울 고르기)
  const PANC = { x: 120, y: 404, r: 54 };               // 이자 (연타)
  const DUCT_R = 26;                                    // 관의 반지름 (이보다 벗어나면 샌다)

  // 관 : 간 · 이자에서 나와 하나의 줄기로 모였다가 세 곳으로 갈라진다
  const DUCTS = [
    [[220, 206], [330, 206]],                            // 간 → 줄기
    [[330, 170], [330, 450]],                            // 줄기 (세로)
    [[174, 420], [330, 420]],                            // 이자 → 줄기
    [[330, 192], [434, 192], [434, 168], [486, 168]],    // → 위
    [[330, 300], [486, 300]],                            // → 쓸개
    [[330, 404], [434, 404], [434, 446], [486, 446]]     // → 작은창자
  ];
  const ENDS = [
    { id: 'stomach', name: '위', x: 524, y: 168, r: 38, color: '#ff9c9c' },
    { id: 'gallbladder', name: '쓸개', x: 524, y: 300, r: 38, color: '#5cc26a' },
    { id: 'small', name: '작은창자', x: 524, y: 446, r: 38, color: '#ffb35a' }
  ];
  const HOME = {
    liver: { x: 220, y: 206 },
    pancreas: { x: 186, y: 420 },
    gallbladder: { x: 450, y: 300 }     // 쓸개 입구 (관 위) — 다시 어디로 보낼지 고른다
  };

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L = dx * dx + dy * dy;
    let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }
  function ductDist(x, y) {
    let m = 1e9;
    for (const line of DUCTS) {
      for (let i = 0; i < line.length - 1; i++) {
        m = Math.min(m, segDist(x, y, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]));
      }
    }
    return m;
  }
  function endAt(x, y) {
    for (const e of ENDS) if (Math.hypot(x - e.x, y - e.y) < e.r + 6) return e;
    return null;
  }

  J.triple = wire(Object.assign({}, Base, {
    enter(api) {
      this.initJ(api);
      this.noFlask = true;                       // 이 단계는 관으로 직접 보낸다
      this.pan = 0; this.heat = 0; this.lock = 0;
      this.drops = []; this.dSpawn = 0.5;
      this.bile = 0; this.bileNeed = 3;
      this.blobs = []; this.dragId = null; this.dragB = null;
      this.judge = ''; this.judgeT = 0; this.judgeOk = true;
      this.sent = 0; this.leaks = 0; this.glow = null; this.glowT = 0;
      this.turn = 'liver';        // ★ 간 → 이자 → 간 … 번갈아 만든다
      this.gbLock = 0; this.gbAt = 0; this._bile = 0;   // 쓸개 방울 중복 생성 막기
    },
    turnName() { return this.turn === 'liver' ? '간 (쓸개즙)' : '이자 (이자액)'; },
    nextTurn() {
      this.turn = this.turn === 'liver' ? 'pancreas' : 'liver';
      E.toast('다음 차례 : ' + this.turnName(), '#ffd166');
    },
    hasBlob(from) { return this.blobs.some(b => b.from === from); },
    addBlob(from) {
      if (this.hasBlob(from)) return false;
      const h = HOME[from];
      this.blobs.push({ from, x: h.x, y: h.y, armed: false });
      return true;
    },
    say(m, c, ok) { this.judge = m; this.judgeT = 1.8; this.judgeOk = ok !== false; E.toast(m, c); },

    update(dt, s) {
      this.baseUpdate(dt, s);
      if (this.lock > 0) { this.lock -= dt; this.heat = Math.max(0, this.heat - 46 * dt); }
      else this.heat = Math.max(0, this.heat - 17 * dt);

      // 간 안에서 방울이 떠다닌다
      this.dSpawn -= dt * (1 + this.diff * 0.7);
      if (this.dSpawn <= 0 && this.drops.length < 7) {
        this.dSpawn = 0.8;
        this.drops.push({
          x: LIVER.x + 26 + Math.random() * (LIVER.w - 52),
          y: LIVER.y + 30 + Math.random() * (LIVER.h - 60),
          vx: (Math.random() - .5) * 54, vy: (Math.random() - .5) * 44,
          bile: Math.random() < 0.6
        });
      }
      this.drops.forEach(d => {
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.x < LIVER.x + 22 || d.x > LIVER.x + LIVER.w - 22) d.vx *= -1;
        if (d.y < LIVER.y + 26 || d.y > LIVER.y + LIVER.h - 26) d.vy *= -1;
      });

      /* 쓸개에 저장된 쓸개즙이 있으면 쓸개 입구에 방울이 생긴다 (다시 골라 보내야 한다).
         ★ 보낸 직후에는 서버 값이 아직 줄기 전이라 방울이 하나 더 생기는 버그가 있었다 —
           서버가 실제로 저장량을 줄인 것을 확인할 때까지 기다린다. */
      this._bile = s ? s.bileStored : 0;
      if (this.gbLock > 0) {
        this.gbLock -= dt;
        if (s && s.bileStored < this.gbAt - 0.5) this.gbLock = 0;   // 서버가 반영했다
      } else if (s && s.bileStored >= R.BILE_DOSE) this.addBlob('gallbladder');

      if (this.judgeT > 0) this.judgeT -= dt;
      if (this.glowT > 0) this.glowT -= dt;
    },

    tap(p) {
      // 관 위의 방울 잡기 (이자·간보다 먼저 확인한다)
      for (const b of this.blobs) {
        if (E.hitC(p, b.x, b.y, 30)) { this.dragId = p.id; this.dragB = b; return; }
      }
      // ① 이자 연타
      if (E.hitC(p, PANC.x, PANC.y, PANC.r)) {
        if (this.turn !== 'pancreas') { this.say('지금은 간에서 쓸개즙을 만들 차례입니다', '#ffd166', false); return; }
        if (this.lock > 0) { this.say('이자가 지쳤습니다 — 잠시 기다리세요', '#ff9c9c', false); return; }
        if (this.hasBlob('pancreas')) { this.say('이자액이 이미 관 입구에 있습니다 — 먼저 옮기세요', '#ffd166', false); return; }
        this.pan += 9; this.heat += 12;
        if (this.heat >= 100) { this.lock = 2.6; this.heat = 100; E.shake(.8); this.say('과열! 잠시 멈춥니다', '#ff9c9c', false); }
        if (this.pan >= 100) {
          this.pan = 0; this.addBlob('pancreas'); this.api.act({ t: 'produce' });
          this.say('이자액 완성! 관을 따라 끌어 보내세요', '#ffb35a');
          this.nextTurn();
        }
        return;
      }
      // ② 간 : 쓸개즙 방울만 골라 탭
      if (E.hit(p, LIVER.x, LIVER.y, LIVER.w, LIVER.h)) {
        if (this.turn !== 'liver') { this.say('지금은 이자에서 이자액을 만들 차례입니다', '#ffd166', false); return; }
        let best = -1, bd = 34;
        this.drops.forEach((d, i) => {
          const dist = Math.hypot(d.x - p.x, d.y - p.y);
          if (dist < bd) { bd = dist; best = i; }
        });
        if (best < 0) return;
        const d = this.drops.splice(best, 1)[0];
        if (d.bile) {
          if (this.hasBlob('liver')) { this.say('쓸개즙이 이미 관 입구에 있습니다 — 먼저 옮기세요', '#ffd166', false); return; }
          this.bile++;
          if (this.bile >= this.bileNeed) {
            this.bile = 0; this.addBlob('liver'); this.api.act({ t: 'produce' });
            this.say('쓸개즙 완성! 관을 따라 끌어 보내세요', '#c9e04d');
            this.nextTurn();
          } else this.say('쓸개즙 ' + this.bile + ' / ' + this.bileNeed, '#c9e04d');
        } else {
          E.shake(.6); this.bile = Math.max(0, this.bile - 1);
          this.say('노폐물을 골랐습니다! 초록 방울만 고르세요', '#ff9c9c', false);
        }
      }
    },

    drag(p) {
      if (this.dragId !== p.id || !this.dragB) return;
      const b = this.dragB;
      b.x = p.x; b.y = p.y;

      // 집에서 충분히 벗어나야 '보내기'로 인정한다 (제자리에서 바로 도착 처리 방지)
      const h = HOME[b.from];
      if (!b.armed && Math.hypot(p.x - h.x, p.y - h.y) > 46) b.armed = true;

      const e = endAt(p.x, p.y);
      if (e && b.armed) { this.deliver(b, e); return; }
      if (e) return;                              // 아직 출발 지점 근처
      if (ductDist(p.x, p.y) > DUCT_R) {          // ★ 관 밖으로 새어 나갔다
        const h = HOME[b.from];
        b.x = h.x; b.y = h.y;
        this.dragId = null; this.dragB = null;
        this.leaks++;
        E.shake(1.1);
        this.say('관을 벗어났습니다! 소화액이 새어 나갔어요', '#ff6b6b', false);
      }
    },
    release(p) { if (this.dragId === p.id) { this.dragId = null; this.dragB = null; } },

    deliver(b, e) {
      const correct = G.CORRECT_ROUTE[b.from] === e.id;
      this.api.act({ t: 'drop', from: b.from, to: e.id });
      const i = this.blobs.indexOf(b);
      if (i >= 0) this.blobs.splice(i, 1);
      this.dragId = null; this.dragB = null;
      if (b.from === 'gallbladder') { this.gbLock = 1.4; this.gbAt = this._bile; }
      this.glow = e.id; this.glowT = .8;
      if (correct) { this.sent++; this.say(JUICE[b.from].name + ' → ' + e.name + ' 정확!', e.color); }
      else { E.shake(1.3); this.say(eul(JUICE[b.from].name) + ' ' + ro(e.name) + ' 보냈습니다!', '#ff6b6b', false); }
    },

    draw(g, s) {
      bg(g, '#241a2a', '#100b12');
      this.areaBox(g, '만든 소화액을 관을 따라 끌어서 보내세요',
        '관 밖으로 나가면 새어 나갑니다 · 끝은 위 · 쓸개 · 작은창자 세 곳');
      // ★ 이번 차례 안내 (간 → 이자 → 간 …)
      const liverTurn = this.turn === 'liver';
      E.fillRR(g, 196, 132, 240, 28, 9, liverTurn ? 'rgba(201,224,77,.2)' : 'rgba(255,179,90,.2)',
        liverTurn ? '#c9e04d' : '#ffb35a', 2);
      E.text(g, '이번 차례 : ' + this.turnName(), 316, 146, 14, liverTurn ? '#c9e04d' : '#ffb35a');

      /* ---- 관 ---- */
      g.save();
      g.lineCap = 'round'; g.lineJoin = 'round';
      DUCTS.forEach(line => {
        g.beginPath(); g.moveTo(line[0][0], line[0][1]);
        for (let i = 1; i < line.length; i++) g.lineTo(line[i][0], line[i][1]);
        g.strokeStyle = 'rgba(180,220,255,.10)'; g.lineWidth = DUCT_R * 2; g.stroke();
        g.strokeStyle = 'rgba(180,220,255,.30)'; g.lineWidth = DUCT_R * 2 - 6; g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 2; g.setLineDash([9, 8]); g.stroke();
        g.setLineDash([]);
      });
      g.restore();

      /* ---- 끝(목적지) ---- */
      ENDS.forEach(e => {
        const hot = this.glow === e.id && this.glowT > 0;
        E.circle(g, e.x, e.y, e.r, hot ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.07)', e.color, hot ? 5 : 3);
        E.text(g, e.name, e.x, e.y, e.name.length > 2 ? 15 : 19, e.color);
      });
      const stored = s ? s.bileStored : 0;
      E.gauge(g, ENDS[1].x - 60, ENDS[1].y + 50, 120, 16, stored, '#5cc26a', 'rgba(255,255,255,.12)',
        '저장 ' + Math.round(stored) + '%');

      /* ---- ② 간 ---- */
      g.save(); g.globalAlpha = liverTurn ? 1 : .38;
      E.fillRR(g, LIVER.x, LIVER.y, LIVER.w, LIVER.h, 12, 'rgba(201,224,77,.07)',
        liverTurn ? '#c9e04d' : 'rgba(201,224,77,.4)', liverTurn ? 3 : 2);
      E.text(g, liverTurn ? '간 — 초록 방울만 탭' : '간 (다음 차례)',
        LIVER.x + LIVER.w / 2, LIVER.y + 17, 14, '#c9e04d');
      this.drops.forEach(d => {
        if (d.bile) {
          E.circle(g, d.x, d.y, 15, '#c9e04d', 'rgba(255,255,255,.6)', 3);
          E.text(g, '즙', d.x, d.y, 12, '#2a2a10');
        } else {
          g.save(); E.blob(g, d.x, d.y, 14, .25, d.x, E.t);
          g.fillStyle = '#5a5a5a'; g.fill(); g.strokeStyle = '#2f2f2f'; g.lineWidth = 2; g.stroke(); g.restore();
        }
      });
      E.gauge(g, LIVER.x + 16, LIVER.y + LIVER.h - 24, LIVER.w - 32, 16,
        this.bile / this.bileNeed * 100, '#c9e04d', 'rgba(255,255,255,.12)',
        '모은 쓸개즙 ' + this.bile + '/' + this.bileNeed);
      g.restore();

      /* ---- ① 이자 ---- */
      g.save(); g.globalAlpha = this.lock > 0 ? .35 : (liverTurn ? .38 : 1);
      E.circle(g, PANC.x, PANC.y, PANC.r, 'rgba(255,179,90,.14)', '#ffb35a', liverTurn ? 3 : 5);
      E.text(g, '🔶', PANC.x, PANC.y - 12, 30, '#fff');
      E.text(g, '이자', PANC.x, PANC.y + 18, 16, '#ffb35a');
      g.restore();
      E.text(g, this.lock > 0 ? '과열! 식는 중…' : (liverTurn ? '이자 (다음 차례)' : '이자 연타'),
        PANC.x, PANC.y - 78, 17, this.lock > 0 ? '#ff6b6b' : '#ffb35a');
      E.gauge(g, PANC.x - 76, PANC.y + 66, 152, 16, this.pan, '#ffb35a', 'rgba(255,255,255,.1)',
        '이자액 ' + Math.round(this.pan) + '%');
      E.gauge(g, PANC.x - 76, PANC.y + 88, 152, 11, this.heat, this.heat > 70 ? '#ff6b6b' : '#ffd166',
        'rgba(255,255,255,.1)');
      E.text(g, '과열', PANC.x - 96, PANC.y + 93, 12, 'rgba(255,255,255,.5)', 'center', 600);

      /* ---- 관 위의 방울 ---- */
      this.blobs.forEach(b => {
        const m = JUICE[b.from];
        const a = .4 + .5 * Math.abs(Math.sin(E.t * 5));
        g.save(); g.globalAlpha = a;
        E.circle(g, b.x, b.y, 29, null, m.color, 3); g.restore();
        E.circle(g, b.x, b.y, 22, m.color, 'rgba(255,255,255,.9)', 3);
        E.text(g, m.name, b.x, b.y, m.name.length > 2 ? 11 : 13, '#20200c');   // '쓸개' 가 아니라 '쓸개즙'
      });

      if (this.judgeT > 0) {
        g.save(); g.globalAlpha = Math.min(1, this.judgeT);
        E.text(g, this.judge, AREA.x + AREA.w / 2, AREA.y + AREA.h - 16, 17,
          this.judgeOk ? '#7dff9b' : '#ff9c9c');
        g.restore();
      }

      this.baseDraw(g, s);
    }
  }));


  /* ============================================================
     5. 큰창자 단계 — 칸마다 20초 안에 물길을 이어야 한다
        찌꺼기는 그 20초 동안 그 칸에 갇혀 있고,
        물길을 못 이으면 그 칸에서는 물이 한 방울도 빠지지 않는다.
     ============================================================ */
  const COLS = 4, ROWS = 3, TW = 132, TH = 96, GX = 46, GY = 164;

  J.microbe = wire(Object.assign({}, Base, {
    enter(api) {
      this.initJ(api);
      this.solved = 0; this.win = 0; this.round = -1; this.done = false;
      this.make();
    },
    make() {
      const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
      const path = []; let c = 0, r = 1, guard = 0;
      path.push([c, r]);
      while (c < COLS - 1 && guard++ < 40) {
        if (Math.random() < 0.42) {
          const nr = r + (Math.random() < .5 ? -1 : 1);
          if (nr >= 0 && nr < ROWS && !path.some(q => q[0] === c && q[1] === nr)) { r = nr; path.push([c, r]); continue; }
        }
        c++; path.push([c, r]);
      }
      this.exitRow = r;
      const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;
      grid[path[0][1]][path[0][0]] |= LEFT;
      for (let i = 0; i < path.length - 1; i++) {
        const [c1, r1] = path[i], [c2, r2] = path[i + 1];
        if (c2 > c1) { grid[r1][c1] |= RIGHT; grid[r2][c2] |= LEFT; }
        else if (r2 > r1) { grid[r1][c1] |= DOWN; grid[r2][c2] |= UP; }
        else { grid[r1][c1] |= UP; grid[r2][c2] |= DOWN; }
      }
      const last = path[path.length - 1];
      grid[last[1]][last[0]] |= RIGHT;
      const deco = [3, 6, 12, 9, 5, 10];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if (!grid[y][x]) grid[y][x] = deco[(Math.random() * deco.length) | 0];
      }
      this.solution = grid.map(r => r.slice());
      this.grid = grid.map(row => row.map(m => {
        let v = m; const n = 1 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) v = ((v << 1) | (v >> 3)) & 15;
        return v;
      }));
      this.done = false; this.win = 0;
    },
    connected() {
      const seen = new Set(), q = [];
      if (this.grid[1][0] & 8) { q.push([0, 1]); seen.add('0,1'); }
      const dirs = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]];
      while (q.length) {
        const [x, y] = q.shift();
        for (const [dx, dy, mine, theirs] of dirs) {
          if (!(this.grid[y][x] & mine)) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          if (!(this.grid[ny][nx] & theirs)) continue;
          const k = nx + ',' + ny;
          if (seen.has(k)) continue;
          seen.add(k); q.push([nx, ny]);
        }
      }
      const ok = seen.has((COLS - 1) + ',' + this.exitRow) && !!(this.grid[this.exitRow][COLS - 1] & 2);
      return { ok, seen };
    },
    update(dt, s) {
      this.baseUpdate(dt, s);
      const L = s && s.large;
      if (L && L.round !== this.round) {          // 새 칸 → 새 퍼즐
        this.round = L.round;
        if (L.round < L.rounds) { this.make(); E.toast((L.round + 1) + '번 칸! 20초 안에 물길을 이으세요', '#7ad7f0', true); }
      }
      if (this.win > 0) this.win -= dt;
    },
    tap(p) {
      if (this.done) return;
      const cx = Math.floor((p.x - GX) / TW), cy = Math.floor((p.y - GY) / TH);
      if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
      const v = this.grid[cy][cx];
      this.grid[cy][cx] = ((v << 1) | (v >> 3)) & 15;
      if (this.connected().ok) {
        this.win = 1.6; this.solved++; this.done = true;
        this.api.act({ t: 'gate' });
        E.toast('물길 연결! 이 칸에서 짝꿍이 물을 뺄 수 있습니다', '#7ad7f0', true);
      }
    },
    draw(g, s) {
      bg(g, '#16281f', '#08110c');
      const L = (s && s.large) || { round: 0, rounds: R.PORES, roundT: R.ROUND_TIME, roundLimit: R.ROUND_TIME, open: false, target: 0 };
      const cur = Math.min(L.round, L.rounds - 1);
      const left = Math.max(0, L.roundT);

      this.areaBox(g, (cur + 1) + ' / ' + L.rounds + '번 칸 — 물길을 이어 주세요',
        '조각을 눌러 돌립니다 · 왼쪽 입구에서 오른쪽 출구까지');

      // 남은 시간
      const pr = Math.max(0, Math.min(1, left / (L.roundLimit || R.ROUND_TIME)));
      E.gauge(g, AREA.x + 40, 136, AREA.w - 80, 16, pr * 100,
        left < 6 ? '#ff6b6b' : '#7ad7f0', 'rgba(255,255,255,.12)',
        left.toFixed(1) + '초 남음');

      const { seen } = this.connected();
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const px = GX + x * TW, py = GY + y * TH;
        const on = seen.has(x + ',' + y);
        E.fillRR(g, px + 4, py + 4, TW - 8, TH - 8, 10,
          on ? 'rgba(122,215,240,.13)' : 'rgba(255,255,255,.04)',
          on ? 'rgba(122,215,240,.5)' : 'rgba(255,255,255,.12)', 2);
        const m = this.grid[y][x], mx = px + TW / 2, my = py + TH / 2;
        g.save();
        g.lineCap = 'round';
        g.strokeStyle = on ? '#7ad7f0' : '#5d7f70';
        g.lineWidth = 15;
        if (m & 1) { g.beginPath(); g.moveTo(mx, my); g.lineTo(mx, py + 6); g.stroke(); }
        if (m & 2) { g.beginPath(); g.moveTo(mx, my); g.lineTo(px + TW - 6, my); g.stroke(); }
        if (m & 4) { g.beginPath(); g.moveTo(mx, my); g.lineTo(mx, py + TH - 6); g.stroke(); }
        if (m & 8) { g.beginPath(); g.moveTo(mx, my); g.lineTo(px + 6, my); g.stroke(); }
        E.circle(g, mx, my, 9, on ? '#bff0ff' : '#7c9a8c');
        g.restore();
      }
      E.text(g, '💧', GX - 20, GY + TH * 1.5, 26, '#7ad7f0');
      E.text(g, '➡', GX + COLS * TW + 12, GY + TH * (this.exitRow + 0.5), 24, '#7dff9b');

      // 칸 진행 표시 (왼쪽 아래) + 상태 문구 (그 아래 줄)
      const pores = (s && s.pores) || [];
      for (let i = 0; i < (L.rounds || R.PORES); i++) {
        const bx = AREA.x + 30 + i * 46;
        E.fillRR(g, bx, 462, 38, 30, 8,
          pores[i] ? 'rgba(122,215,240,.4)' : (i === cur ? 'rgba(255,209,102,.2)' : 'rgba(255,255,255,.05)'),
          pores[i] ? '#7ad7f0' : (i === cur ? '#ffd166' : 'rgba(255,255,255,.15)'), i === cur ? 3 : 1);
        E.text(g, pores[i] ? '💧' : (i + 1), bx + 19, 477, 15,
          pores[i] ? '#fff' : (i === cur ? '#ffd166' : 'rgba(255,255,255,.4)'));
      }
      E.text(g, this.done ? '✔ 이 칸은 뚫었습니다 — 다음 칸을 기다리세요'
                          : '아직 못 뚫었습니다! 시간이 지나면 물이 안 빠집니다',
        AREA.x + AREA.w / 2, 504, 14,
        this.done ? '#7dff9b' : '#ff9c9c', 'center', 700);

      if (this.win > 0) {
        g.save(); g.globalAlpha = Math.min(1, this.win);
        E.text(g, '연결 성공!', AREA.x + AREA.w / 2, 300, 40, '#7ad7f0'); g.restore();
      }
      this.baseDraw(g, s);
    }
  }));


  window.StageJuice = J;
})();
