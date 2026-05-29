/* =========================================================
   entity.js — ファイター（プレイヤー/CPU 共通）
   キャラ定義・移動・攻撃・必殺・ダメージ・縄張りブースト。
   ========================================================= */
(function (global) {
  'use strict';

  // キャラクター図鑑（パステルでかわいい花の精たち）
  const CHARACTERS = [
    {
      id: 'sakura', name: 'サクラ', emoji: '🌸',
      desc: 'バランス型。塗りが少し広め。',
      color: '#ff6fa5', light: '#ffd0e3',
      speed: 1.0, power: 1.0, hp: 100, paintRadius: 2,
      special: 'bloom',  // 周囲を一気に開花＆吹き飛ばし
    },
    {
      id: 'mint', name: 'ミント', emoji: '🍀',
      desc: 'すばやい。ダッシュが得意。',
      color: '#34c98a', light: '#bff3da',
      speed: 1.22, power: 0.85, hp: 90, paintRadius: 2,
      special: 'whirl',  // 回転斬りで連続ヒット
    },
    {
      id: 'sunny', name: 'サニー', emoji: '🌻',
      desc: 'パワー型。攻撃が重い。',
      color: '#f5a623', light: '#ffe6ad',
      speed: 0.88, power: 1.3, hp: 120, paintRadius: 2,
      special: 'beam',   // 前方ビームで大ダメージ
    },
    {
      id: 'lila', name: 'リラ', emoji: '🪻',
      desc: 'トリッキー。塗り範囲が広い。',
      color: '#a97cff', light: '#e0d2ff',
      speed: 1.05, power: 0.95, hp: 95, paintRadius: 3,
      special: 'trap',   // 周囲に塗り爆発（広範囲ペイント）
    },
  ];

  class Fighter {
    constructor(charId, ownerId, x, y) {
      const def = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
      this.def = def;
      this.owner = ownerId; // 1 or 2
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.facing = ownerId === 1 ? 1 : -1; // 向き(x)
      this.faceY = 0;
      this.r = 20;

      this.maxHp = def.hp;
      this.hp = def.hp;
      this.special = 0;       // 必殺ゲージ 0..100
      this.dead = false;

      // クールダウン
      this.attackCd = 0;
      this.dashCd = 0;
      this.invuln = 0;        // 無敵時間
      this.dashTime = 0;      // ダッシュ中
      this.hitstun = 0;       // のけぞり
      this.attackAnim = 0;
      this.specialAnim = 0;
      this.bob = Math.random() * Math.PI * 2;

      this.bonus = 1;         // 縄張りブースト倍率
    }

    // 縄張り％からブースト算出（0%→1.0, 100%→1.5）
    updateBonus(territory) {
      this.bonus = 1 + territory * 0.5;
    }

    get speed() { return this.def.speed * 2.7 * this.bonus; }
    get power() { return this.def.power * this.bonus; }

    update(dt, input, arena, game) {
      this.bob += dt * 8;
      if (this.attackCd > 0) this.attackCd -= dt;
      if (this.dashCd > 0) this.dashCd -= dt;
      if (this.invuln > 0) this.invuln -= dt;
      if (this.hitstun > 0) this.hitstun -= dt;
      if (this.attackAnim > 0) this.attackAnim -= dt;
      if (this.specialAnim > 0) this.specialAnim -= dt;
      if (this.dashTime > 0) this.dashTime -= dt;

      // 移動
      let mx = input.mx, my = input.my;
      const mag = Math.hypot(mx, my);
      if (mag > 0.15 && this.hitstun <= 0) {
        if (mag > 1) { mx /= mag; my /= mag; }
        this.facing = mx >= 0 ? 1 : (mx < 0 ? -1 : this.facing);
        const sp = this.speed * (this.dashTime > 0 ? 2.4 : 1);
        this.vx = mx * sp;
        this.vy = my * sp;
      } else if (this.hitstun <= 0) {
        this.vx *= 0.7; this.vy *= 0.7;
      }
      // ノックバック減衰
      this.vx *= 0.9; this.vy *= 0.9;

      this.x += this.vx;
      this.y += this.vy;

      // 壁
      this.x = Math.max(this.r, Math.min(arena.w - this.r, this.x));
      this.y = Math.max(this.r + 60, Math.min(arena.h - this.r - 20, this.y));

      // 足元を塗る
      if (game.phase === 'play') {
        const moving = Math.hypot(this.vx, this.vy) > 0.4;
        const rad = this.def.paintRadius + (this.dashTime > 0 ? 1 : 0);
        if (moving || Math.random() < 0.3) {
          if (arena.paint(this.x, this.y, this.owner, rad)) {
            if (Math.random() < 0.15) global.Sound.paint();
          }
        }
        // 必殺ゲージ：縄張りを広げると貯まる
        this.special = Math.min(100, this.special + dt * 6);
      }

      // 入力アクション（pressed = 押した瞬間）
      if (this.hitstun <= 0 && game.phase === 'play') {
        if (input.pressedAttack && this.attackCd <= 0) this.doAttack(game);
        if (input.pressedDash && this.dashCd <= 0) this.doDash();
        if (input.pressedSpecial && this.special >= 100) this.doSpecial(game, arena);
      }
    }

    doDash() {
      this.dashCd = 0.7;
      this.dashTime = 0.18;
      this.invuln = 0.22;
      const m = Math.hypot(this.vx, this.vy) || 1;
      const dx = (this.vx / m) || this.facing, dy = (this.vy / m) || 0;
      this.vx = dx * this.speed * 3.2;
      this.vy = dy * this.speed * 3.2;
      global.Sound.dash();
      game.spawnDashTrail(this);
    }

    doAttack(game) {
      this.attackCd = 0.38;
      this.attackAnim = 0.22;
      global.Sound.attack();
      const reach = 46;
      const ax = this.x + this.facing * 26;
      const ay = this.y;
      game.meleeHit(this, ax, ay, reach, 9 * this.power, this.facing * 6);
      game.spawnSlash(ax, ay, this.facing, this.def.color);
    }

    doSpecial(game, arena) {
      this.special = 0;
      this.specialAnim = 0.6;
      global.Sound.special();
      const kind = this.def.special;
      if (kind === 'bloom') {
        game.aoeHit(this, this.x, this.y, 130, 16 * this.power, 16);
        game.paintBurst(this.x, this.y, this.owner, 6, arena);
        game.spawnBurst(this.x, this.y, this.def.color, 30);
      } else if (kind === 'whirl') {
        // 連続ヒット
        for (let i = 0; i < 4; i++) setTimeout(() => {
          if (!this.dead) { game.aoeHit(this, this.x, this.y, 90, 6 * this.power, 6);
            game.spawnBurst(this.x, this.y, this.def.color, 8); }
        }, i * 110);
        game.paintBurst(this.x, this.y, this.owner, 4, arena);
      } else if (kind === 'beam') {
        const bx = this.x + this.facing * 120;
        game.aoeHit(this, bx, this.y, 90, 24 * this.power, 22);
        game.paintBeam(this.x, this.y, this.facing, this.owner, arena);
        game.spawnBeam(this.x, this.y, this.facing, this.def.color);
      } else if (kind === 'trap') {
        game.paintBurst(this.x, this.y, this.owner, 8, arena);
        game.aoeHit(this, this.x, this.y, 150, 10 * this.power, 12);
        game.spawnBurst(this.x, this.y, this.def.color, 40);
      }
      global.Sound.bloom();
    }

    takeDamage(dmg, kbx, kby) {
      if (this.invuln > 0 || this.dead) return false;
      this.hp -= dmg;
      this.invuln = 0.4;
      this.hitstun = 0.22;
      this.vx = kbx; this.vy = kby;
      this.special = Math.min(100, this.special + dmg * 0.6); // 被弾でも少し貯まる
      if (this.hp <= 0) { this.hp = 0; this.dead = true; }
      return true;
    }

    // ===== 描画 =====
    draw(ctx) {
      const bobY = Math.sin(this.bob) * 3;
      ctx.save();
      ctx.translate(this.x, this.y + bobY);

      // 影
      ctx.fillStyle = 'rgba(120,90,140,0.18)';
      ctx.beginPath();
      ctx.ellipse(0, this.r + 6 - bobY, this.r * 0.8, this.r * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();

      // 無敵点滅
      if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) ctx.globalAlpha = 0.45;

      // オーラ（必殺チャージ満タン）
      if (this.special >= 100) {
        ctx.save();
        ctx.globalAlpha = 0.4 + Math.sin(this.bob * 2) * 0.2;
        ctx.fillStyle = this.def.light;
        ctx.beginPath(); ctx.arc(0, 0, this.r + 12, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // 体（ぷにっとした円）
      const sq = this.attackAnim > 0 ? 1.15 : (this.dashTime > 0 ? 1.2 : 1);
      ctx.scale(this.facing * sq, (2 - sq));
      const grad = ctx.createRadialGradient(-6, -8, 4, 0, 0, this.r + 4);
      grad.addColorStop(0, this.def.light);
      grad.addColorStop(1, this.def.color);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.fill();
      // ふち
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
      ctx.restore();

      // 顔（向きに依らず正立）
      ctx.save();
      ctx.translate(this.x, this.y + bobY);
      ctx.font = `${this.r * 1.5}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.def.emoji, 0, 1);
      ctx.restore();

      // 攻撃モーションの弧
      if (this.attackAnim > 0) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = this.attackAnim / 0.22 * 0.6;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(this.facing * 24, 0, 30, -1, 1);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  }

  global.Fighter = Fighter;
  global.CHARACTERS = CHARACTERS;
})(window);
