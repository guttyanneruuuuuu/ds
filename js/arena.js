/* =========================================================
   arena.js — 独自要素「ブルーム（開花）バトル」の心臓部
   フィールドをグリッドで管理し、各セルの「塗り主」と「開花量」を保持。
   ・歩くと足元が自分の色に染まる（既存色は上書きで奪える）
   ・縄張り（塗った割合）が広いほどステータス強化
   ・塗られたセルからは花が咲き、見た目も賑やかに
   ========================================================= */
(function (global) {
  'use strict';

  const FLOWER_EMOJI = ['🌸', '🌼', '🌷', '🌺', '🏵️', '💐', '🌻', '❀'];

  class Arena {
    constructor(w, h, cell = 34) {
      this.cell = cell;
      this.resize(w, h);
    }

    resize(w, h) {
      this.w = w; this.h = h;
      this.cols = Math.ceil(w / this.cell);
      this.rows = Math.ceil(h / this.cell);
      const n = this.cols * this.rows;
      // owner: 0=未塗り, 1=P1, 2=P2
      this.owner = new Uint8Array(n);
      this.level = new Float32Array(n);   // 0..1 開花量（演出/上書き耐性）
      this.flower = new Uint8Array(n);     // 花の種類インデックス
      this.counts = [0, 0, 0];             // [未,P1,P2] セル数キャッシュ
      this.counts[0] = n;
      this.total = n;
      this._dirty = true;
    }

    idx(cx, cy) { return cy * this.cols + cx; }
    inBounds(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows; }

    // ワールド座標を半径rで塗る
    paint(x, y, owner, radius = 1) {
      const ccx = Math.floor(x / this.cell);
      const ccy = Math.floor(y / this.cell);
      let changed = false;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius + radius) continue;
          const cx = ccx + dx, cy = ccy + dy;
          if (!this.inBounds(cx, cy)) continue;
          const i = this.idx(cx, cy);
          const prev = this.owner[i];
          if (prev === owner) {
            this.level[i] = Math.min(1, this.level[i] + 0.04);
          } else {
            // 上書き：相手の開花量を削りながら奪う
            if (prev !== 0) {
              this.level[i] -= 0.10;
              if (this.level[i] > 0) continue; // まだ相手のもの
            }
            // 奪取成立
            this.counts[prev]--;
            this.counts[owner]++;
            this.owner[i] = owner;
            this.level[i] = 0.2;
            this.flower[i] = (FLOWER_EMOJI.length * Math.random()) | 0;
            changed = true;
          }
        }
      }
      if (changed) this._dirty = true;
      return changed;
    }

    territory(owner) {
      return this.counts[owner] / this.total;
    }

    // セル中心ワールド座標
    cellCenter(cx, cy) {
      return { x: cx * this.cell + this.cell / 2, y: cy * this.cell + this.cell / 2 };
    }

    // 指定座標の所有者
    ownerAt(x, y) {
      const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
      if (!this.inBounds(cx, cy)) return 0;
      return this.owner[this.idx(cx, cy)];
    }

    // 自陣の重心（AIが縄張りを広げる目標に使う）
    centroid(owner) {
      let sx = 0, sy = 0, c = 0;
      for (let cy = 0; cy < this.rows; cy++) {
        for (let cx = 0; cx < this.cols; cx++) {
          if (this.owner[this.idx(cx, cy)] === owner) {
            sx += cx; sy += cy; c++;
          }
        }
      }
      if (c === 0) return null;
      return { x: (sx / c) * this.cell + this.cell / 2, y: (sy / c) * this.cell + this.cell / 2 };
    }

    // 最も近い「自分以外/未塗り」セルを探す（塗り広げ目標）
    nearestUnclaimed(x, y, owner, maxR = 14) {
      const ox = Math.floor(x / this.cell), oy = Math.floor(y / this.cell);
      for (let r = 1; r <= maxR; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const cx = ox + dx, cy = oy + dy;
            if (!this.inBounds(cx, cy)) continue;
            if (this.owner[this.idx(cx, cy)] !== owner) {
              return this.cellCenter(cx, cy);
            }
          }
        }
      }
      return null;
    }

    // ===== 描画 =====
    // colors: { 1:{base,light}, 2:{base,light} }
    draw(ctx, colors) {
      const c = this.cell;
      for (let cy = 0; cy < this.rows; cy++) {
        for (let cx = 0; cx < this.cols; cx++) {
          const i = this.idx(cx, cy);
          const o = this.owner[i];
          if (o === 0) continue;
          const col = colors[o];
          const lv = this.level[i];
          ctx.fillStyle = col.base;
          ctx.globalAlpha = 0.55 + lv * 0.35;
          ctx.fillRect(cx * c, cy * c, c + 0.6, c + 0.6);
          ctx.globalAlpha = 1;
        }
      }
    }

    // 花（高開花セルにだけ咲かせて軽量化）
    drawFlowers(ctx) {
      const c = this.cell;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.floor(c * 0.7)}px serif`;
      for (let cy = 0; cy < this.rows; cy++) {
        for (let cx = 0; cx < this.cols; cx++) {
          const i = this.idx(cx, cy);
          if (this.owner[i] !== 0 && this.level[i] > 0.7) {
            ctx.globalAlpha = (this.level[i] - 0.7) / 0.3;
            ctx.fillText(FLOWER_EMOJI[this.flower[i]], cx * c + c / 2, cy * c + c / 2);
          }
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  global.Arena = Arena;
})(window);
