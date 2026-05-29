/* =========================================================
   input.js — 入力管理
   バーチャルスティック / アクションボタン / キーボード を統合。
   出力: Input.state = { mx, my(正規化-1..1), attack, dash, special }
   ========================================================= */
(function (global) {
  'use strict';

  const Input = {
    state: { mx: 0, my: 0, attack: false, dash: false, special: false },
    // エッジ検出用（押した瞬間）
    pressed: { attack: false, dash: false, special: false },
    _prev: { attack: false, dash: false, special: false },
    _keys: {},
    _stick: { active: false, id: null, cx: 0, cy: 0, max: 46 },

    init() {
      this._initStick();
      this._initButtons();
      this._initKeyboard();
    },

    // 毎フレーム冒頭で呼ぶ：エッジ計算
    beginFrame() {
      this.pressed.attack  = this.state.attack  && !this._prev.attack;
      this.pressed.dash    = this.state.dash    && !this._prev.dash;
      this.pressed.special = this.state.special && !this._prev.special;
      this._prev.attack = this.state.attack;
      this._prev.dash = this.state.dash;
      this._prev.special = this.state.special;
    },

    _initStick() {
      const zone = document.getElementById('stick-zone');
      const base = document.getElementById('stick-base');
      const knob = document.getElementById('stick-knob');
      if (!zone) return;

      const setBaseAt = (x, y) => {
        const r = zone.getBoundingClientRect();
        base.style.left = (x - r.left - 60) + 'px';
        base.style.bottom = (r.bottom - y - 60) + 'px';
      };
      const reset = () => {
        knob.style.transform = 'translate(-50%,-50%)';
        this.state.mx = 0; this.state.my = 0;
        base.style.left = '14px'; base.style.bottom = '14px';
      };

      const start = (x, y, id) => {
        this._stick.active = true; this._stick.id = id;
        setBaseAt(x, y);
        const b = base.getBoundingClientRect();
        this._stick.cx = b.left + b.width / 2;
        this._stick.cy = b.top + b.height / 2;
        move(x, y);
      };
      const move = (x, y) => {
        let dx = x - this._stick.cx, dy = y - this._stick.cy;
        const dist = Math.hypot(dx, dy);
        const max = this._stick.max;
        if (dist > max) { dx = dx / dist * max; dy = dy / dist * max; }
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.state.mx = dx / max;
        this.state.my = dy / max;
      };

      zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        start(t.clientX, t.clientY, t.identifier);
      }, { passive: false });
      zone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier === this._stick.id) move(t.clientX, t.clientY);
        }
      }, { passive: false });
      const end = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === this._stick.id) { this._stick.active = false; reset(); }
        }
      };
      zone.addEventListener('touchend', end);
      zone.addEventListener('touchcancel', end);

      // マウス（PC用）
      let mouseDown = false;
      zone.addEventListener('mousedown', (e) => { mouseDown = true; start(e.clientX, e.clientY, 'mouse'); });
      window.addEventListener('mousemove', (e) => { if (mouseDown && this._stick.active) move(e.clientX, e.clientY); });
      window.addEventListener('mouseup', () => { if (mouseDown) { mouseDown = false; this._stick.active = false; reset(); } });
    },

    _bindButton(id, key) {
      const el = document.getElementById(id);
      if (!el) return;
      const on = (e) => { e.preventDefault(); this.state[key] = true; };
      const off = (e) => { e.preventDefault(); this.state[key] = false; };
      el.addEventListener('touchstart', on, { passive: false });
      el.addEventListener('touchend', off, { passive: false });
      el.addEventListener('touchcancel', off, { passive: false });
      el.addEventListener('mousedown', on);
      el.addEventListener('mouseup', off);
      el.addEventListener('mouseleave', off);
    },
    _initButtons() {
      this._bindButton('btn-attack', 'attack');
      this._bindButton('btn-dash', 'dash');
      this._bindButton('btn-special', 'special');
    },

    _initKeyboard() {
      const map = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
        W: 'up', S: 'down', A: 'left', D: 'right',
        j: 'attack', J: 'attack', k: 'dash', K: 'dash', l: 'special', L: 'special',
        ' ': 'attack',
      };
      window.addEventListener('keydown', (e) => {
        const m = map[e.key]; if (!m) return;
        this._keys[m] = true; this._applyKeys();
      });
      window.addEventListener('keyup', (e) => {
        const m = map[e.key]; if (!m) return;
        this._keys[m] = false; this._applyKeys();
      });
    },
    _applyKeys() {
      const k = this._keys;
      if (!this._stick.active) {
        let x = (k.right ? 1 : 0) - (k.left ? 1 : 0);
        let y = (k.down ? 1 : 0) - (k.up ? 1 : 0);
        const d = Math.hypot(x, y);
        if (d > 1) { x /= d; y /= d; }
        this.state.mx = x; this.state.my = y;
      }
      this.state.attack = !!k.attack;
      this.state.dash = !!k.dash;
      this.state.special = !!k.special;
    },

    reset() {
      this.state.mx = 0; this.state.my = 0;
      this.state.attack = this.state.dash = this.state.special = false;
    },
  };

  global.Input = Input;
})(window);
