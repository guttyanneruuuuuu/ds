/* =========================================================
   main.js — 起動エントリ
   ========================================================= */
(function (global) {
  'use strict';

  function boot() {
    global.Input.init();
    global.UI.init();
    global.UI.show('title');

    const bootEl = document.getElementById('boot');
    const unlock = () => {
      global.Sound.init();
      global.Sound.resume();
      global.Sound.startMusic();
      // タイトルに戻ったらBGMを止める設計ではなく常時。ゲーム側で上書き。
      bootEl.classList.add('hide');
      setTimeout(() => bootEl.style.display = 'none', 500);
      bootEl.removeEventListener('click', unlock);
      bootEl.removeEventListener('touchstart', unlock);
    };
    bootEl.addEventListener('click', unlock);
    bootEl.addEventListener('touchstart', unlock, { passive: true });

    // 画面の二重タップズーム防止
    let lastTouch = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouch < 300) e.preventDefault();
      lastTouch = now;
    }, { passive: false });

    // 画面回転/リサイズ時の再計算は各Gameが処理
    console.log('🌸 Bloom Brawl ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
