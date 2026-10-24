/* ============================================================
   actor.js — 조이스틱 · 캐릭터 물리 · 발판 세계
   물불게임(포레스트 템플) 같은 조작감을 만드는 공용 모듈
   ============================================================ */
(function () {
  const VW = 1000, VH = 700;
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

  /* ============================================================
     가상 조이스틱 + 버튼 (멀티터치 · 키보드 겸용)
     ============================================================ */
  const Ctrl = {
    SX: 132, SY: 566, SR: 86, KNOB: 38,
    AX: 872, AY: 588, AR: 60,       // 점프
    BX: 748, BY: 512, BR: 50,       // 행동(잡기/놓기/힘주기)

    reset() {
      this.sid = null; this.aid = null; this.bid = null;
      this.dx = 0; this.dy = 0;
      this.kx = this.ky = 0;
      this.aHeld = false; this.bHeld = false;
      this._aEdge = false; this._bEdge = false;
      this.aQueued = false; this.bQueued = false;
      this.hintT = 5;
    },

    down(p) {
      if (Math.hypot(p.x - this.AX, p.y - this.AY) < this.AR + 22) {
        this.aid = p.id; this.aHeld = true; this.aQueued = true; return true;
      }
      if (Math.hypot(p.x - this.BX, p.y - this.BY) < this.BR + 22) {
        this.bid = p.id; this.bHeld = true; this.bQueued = true; return true;
      }
      if (p.x < VW * 0.46 && p.y > VH * 0.42) {   // 왼쪽 아래 아무 곳이나 = 조이스틱
        this.sid = p.id; this.SX = p.x; this.SY = p.y; this.dx = 0; this.dy = 0;
        this.hintT = 0;
        return true;
      }
      return false;
    },
    move(p) {
      if (p.id === this.sid) {
        const dx = p.x - this.SX, dy = p.y - this.SY;
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / this.SR);
        this.dx = dx / d * k; this.dy = dy / d * k;
        return true;
      }
      return false;
    },
    up(p) {
      if (p.id === this.sid) { this.sid = null; this.dx = 0; this.dy = 0; this.SX = 132; this.SY = 566; return true; }
      if (p.id === this.aid) { this.aid = null; this.aHeld = false; return true; }
      if (p.id === this.bid) { this.bid = null; this.bHeld = false; return true; }
      return false;
    },

    // 키보드 (선생님이 노트북으로 시연할 때)
    key(e, down) {
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A': this.kx = down ? -1 : 0; return true;
        case 'ArrowRight': case 'd': case 'D': this.kx = down ? 1 : 0; return true;
        case 'ArrowDown': case 's': case 'S': this.ky = down ? 1 : 0; return true;
        case 'ArrowUp': case 'w': case 'W': case ' ':
          this.ky = down ? -1 : 0;
          if (down && !this.aHeld) this.aQueued = true;
          this.aHeld = down; return true;
        case 'z': case 'Z': case 'x': case 'X': case 'Enter':
          if (down && !this.bHeld) this.bQueued = true;
          this.bHeld = down; return true;
      }
      return false;
    },

    // 이번 프레임의 입력
    poll() {
      const mx = clamp(this.dx + this.kx, -1, 1);
      const my = clamp(this.dy + this.ky, -1, 1);
      const jump = this.aQueued; this.aQueued = false;
      const act = this.bQueued; this.bQueued = false;
      return { mx, my, jump, act, jumpHeld: this.aHeld, actHeld: this.bHeld };
    },

    draw(g, labelA, labelB) {
      g.save();
      g.globalAlpha = 0.30;
      // 조이스틱
      E.circle(g, this.SX, this.SY, this.SR, 'rgba(255,255,255,.10)', 'rgba(255,255,255,.45)', 4);
      const kx = this.SX + this.dx * (this.SR - this.KNOB);
      const ky = this.SY + this.dy * (this.SR - this.KNOB);
      E.circle(g, kx, ky, this.KNOB, 'rgba(255,255,255,.55)', 'rgba(255,255,255,.8)', 3);
      // 버튼
      E.circle(g, this.AX, this.AY, this.AR, this.aHeld ? 'rgba(125,255,155,.55)' : 'rgba(125,255,155,.22)', '#7dff9b', 4);
      E.circle(g, this.BX, this.BY, this.BR, this.bHeld ? 'rgba(255,209,102,.55)' : 'rgba(255,209,102,.22)', '#ffd166', 4);
      g.restore();
      g.save(); g.globalAlpha = 0.75;
      E.text(g, labelA || '점프', this.AX, this.AY, 19, '#eaffef');
      E.text(g, labelB || '행동', this.BX, this.BY, 17, '#fff4d6');
      g.restore();
      if (this.hintT > 0) {
        this.hintT -= E.dt;
        g.save(); g.globalAlpha = Math.min(1, this.hintT) * 0.8;
        E.text(g, '왼쪽 아래를 끌어서 이동', 132, 462, 17, '#fff');
        g.restore();
      }
    }
  };

  /* ============================================================
     캐릭터
     ============================================================ */
  function Actor(x, y, color, opt) {
    opt = opt || {};
    this.x = x; this.y = y;          // 발밑 중앙
    this.vx = 0; this.vy = 0;
    this.w = opt.w || 34; this.h = opt.h || 46;
    this.color = color;
    this.face = 1;
    this.onGround = false;
    this.stun = 0;
    this.anim = 0;
    this.spawnX = x; this.spawnY = y;
    this.speed = opt.speed || 300;
    this.jumpV = opt.jumpV || 700;
    this.gravity = opt.gravity || 2000;
    this.swim = !!opt.swim;
    this.carry = null;               // 들고 있는 것
    this.blink = 0;
    this.dashT = 0; this.dashCd = 0; // 밀치기(대시)
    // ---- 기관마다 주어지는 체력 ----
    this.maxHp = (window.GAMEDATA && GAMEDATA.RULES.HP_MAX) || 100;
    this.hp = this.maxHp;
    this.hpFlash = 0;
  }
  // 체력을 다 쓰면 그 기관에서는 더 이상 일할 수 없다
  Actor.prototype.spent = function () { return this.hp <= 0; };
  Actor.prototype.revive = function (amount) {
    if (this.hp >= this.maxHp) return false;
    this.hp = clamp(this.hp + (amount || 55), 0, this.maxHp);
    this.hpFlash = 1;
    return true;
  };

  Actor.prototype.rect = function () {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  };

  Actor.prototype.update = function (dt, world, inp) {
    if (this.stun > 0) {
      this.stun -= dt;
      this.vx *= 0.9;
    } else {
      if (this.swim) {
        this.vx += inp.mx * this.speed * 6 * dt;
        this.vy += inp.my * this.speed * 6 * dt;
        this.vx *= 0.90; this.vy *= 0.90;
      } else {
        const target = inp.mx * this.speed;
        if (this.dashT <= 0) this.vx += (target - this.vx) * Math.min(1, dt * 16);
        if (inp.jump && this.onGround) { this.vy = -this.jumpV; this.onGround = false; }
      }
      if (Math.abs(inp.mx) > 0.15) this.face = inp.mx > 0 ? 1 : -1;
    }
    if (!this.swim) this.vy += this.gravity * dt;
    this.vy = clamp(this.vy, -1400, 1400);

    // --- 이동 + 충돌 (x 먼저, y 나중) ---
    this.x += this.vx * dt;
    this._collide(world, true);
    this.y += this.vy * dt;
    this.onGround = false;
    this._collide(world, false);

    if (!isFinite(this.x) || !isFinite(this.y) || !isFinite(this.vx) || !isFinite(this.vy)) {
      this.x = this.spawnX; this.y = this.spawnY; this.vx = 0; this.vy = 0;
    }
    this.x = clamp(this.x, 20, VW - 20);
    if (this.y > VH + 200) { this.y = 60; this.vy = 0; }

    if (this.dashT > 0) this.dashT -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.hpFlash > 0) this.hpFlash -= dt;
    if (this.spent()) { this.vx *= 0.86; if (this.swim) this.vy *= 0.86; }   // 지치면 느려진다
    this.anim += Math.abs(this.vx) * dt * 0.06 + dt * 0.6;
    if (this.blink > 0) this.blink -= dt;
    if (Math.random() < dt * 0.35) this.blink = 0.13;

    if (this.carry) { this.carry.x = this.x; this.carry.y = this.y - this.h - 16; }
  };

  Actor.prototype._collide = function (world, horizontal) {
    const solids = world.solids || [];
    const r = this.rect();
    for (const s of solids) {
      if (s.off) continue;
      if (r.x + r.w <= s.x || r.x >= s.x + s.w || r.y + r.h <= s.y || r.y >= s.y + s.h) continue;
      if (world.topDown) {                       // 위에서 내려다보는 미로 (중력 없음)
        if (horizontal) {
          if (this.vx > 0) this.x = s.x - this.w / 2 - 0.01;
          else if (this.vx < 0) this.x = s.x + s.w + this.w / 2 + 0.01;
          this.vx = 0;
        } else {
          if (this.vy > 0) this.y = s.y - 0.01;
          else if (this.vy < 0) this.y = s.y + s.h + this.h + 0.01;
          this.vy = 0;
        }
        const r2 = this.rect(); r.x = r2.x; r.y = r2.y;
        continue;
      }
      if (horizontal) {
        if (s.oneWay) continue;
        if (this.vx > 0) this.x = s.x - this.w / 2 - 0.01;
        else if (this.vx < 0) this.x = s.x + s.w + this.w / 2 + 0.01;
        this.vx = 0;
      } else {
        if (this.vy >= 0 && r.y + r.h - this.vy * 0.017 <= s.y + 12) {
          this.y = s.y; this.vy = 0; this.onGround = true;
          if (s.vx) this.x += s.vx * 0.017;
        } else if (this.vy < 0 && !s.oneWay) {
          this.y = s.y + s.h + this.h; this.vy = 0;
        }
      }
      const rr = this.rect(); r.x = rr.x; r.y = rr.y;
    }
  };

  // 밀치기 — [밀기] 버튼으로 앞으로 확 돌진한다
  Actor.prototype.dash = function () {
    if (this.dashCd > 0 || this.stun > 0) return false;
    this.dashT = 0.24; this.dashCd = 0.55;
    this.vx = this.face * 780;
    return true;
  };

  Actor.prototype.hurt = function (sec, dmg) {
    if (this.stun > 0) return false;
    this.stun = sec || 1.2;
    this.vy = this.swim ? 0 : -420;
    this.vx = -this.face * 260;
    this.hp = clamp(this.hp - (dmg === undefined ? 25 : dmg), 0, this.maxHp);
    this.hpFlash = 1;
    return true;
  };

  Actor.prototype.draw = function (g) {
    const x = this.x, y = this.y, w = this.w, h = this.h;
    const bob = Math.sin(this.anim * 6) * (this.onGround && Math.abs(this.vx) > 20 ? 2.5 : 1);
    const hurt = this.stun > 0 && Math.floor(this.stun * 14) % 2 === 0;
    if (this.dashT > 0) {
      g.save(); g.globalAlpha = this.dashT * 1.6;
      for (let i = 1; i <= 3; i++) E.circle(g, x - this.face * i * 16, y - h / 2, h / 2.6 - i * 3, this.color);
      g.restore();
    }
    g.save();
    if (hurt) g.globalAlpha = 0.45;

    // 다리
    const legSw = this.onGround ? Math.sin(this.anim * 12) * 8 : 4;
    g.strokeStyle = '#2b2f3a'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - 7, y - 12); g.lineTo(x - 7 + legSw, y); g.stroke();
    g.beginPath(); g.moveTo(x + 7, y - 12); g.lineTo(x + 7 - legSw, y); g.stroke();

    // 몸통 (물방울 모양)
    g.beginPath();
    g.moveTo(x, y - h - 6 + bob);
    g.bezierCurveTo(x + w * 0.78, y - h * 0.72 + bob, x + w * 0.62, y - 6 + bob, x, y - 8 + bob);
    g.bezierCurveTo(x - w * 0.62, y - 6 + bob, x - w * 0.78, y - h * 0.72 + bob, x, y - h - 6 + bob);
    g.closePath();
    const gr = g.createLinearGradient(x - w / 2, y - h, x + w / 2, y);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, this.color); gr.addColorStop(1, this.color);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3; g.stroke();

    // 눈
    const ey = y - h * 0.62 + bob, ex = this.face * 5;
    if (this.blink > 0) {
      g.strokeStyle = '#22252e'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + ex - 12, ey); g.lineTo(x + ex - 4, ey); g.stroke();
      g.beginPath(); g.moveTo(x + ex + 4, ey); g.lineTo(x + ex + 12, ey); g.stroke();
    } else {
      E.circle(g, x + ex - 8, ey, 6, '#fff');
      E.circle(g, x + ex + 8, ey, 6, '#fff');
      E.circle(g, x + ex - 8 + this.face * 2, ey + 1, 3, '#22252e');
      E.circle(g, x + ex + 8 + this.face * 2, ey + 1, 3, '#22252e');
    }
    if (this.stun > 0) {
      for (let i = 0; i < 3; i++) {
        const a = E.t * 7 + i * 2.1;
        E.text(g, '✦', x + Math.cos(a) * 24, y - h - 22 + Math.sin(a) * 8, 16, '#ffd166');
      }
    }
    g.restore();
  };

  /* ============================================================
     세계 도우미
     ============================================================ */
  const World = {
    // 발판 그리기 (조직처럼 보이게)
    drawSolid(g, s, fill, edge) {
      if (s.off) return;
      E.fillRR(g, s.x, s.y, s.w, s.h, Math.min(10, s.h / 2), fill || '#8c5b52', edge || 'rgba(255,255,255,.18)', 2);
      g.save(); g.globalAlpha = .18;
      for (let i = 4; i < s.w; i += 16) {
        g.beginPath(); g.moveTo(s.x + i, s.y + 3); g.lineTo(s.x + i - 5, s.y + s.h - 3);
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
      }
      g.restore();
    },
    overlap(a, b) {
      return !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h);
    },
    near(actor, x, y, r) {
      return Math.hypot(actor.x - x, (actor.y - actor.h / 2) - y) < r;
    }
  };

  /* ============================================================
     밀 수 있는 덩어리 (음식물 조각 · 영양소)
     ============================================================ */
  function Chunk(x, y, r, kind, color) {
    this.x = x; this.y = y; this.r = r; this.kind = kind; this.color = color;
    this.vx = 0; this.vy = 0; this.spin = 0; this.dead = false; this.soak = 0; this.held = false;
  }
  /* 발판 한 개와의 충돌을 푼다.
     ★ oneWay 발판은 '위에서 내려와 착지할 때만' 막는다.
       (예전에는 아래에서 뚫고 지나갈 때도 옆면으로 밀어내서
        던진 음식물이 발판 왼쪽/오른쪽 끝으로 순간이동하는 버그가 있었다) */
  Chunk.prototype._solve = function (s, py) {
    if (s.off) return;
    if (!(this.x + this.r > s.x && this.x - this.r < s.x + s.w &&
          this.y + this.r > s.y && this.y - this.r < s.y + s.h)) return;

    if (s.oneWay) {
      // 내려오는 중이고, 직전 프레임에는 발판 위에 있었을 때만 착지
      if (this.vy > 0 && py + this.r <= s.y + 2) { this.y = s.y - this.r; this.vy = 0; }
      return;                                   // 그 외에는 그냥 통과한다
    }
    // 꽉 막힌 벽 : 파고든 깊이가 얕은 축으로 밀어낸다
    const ox = Math.min(this.x + this.r - s.x, s.x + s.w - (this.x - this.r));
    const oy = Math.min(this.y + this.r - s.y, s.y + s.h - (this.y - this.r));
    if (oy <= ox) {
      if (this.y < s.y + s.h / 2) { this.y = s.y - this.r; if (this.vy > 0) this.vy = 0; }
      else { this.y = s.y + s.h + this.r; if (this.vy < 0) this.vy = 0; }
    } else {
      if (this.x < s.x + s.w / 2) { this.x = s.x - this.r; if (this.vx > 0) this.vx = 0; }
      else { this.x = s.x + s.w + this.r; if (this.vx < 0) this.vx = 0; }
    }
  };

  Chunk.prototype.update = function (dt, world, actor) {
    if (this.held) return;
    const solids = world.solids || [];
    // 빠르게 던진 덩어리가 발판을 뚫고 지나가지 않도록 잘게 나눠 움직인다
    const dist = Math.hypot(this.vx, this.vy) * dt;
    const steps = Math.max(1, Math.min(8, Math.ceil(dist / (this.r * 0.7))));
    const h = dt / steps;
    for (let k = 0; k < steps; k++) {
      const py = this.y;
      this.vy += (world.gravity || 1800) * h;
      this.x += this.vx * h; this.y += this.vy * h;
      this.vx *= (1 - (world.friction || 1.6) * h);
      for (const s of solids) this._solve(s, py);
      this.x = clamp(this.x, this.r, VW - this.r);
    }
    this.spin += this.vx * dt * 0.05;

    // 캐릭터가 밀기
    if (actor) {
      const d = Math.hypot(actor.x - this.x, (actor.y - actor.h / 2) - this.y);
      if (d < this.r + 24) {
        const dir = this.x > actor.x ? 1 : -1;
        if (actor.dashT > 0 && Math.sign(actor.vx || dir) === dir) {
          // 밀치기 : 한 번에 확 밀어낸다
          this.vx = dir * Math.max(Math.abs(this.vx), 620);
          if (this.vy > -60) this.vy = -190;
          actor.vx *= 0.96;
        } else if (Math.abs(actor.vx) > 30 && Math.sign(actor.vx) === dir) {
          // ★ sticky = 침이 마른 상태. 밀어도 거의 안 밀린다.
          this.vx += dir * Math.abs(actor.vx) * (this.sticky ? 0.05 : 0.17);
          actor.vx *= this.sticky ? 0.55 : 0.7;
        }
      }
    }
  };
  Chunk.prototype.draw = function (g) {
    g.save();
    E.blob(g, this.x, this.y, this.r, 0.15, this.r, E.t * 0.8 + this.spin);
    const gr = g.createRadialGradient(this.x - this.r / 3, this.y - this.r / 3, 2, this.x, this.y, this.r);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.28, this.color); gr.addColorStop(1, this.color);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2.5; g.stroke();
    if (this.soak > 0) {
      g.globalAlpha = Math.min(.6, this.soak);
      E.blob(g, this.x, this.y, this.r, 0.15, this.r, E.t * 0.8 + this.spin);
      g.fillStyle = '#9dffb4'; g.fill();
    }
    g.restore();
  };

  /* ============================================================
     Ball — 위에서 내려다보는 미로에서 굴리는 음식물 덩이
     (중력 없음 · 캐릭터가 닿는 방향으로 밀린다 · 원 vs 사각형 충돌)
     ============================================================ */
  function Ball(x, y, r, kind, color) {
    this.x = x; this.y = y; this.r = r; this.kind = kind; this.color = color;
    this.vx = 0; this.vy = 0; this.spin = 0; this.rub = 0; this.small = false; this.dead = false;
  }
  Ball.prototype.update = function (dt, solids, hero, mult) {
    mult = mult === undefined ? 1 : mult;
    if (hero) {
      const hy = hero.y - hero.h / 2;
      let dx = this.x - hero.x, dy = this.y - hy;
      let d = Math.hypot(dx, dy);
      if (d < 0.001) { dx = 1; dy = 0; d = 1; }
      const touch = this.r + 20;
      if (d < touch) {
        const nx = dx / d, ny = dy / d;
        const along = hero.vx * nx + hero.vy * ny;
        if (along > 12) {
          this.vx += nx * along * 0.9 * mult;
          this.vy += ny * along * 0.9 * mult;
          hero.vx *= 0.72; hero.vy *= 0.72;
        }
        // 소화액이 없으면 밀어도 거의 꿈쩍하지 않는다
        const push = (touch - d) * 0.6 * (0.12 + 0.88 * mult);
        this.x += nx * push; this.y += ny * push;
      }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    const damp = Math.max(0, 1 - (4.2 + (1 - mult) * 16) * dt);
    this.vx *= damp; this.vy *= damp;
    this.spin += (Math.abs(this.vx) + Math.abs(this.vy)) * dt * 0.02;

    this.hitWall = false;                       // 이번 프레임에 벽에 닿았는가
    for (const s of (solids || [])) {
      if (s.off) continue;
      const cx = clamp(this.x, s.x, s.x + s.w), cy = clamp(this.y, s.y, s.y + s.h);
      let dx = this.x - cx, dy = this.y - cy;
      let d = Math.hypot(dx, dy);
      if (d >= this.r) continue;
      this.hitWall = true;
      if (d < 0.001) {                            // 완전히 안에 들어간 경우
        const left = this.x - s.x, right = s.x + s.w - this.x;
        const top = this.y - s.y, bot = s.y + s.h - this.y;
        const m = Math.min(left, right, top, bot);
        if (m === left) { this.x = s.x - this.r; this.vx = Math.min(0, this.vx); }
        else if (m === right) { this.x = s.x + s.w + this.r; this.vx = Math.max(0, this.vx); }
        else if (m === top) { this.y = s.y - this.r; this.vy = Math.min(0, this.vy); }
        else { this.y = s.y + s.h + this.r; this.vy = Math.max(0, this.vy); }
        continue;
      }
      const nx = dx / d, ny = dy / d, pen = this.r - d;
      this.x += nx * pen; this.y += ny * pen;
      const vn = this.vx * nx + this.vy * ny;
      if (vn < 0) { this.vx -= vn * nx * 1.2; this.vy -= vn * ny * 1.2; }
    }
    this.x = clamp(this.x, this.r, VW - this.r);
    this.y = clamp(this.y, this.r, VH - this.r);
    if (!isFinite(this.x) || !isFinite(this.y)) { this.x = 120; this.y = 220; this.vx = this.vy = 0; }
  };
  Ball.prototype.draw = function (g) {
    g.save();
    E.blob(g, this.x, this.y, this.r, 0.14, this.r, E.t * 0.7 + this.spin);
    const gr = g.createRadialGradient(this.x - this.r / 3, this.y - this.r / 3, 2, this.x, this.y, this.r);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.28, this.color); gr.addColorStop(1, this.color);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2.5; g.stroke();
    g.restore();
  };

  window.Ctrl = Ctrl;
  window.Actor = Actor;
  window.Chunk = Chunk;
  window.Ball = Ball;
  window.World = World;
})();
