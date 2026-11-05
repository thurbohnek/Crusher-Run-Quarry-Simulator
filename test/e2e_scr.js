const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate((k) => { const s = Career.newGame('Test Ltd'); s.tut = Object.assign({ coachOffice: 1, coachShift: 1 }, s.tut); s.tier = 1; s.css = 110; s.up.sikt = true; s.up.kjegle = k; s.up.early = true; Career.store(s); }, process.argv[2] === 'k');
  await p.reload(); await p.click('#intro'); await p.waitForTimeout(400); await p.click('#bCont'); await p.click('#bShift');
  await p.click('#tFeed'); await p.waitForTimeout(30000);
  await p.click('#bView'); await p.waitForTimeout(800); await p.screenshot({ path: 'shots/s_all.png' });
  await p.mouse.move(60, 470); for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, -200); await p.waitForTimeout(60); } await p.waitForTimeout(600); await p.screenshot({ path: 'shots/s_zoom.png' });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
