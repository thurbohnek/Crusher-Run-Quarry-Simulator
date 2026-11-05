const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/'); await p.click('#intro'); await p.waitForTimeout(500); await p.click('#bNew'); await p.click('#bGo'); await p.click('#bShift');
  await p.mouse.move(150, 300); for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, 200); await p.waitForTimeout(60); }
  await p.click('#tFeed');
  const shots = [];
  for (const t of [700, 1300, 1900, 2500, 3100]) { await p.waitForTimeout(t - (shots.length ? [700, 1300, 1900, 2500, 3100][shots.length - 1] : 0)); const f = `shots/ex_${shots.length}.png`; await p.screenshot({ path: f }); shots.push(f); }
  await p.waitForTimeout(1500);
  const box = await p.$eval('#cv', c => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await p.mouse.move(box.x + box.w * 0.52, box.y + box.h * 0.27); await p.mouse.down();
  for (const t of [150, 400, 750]) { await p.waitForTimeout(t === 150 ? 150 : t === 400 ? 250 : 350); await p.screenshot({ path: `shots/sw_c${t}.png` }); }
  await p.mouse.up();
  for (const t of [60, 140, 260, 450]) { await p.waitForTimeout(t === 60 ? 60 : t === 140 ? 80 : t === 260 ? 120 : 190); await p.screenshot({ path: `shots/sw_s${t}.png` }); }
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
