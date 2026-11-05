const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const tier = +(process.argv[2] || 0);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate((tier) => { const s = Career.newGame('Test AS'); s.tut = Object.assign({ coachOffice: 1, coachShift: 1 }, s.tut); s.tier = tier; s.css = [70, 110, 150, 200][tier]; s.weather = 0; Career.store(s); }, tier);
  await p.reload(); await p.click('#intro'); await p.waitForTimeout(500); await p.click('#bCont'); await p.click('#bShift');
  await p.click('#tFeed'); await p.waitForTimeout(900); await p.screenshot({ path: `shots/z${tier}_dump.png` });
  await p.waitForTimeout(2500);
  // sledge aim on the mouth
  await p.mouse.move(200, 230); await p.mouse.down(); await p.waitForTimeout(600); await p.screenshot({ path: `shots/z${tier}_aim.png` }); await p.mouse.up(); await p.waitForTimeout(80); await p.screenshot({ path: `shots/z${tier}_hit.png` });
  // zoom out with the wheel and dump again
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 200); await p.waitForTimeout(50); }
  await p.waitForTimeout(700); await p.click('#tFeed'); await p.waitForTimeout(800); await p.screenshot({ path: `shots/z${tier}_out.png` });
  for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, -200); await p.waitForTimeout(50); }
  await p.waitForTimeout(800); await p.screenshot({ path: `shots/z${tier}_in.png` });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
