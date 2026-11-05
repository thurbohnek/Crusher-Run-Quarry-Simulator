const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const zoomSteps = +(process.argv[2] || 4), tier = +(process.argv[3] || 0);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate((tier) => { const s = Career.newGame('Test AS'); s.tut = Object.assign({ coachOffice: 1, coachShift: 1 }, s.tut); s.tier = tier; s.css = [70, 110, 150, 200][tier]; s.seed = 5; Career.store(s); }, tier);
  await p.reload(); await p.click('#intro'); await p.waitForTimeout(500); await p.click('#bCont'); await p.click('#bShift');
  await p.mouse.move(200, 360); for (let i = 0; i < zoomSteps; i++) { await p.mouse.wheel(0, 200); await p.waitForTimeout(60); }
  await p.waitForTimeout(400); await p.click('#tFeed'); await p.waitForTimeout(1500); await p.screenshot({ path: `shots/sc_${tier}_${zoomSteps}_a.png` });
  await p.waitForTimeout(3500); await p.screenshot({ path: `shots/sc_${tier}_${zoomSteps}_b.png` });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
