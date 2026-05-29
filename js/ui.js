/* =========================================================
   ui.js — 画面遷移・キャラ選択・リザルト・フレンド対戦管理
   ========================================================= */
(function (global) {
  'use strict';

  const UI = {
    screen: 'title',
    mode: null,          // 'ai' | 'friend' | 'practice'
    difficulty: 'normal',
    selP1: null,
    selP2: null,
    game: null,

    // フレンド対戦（パスアンドプレイ・タイムアタック）状態
    friend: null,        // { turn:1|2, p1Score, p2Score, char1, char2 }

    init() {
      this._bindNav();
      this._buildCharGrid();
      this._bindActions();
    },

    show(name) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      const el = document.getElementById('screen-' + name);
      if (el) el.classList.add('active');
      this.screen = name;
      // ゲーム画面のみポーズボタン表示
      const pb = document.getElementById('btn-pause');
      if (pb) pb.style.display = name === 'game' ? 'flex' : 'none';
    },

    _bindNav() {
      // タイトルのモード選択
      document.querySelectorAll('#screen-title [data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
          global.Sound.select();
          this.mode = btn.dataset.mode;
          this._enterSelect();
        });
      });
      // 戻る
      document.querySelectorAll('[data-back]').forEach(btn => {
        btn.addEventListener('click', () => {
          global.Sound.back();
          this.show(btn.dataset.back);
          this._resetSelect();
        });
      });
      // 難易度
      document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          global.Sound.tap();
          this.difficulty = btn.dataset.diff;
          document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
      // 遊び方
      const howto = document.getElementById('overlay-howto');
      document.getElementById('btn-howto').addEventListener('click', () => {
        global.Sound.tap(); howto.classList.remove('hidden');
      });
      document.getElementById('btn-howto-close').addEventListener('click', () => {
        global.Sound.tap(); howto.classList.add('hidden');
      });
    },

    _enterSelect() {
      this._resetSelect();
      const title = document.getElementById('select-title');
      const friendSetup = document.getElementById('friend-setup');
      const diffSetup = document.getElementById('difficulty-setup');
      if (this.mode === 'friend') {
        title.textContent = '2人でえらぶ';
        friendSetup.classList.remove('hidden');
        diffSetup.classList.add('hidden');
      } else if (this.mode === 'ai') {
        title.textContent = 'キャラをえらぶ';
        friendSetup.classList.add('hidden');
        diffSetup.classList.remove('hidden');
      } else {
        title.textContent = 'キャラをえらぶ（練習）';
        friendSetup.classList.add('hidden');
        diffSetup.classList.add('hidden');
      }
      this.show('select');
    },

    _resetSelect() {
      this.selP1 = null; this.selP2 = null;
      this._friendPick = 1;
      document.querySelectorAll('.char-card').forEach(c => {
        c.classList.remove('selected', 'sel-p1', 'sel-p2');
      });
      const p1 = document.querySelector('#pick-p1 .vs-name');
      const p2 = document.querySelector('#pick-p2 .vs-name');
      if (p1) p1.textContent = '？';
      if (p2) p2.textContent = '？';
      document.getElementById('btn-start').disabled = true;
    },

    _buildCharGrid() {
      const grid = document.getElementById('char-grid');
      grid.innerHTML = '';
      global.CHARACTERS.forEach(ch => {
        const card = document.createElement('div');
        card.className = 'char-card';
        card.style.setProperty('--cc', ch.color);
        const dots = (n) => Array.from({ length: 3 }, (_, i) =>
          `<span class="stat-dot ${i < n ? 'on' : ''}"></span>`).join('');
        const spd = ch.speed >= 1.15 ? 3 : ch.speed >= 1.0 ? 2 : 1;
        const pow = ch.power >= 1.2 ? 3 : ch.power >= 0.95 ? 2 : 1;
        card.innerHTML = `
          <div class="char-avatar">${ch.emoji}</div>
          <div class="char-name">${ch.name}</div>
          <div class="char-desc">${ch.desc}</div>
          <div class="char-stats" title="速さ">${dots(spd)}</div>
          <div class="char-stats" title="力">${dots(pow)}</div>`;
        card.addEventListener('click', () => this._pickChar(ch.id, card));
        grid.appendChild(card);
      });
    },

    _pickChar(id, card) {
      global.Sound.select();
      if (this.mode === 'friend') {
        if (this._friendPick === 1) {
          this.selP1 = id;
          document.querySelectorAll('.char-card').forEach(c => c.classList.remove('sel-p1'));
          card.classList.add('sel-p1', 'selected');
          document.querySelector('#pick-p1 .vs-name').textContent =
            global.CHARACTERS.find(c => c.id === id).emoji;
          this._friendPick = 2;
        } else {
          this.selP2 = id;
          document.querySelectorAll('.char-card').forEach(c => c.classList.remove('sel-p2'));
          card.classList.add('sel-p2', 'selected');
          document.querySelector('#pick-p2 .vs-name').textContent =
            global.CHARACTERS.find(c => c.id === id).emoji;
          this._friendPick = 1;
        }
        document.getElementById('btn-start').disabled = !(this.selP1 && this.selP2);
      } else {
        this.selP1 = id;
        document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        // 相手はランダム（自分以外）
        const others = global.CHARACTERS.filter(c => c.id !== id);
        this.selP2 = others[(Math.random() * others.length) | 0].id;
        document.getElementById('btn-start').disabled = false;
      }
    },

    _bindActions() {
      document.getElementById('btn-start').addEventListener('click', () => {
        global.Sound.tap();
        this._startMatch();
      });
      // ポーズ
      document.getElementById('btn-pause').addEventListener('click', () => {
        if (!this.game) return;
        this.game.paused = true;
        global.Sound.tap();
        document.getElementById('overlay-pause').classList.remove('hidden');
      });
      document.getElementById('btn-resume').addEventListener('click', () => {
        global.Sound.tap();
        document.getElementById('overlay-pause').classList.add('hidden');
        if (this.game) { this.game.paused = false; this.game._last = performance.now(); }
      });
      document.getElementById('btn-quit').addEventListener('click', () => {
        global.Sound.back();
        document.getElementById('overlay-pause').classList.add('hidden');
        if (this.game) this.game.stop();
        this.friend = null;
        this.show('title');
      });
      // リザルト
      document.getElementById('btn-rematch').addEventListener('click', () => {
        global.Sound.tap();
        this._startMatch();
      });
      document.getElementById('btn-tomenu').addEventListener('click', () => {
        global.Sound.back();
        this.friend = null;
        this.show('title');
      });
    },

    _startMatch() {
      global.Input.reset();
      this.show('game');
      const canvas = document.getElementById('game-canvas');

      if (this.mode === 'friend') {
        // パスアンドプレイ・タイムアタック開始/継続
        if (!this.friend) {
          this.friend = { turn: 1, p1: 0, p2: 0, char1: this.selP1, char2: this.selP2 };
        }
        this._runFriendTurn(canvas);
        return;
      }

      // AI / 練習
      this.game = new global.Game(canvas);
      this.game.onEnd = (res) => this._showResult(res);
      this.game.start({
        mode: this.mode,
        p1: this.selP1, p2: this.selP2,
        difficulty: this.difficulty, time: 60,
      });
      document.getElementById('hud-name1').textContent =
        global.CHARACTERS.find(c => c.id === this.selP1).name;
      document.getElementById('hud-name2').textContent =
        this.mode === 'ai' ? 'CPU' : '練習くん';
    },

    // ===== フレンド：タイムアタック2ターン =====
    _runFriendTurn(canvas) {
      const f = this.friend;
      const who = f.turn;
      const char = who === 1 ? f.char1 : f.char2;
      const banner = document.getElementById('turn-banner');
      banner.classList.remove('hidden');
      banner.innerHTML = `
        <div class="tb-big">${who === 1 ? '🌸 P1のばん' : '💙 P2のばん'}</div>
        <div class="tb-sub">30秒でできるだけ広く塗ろう！<br>練習相手をボコってもOK</div>
        <button class="btn btn-primary" id="tb-go">スタート</button>`;
      document.getElementById('tb-go').addEventListener('click', () => {
        global.Sound.go();
        banner.classList.add('hidden');
        this.game = new global.Game(canvas);
        this.game.onEnd = (res) => this._friendTurnEnd(res, canvas);
        this.game.start({ mode: 'practice', p1: char, p2: who === 1 ? f.char2 : f.char1, time: 30 });
        document.getElementById('hud-name1').textContent =
          (who === 1 ? 'P1 ' : 'P2 ') + global.CHARACTERS.find(c => c.id === char).name;
        document.getElementById('hud-name2').textContent = 'まと';
      }, { once: true });
    },

    _friendTurnEnd(res, canvas) {
      const f = this.friend;
      // スコア = 縄張り% * 100 + KOボーナス
      const score = Math.round(res.t1 * 100) + (res.winner === 1 ? 20 : 0);
      if (f.turn === 1) {
        f.p1 = score; f.turn = 2;
        this._runFriendTurn(canvas);
      } else {
        f.p2 = score;
        // 勝敗判定
        const winner = f.p1 > f.p2 ? 1 : (f.p2 > f.p1 ? 2 : 0);
        this._showResult({
          winner, reason: 'friend',
          friendScores: { p1: f.p1, p2: f.p2 },
          t1: f.p1 / 100, t2: f.p2 / 100,
        });
        this.friend = null;
      }
    },

    _showResult(res) {
      const emoji = document.getElementById('result-emoji');
      const titleEl = document.getElementById('result-title');
      const stats = document.getElementById('result-stats');

      let mine = 1;
      const win = res.winner;
      if (win === 0) { emoji.textContent = '🤝'; titleEl.textContent = 'DRAW'; global.Sound.win(); }
      else if (win === mine) { emoji.textContent = '🏆'; titleEl.textContent = 'WIN!'; global.Sound.win(); }
      else { emoji.textContent = '🌧'; titleEl.textContent = 'LOSE...'; global.Sound.lose(); }

      let rows = '';
      if (res.reason === 'friend') {
        rows = `
          <div class="row"><span>🌸 P1 スコア</span><b>${res.friendScores.p1}</b></div>
          <div class="row"><span>💙 P2 スコア</span><b>${res.friendScores.p2}</b></div>
          <div class="row"><span>勝者</span><b>${win === 1 ? 'P1' : win === 2 ? 'P2' : 'ひきわけ'}</b></div>`;
      } else {
        rows = `
          <div class="row"><span>🎨 あなたの縄張り</span><b>${Math.round(res.t1 * 100)}%</b></div>
          <div class="row"><span>🎨 相手の縄張り</span><b>${Math.round(res.t2 * 100)}%</b></div>
          <div class="row"><span>❤️ 残りHP</span><b>${Math.round(res.hp1)}</b></div>
          <div class="row"><span>結果</span><b>${res.reason === 'ko' ? 'ノックアウト!' : 'タイムアップ'}</b></div>`;
      }
      stats.innerHTML = rows;
      this.show('result');
    },
  };

  global.UI = UI;
})(window);
