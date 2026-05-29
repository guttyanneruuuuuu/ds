/* =========================================================
   ai.js — CPU思考ロジック
   状況に応じて「縄張り拡大」「接近攻撃」「回避」「必殺」を選択。
   難易度で反応速度・精度・積極性が変化。
   出力は Input.state 互換のオブジェクト。
   ========================================================= */
(function (global) {
  'use strict';

  const DIFFICULTY = {
    easy:   { react: 0.45, aggr: 0.4, dashChance: 0.15, dodge: 0.25, err: 0.5 },
    normal: { react: 0.28, aggr: 0.6, dashChance: 0.3,  dodge: 0.5,  err: 0.28 },
    hard:   { react: 0.14, aggr: 0.82, dashChance: 0.5, dodge: 0.78, err: 0.1 },
  };

  class AIController {
    constructor(self, target, arena, difficulty = 'normal') {
      this.self = self;
      this.target = target;
      this.arena = arena;
      this.cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
      this.timer = 0;
      this.goal = null;
      this.mode = 'expand';
      this.out = { mx: 0, my: 0, attack: false, dash: false, special: false,
                   pressedAttack: false, pressedDash: false, pressedSpecial: false };
      this._atkCool = 0;
    }

    think(dt) {
      const s = this.self, t = this.target, cfg = this.cfg;
      // 押下エッジはフレームごとにリセット
      this.out.pressedAttack = this.out.pressedDash = this.out.pressedSpecial = false;

      this.timer -= dt;
      this._atkCool -= dt;

      const dx = t.x - s.x, dy = t.y - s.y;
      const dist = Math.hypot(dx, dy);

      // 判断更新（reactごと）
      if (this.timer <= 0) {
        this.timer = cfg.react + Math.random() * cfg.react;
        this._decide(dist);
      }

      // --- 行動実行 ---
      if (this.mode === 'attack') {
        // ターゲットへ接近
        const ang = Math.atan2(dy, dx);
        const jitter = (Math.random() - 0.5) * cfg.err;
        this.out.mx = Math.cos(ang + jitter);
        this.out.my = Math.sin(ang + jitter);

        // 間合いに入ったら攻撃
        if (dist < 60 && this._atkCool <= 0 && s.attackCd <= 0) {
          // 向きを合わせる
          this.out.pressedAttack = true;
          this._atkCool = 0.25;
        }
        // たまにダッシュで接近
        if (dist > 130 && s.dashCd <= 0 && Math.random() < cfg.dashChance * dt * 8) {
          this.out.pressedDash = true;
        }
      } else if (this.mode === 'dodge') {
        // ターゲットから離れる方向＋未塗りを塗りつつ
        const ang = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 0.8;
        this.out.mx = Math.cos(ang);
        this.out.my = Math.sin(ang);
        if (s.dashCd <= 0 && Math.random() < cfg.dodge * dt * 10) this.out.pressedDash = true;
      } else {
        // expand: 未塗りセルへ向かう
        if (!this.goal || Math.hypot(this.goal.x - s.x, this.goal.y - s.y) < 30) {
          this.goal = this.arena.nearestUnclaimed(s.x, s.y, s.owner, 16)
                   || { x: this.arena.w * Math.random(), y: 80 + Math.random() * (this.arena.h - 120) };
        }
        const ang = Math.atan2(this.goal.y - s.y, this.goal.x - s.x);
        const jitter = (Math.random() - 0.5) * cfg.err * 1.4;
        this.out.mx = Math.cos(ang + jitter);
        this.out.my = Math.sin(ang + jitter);
      }

      // 必殺：満タンかつ相手が近い/積極的なら発動
      if (s.special >= 100) {
        const wantSpecial = (dist < 140 && Math.random() < cfg.aggr) || Math.random() < 0.01;
        if (wantSpecial) this.out.pressedSpecial = true;
      }

      return this.out;
    }

    _decide(dist) {
      const s = this.self, t = this.target, cfg = this.cfg;
      const r = Math.random();
      // 相手が必殺チャージ満タン & 近い → 回避優先
      if (dist < 120 && t.special >= 100 && r < cfg.dodge) { this.mode = 'dodge'; return; }
      // HP低い & 相手が攻撃モーション中 → 回避
      if (s.hp < s.maxHp * 0.3 && dist < 90 && r < cfg.dodge * 0.8) { this.mode = 'dodge'; return; }

      // 縄張りが負けている → 拡大重視
      const myT = this.arena.territory(s.owner);
      const opT = this.arena.territory(t.owner);

      if (r < cfg.aggr && dist < 220) {
        this.mode = 'attack';
      } else if (myT < opT && r < 0.7) {
        this.mode = 'expand';
      } else if (dist < 160 && r < cfg.aggr + 0.2) {
        this.mode = 'attack';
      } else {
        this.mode = 'expand';
      }
    }
  }

  global.AIController = AIController;
})(window);
