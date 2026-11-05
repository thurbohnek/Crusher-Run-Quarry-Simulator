const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width"></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate(() => { const s = Career.newGame('Test AS'); s.tut = Object.assign({ coachOffice: 1, coachShift: 1 }, s.tut); s.tier = 1; s.css = 110; s.weather = 0; Career.store(s); });
  await p.reload(); await p.tap('#intro'); await p.waitForTimeout(500); await p.tap('#bCont'); await p.tap('#bShift');
  await p.waitForTimeout(800);
  const cdp = await p.context().newCDPSession(p);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i })) });
  const pinch = async (d0, d1) => { const cx = 200, cy = 400; await T('touchStart', [[cx - d0, cy], [cx + d0, cy]]); for (let k = 1; k <= 10; k++) { const d = d0 + (d1 - d0) * k / 10; await T('touchMove', [[cx - d, cy], [cx + d, cy]]); await p.waitForTimeout(16); } await T('touchEnd', []); };
  await p.screenshot({ path: 'shots/pi_0.png' });
  await pinch(120, 40); await p.waitForTimeout(500); await p.screenshot({ path: 'shots/pi_1.png' });
  await pinch(40, 150); await p.waitForTimeout(500); await p.screenshot({ path: 'shots/pi_2.png' });
  // one finger pan
  await T('touchStart', [[200, 400]]); for (let k = 1; k <= 10; k++) { await T('touchMove', [[200 + k * 10, 400 + k * 6]]); await p.waitForTimeout(16); } await T('touchEnd', []);
  await p.waitForTimeout(500); await p.screenshot({ path: 'shots/pi_3.png' });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
