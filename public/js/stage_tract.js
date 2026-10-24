/* ============================================================
   stage_tract.js — 소화관 담당(1P) 액션 미니게임 5종
   조이스틱 이동 + [점프] + [밀기/행동] (밀기는 앞으로 확 돌진하는 '밀치기')
   ★ 이번 차시 범위만 — 모세혈관/암죽관 구분은 다루지 않는다
   ============================================================ */
(function () {
  const VW = 1000, VH = 700;
  const G = window.GAMEDATA;
  const R = G.RULES;
  const T = {};
  const HERO = '#ffca6b';

  /* ---------- 공용 ---------- */
  function banner(g, msg, color) {
    if (!msg) return 0;
    const track = E.trackText; E.trackText = false;
    g.save();
    g.font = '800 21px Pretendard, "Malgun Gothic", sans-serif';
    const lines = E.wrap(g, msg, 640);
    const h = lines.length * 27 + 14;
    g.globalAlpha = .7 + .3 * Math.sin(E.t * 6);
    E.fillRR(g, 90, 8, 680, h, 10, 'rgba(20,6,8,.85)', color, 2);
    lines.forEach((l, i) => E.text(g, l, 430, 8 + 15 + i * 27, 21, color));
    g.restore(); E.trackText = track;
    E.toastTop = 8 + h + 8;          // 알림이 경고 띠를 가리지 않게
    return h + 12;
  }
  function juiceWarning(s) {
    if (!s) return null;
    if (s.stage === 'mouth' && s.delivered.saliva < 35)
      return ['침이 부족합니다 — 음식이 말라붙어 잘 밀리지 않아요. 짝꿍에게 알리세요!', '#ff9c9c'];
    if (s.stage === 'stomach' && s.delivered.gastric < 35)
      return ['위액이 묽습니다 — 담가도 소화되지 않아요. 짝꿍에게 위액을 요청하세요!', '#ff9c9c'];
    if (s.stage === 'small' && s.delivered.pancreatic < 35 && s.delivered.bile < 35)
      return ['소화액이 없습니다 — 영양소를 소화할 수 없어요! 이자액·쓸개즙을 요청하세요', '#ff9c9c'];
    return null;
  }
  function footer(g, msg) {
    g.save();
    g.font = '600 18px Pretendard, "Malgun Gothic", sans-serif';
    const w = g.measureText(msg).width + 30;
    E.fillRR(g, VW / 2 - w / 2, VH - 32, w, 28, 8, 'rgba(6,8,12,.66)');
    g.restore();
    E.text(g, msg, VW / 2, VH - 18, 18, 'rgba(255,255,255,.74)', 'center', 600);
  }
  function wire(mod) {
    mod.down = function (p) { if (Ctrl.down(p)) return; if (this.tap) this.tap(p); };
    mod.move = function (p) { Ctrl.move(p); };
    mod.up = function (p) { Ctrl.up(p); };
    return mod;
  }

  /* ---------- 기관마다 있는 체력 ----------
     위험 요소에 닿으면 깎이고, 0이 되면 그 기관에서는 더 이상 일할 수 없다.
     짝꿍이 알맞은 소화액(큰창자는 물길)을 보내 주면 회복된다. */
  const HURT = R.HURT || { molar: 26, acid: 25, drop: 22, cramp: 24, reflux: 12, strain: 9 };

  function hpBar(g, hero) {
    const x = 782, y = 8, w = 202, h = 26;
    E.fillRR(g, x, y, w, h, 9, 'rgba(6,8,12,.78)', 'rgba(255,255,255,.18)', 2);
    const p = Math.max(0, Math.min(1, hero.hp / hero.maxHp));
    if (p > 0.004) {
      g.save(); E.roundRect(g, x + 3, y + 3, w - 6, h - 6, 6); g.clip();
      g.fillStyle = p > .55 ? '#7dff9b' : (p > .28 ? '#ffd166' : '#ff6b6b');
      g.fillRect(x + 3, y + 3, (w - 6) * p, h - 6);
      g.restore();
    }
    if (hero.hpFlash > 0) {
      g.save(); g.globalAlpha = Math.min(1, hero.hpFlash) * .8;
      E.roundRect(g, x - 3, y - 3, w + 6, h + 6, 11); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); g.restore();
    }
    E.text(g, '체력 ' + Math.round(hero.hp), x + w / 2, y + h / 2, 15,
      p > .28 ? '#0d1116' : '#ffffff', 'center', 800);
  }
  // 지쳤을 때 화면 가운데 안내
  function spentNote(g, hero, help) {
    if (!hero.spent()) return false;
    g.save(); g.globalAlpha = .55 + .35 * Math.abs(Math.sin(E.t * 3));
    E.fillRR(g, VW / 2 - 260, 196, 520, 60, 12, 'rgba(40,6,10,.9)', '#ff6b6b', 3);
    g.restore();
    E.text(g, '지쳤습니다 — 이 기관에서는 더 이상 일할 수 없어요', VW / 2, 218, 19, '#ff9c9c');
    E.text(g, help, VW / 2, 243, 15, 'rgba(255,255,255,.75)', 'center', 600);
    return true;
  }
  // 짝꿍이 도와주면 회복 (소화액이 새로 도착하거나 물길이 뚫리면)
  function reviveWatch(self, s, key) {
    let v = 0;
    if (!s) return;
    if (key === 'gate') v = (s.pores || []).filter(Boolean).length * 40;
    else if (key === 'small') v = Math.max(s.delivered.pancreatic, s.delivered.bile);
    else v = s.delivered[key] || 0;
    if (self._rv === undefined) { self._rv = v; return; }
    if (v > self._rv + 8 && self.hero && self.hero.hp < self.hero.maxHp) {
      if (self.hero.revive(R.HP_REVIVE || 55)) E.toast('짝꿍 덕분에 회복했습니다! 💚', '#7dff9b');
    }
    self._rv = v;
  }

  /* ============================================================
     1. 입 — 씹어서 작게 만든 뒤 목구멍으로 넘기기
        · [밀기] 버튼 없음. 몸으로 부딪쳐서 민다 (침이 있어야 잘 굴러간다)
        · ★ 어금니가 맞물리는 자리는 혀보다 한 단 낮은 '구덩이' 다.
          혀 위에서 조각을 밀어 구덩이로 떨어뜨리면 어금니가 씹는다.
          작아진 조각은 그 자리에 그대로 남으므로,
          **어금니가 열린 틈에 뛰어 내려가 줍고 다시 점프해서 올라와야 한다.**
          어금니가 맞물릴 때 구덩이 안에 있으면 체력이 깎인다.
        · 작아진 조각은 [줍기]로 들어 왼쪽 목구멍에 던져 넘긴다
     ============================================================ */
  const THROAT = { x: 24, y: 396, w: 96, h: 168 };
  const TONGUE = { x: 120, y: 560, w: 476, h: 100 };     // 혀 바닥 : 120 ~ 596
  const PIT = { x: 596, y: 636, w: 184, h: 44 };         // ★ 어금니 구덩이 바닥 (한 단 아래)
  const LIP = { x: 100, y: 545, w: 20, h: 115 };         // 왼쪽으로 굴러떨어지지 않게 막는 턱
  /* ★ 목구멍 아래 받침 바닥.
     예전에는 y=664 라 턱(545) 까지 119px 을 올라와야 했는데
     점프 최대 상승이 129px 이라 사실상 못 나왔다(빠지면 갇힘).
     바닥을 올리고 중간에 디딤판을 하나 둬서 두 번에 확실히 나올 수 있게 했다. */
  const CATCH = { x: 0, y: 616, w: 100, h: 84 };         // 받침 바닥 (턱까지 71px)
  const STEP  = { x: 46, y: 572, w: 54, h: 14 };         // 디딤판 (받침에서 44px 위)
  const RWALL = { x: 780, y: 280, w: 40, h: 380 };
  const MOLAR_H = 44;                                     // 어금니 높이 (구덩이에 맞춘 크기)

  T.chew = wire({
    enter(api) {
      this.api = api; Ctrl.reset();
      this.hero = new Actor(430, 560, HERO);
      this.world = {
        gravity: 1900, friction: 1.6,
        solids: [TONGUE, PIT, LIP, CATCH, STEP, RWALL].map(o => Object.assign({}, o))
      };
      this.chunks = [];
      for (let i = 0; i < 2; i++) this.spawn(280 + i * 90);
      this.phase = 0; this.judge = ''; this.judgeT = 0;
      this.crumbs = [];
      this.swallowed = 0; this.gulp = 0; this.dives = 0;
    },
    spawn(x) {
      const hard = 2 + ((Math.random() * 2) | 0);            // 2~3번 씹어야 한다
      const c = new Chunk(x || 300, 430, 30 + hard * 4, 'food', hard === 2 ? '#d09a3c' : '#a8712a');
      c.hard = hard; c.maxHard = hard; c.small = false;
      this.chunks.push(c);
    },
    inPit(x, y) { return x > PIT.x - 6 && x < PIT.x + PIT.w + 6 && y > 600; },
    update(dt, s) {
      const inp = Ctrl.poll();
      /* ★ 침이 마르면 음식물이 잘 안 움직인다 (교과서 : 침은 음식물을 부드럽게 한다)
           · 몸으로 밀어도 거의 안 굴러가고
           · 들고 있으면 발이 느려지고, 던져도 멀리 안 간다 */
      const sal = s ? s.delivered.saliva : 0;
      this.dry = sal < R.JUICE_OK;
      this.world.friction = this.dry ? 6.5 : 1.1;
      this.chunks.forEach(c => { c.sticky = this.dry; });
      if (this.dry) {
        this.dryT = (this.dryT || 0) + dt;
        if (this.dryT > 3.5) {
          this.dryT = 0;
          E.toast('입이 말랐습니다! 침이 없으면 음식물이 잘 안 움직여요 — 📢 로 알리세요', '#ffd166');
        }
      } else this.dryT = 0;
      reviveWatch(this, s, 'saliva');

      const size = s ? s.food.size : 100;
      const period = 2.4 - 0.8 * (1 - size / 100);
      this.phase = (this.phase + dt / period) % 1;
      const closed = Math.max(0, Math.cos(this.phase * Math.PI * 2));
      this.jaw = closed;

      // 마른 음식물을 들고 있으면 무거워서 느려진다
      this.hero.speed = (this.dry && this.hero.carry) ? 190 : 300;
      const wasIn = this.inPit(this.hero.x, this.hero.y);
      this.hero.update(dt, this.world, inp);
      if (!wasIn && this.inPit(this.hero.x, this.hero.y)) this.dives++;

      /* ★ 목구멍 옆 받침에 오래 갇혀 있으면 혀 위로 올려 준다 (안전장치).
         발판 배치상 두 번 점프하면 나올 수 있지만, 수업 중 갇히는 일은 없어야 한다. */
      if (this.hero.x < LIP.x && this.hero.y > CATCH.y - 4) {
        this.stuck = (this.stuck || 0) + dt;
        if (this.stuck > 6) {
          this.stuck = 0;
          this.hero.x = TONGUE.x + 60; this.hero.y = TONGUE.y;
          this.hero.vx = 0; this.hero.vy = 0;
          E.toast('혀 위로 올라왔습니다 — 디딤판을 밟고 두 번 점프하면 나올 수 있어요', '#ffd166');
        }
      } else this.stuck = 0;
      this.chunks.forEach(c => { if (!c.held) c.update(dt, this.world, this.hero); });
      if (this.hero.carry) { this.hero.carry.x = this.hero.x; this.hero.carry.y = this.hero.y - this.hero.h - 18; }

      /* ---- [줍기] / [던지기] ---- */
      if (inp.act && this.hero.spent()) {
        E.toast('지쳤습니다 — 짝꿍이 침을 보내 주면 회복돼요', '#ff9c9c');
      } else if (inp.act) {
        if (this.hero.carry) {
          const c = this.hero.carry;
          c.held = false; this.hero.carry = null;
          const pw = this.dry ? 0.55 : 1;                  // 마르면 멀리 못 던진다
          c.vx = this.hero.face * 520 * pw; c.vy = -360 * (this.dry ? 0.82 : 1);
          if (this.dry) E.toast('말라서 잘 안 날아갑니다 — 침이 필요해요!', '#ffd166');
        } else {
          let best = null, bd = 70;
          for (const c of this.chunks) {
            if (!c.small) continue;                          // 큰 조각은 무거워서 못 든다
            const d = Math.hypot(c.x - this.hero.x, c.y - (this.hero.y - 22));
            if (d < bd) { bd = d; best = c; }
          }
          if (best) { best.held = true; this.hero.carry = best; }
          else {
            const bigNear = this.chunks.some(c => !c.small &&
              Math.hypot(c.x - this.hero.x, c.y - (this.hero.y - 22)) < 76);
            if (bigNear) E.toast('아직 커서 들 수 없어요 — 밀어서 어금니 구덩이로!', '#ffd166');
          }
        }
      }

      /* ---- 목구멍으로 넘어갔는가 ---- */
      for (let i = this.chunks.length - 1; i >= 0; i--) {
        const c = this.chunks[i];
        if (c.held) continue;
        if (c.x < THROAT.x + THROAT.w && c.y > THROAT.y && c.y < THROAT.y + THROAT.h) {
          if (c.small) {
            this.api.act({ t: 'swallow' });
            this.swallowed++; this.gulp = .7;
            this.judge = '꿀꺽!'; this.judgeT = .9; this.judgeOk = true;
            E.toast('목구멍으로 넘어갔습니다!', '#7dff9b');
          } else {
            this.judge = '너무 커요! 더 씹어야 해요'; this.judgeT = 1.2; this.judgeOk = false;
            c.x = THROAT.x + THROAT.w + 40; c.vx = 260; c.vy = -240;
            E.shake(.5);
            continue;
          }
          this.chunks.splice(i, 1);
        }
      }

      /* ---- 어금니가 맞물리는 순간 (구덩이 안이 씹히는 자리) ---- */
      if (closed > 0.90 && !this._bit) {
        this._bit = true;
        let hit = 0;
        for (const c of this.chunks) {
          if (c.held || c.small) continue;
          if (this.inPit(c.x, c.y + c.r)) {
            const centered = Math.abs(c.x - (PIT.x + PIT.w / 2)) < 56;
            this.api.act({ t: 'chew', grade: centered ? 'perfect' : 'good' });
            c.hard--; hit++;
            for (let k = 0; k < 10; k++) this.crumbs.push({
              x: c.x, y: c.y, vx: (Math.random() - .5) * 400, vy: -180 - Math.random() * 240, life: .7
            });
            if (c.hard <= 0) {
              // ★ 씹힌 구덩이 자리에 그대로 머문다 — 뛰어 내려가 주워야 한다
              c.small = true; c.r = 18; c.color = '#ffe08a';
              c.vx = 0; c.vy = -100;
              this.judge = '작아졌다! 어금니가 열릴 때 뛰어들어가 주우세요';
              this.judgeOk = true;
            } else {
              c.r = Math.max(20, c.r - 6);
              c.vx = (Math.random() - .5) * 90; c.vy = -200;
              this.judge = centered ? '한 번 더!' : '가운데로 넣어야 잘 씹혀요';
              this.judgeOk = centered;
            }
            this.judgeT = 1.2;
          }
        }
        // ★ 구덩이 안에 있으면 이에 눌린다
        if (this.inPit(this.hero.x, this.hero.y)) {
          if (this.hero.hurt(1.3, HURT.molar)) {
            E.shake(1.4); E.toast('이에 눌렸어요! 어금니가 열렸을 때만 들어가세요', '#ff9c9c');
          }
        }
        if (hit) E.shake(.6);
      }
      if (closed < 0.5) this._bit = false;

      // 혀 위(왼쪽)에 새 조각을 놓아 준다 — 밀어서 구덩이로 떨어뜨려야 한다
      while (this.chunks.length < 2) this.spawn(240 + Math.random() * 190);

      this.crumbs.forEach(f => { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 900 * dt; });
      this.crumbs = this.crumbs.filter(f => f.life > 0);
      if (this.judgeT > 0) this.judgeT -= dt;
      if (this.gulp > 0) this.gulp -= dt;
    },
    draw(g, s) {
      Organs.fleshBackground(g, '#5d2431', '#28101a');
      Organs.mouthCavity(g, { x: 20, y: 40, w: 950, h: 620 });

      // ---- 목구멍(인두) ----
      g.save();
      const gulp = this.gulp > 0 ? Math.sin(this.gulp * 9) * 6 : 0;
      g.beginPath();
      g.ellipse(THROAT.x + THROAT.w / 2, THROAT.y + THROAT.h / 2, THROAT.w / 2 + gulp, THROAT.h / 2 + gulp, 0, 0, 6.284);
      g.fillStyle = '#2a0d16'; g.fill();
      g.strokeStyle = this.gulp > 0 ? '#7dff9b' : '#8e3247'; g.lineWidth = 6; g.stroke();
      g.restore();
      E.text(g, '목구멍', THROAT.x + THROAT.w / 2, THROAT.y - 22, 18, '#ffd166');
      E.text(g, '⬅ 여기로', THROAT.x + THROAT.w / 2 + 6, THROAT.y + THROAT.h + 22, 15, 'rgba(255,255,255,.55)', 'center', 600);

      const SURF = PIT.y;                     // 어금니가 맞물리는 높이 (구덩이 바닥)
      const gap = 14 + (1 - this.jaw) * 200;  // 위 어금니가 열린 정도

      // ---- 어금니 구덩이 (혀보다 한 단 아래) ----
      g.save();
      g.fillStyle = '#2a0d16';
      g.fillRect(PIT.x, 552, PIT.w, VH - 552);
      g.restore();

      // 혀 (구덩이 앞까지)
      Organs.tongue(g, 120, 552, TONGUE.w - 10, 100, E.t);
      E.fillRR(g, LIP.x, LIP.y, LIP.w, LIP.h, 8, '#c96a7d');
      // 혀 끝(구덩이 쪽 벼랑)
      E.fillRR(g, TONGUE.x + TONGUE.w - 30, 552, 30, 26, 10, '#e08a99');

      // 아래 어금니 : 구덩이 바닥에서 위로
      E.fillRR(g, PIT.x - 6, PIT.y, PIT.w + 12, PIT.h + 8, 12, '#a8394f');
      for (let i = 0; i < 2; i++) Organs.molar(g, 644 + i * 88, SURF + MOLAR_H, 80, MOLAR_H, 1);
      // 위 어금니 : 위에서 내려온다
      const upTip = SURF - gap;
      for (let i = 0; i < 2; i++) Organs.molar(g, 644 + i * 88, upTip - MOLAR_H, 80, MOLAR_H, -1);
      E.fillRR(g, PIT.x - 6, upTip - MOLAR_H - 34, PIT.w + 12, 38, 14, '#a8394f');

      // 구덩이 상태 안내
      // 구덩이 상태 안내 (오른쪽 아래 버튼과 겹치지 않도록 왼쪽에 둔다)
      const open = this.jaw < 0.55;
      g.save(); g.globalAlpha = .35 + .3 * Math.abs(Math.sin(E.t * (open ? 3 : 7)));
      E.fillRR(g, PIT.x + 2, 556, PIT.w - 4, 14, 6, open ? 'rgba(125,255,155,.3)' : 'rgba(255,107,107,.35)');
      g.restore();
      E.fillRR(g, 336, 470, 268, 32, 9, 'rgba(12,4,8,.72)');
      E.text(g, open ? '지금! 어금니 구덩이로' : '어금니가 닫힙니다 — 나오세요',
        470, 486, 15, open ? '#7dff9b' : '#ff9c9c');
      g.save(); g.globalAlpha = .35 + .35 * Math.abs(Math.sin(E.t * 3));
      E.text(g, open ? '⤵' : '⤴', 626, 486, 28, open ? '#7dff9b' : '#ff9c9c');
      g.restore();

      const sal = s ? s.delivered.saliva : 0;
      if (sal > 10) {
        g.save(); g.globalAlpha = Math.min(.4, sal / 200);
        E.fillRR(g, 130, 548, TONGUE.w - 40, 20, 10, '#9fe6ff');
        g.restore();
      }

      this.chunks.forEach(c => {
        c.draw(g);
        if (c.small) {
          E.fillRR(g, c.x - 30, c.y - c.r - 24, 60, 19, 6, 'rgba(20,40,20,.8)');
          E.text(g, '들 수 있음', c.x, c.y - c.r - 15, 12, '#7dff9b', 'center', 700);
        } else {
          for (let i = 0; i < c.maxHard; i++) {
            E.circle(g, c.x - (c.maxHard - 1) * 7 + i * 14, c.y - c.r - 14, 5,
              i < c.hard ? '#ff9c9c' : 'rgba(255,255,255,.18)');
          }
        }
      });
      this.crumbs.forEach(f => { g.save(); g.globalAlpha = f.life * 1.4; E.circle(g, f.x, f.y, 5, '#ffe0a0'); g.restore(); });
      this.hero.draw(g);

      if (this.judgeT > 0) {
        g.save(); g.globalAlpha = Math.min(1, this.judgeT);
        E.text(g, this.judge, 400, 330, 24, this.judgeOk ? '#7dff9b' : '#ff9c9c');
        g.restore();
      }
      E.fillRR(g, 812, 96, 172, 46, 10, 'rgba(0,0,0,.42)');
      E.text(g, '넘긴 횟수 ' + this.swallowed, 898, 119, 18, '#7dff9b');

      const w = juiceWarning(s);
      banner(g, w && w[0], w && w[1]);
      hpBar(g, this.hero);
      spentNote(g, this.hero, '짝꿍이 침을 보내 주면 다시 일할 수 있어요');
      footer(g, '밀어서 어금니 구덩이로 → 어금니가 열릴 때 뛰어내려 [줍기] → 점프해 나와 목구멍으로 [던지기]');
      Ctrl.draw(g, '점프', this.hero.carry ? '던지기' : '줍기');
    }
  });

  /* ============================================================
     2. 식도 — 음식물 바로 뒤의 근육을 조여 아래로 밀어낸다
        · 힌트가 잠시 뒤 사라진다 (음식물 위치를 보고 스스로 찾기)
        · ★ 가끔 근육이 막힌다 → 소화액 담당이 분류 문제를 맞혀야 뚫린다 (둘의 연계)
     ============================================================ */
  T.peristalsis = wire({
    enter(api) {
      this.api = api; Ctrl.reset();
      this.ringY = [140, 210, 280, 350, 420, 490, 560];
      this.world = { gravity: 1900, solids: [] };
      this.ringY.forEach((y, i) => this.world.solids.push({ x: i % 2 ? 250 : 330, y: y + 26, w: 170, h: 16, oneWay: true }));
      this.world.solids.push({ x: 200, y: 620, w: 300, h: 60 });
      this.hero = new Actor(300, 620, HERO);
      this.pulse = this.ringY.map(() => 0);
      this.blocked = this.ringY.map(() => 0);      // 서버가 알려 주는 '막힌 근육'
      this.idle = 0; this.hintT = 3.2; this.wasBlocked = false;
    },
    targetIdx(s) {
      const by = 182 + (s ? s.bolus : 0) / 100 * 430;
      let idx = -1;
      for (let i = 0; i < this.ringY.length; i++) if (this.ringY[i] < by - 26) idx = i;
      return { idx, by };
    },
    update(dt, s) {
      const inp = Ctrl.poll();
      this.hero.update(dt, this.world, inp);
      // 식도에는 소화액이 없으므로 체력이 천천히 저절로 회복된다
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 5 * dt);
      this.pulse = this.pulse.map(v => Math.max(0, v - dt * 2.2));
      this.idle += dt;
      if (this.hintT > 0) this.hintT -= dt;

      /* ★ 막힌 근육은 서버가 정한다. 소화관 담당은 스스로 못 뚫는다 —
         소화액 담당이 분류 문제를 맞혀야 뚫린다. */
      const eb = s && s.eso ? s.eso : { blocked: 0, ring: -1 };
      this.blocked = this.ringY.map((_, i) => (eb.blocked > 0 && eb.ring === i) ? 1 : 0);
      this.jammed = eb.blocked > 0;
      if (this.jammed && !this.wasBlocked) E.shake(.5);
      if (!this.jammed && this.wasBlocked) E.toast('짝꿍이 문제를 맞혀 뚫렸습니다!', '#7dff9b');
      this.wasBlocked = this.jammed;

      if (!this.jammed && this.idle > 3.0) {
        this.idle = 0; this.api.act({ t: 'reflux' });
        this.hero.hp = Math.max(0, this.hero.hp - HURT.reflux); this.hero.hpFlash = 1;
        E.toast('멈추면 음식물이 역류합니다!', '#ff9c9c'); E.shake(.6);
      }

      let near = -1, bd = 999;
      this.ringY.forEach((y, i) => {
        const d = Math.abs((this.hero.y - 20) - y);
        if (d < 62 && d < bd) { bd = d; near = i; }
      });
      this.near = near;

      if (inp.act && this.hero.spent()) {
        E.toast('지쳤습니다 — 식도에서는 잠시 쉬어야 해요', '#ff9c9c');
      } else if (inp.act && this.jammed) {
        // 스스로는 못 뚫는다 — 짝꿍에게 알린다
        this.pulse[Math.max(0, near)] = 1;
        E.toast('혼자서는 못 뚫습니다 — 짝꿍이 분류 문제를 맞혀야 해요!', '#ffd166');
        this.idle = 0;
      } else if (inp.act && near >= 0) {
        const { idx } = this.targetIdx(s);
        this.pulse[near] = 1;
        if (near === idx) {
          this.api.act({ t: 'wave', q: 1 });
          this.hintT = 1.4;
          E.toast('좋아요! 음식물 뒤쪽을 조여야 내려갑니다', '#7dff9b');
        } else if (near === idx - 1) this.api.act({ t: 'wave', q: 0.45 });
        else if (this.ringY[near] > 182 + (s ? s.bolus : 0) / 100 * 430) {
          this.api.act({ t: 'reflux' });
          E.toast('음식물 앞쪽을 조이면 거꾸로 올라갑니다!', '#ff9c9c');
          E.shake(.8);
        }
        this.idle = 0;
      }
    },
    draw(g, s) {
      Organs.fleshBackground(g, '#2c1c2e', '#130a14');
      Organs.esophagus(g, 660, 90, 660, 190);
      const { idx, by } = this.targetIdx(s);

      this.ringY.forEach((y, i) => {
        const sq = this.pulse[i] * 46;
        const isT = i === idx && this.hintT > 0;
        const isBlocked = this.blocked[i] > 0;
        g.save();
        g.strokeStyle = isBlocked ? '#ff6b6b' : (this.pulse[i] > .05 ? '#ff9de2' : (isT ? '#7dff9b' : 'rgba(255,255,255,.22)'));
        g.lineWidth = this.pulse[i] > .05 ? 12 : (isT || isBlocked ? 8 : 5);
        if (isT) g.globalAlpha = .55 + .45 * Math.sin(E.t * 7);
        g.beginPath(); g.ellipse(660, y, 95 - sq, 17, 0, 0, 6.284); g.stroke();
        g.restore();
        const hx = i % 2 ? 420 : 500;
        E.circle(g, hx, y + 10, 18,
          isBlocked ? 'rgba(255,107,107,.5)' : (this.pulse[i] > .05 ? '#ff9de2' : (isT ? 'rgba(125,255,155,.5)' : 'rgba(255,255,255,.12)')),
          this.near === i ? '#ffd166' : 'rgba(255,255,255,.3)', this.near === i ? 4 : 3);
        if (isBlocked) E.text(g, '✖', hx, y + 10, 18, '#ff6b6b');
      });

      g.save();
      E.blob(g, 660, by, 76, 0.1, 2.2, E.t);
      const gr = g.createRadialGradient(640, by - 22, 5, 660, by, 78);
      gr.addColorStop(0, '#f3d089'); gr.addColorStop(1, '#a97b34');
      g.fillStyle = gr; g.fill(); g.strokeStyle = '#6d4f1f'; g.lineWidth = 3; g.stroke();
      g.restore();

      this.world.solids.forEach(sl => World.drawSolid(g, sl, '#5b4270', 'rgba(255,255,255,.2)'));
      this.hero.draw(g);

      hpBar(g, this.hero);
      spentNote(g, this.hero, '역류를 막지 못하면 몸이 지칩니다 — 잠시 뒤 다시 시도하세요');
      if (this.jammed) {
        E.fillRR(g, 190, 40, 940 - 250, 44, 12, 'rgba(60,10,14,.9)', '#ff6b6b', 2);
        E.text(g, '✖ 근육이 막혔습니다 — 짝꿍이 분류 문제를 맞혀야 뚫립니다',
          500, 62, 19, '#ff9c9c');
      }
      footer(g, this.jammed ? '내가 할 수 있는 게 없습니다 — 📢 로 짝꿍에게 알리세요!'
             : (this.hintT > 0 ? '초록 근육 옆에서 [조이기] — 음식물 바로 뒤를 조여야 내려갑니다'
                               : '음식물 바로 뒤(위쪽)의 근육을 스스로 찾아 조이세요'));
      Ctrl.draw(g, '점프', '조이기');
    }
  });

  /* ============================================================
     3. 위 — 위액에 닿지 않으면서 덩어리를 위액에 빠뜨린다
        · [잡기]로 덩어리를 들고 다시 눌러 던질 수 있다
        · 위액 방울이 튀어오른다 (회피)
        · 위벽 수축 파도가 몸을 밀어낸다
     ============================================================ */
  T.churn = wire({
    enter(api) {
      this.api = api; Ctrl.reset();
      // ★ 발판은 '아래 발판에서 점프로 닿는 높이(최대 144px)' 안에만 놓는다.
      //   예전 배치는 맨 위 두 칸이 130px 위여서 아무리 점프해도 올라갈 수 없었다.
      this.ledges = [
        { x: 100, y: 556, w: 200, h: 20 },   // 0 아래 왼쪽
        { x: 372, y: 492, w: 196, h: 20 },   // 1 ← 0 에서 64 위
        { x: 664, y: 540, w: 200, h: 20 },   // 2 아래 오른쪽
        { x: 200, y: 420, w: 220, h: 20 },   // 3 ← 1 에서 72 위
        { x: 500, y: 402, w: 250, h: 20 },   // 4 ← 1 에서 90 위
        { x: 168, y: 322, w: 190, h: 20 },   // 5 ← 3 에서 98 위
        { x: 596, y: 300, w: 210, h: 20 }    // 6 ← 4 에서 102 위
      ];
      this.world = { gravity: 1900, friction: 1.4, solids: this.ledges.map(l => Object.assign({ oneWay: true }, l)) };
      this.hero = new Actor(200, 556, HERO, { jumpV: 760 });
      this.chunks = [];
      [0, 1, 2, 3].forEach(i => this.spawn(i));      // 처음부터 넉넉히
      this.fx = []; this.splash = []; this.splashT = 2.2;
      this.rain = []; this.rainT = 1.0;
      this.dissolveQ = 0; this.dropT = 0; this.fed = 0;
    },
    // 위액에 잠기지 않은 발판에만 놓는다
    spawn(i) {
      const ay = this.acidY(E.snap);
      const safe = this.ledges.filter(L => L.y < ay - 40);
      const list = safe.length ? safe : this.ledges;
      const L = list[((i | 0) * 3 + 1) % list.length];
      const c = new Chunk(L.x + L.w / 2 + (Math.random() - .5) * 40, L.y - 34, 28, 'protein', '#5aa9e6');
      c.vx = 0; c.vy = 0;
      this.chunks.push(c);
      this.fed++;
    },
    acidY(s) { return 668 - ((s ? s.delivered.gastric : 0) / 100) * 124; },
    update(dt, s) {
      const inp = Ctrl.poll();
      const ay = this.acidY(s);
      const gast = s ? s.delivered.gastric : 0;
      const diff = s ? Math.min(1, s.stageTime / 50) : 0;
      reviveWatch(this, s, 'gastric');

      // ★ 위벽 수축 파도는 없앴다 — 대신 위 천장에서 위액 방울이 떨어진다
      this.rainT -= dt * (1 + diff * 0.9);
      if (this.rainT <= 0) {
        this.rainT = 0.85 + Math.random() * 0.9;
        const n = 1 + (Math.random() < 0.35 + diff * 0.3 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          this.rain.push({ x: 90 + Math.random() * 820, y: 96, vy: 0, r: 12, warn: 0.75 });
        }
      }
      this.rain.forEach(d => {
        if (d.warn > 0) { d.warn -= dt; return; }
        d.vy += 1250 * dt; d.y += d.vy * dt;
      });
      this.rain = this.rain.filter(d => d.y < ay + 6);

      // 위액 표면에서 튀어오르는 방울
      this.splashT -= dt;
      if (this.splashT <= 0) {
        this.splashT = 2.2 + Math.random() * 1.6;
        this.splash.push({ x: 120 + Math.random() * 760, y: ay, vy: -520 - Math.random() * 240, r: 13 });
      }
      this.splash.forEach(sp => { sp.vy += 1500 * dt; sp.y += sp.vy * dt; });
      this.splash = this.splash.filter(sp => sp.y < ay + 10 || sp.vy < 0);

      this.hero.update(dt, this.world, inp);

      // 잡기 / 던지기
      if (inp.act && this.hero.spent()) {
        E.toast('지쳤습니다 — 짝꿍이 위액을 보내 주면 회복돼요', '#ff9c9c');
      } else if (inp.act) {
        if (this.hero.carry) {
          const c = this.hero.carry;
          c.held = false; this.hero.carry = null;
          c.vx = this.hero.face * 640; c.vy = -320;
          E.toast('던졌다!', '#ffd166');
        } else {
          let best = null, bd = 74;
          for (const c of this.chunks) {
            const d = Math.hypot(c.x - this.hero.x, c.y - (this.hero.y - 22));
            if (d < bd) { bd = d; best = c; }
          }
          if (best) { best.held = true; this.hero.carry = best; }
        }
      }
      // ★ 위에서는 몸으로 밀어도 덩어리가 움직이지 않는다 (actor 를 넘기지 않는다).
      //   반드시 [잡기]로 들어서 [던지기] 해야 위액에 빠뜨릴 수 있다.
      this.chunks.forEach(c => { if (!c.held) c.update(dt, this.world, null); });
      if (this.hero.carry) { this.hero.carry.x = this.hero.x; this.hero.carry.y = this.hero.y - this.hero.h - 20; }

      // 위액 · 튀는 방울 · 떨어지는 방울에 닿으면 기절
      let touched = this.hero.y > ay + 4;
      let dmg = HURT.acid;
      for (const sp of this.splash) {
        if (Math.hypot(sp.x - this.hero.x, sp.y - (this.hero.y - 22)) < sp.r + 20) touched = true;
      }
      for (const d of this.rain) {
        if (d.warn > 0) continue;
        if (Math.hypot(d.x - this.hero.x, d.y - (this.hero.y - 22)) < d.r + 20) { touched = true; dmg = HURT.drop; }
      }
      if (touched) {
        if (this.hero.hurt(1.4, dmg)) {
          E.shake(1.6); E.toast('위액은 강한 산성입니다! 닿으면 안 돼요', '#ff6b6b');
          for (let i = 0; i < 16; i++) this.fx.push({
            x: this.hero.x, y: this.hero.y, vx: (Math.random() - .5) * 400, vy: -200 - Math.random() * 250, life: .7
          });
          if (this.hero.carry) { this.hero.carry.held = false; this.hero.carry = null; }
        }
        if (this.hero.y > ay + 4) {
          let safe = null, bd = 1e9;
          for (const L of this.ledges) {
            if (L.y > ay - 10) continue;
            const d = Math.abs(L.x + L.w / 2 - this.hero.x);
            if (d < bd) { bd = d; safe = L; }
          }
          if (!safe) safe = this.ledges[3];
          this.hero.x = safe.x + safe.w / 2; this.hero.y = safe.y; this.hero.vx = 0; this.hero.vy = 0;
        }
      }

      // 덩어리가 위액에 잠기면 소화된다 (위액이 진해야 한다)
      for (const c of this.chunks) {
        if (c.held) continue;
        if (c.y + c.r > ay) {
          c.vy *= 0.86; c.vx *= 0.9;
          c.y = Math.min(c.y, ay + c.r * 1.6);
          if (gast >= R.JUICE_OK) {
            c.soak += dt * 0.5; c.r = Math.max(8, c.r - dt * 9);
            this.dissolveQ += dt * 3.4;
          }
          if (c.soak >= 1) c.dead = true;
        }
      }
      while (this.dissolveQ >= 1) { this.dissolveQ -= 1; this.api.act({ t: 'churn', q: 1 }); }

      const before = this.chunks.length;
      this.chunks = this.chunks.filter(c => !c.dead);
      if (this.chunks.length < before) E.toast('음식물이 위액에 소화되었습니다!', '#7dff9b');

      // ★ 식도에서 음식물이 계속 내려온다 — 위액 위에 '들 수 있는' 덩어리가 늘 3개는 있도록
      const usable = this.chunks.filter(c => c.held || c.y + c.r < ay - 6).length;
      this.dropT -= dt;
      if (usable < 3 && this.chunks.length < 8 && this.dropT <= 0) {
        this.dropT = 1.1;
        this.spawn((Math.random() * 7) | 0);
        if (usable === 0) E.toast('식도에서 음식물이 더 내려왔습니다!', '#ffd166');
      }

      this.fx.forEach(f => { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 700 * dt; });
      this.fx = this.fx.filter(f => f.life > 0);
      this.world.solids.forEach(sl => { sl.off = (sl.y > ay - 6 && sl.h < 30); });
    },
    draw(g, s) {
      Organs.fleshBackground(g, '#3b1f19', '#160a07');
      Organs.stomach(g, { x: 40, y: 20, w: 920, h: 660 });

      const ay = this.acidY(s);
      const gast = s ? s.delivered.gastric : 0;
      const strong = gast >= R.JUICE_OK;

      g.save();
      g.beginPath(); g.moveTo(0, VH);
      for (let x = 0; x <= VW; x += 20) g.lineTo(x, ay + Math.sin(x * 0.02 + E.t * 2.4) * 7 + Math.sin(x * 0.05 - E.t * 3) * 4);
      g.lineTo(VW, VH); g.closePath();
      const gr = g.createLinearGradient(0, ay - 30, 0, VH);
      gr.addColorStop(0, strong ? 'rgba(150,255,170,.85)' : 'rgba(190,215,190,.55)');
      gr.addColorStop(1, strong ? 'rgba(40,150,80,.95)' : 'rgba(90,120,95,.7)');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = strong ? '#b6ffca' : '#c7d6c7'; g.lineWidth = 3; g.stroke();
      g.restore();

      this.splash.forEach(sp => {
        E.circle(g, sp.x, sp.y, sp.r, strong ? 'rgba(150,255,170,.9)' : 'rgba(200,220,200,.7)', '#eafff0', 2);
      });
      // 천장에서 떨어지는 위액 방울 (떨어지기 전 잠깐 경고)
      this.rain.forEach(d => {
        if (d.warn > 0) {
          g.save(); g.globalAlpha = .35 + .45 * Math.abs(Math.sin(E.t * 16));
          E.circle(g, d.x, 96, 11, null, '#ff6b6b', 3);
          g.strokeStyle = 'rgba(255,107,107,.35)'; g.lineWidth = 2; g.setLineDash([6, 8]);
          g.beginPath(); g.moveTo(d.x, 108); g.lineTo(d.x, ay - 10); g.stroke();
          g.restore();
          return;
        }
        g.save();
        g.beginPath(); g.moveTo(d.x, d.y - 18);
        g.bezierCurveTo(d.x + 12, d.y - 4, d.x + 11, d.y + 12, d.x, d.y + 12);
        g.bezierCurveTo(d.x - 11, d.y + 12, d.x - 12, d.y - 4, d.x, d.y - 18);
        g.fillStyle = strong ? '#96ffaa' : '#c8dcc8'; g.fill();
        g.strokeStyle = '#eafff0'; g.lineWidth = 2; g.stroke(); g.restore();
      });

      this.world.solids.forEach(sl => { if (!sl.off && sl.h < 30) World.drawSolid(g, sl, '#9c5c4c', 'rgba(255,220,200,.3)'); });
      this.chunks.forEach(c => c.draw(g));
      this.fx.forEach(f => { g.save(); g.globalAlpha = f.life * 1.4; E.circle(g, f.x, f.y, 5, '#b6ffca'); g.restore(); });
      this.hero.draw(g);

      const w = juiceWarning(s);
      banner(g, w && w[0], w && w[1]);
      if (!w) { E.text(g, '파란 덩어리를 위액에 빠뜨려 소화시키세요', 430, 34, 21, '#7dff9b'); E.toastTop = 58; }
      hpBar(g, this.hero);
      spentNote(g, this.hero, '짝꿍이 위액을 보내 주면 다시 일할 수 있어요');
      footer(g, '몸으로 밀어도 안 떨어집니다 — [잡기]로 들어서 위액에 [던지기]! 방울은 피하세요');
      Ctrl.draw(g, '점프', this.hero.carry ? '던지기' : '잡기');
    }
  });

  /* ============================================================
  /* ============================================================
     4. 작은창자 — 길고 꼬불꼬불한 관(미로) 안에서 소화하고 흡수한다
        · 위에서 내려다보는 미로. 중력이 없다.
        · 처음부터 음식물 덩이 6개가 관 여기저기에 흩어져 있다.
        · 소화액 웅덩이 3곳으로 굴려 가서 [문지르기] ×4 → 작은 영양소.
        · 웅덩이의 위·아래 관벽에는 융털이 있다. 작아진 덩이를 그쪽으로 밀면 흡수!
        · ★ 아직 소화되지 않은 '큰' 덩이를 관벽에 부딪히면 체력이 깎인다.
          (융털은 소장 전체에 퍼져 있으므로 웅덩이 옆에서 바로 흡수된다)
        · 소화액이 없으면 덩이가 거의 굴러가지 않는다  ← 협동 지점
     ============================================================ */
  // 아래(출발) → 오른쪽 → 위 → 왼쪽 → 위 → 오른쪽 으로 이어지는 꼬불꼬불한 관
  const MAZE = {
    lanes: [                                   // 관 안쪽(빈 공간)
      { x: 100, y: 520, w: 800, h: 120 },      // ① 아래 통로
      { x: 780, y: 460, w: 120, h: 60 },       // ② 오른쪽 위로 꺾이는 곳
      { x: 100, y: 340, w: 800, h: 120 },      // ③ 가운데 통로
      { x: 100, y: 280, w: 120, h: 60 },       // ④ 왼쪽 위로 꺾이는 곳
      { x: 100, y: 160, w: 855, h: 120 }       // ⑤ 위 통로
    ],
    walls: [
      { x: 0, y: 110, w: 1000, h: 50 },        // 위 바깥
      { x: 0, y: 110, w: 40, h: 590 },         // 왼쪽 바깥
      { x: 0, y: 640, w: 1000, h: 60 },        // 아래 바깥
      { x: 955, y: 110, w: 45, h: 590 },       // 오른쪽 바깥
      { x: 220, y: 280, w: 735, h: 60 },       // ⑤↔③ 칸막이
      { x: 40, y: 280, w: 60, h: 60 },
      { x: 40, y: 460, w: 740, h: 60 },        // ③↔① 칸막이
      { x: 900, y: 460, w: 55, h: 60 },
      { x: 40, y: 160, w: 60, h: 120 },        // ⑤ 왼쪽 끝
      { x: 40, y: 340, w: 60, h: 120 },        // ③ 왼쪽 끝
      { x: 900, y: 340, w: 55, h: 120 },       // ③ 오른쪽 끝
      { x: 40, y: 520, w: 60, h: 120 },        // ① 왼쪽 끝
      { x: 900, y: 520, w: 55, h: 120 }        // ① 오른쪽 끝
    ],
    // 소화액 웅덩이 3곳 + 그 자리의 관벽 융털(위/아래 띠)
    pools: [
      { x: 400, y: 528, w: 160, h: 104, lane: { y: 520, h: 120 } },
      { x: 380, y: 348, w: 160, h: 104, lane: { y: 340, h: 120 } },
      { x: 470, y: 168, w: 160, h: 104, lane: { y: 160, h: 120 } }
    ],
    cramps: [
      { x: 686, y: 520, w: 70, h: 120, ph: 0.0 },
      { x: 236, y: 340, w: 70, h: 120, ph: 1.4 },
      { x: 738, y: 160, w: 70, h: 120, ph: 2.8 }
    ],
    // 처음에 덩이가 놓이는 자리 6곳 (관 한가운데라 벽에 안 닿는다)
    spots: [
      { x: 300, y: 580 }, { x: 830, y: 580 },
      { x: 180, y: 400 }, { x: 700, y: 400 },
      { x: 200, y: 220 }, { x: 860, y: 220 }
    ]
  };
  const RUB_NEED = 4;
  const VILLI_BAND = 28;                        // 관벽 융털 띠의 두께

  T.villi = wire({
    enter(api) {
      this.api = api; Ctrl.reset();
      this.world = { gravity: 0, topDown: true, friction: 4, solids: MAZE.walls.map(w => Object.assign({}, w)) };
      this.hero = new Actor(150, 580, HERO, { swim: true, speed: 285 });
      this.balls = [];
      MAZE.spots.forEach((p, i) => this.balls.push(this.makeBall(p.x, p.y, i)));
      this.rubCd = 0; this.msg = ''; this.msgT = 0; this.msgOk = true;
      this.fx = []; this.delivered = 0; this.bumped = 0; this.wave = 0;
    },
    makeBall(x, y, i) {
      const kinds = ['starch', 'protein', 'fat'];
      const k = kinds[i % 3];
      const b = new Ball(x, y, 32, k, G.NUTRIENTS[k].color);
      b.bumpCd = 0;
      return b;
    },
    juiceOn(s) {
      return !!(s && (s.delivered.pancreatic >= R.JUICE_OK || s.delivered.bile >= R.JUICE_OK));
    },
    poolOf(b) {
      return MAZE.pools.find(p => b.x > p.x && b.x < p.x + p.w && b.y > p.y && b.y < p.y + p.h) || null;
    },
    // 웅덩이 자리의 관벽 융털에 닿았는가 (위 띠 / 아래 띠)
    villiHit(b) {
      for (const p of MAZE.pools) {
        if (b.x < p.x - 6 || b.x > p.x + p.w + 6) continue;
        const top = p.lane.y, bot = p.lane.y + p.lane.h;
        if (b.y < top + VILLI_BAND || b.y > bot - VILLI_BAND) return p;
      }
      return null;
    },
    say(m, c, ok) { this.msg = m; this.msgT = 2.4; this.msgOk = ok !== false; E.toast(m, c); },
    crampOn(c) { return (Math.sin((E.t + c.ph) * 1.5) > 0.86); },
    update(dt, s) {
      const inp = Ctrl.poll();
      reviveWatch(this, s, 'small');
      this.hero.update(dt, this.world, inp);
      if (this.rubCd > 0) this.rubCd -= dt;
      if (this.msgT > 0) this.msgT -= dt;
      if (this.wave > 0) this.wave -= dt;

      const on = this.juiceOn(s);
      const mult = on ? 1 : 0.22;                 // 소화액이 없으면 거의 안 굴러간다
      const pusher = this.hero.spent() ? null : this.hero;

      for (let i = this.balls.length - 1; i >= 0; i--) {
        const b = this.balls[i];
        if (b.bumpCd > 0) b.bumpCd -= dt;
        b.update(dt, this.world.solids, pusher, mult);

        // ★ 소화되지 않은 큰 덩이가 관벽에 부딪히면 체력이 깎인다
        if (b.hitWall && !b.small && b.bumpCd <= 0) {
          b.bumpCd = 1.1; this.bumped++;
          this.hero.hp = Math.max(0, this.hero.hp - HURT.cramp); this.hero.hpFlash = 1;
          b.vx *= -0.4; b.vy *= -0.4;
          E.shake(1.1);
          this.say('큰 덩이가 관벽에 부딪혔어요! 벽에 닿지 않게 조심히 굴리세요', '#ff6b6b', false);
        }
        // 작아진 덩이가 웅덩이 옆 관벽(융털)에 닿으면 흡수된다
        if (b.small && this.villiHit(b)) {
          this.api.act({ t: 'absorb', ok: true, kind: b.kind, q: 8 });
          this.delivered++;
          for (let k = 0; k < 18; k++) this.fx.push({
            x: b.x, y: b.y, vx: (Math.random() - .5) * 420, vy: (Math.random() - .5) * 420, life: .7, c: '#ffd166'
          });
          this.balls.splice(i, 1);
          E.toast('융털이 흡수했습니다! (' + this.delivered + ' / ' + MAZE.spots.length + ')', '#7dff9b', true);
          continue;
        }
      }

      // 관이 조여드는 곳 — 캐릭터가 끼면 체력이 깎인다
      for (const c of MAZE.cramps) {
        if (!this.crampOn(c)) continue;
        if (this.hero.x > c.x - 6 && this.hero.x < c.x + c.w + 6 &&
            this.hero.y > c.y && this.hero.y < c.y + c.h) {
          if (this.hero.hurt(1.0, HURT.cramp)) {
            E.shake(1.2); E.toast('관이 조여들었습니다! 열릴 때 지나가세요', '#ff9c9c');
          }
        }
      }

      // [문지르기] — 소화액 웅덩이 안의 덩이만 소화된다
      if ((inp.act || inp.jump) && this.rubCd <= 0) {
        this.rubCd = 0.4;
        let b = null, bd = 1e9;
        for (const x of this.balls) {
          const d = Math.hypot(x.x - this.hero.x, x.y - (this.hero.y - this.hero.h / 2));
          if (d < bd) { bd = d; b = x; }
        }
        const near = b && bd < b.r + 46;
        if (this.hero.spent()) this.say('지쳤습니다 — 짝꿍이 소화액을 보내 주면 회복돼요', '#ff9c9c', false);
        else if (!near) this.say('덩이 가까이에서 문지르세요', '#ffd166', false);
        else if (b.small) this.say('다 소화됐어요 — 웅덩이 위·아래 관벽(융털)으로 밀어 주세요', '#7dff9b');
        else if (!this.poolOf(b)) this.say('초록 소화액 웅덩이 안에서 문질러야 소화됩니다', '#ffd166', false);
        else if (!on) this.say('소화액이 없습니다! 이자액·쓸개즙을 요청하세요', '#ff9c9c', false);
        else {
          this.api.act({ t: 'grind', kind: b.kind, q: 4 });
          b.rub++; b.r = Math.max(17, b.r - 4);
          this.wave = .35;
          for (let i = 0; i < 10; i++) this.fx.push({
            x: b.x, y: b.y, vx: (Math.random() - .5) * 340, vy: (Math.random() - .5) * 340, life: .6, c: b.color
          });
          if (b.rub >= RUB_NEED) {
            b.small = true; b.r = 16; b.color = '#ffe08a';
            this.say('소화 완료! 위·아래 관벽(융털)으로 밀면 흡수됩니다', '#7dff9b');
          } else this.say('소화 중… ' + b.rub + ' / ' + RUB_NEED, '#7dff9b');
        }
      }

      // 다 흡수했는데 아직 단계가 안 끝났으면 음식물이 더 내려온다
      if (!this.balls.length) {
        MAZE.spots.slice(0, 3).forEach((p, i) => this.balls.push(this.makeBall(p.x, p.y, i + 1)));
        E.toast('음식물이 더 내려왔습니다!', '#ffd166', true);
      }

      this.fx.forEach(f => { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; });
      this.fx = this.fx.filter(f => f.life > 0);
    },
    draw(g, s) {
      Organs.fleshBackground(g, '#37202c', '#160c12');

      // 근육층(벽)은 어둡게, 관 안쪽만 밝게 — 길이 한눈에 보이도록
      g.save();
      g.fillStyle = '#2b1620'; g.fillRect(0, 110, VW, 590);
      g.globalAlpha = .18;
      for (let i = 0; i < VW; i += 26) {
        g.beginPath(); g.moveTo(i, 110); g.lineTo(i - 14, 700);
        g.strokeStyle = '#e4b0b8'; g.lineWidth = 2; g.stroke();
      }
      g.restore();
      MAZE.lanes.forEach(L => {
        E.fillRR(g, L.x, L.y, L.w, L.h, 26, '#a8615c');
        g.save(); g.globalAlpha = .22;
        E.fillRR(g, L.x + 6, L.y + 6, L.w - 12, L.h * 0.3, 14, '#ffd9d0');
        g.restore();
      });
      g.save(); g.globalAlpha = .3;
      MAZE.lanes.forEach(L => {
        for (let x = L.x + 12; x < L.x + L.w - 8; x += 17) {
          g.beginPath(); g.moveTo(x, L.y + 2); g.lineTo(x + 3, L.y + 13); g.lineTo(x + 6, L.y + 2);
          g.fillStyle = '#ffc9bd'; g.fill();
          g.beginPath(); g.moveTo(x, L.y + L.h - 2); g.lineTo(x + 3, L.y + L.h - 13); g.lineTo(x + 6, L.y + L.h - 2);
          g.fill();
        }
      });
      g.restore();

      const on = this.juiceOn(s);

      // 웅덩이 + 그 자리의 융털 띠 (위·아래 관벽)
      MAZE.pools.forEach(p => {
        const top = p.lane.y, bot = p.lane.y + p.lane.h;
        const a = .3 + .22 * Math.abs(Math.sin(E.t * 3.2));
        g.save(); g.globalAlpha = a;
        E.fillRR(g, p.x, top, p.w, VILLI_BAND, 8, '#ffd166');
        E.fillRR(g, p.x, bot - VILLI_BAND, p.w, VILLI_BAND, 8, '#ffd166');
        g.restore();
        g.save(); g.globalAlpha = .7;
        for (let x = p.x + 8; x < p.x + p.w - 6; x += 15) {
          g.beginPath(); g.moveTo(x, top + VILLI_BAND); g.lineTo(x + 4, top + 6); g.lineTo(x + 8, top + VILLI_BAND);
          g.fillStyle = '#ffe6a8'; g.fill();
          g.beginPath(); g.moveTo(x, bot - VILLI_BAND); g.lineTo(x + 4, bot - 6); g.lineTo(x + 8, bot - VILLI_BAND);
          g.fill();
        }
        g.restore();

        g.save(); g.globalAlpha = on ? .34 + .07 * Math.sin(E.t * 3) : .12;
        E.fillRR(g, p.x, p.y, p.w, p.h, 18, on ? '#7dff9b' : '#7a7a7a'); g.restore();
        E.fillRR(g, p.x, p.y, p.w, p.h, 18, null, on ? '#7dff9b' : 'rgba(255,255,255,.2)', 3);
      });

      // 조여드는 곳
      MAZE.cramps.forEach(c => {
        const shut = this.crampOn(c);
        const soon = Math.sin((E.t + c.ph) * 1.5) > 0.62;
        g.save();
        g.globalAlpha = shut ? .8 : (soon ? .45 : .2);
        g.fillStyle = shut ? '#ff6b6b' : '#ffb35a';
        const bite = shut ? 34 : (soon ? 18 : 8);
        g.fillRect(c.x, c.y, c.w, bite);
        g.fillRect(c.x, c.y + c.h - bite, c.w, bite);
        g.restore();
      });

      this.balls.forEach(b => {
        b.draw(g);
        if (b.small) {
          g.save(); g.globalAlpha = .45 + .4 * Math.abs(Math.sin(E.t * 6));
          E.circle(g, b.x, b.y, b.r + 8, null, '#7dff9b', 3); g.restore();
        } else {
          for (let i = 0; i < RUB_NEED; i++) {
            E.circle(g, b.x - (RUB_NEED - 1) * 7 + i * 14, b.y - b.r - 12, 4.5,
              i < b.rub ? '#7dff9b' : 'rgba(255,255,255,.25)');
          }
          if (b.bumpCd > 0) { g.save(); g.globalAlpha = b.bumpCd; E.circle(g, b.x, b.y, b.r + 7, null, '#ff6b6b', 3); g.restore(); }
        }
      });
      this.fx.forEach(f => { g.save(); g.globalAlpha = f.life * 1.5; E.circle(g, f.x, f.y, 5, f.c); g.restore(); });
      this.hero.draw(g);

      // 위쪽 고정 안내 (글자 겹침 방지)
      E.fillRR(g, 236, 64, 236, 30, 8, 'rgba(20,6,8,.85)', 'rgba(255,255,255,.2)', 1.5);
      E.text(g, '남은 덩이 ' + this.balls.length + ' · 흡수 ' + this.delivered, 354, 79, 15, '#ffd166');
      E.fillRR(g, 486, 64, 280, 30, 8, 'rgba(20,6,8,.85)', on ? 'rgba(125,255,155,.4)' : 'rgba(255,107,107,.4)', 1.5);
      E.text(g, on ? '소화액 있음 — 덩이가 잘 굴러갑니다' : '소화액 없음 — 덩이가 안 굴러갑니다',
        626, 79, 14, on ? '#7dff9b' : '#ff9c9c');

      if (this.msgT > 0) {
        g.save(); g.globalAlpha = Math.min(1, this.msgT);
        E.text(g, this.msg, VW / 2, 386, 19, this.msgOk ? '#ffd166' : '#ff9c9c'); g.restore();
      }

      const w = juiceWarning(s);
      banner(g, w && w[0], w && w[1]);
      if (!w) E.toastTop = 104;          // 위쪽 이름표를 알림이 가리지 않게
      hpBar(g, this.hero);
      spentNote(g, this.hero, '짝꿍이 이자액·쓸개즙을 보내 주면 다시 일할 수 있어요');
      footer(g, '벽에 닿지 않게 굴려 웅덩이로 → [문지르기] ×' + RUB_NEED + ' → 위·아래 관벽(융털)으로 밀기');
      Ctrl.draw(g, '문지르기', '문지르기');
    }
  });

  /* ============================================================
     5. 큰창자 — 칸(라운드) 방식 + ★ '몇 초' 맞추기
        · 찌꺼기는 한 칸에 20초 동안 갇힌다. 그 동안은 앞으로 못 간다.
        · 짝꿍이 그 칸의 물길을 뚫어 줘야 물이 빠진다.
        · 물길이 뚫리면 "N.N초 동안 흡수하세요!" 가 뜬다.
          찌꺼기 위에서 버튼을 꾹 누른 채 스스로 초를 세다가, 그 초에 맞춰 뗀다.
          화면에 초시계는 보이지 않는다 — 정확할수록 물이 많이 빠진다.
     ============================================================ */
  const CELL = { x0: 120, x1: 880, y: 600 };

  T.water = wire({
    enter(api) {
      this.api = api; Ctrl.reset();
      this.world = {
        gravity: 1900, solids: [
          { x: 0, y: 600, w: 1000, h: 100 },
          { x: 210, y: 470, w: 130, h: 16, oneWay: true },
          { x: 470, y: 430, w: 130, h: 16, oneWay: true },
          { x: 730, y: 470, w: 130, h: 16, oneWay: true }
        ]
      };
      this.hero = new Actor(120, 600, HERO);
      this.res = { x: 260, y: 600, r: 58 };
      this.resSolid = { x: 200, y: 540, w: 120, h: 20, oneWay: true };
      this.world.solids.push(this.resSolid);
      this.drops = []; this.round = -1;
      this.holding = false; this.holdT = 0; this.holdIdx = -1;
      this.judge = ''; this.judgeT = 0; this.judgeOk = true;
      this.lastSec = 0;
    },
    cellX(i) {
      const n = R.PORES;
      return CELL.x0 + (i + 0.5) / n * (CELL.x1 - CELL.x0);
    },
    onRes() {
      return this.hero.onGround && Math.abs(this.hero.x - this.res.x) < this.res.r &&
             Math.abs(this.hero.y - this.resSolid.y) < 14;
    },
    send() {
      const sec = Math.round(this.holdT * 100) / 100;
      this.lastSec = sec;
      this.api.act({ t: 'hold', sec });
      this.holding = false; this.holdT = 0;
      for (let i = 0; i < 10; i++) this.drops.push({
        x: this.res.x + (Math.random() - .5) * this.res.r * 1.4, y: this.res.y - 20,
        vx: (Math.random() - .5) * 300, vy: -180 - Math.random() * 160, life: .7
      });
    },
    update(dt, s) {
      const inp = Ctrl.poll();
      const L = (s && s.large) || { round: 0, rounds: R.PORES, roundT: R.ROUND_TIME, roundLimit: R.ROUND_TIME, target: 0, removed: 0, open: false, holdTarget: 3, holdIdx: 0 };
      reviveWatch(this, s, 'gate');

      if (L.round !== this.round) {
        this.round = L.round; E.shake(.5);
        this.holding = false; this.holdT = 0;
      }
      if (L.holdIdx !== this.holdIdx) { this.holdIdx = L.holdIdx; }

      // 찌꺼기는 지금 칸에 갇혀 있다
      this.res.x = this.cellX(Math.min(L.round, R.PORES - 1)) + Math.sin(E.t * 1.6) * 10;
      const rw = s ? s.residueWater : 100;
      this.res.r = 40 + rw * 0.24;
      this.resSolid.x = this.res.x - this.res.r * 0.8;
      this.resSolid.w = this.res.r * 1.6;
      this.resSolid.y = this.res.y - this.res.r * 1.5;

      this.hero.update(dt, this.world, inp);
      if (this.judgeT > 0) this.judgeT -= dt;

      /* ---- ★ 꾹 누르고 있다가 정해진 초에 떼기 (한 칸에 한 번) ---- */
      const ready = L.open && !L.holdDone && !this.hero.spent() && this.onRes();
      if (!this.holding) {
        if (inp.actHeld && ready) { this.holding = true; this.holdT = 0; }
        else if (inp.act && !ready) {
          if (this.hero.spent()) E.toast('지쳤습니다 — 짝꿍이 다음 물길을 뚫어 주면 회복돼요', '#ff9c9c');
          else if (!L.open) { this.api.act({ t: 'hold', sec: 0 }); E.shake(.5); }
          else if (L.holdDone) E.toast('이 칸은 이미 끝났습니다 — 다음 칸에서 다시!', '#ffd166');
          else E.toast('찌꺼기 위에 올라타서 눌러야 합니다', '#ffd166');
        }
      } else {
        this.holdT += dt;
        if (!inp.actHeld || !this.onRes() || this.holdT > 12) this.send();
      }

      this.drops.forEach(d => { d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 800 * dt; });
      this.drops = this.drops.filter(d => d.life > 0);
    },
    // 서버가 판정 결과를 보내면 main.js 가 불러 준다
    showJudge(e) {
      this.judge = e.msg; this.judgeT = 2.6; this.judgeOk = !!e.ok;
    },
    draw(g, s) {
      Organs.fleshBackground(g, '#1f2f24', '#0a120d');
      g.save();
      g.fillStyle = '#5c8a68'; g.fillRect(0, 0, VW, 190);
      g.fillStyle = '#4a7355'; g.fillRect(0, 600, VW, 100);
      g.globalAlpha = .3; g.fillStyle = '#2f4f39';
      for (let i = 0; i < 9; i++) { E.circle(g, 60 + i * 115, 190, 66, '#2f4f39'); E.circle(g, 110 + i * 115, 600, 66, '#2f4f39'); }
      g.restore();

      const L = (s && s.large) || { round: 0, rounds: R.PORES, target: 0, removed: 0, open: false, holdTarget: 3, results: [] };
      const pores = (s && s.pores) || new Array(R.PORES).fill(false);
      const cur = Math.min(L.round, R.PORES - 1);

      // ---- 칸 5개 ----
      const cw = (CELL.x1 - CELL.x0) / R.PORES;
      for (let i = 0; i < R.PORES; i++) {
        const cx = CELL.x0 + i * cw;
        const done = i < L.round;
        const isCur = i === cur;
        g.save(); g.globalAlpha = isCur ? .30 : .13;
        g.fillStyle = done ? '#7dff9b' : (isCur ? '#ffd166' : '#ffffff');
        g.fillRect(cx + 3, 486, cw - 6, 114);
        g.restore();
        g.save(); g.setLineDash([6, 6]); g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(cx, 486); g.lineTo(cx, 600); g.stroke(); g.restore();

        const open = pores[i];
        E.fillRR(g, cx + cw / 2 - 40, 602, 80, 30, 9,
          open ? 'rgba(122,215,240,.5)' : 'rgba(255,255,255,.06)',
          open ? '#7ad7f0' : 'rgba(255,120,120,.35)', isCur ? 4 : 2);
        E.text(g, open ? '💧' : '✖', cx + cw / 2, 617, 16, open ? '#fff' : 'rgba(255,140,140,.8)');
        E.text(g, (i + 1), cx + cw / 2, 500, 15,
          done ? 'rgba(125,255,155,.8)' : (isCur ? '#ffd166' : 'rgba(255,255,255,.32)'), 'center', 800);
      }

      this.world.solids.forEach(sl => { if (sl.h < 30 && sl !== this.resSolid) World.drawSolid(g, sl, '#3f6b4c', 'rgba(200,255,215,.25)'); });

      const rw = s ? s.residueWater : 100;
      g.save();
      E.blob(g, this.res.x, this.res.y - this.res.r * 0.75, this.res.r, .16, 2.6, E.t);
      g.fillStyle = rw > 55 ? '#9a7c4a' : rw > 33 ? '#7a5a30' : '#5a4020';
      g.fill(); g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3; g.stroke();
      if (rw > 50) { g.globalAlpha = .3; E.circle(g, this.res.x, this.res.y - this.res.r * 0.75, this.res.r + 5, '#7ad7f0'); }
      g.restore();

      this.drops.forEach(d => { g.save(); g.globalAlpha = d.life * 1.4; E.circle(g, d.x, d.y, 6, '#7ad7f0'); g.restore(); });
      this.hero.draw(g);

      /* ---- 이번 칸 안내판 ----
         ★ 여기에는 남은 시간을 절대 표시하지 않는다.
           숫자든 게이지든 보이면 그걸 보고 초를 세어 버려서 게임이 무의미해진다. */
      E.fillRR(g, 244, 140, 512, 208, 14, 'rgba(6,14,10,.84)', L.open ? 'rgba(122,215,240,.55)' : 'rgba(255,107,107,.55)', 2);
      E.text(g, (cur + 1) + ' / ' + R.PORES + '번 칸  —  초시계 없이 스스로 세기',
        500, 166, 18, '#ffffff');

      if (!L.open) {
        E.text(g, '✖ 물길이 막혔습니다', 500, 220, 26, '#ff9c9c');
        E.text(g, '짝꿍이 이 칸의 물길을 뚫어 줘야 물이 빠집니다', 500, 254, 17, 'rgba(255,255,255,.6)', 'center', 600);
      } else if (L.holdDone) {
        E.text(g, '✔ 이 칸 흡수 완료', 500, 220, 26, '#7dff9b');
        E.text(g, '다음 칸으로 넘어가면 다시 한 번 잽니다', 500, 254, 17, 'rgba(255,255,255,.6)', 'center', 600);
      } else {
        E.text(g, '이번엔  ' + Number(L.holdTarget).toFixed(1) + ' 초  동안 흡수! (한 번뿐)', 500, 222, 27, '#7ad7f0');
        if (this.holding) {
          const beat = 0.5 + 0.5 * Math.abs(Math.sin(E.t * 6));
          g.save(); g.globalAlpha = beat;
          E.text(g, '● 흡수 중… 초를 세다가 손을 떼세요', 500, 260, 20, '#ffd166');
          g.restore();
        } else {
          E.text(g, '찌꺼기 위에 올라가 버튼을 꾹 누르고 있다가, 그 초에 딱 맞춰 떼기',
            500, 258, 15, 'rgba(255,255,255,.62)', 'center', 600);
        }
      }

      const need = L.target || 0, got = L.removed || 0;
      E.text(g, '이 칸에서 뺀 물  ' + got.toFixed(1) + '%  /  ' + need.toFixed(1) + '%',
        500, 294, 19, got >= need * (R.ROUND_PASS || .8) ? '#7dff9b' : '#ffd166');
      E.gauge(g, 264, 310, 472, 14, need > 0 ? Math.min(100, got / need * 100) : 100,
        got >= need * (R.ROUND_PASS || .8) ? '#7dff9b' : '#7ad7f0');

      if (this.judgeT > 0) {
        g.save(); g.globalAlpha = Math.min(1, this.judgeT);
        E.text(g, this.judge, 500, 356, 20, this.judgeOk ? '#7dff9b' : '#ff9c9c');
        g.restore();
      }

      const W = R.WATER_TARGET;
      E.fillRR(g, 274, 372, 452, 74, 12, 'rgba(6,14,10,.72)');
      E.text(g, '찌꺼기 전체 수분', 500, 392, 16, 'rgba(255,255,255,.75)');
      E.gauge(g, 294, 406, 412, 24, rw, rw >= W[0] && rw <= W[1] ? '#7dff9b' : (rw > W[1] ? '#7ad7f0' : '#ffb35a'),
        'rgba(255,255,255,.12)', Math.round(rw) + '%   (목표 ' + W[0] + '~' + W[1] + '%)', W);

      hpBar(g, this.hero);
      spentNote(g, this.hero, '짝꿍이 다음 칸의 물길을 뚫어 주면 회복됩니다');
      footer(g, '칸마다 딱 한 번! 찌꺼기 위에서 [누르기] 꾹 — 초시계는 없습니다. 스스로 세어 보세요');
      Ctrl.draw(g, '점프', this.holding ? '떼기!' : '누르기');
    }
  });

  window.StageTract = T;
})();
