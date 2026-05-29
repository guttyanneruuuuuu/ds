/* =========================================================
   game.js — ゲーム本体（ループ/描画/判定/エフェクト/勝敗）
   ========================================================= */
(function (global) {
  'use strict';

  const PLAYER_COLORS = {
    1: { base: '#ff6fa5', light: '#ffd0e3' },
    2: { base: '#4fc3f7', light: '#cdeeff' },
  };

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = Math.min(global.devicePixelRatio || 1, 2);
      this.particles = [];
      this.floaters = [];   // ダメージ表示など
      this.phase = 'idle';  // idle|countdown|play|over
      this.running = false;
      this.paused = false;
      this.shake = 0;
      this._raf = null;
      this._last = 0;
      this.onEnd = null;    // 終了コールバック
      this._resizeBound = () => this.resize();
    }

    resize() {
      const w = this.canvas.clientWidth || global.innerWidth;
      const h = this.canvas.clientHeight || global.innerHeight;
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.W = w; this.H = h;
      if (this.arena) {
        // アリーナはワールド座標固定（リサイズで作り直さない）
      }
    }

    // mode: 'ai' | 'friend' | 'practice'
    start(opts) {
      this.opts = opts;
      this.resize();
      global.addEventListener('resize', this._resizeBound);

      // ワールドサイズ = 画面サイズ
      this.arena = new global.Arena(this.W, this.H, 32);

      // ファイター配置
      const p1 = new global.Fighter(opts.p1, 1, this.W * 0.22, this.H * 0.55);
      const p2 = new global.Fighter(opts.p2, 2, this.W * 0.78, this.H * 0.55);
      this.fighters = [p1, p2];
      this.p1 = p1; this.p2 = p2;

      // コントローラ割り当て
      this.controllers = {};
      if (opts.mode === 'ai') {
        this.controllers[1] = 'human';
        this.ai = new global.AIController(p2, p1, this.arena, opts.difficulty || 'normal');
        this.controllers[2] = 'ai';
      } else if (opts.mode === 'practice') {
        this.controllers[1] = 'human';
        this.controllers[2] = 'dummy';
      } else { // friend = パスアンドプレイ：交互操作
        this.controllers[1] = 'human';
        this.controllers[2] = 'human2';
        // フレンドは同時操作が難しいため「ターン制ラウンド」方式
        this.friendTurn = 1;
      }

      this.time = opts.time || 60;
      this.particles.length = 0;
      this.floaters.length = 0;
      this.winner = null;
      this.stats = { hits1: 0, hits2: 0 };

      this.phase = 'countdown';
      this.countdown = 3.2;
      this.running = true;
      this.paused = false;
      this._last = performance.now();
      global.Sound.startMusic();
      this._loop(this._last);
    }

    stop() {
      this.running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      global.removeEventListener('resize', this._resizeBound);
      global.Sound.stopMusic();
    }

    _loop(now) {
      if (!this.running) return;
      let dt = (now - this._last) / 1000;
      this._last = now;
      if (dt > 0.05) dt = 0.05; // スパイク抑制
      if (!this.paused) {
        this.update(dt);
        this.render();
      }
      this._raf = requestAnimationFrame((t) => this._loop(t));
    }

    update(dt) {
      global.Input.beginFrame();

      if (this.phase === 'countdown') {
        const before = Math.ceil(this.countdown);
        this.countdown -= dt;
        const after = Math.ceil(this.countdown);
        if (after !== before && after >= 1) global.Sound.countdown();
        if (this.countdown <= 0) { this.phase = 'play'; global.Sound.go(); }
      } else if (this.phase === 'play') {
        this.time -= dt;
        if (this.time <= 0) { this.time = 0; this._end('time'); }
      }

      // 縄張りブースト更新
      this.p1.updateBonus(this.arena.territory(1));
      this.p2.updateBonus(this.arena.territory(2));

      // 入力収集
      const inP1 = this._humanInput(1);
      let inP2;
      if (this.controllers[2] === 'ai') {
        inP2 = this.ai.think(dt);
      } else if (this.controllers[2] === 'human2') {
        inP2 = this._humanInput(2); // 同端末では同入力（friendはAI補助 or 練習扱い）
      } else {
        // dummy: ゆるく徘徊する的（練習・フレンド用）
        this._dummyT = (this._dummyT || 0) - dt;
        if (this._dummyT <= 0) {
          this._dummyT = 0.8 + Math.random() * 1.2;
          const a = Math.random() * Math.PI * 2;
          this._dummyDir = { x: Math.cos(a), y: Math.sin(a) };
        }
        inP2 = { mx: this._dummyDir.x * 0.6, my: this._dummyDir.y * 0.6,
                 pressedAttack: false, pressedDash: false, pressedSpecial: false };
      }

      if (this.phase === 'play' || this.phase === 'countdown') {
        this.p1.update(dt, inP1, this.arena, this);
        this.p2.update(dt, inP2, this.arena, this);
      }

      // 体同士の押し合い
      this._separate(this.p1, this.p2);

      // パーティクル
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.92; p.vy *= 0.92; p.vy += p.g * dt;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
      for (let i = this.floaters.length - 1; i >= 0; i--) {
        const f = this.floaters[i];
        f.life -= dt; f.y -= 30 * dt;
        if (f.life <= 0) this.floaters.splice(i, 1);
      }

      if (this.shake > 0) this.shake -= dt * 60;

      // HUD更新
      this._updateHUD();

      // 死亡チェック
      if (this.phase === 'play') {
        if (this.p1.dead || this.p2.dead) this._end('ko');
      }
    }

    _humanInput(which) {
      // which=1 は通常スティック。friendの2人同時は本実装ではP1のみ操作、
      // P2はAI補助（mode==='friend'時に下でハンドリング）
      const s = global.Input.state, pr = global.Input.pressed;
      return {
        mx: s.mx, my: s.my,
        pressedAttack: pr.attack, pressedDash: pr.dash, pressedSpecial: pr.special,
      };
    }

    _separate(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const min = a.r + b.r;
      if (d < min) {
        const push = (min - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }

    // ===== 戦闘判定 =====
    meleeHit(attacker, x, y, reach, dmg, kb) {
      const target = attacker === this.p1 ? this.p2 : this.p1;
      const d = Math.hypot(target.x - x, target.y - y);
      if (d < reach + target.r) {
        const dir = Math.atan2(target.y - attacker.y, target.x - attacker.x);
        if (target.takeDamage(dmg, Math.cos(dir) * kb, Math.sin(dir) * kb)) {
          this._onHit(target, dmg, attacker);
        }
      }
    }
    aoeHit(attacker, x, y, radius, dmg, kb) {
      const target = attacker === this.p1 ? this.p2 : this.p1;
      const d = Math.hypot(target.x - x, target.y - y);
      if (d < radius + target.r) {
        const dir = Math.atan2(target.y - y, target.x - x);
        if (target.takeDamage(dmg, Math.cos(dir) * kb, Math.sin(dir) * kb)) {
          this._onHit(target, dmg, attacker);
        }
      }
    }
    _onHit(target, dmg, attacker) {
      global.Sound.hit();
      this.shake = 8;
      this.spawnBurst(target.x, target.y, '#fff', 12);
      this.floaters.push({ x: target.x, y: target.y - 24, life: 0.7,
        text: Math.round(dmg), color: attacker.def.color });
      if (attacker === this.p1) this.stats.hits1++; else this.stats.hits2++;
    }

    // 必殺の塗り
    paintBurst(x, y, owner, r, arena) {
      arena.paint(x, y, owner, r);
      arena.paint(x, y, owner, Math.max(1, r - 2));
    }
    paintBeam(x, y, facing, owner, arena) {
      for (let i = 0; i < 8; i++) arena.paint(x + facing * i * 26, y, owner, 2);
    }

    // ===== エフェクト生成 =====
    spawnBurst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 160;
        this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.4 + Math.random() * 0.4, g: 200, r: 3 + Math.random() * 4, color });
      }
    }
    spawnSlash(x, y, facing, color) {
      for (let i = 0; i < 6; i++) {
        this.particles.push({ x, y, vx: facing * (80 + Math.random() * 120),
          vy: (Math.random() - 0.5) * 80, life: 0.25, g: 0, r: 3, color });
      }
    }
    spawnDashTrail(f) {
      for (let i = 0; i < 8; i++) {
        this.particles.push({ x: f.x, y: f.y, vx: (Math.random()-0.5)*40,
          vy: (Math.random()-0.5)*40, life: 0.3, g: 0, r: 4, color: f.def.light });
      }
    }
    spawnBeam(x, y, facing, color) {
      for (let i = 0; i < 30; i++) {
        this.particles.push({ x: x + facing * i * 8, y: y + (Math.random()-0.5)*30,
          vx: facing * 100, vy: (Math.random()-0.5)*60, life: 0.4, g: 0, r: 4, color });
      }
    }

    // ===== 勝敗 =====
    _end(reason) {
      if (this.phase === 'over') return;
      this.phase = 'over';
      let winner;
      if (reason === 'ko') {
        winner = this.p1.dead && this.p2.dead ? 0 : (this.p1.dead ? 2 : 1);
      } else {
        const t1 = this.arena.territory(1), t2 = this.arena.territory(2);
        winner = t1 > t2 ? 1 : (t2 > t1 ? 2 : 0);
      }
      this.winner = winner;
      this.reason = reason;
      setTimeout(() => {
        this.stop();
        if (this.onEnd) this.onEnd({
          winner, reason,
          t1: this.arena.territory(1), t2: this.arena.territory(2),
          hp1: this.p1.hp, hp2: this.p2.hp,
          stats: this.stats,
        });
      }, 900);
    }

    _updateHUD() {
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.style.width = v + '%'; };
      set('hp1', (this.p1.hp / this.p1.maxHp) * 100);
      set('hp2', (this.p2.hp / this.p2.maxHp) * 100);
      const t1 = document.getElementById('terr1'), t2 = document.getElementById('terr2');
      if (t1) t1.textContent = Math.round(this.arena.territory(1) * 100) + '%';
      if (t2) t2.textContent = Math.round(this.arena.territory(2) * 100) + '%';
      const timer = document.getElementById('hud-timer');
      if (timer) {
        timer.textContent = Math.ceil(this.time);
        timer.classList.toggle('danger', this.time <= 10 && this.phase === 'play');
      }
      // 必殺ゲージ表示（クールダウンオーバーレイ流用）
      const cdSp = document.getElementById('cd-special');
      if (cdSp) cdSp.style.height = (100 - this.p1.special) + '%';
      const cdDash = document.getElementById('cd-dash');
      if (cdDash) cdDash.style.height = Math.max(0, this.p1.dashCd / 0.7) * 100 + '%';
    }

    // ===== 描画 =====
    render() {
      const ctx = this.ctx;
      ctx.save();
      ctx.scale(this.dpr, this.dpr);

      // シェイク
      let sx = 0, sy = 0;
      if (this.shake > 0) { sx = (Math.random()-0.5) * this.shake; sy = (Math.random()-0.5) * this.shake; }
      ctx.translate(sx, sy);

      // 背景（明るい芝・空のグラデ）
      const g = ctx.createLinearGradient(0, 0, 0, this.H);
      g.addColorStop(0, '#d6f3ff');
      g.addColorStop(0.55, '#eafff1');
      g.addColorStop(1, '#d4f7dd');
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, this.W + 40, this.H + 40);

      // ふんわりドット模様
      this._drawDots(ctx);

      // 塗り
      this.arena.draw(ctx, PLAYER_COLORS);
      this.arena.drawFlowers(ctx);

      // パーティクル（下層）
      this._drawParticles(ctx);

      // ファイター（y順）
      const order = [this.p1, this.p2].sort((a, b) => a.y - b.y);
      order.forEach(f => f.draw(ctx));

      // ダメージ表示
      ctx.textAlign = 'center';
      this.floaters.forEach(f => {
        ctx.save();
        ctx.globalAlpha = Math.min(1, f.life * 2);
        ctx.font = '900 22px ' + getFont();
        ctx.fillStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeStyle = f.color;
        ctx.strokeText(f.text, f.x, f.y); ctx.fillText(f.text, f.x, f.y);
        ctx.restore();
      });

      ctx.restore();

      // カウントダウン
      if (this.phase === 'countdown') this._drawCountdown(ctx);
    }

    _drawDots(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      const s = 64;
      for (let y = 0; y < this.H + s; y += s) {
        for (let x = 0; x < this.W + s; x += s) {
          ctx.beginPath();
          ctx.arc(x + (Math.floor(y/s)%2)*s/2, y, 3, 0, Math.PI*2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    _drawParticles(ctx) {
      this.particles.forEach(p => {
        ctx.globalAlpha = Math.min(1, p.life * 3);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    _drawCountdown(ctx) {
      const n = Math.ceil(this.countdown);
      const frac = this.countdown - Math.floor(this.countdown);
      ctx.save();
      ctx.translate(this.W / 2, this.H / 2);
      const scale = 0.6 + (1 - frac) * 0.8;
      ctx.scale(scale, scale);
      ctx.globalAlpha = Math.min(1, frac * 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 120px ' + getFont();
      const txt = n > 0 ? n : 'GO!';
      ctx.lineWidth = 10; ctx.strokeStyle = '#ff9ecb';
      ctx.fillStyle = '#fff';
      ctx.strokeText(txt, 0, 0); ctx.fillText(txt, 0, 0);
      ctx.restore();
    }
  }

  function getFont() {
    return '"Hiragino Maru Gothic ProN","Quicksand",system-ui,sans-serif';
  }

  global.Game = Game;
  global.PLAYER_COLORS = PLAYER_COLORS;
})(window);
