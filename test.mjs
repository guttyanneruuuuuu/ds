import { chromium } from 'playwright';
import fs from 'fs';

const URL = 'http://localhost:8000/index.html';
fs.mkdirSync('test-shots', { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, // iPhone風
  deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

// boot解放
await page.locator('#boot').click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'test-shots/01-title.png' });

// AI対戦
await page.locator('[data-mode="ai"]').click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'test-shots/02-select.png' });

// キャラ選択（最初のカード）
await page.locator('.char-card').first().click();
await page.waitForTimeout(300);
await page.locator('#btn-start').click();
await page.waitForTimeout(4000); // カウントダウン+プレイ開始
await page.screenshot({ path: 'test-shots/03-game-start.png' });

// 移動シミュレート：スティックをドラッグ
const stick = await page.locator('#stick-base').boundingBox();
if (stick) {
  const cx = stick.x + stick.width/2, cy = stick.y + stick.height/2;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 0; i < 30; i++) {
    const a = i / 5;
    await page.mouse.move(cx + Math.cos(a)*40, cy + Math.sin(a)*40);
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
}
// 攻撃連打
for (let i = 0; i < 5; i++) {
  await page.locator('#btn-attack').click({ force: true });
  await page.waitForTimeout(200);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: 'test-shots/04-game-mid.png' });

// 状態確認
const state = await page.evaluate(() => ({
  phase: window.UI?.game?.phase,
  t1: window.UI?.game?.arena?.territory(1),
  t2: window.UI?.game?.arena?.territory(2),
  hp1: window.UI?.game?.p1?.hp,
  hp2: window.UI?.game?.p2?.hp,
  particles: window.UI?.game?.particles?.length,
}));
console.log('GAME STATE:', JSON.stringify(state));

console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
