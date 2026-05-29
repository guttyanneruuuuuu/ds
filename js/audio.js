/* =========================================================
   audio.js — WebAudio による軽量サウンドエンジン
   外部ファイル不要。明るくポップな効果音をその場で合成。
   ========================================================= */
(function (global) {
  'use strict';

  const Sound = {
    ctx: null,
    master: null,
    musicGain: null,
    enabled: true,
    _musicTimer: null,
    _musicStep: 0,

    init() {
      if (this.ctx) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
    },

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    // 基本トーン
    tone(freq, dur = 0.12, type = 'sine', vol = 0.4, when = 0, glideTo = null) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + dur + 0.02);
    },

    // ノイズ（塗り・着地など）
    noise(dur = 0.15, vol = 0.25, hp = 800) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const filt = this.ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = hp;
      const g = this.ctx.createGain(); g.gain.value = vol;
      src.connect(filt); filt.connect(g); g.connect(this.master);
      src.start(t);
    },

    // === SE プリセット ===
    tap()    { this.tone(660, 0.08, 'triangle', 0.3); },
    select() { this.tone(523, 0.09, 'triangle', 0.35); this.tone(784, 0.12, 'sine', 0.3, 0.05); },
    back()   { this.tone(440, 0.1, 'sine', 0.3, 0, 280); },
    attack() { this.tone(300, 0.07, 'square', 0.18); this.noise(0.08, 0.18, 1500); },
    hit()    { this.tone(180, 0.12, 'sawtooth', 0.28, 0, 90); this.noise(0.1, 0.22, 600); },
    dash()   { this.noise(0.18, 0.2, 1200); this.tone(500, 0.18, 'sine', 0.18, 0, 900); },
    paint()  { this.tone(700 + Math.random()*200, 0.05, 'sine', 0.08); },
    special(){ for(let i=0;i<5;i++) this.tone(523*Math.pow(2,i/12*3), 0.18, 'triangle', 0.25, i*0.05, null); },
    bloom()  { this.tone(659,0.15,'sine',0.3); this.tone(880,0.2,'sine',0.3,0.08); this.tone(1046,0.3,'sine',0.3,0.16); },
    countdown(){ this.tone(880,0.12,'square',0.3); },
    go()     { this.tone(1046,0.3,'triangle',0.4); this.tone(1318,0.4,'sine',0.3,0.1); },
    win()    { [523,659,784,1046].forEach((f,i)=>this.tone(f,0.3,'triangle',0.35,i*0.12)); },
    lose()   { [523,440,349,294].forEach((f,i)=>this.tone(f,0.3,'sine',0.3,i*0.14)); },

    // === BGM（軽快なアルペジオ・ループ） ===
    startMusic() {
      if (!this.enabled || !this.ctx || this._musicTimer) return;
      // 明るいメジャー進行 C - Am - F - G
      const chords = [
        [523.25, 659.25, 783.99],   // C
        [440.00, 523.25, 659.25],   // Am
        [349.23, 440.00, 523.25],   // F
        [392.00, 493.88, 587.33],   // G
      ];
      const bpm = 132;
      const beat = 60 / bpm;
      const step = () => {
        const ch = chords[Math.floor(this._musicStep / 4) % chords.length];
        const note = ch[this._musicStep % 3];
        this._mtone(note, beat * 0.9, 'triangle', 0.5);
        if (this._musicStep % 4 === 0) this._mtone(ch[0] / 2, beat * 1.6, 'sine', 0.5); // bass
        this._musicStep++;
      };
      step();
      this._musicTimer = setInterval(step, beat * 1000);
    },
    _mtone(freq, dur, type, vol) {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * 0.3, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(this.musicGain);
      osc.start(t); osc.stop(t + dur + 0.02);
    },
    stopMusic() {
      if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    },
  };

  global.Sound = Sound;
})(window);
