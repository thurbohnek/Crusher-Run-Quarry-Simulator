const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const tier = +(process.argv[2] || 3);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message + '\n' + e.stack));
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate((tier) => { const s = Career.newGame('Test AS'); s.tut = Object.assign({ coachOffice: 1, coachShift: 1 }, s.tut); s.tier = tier; s.css = [70, 110, 150, 200][tier]; s.up.breaker = tier >= 2 ? 1 : 0; s.up.hydro = tier >= 1; s.up.magnet = true; s.up.sikt = tier >= 2; s.up.loader = Math.min(2, tier); s.money = 2e6; s.day = 60; Career.genOffers(s); Career.store(s); }, tier);
  await p.reload(); await p.click('#intro'); await p.waitForTimeout(600); await p.click('#bCont'); await p.waitForTimeout(300);
  await p.screenshot({ path: `shots/t${tier}_office.png` });
  await p.click('#bShift'); await p.click('#tAuto');
  for (let i = 0; i < 3; i++) { await p.waitForTimeout(5000); await p.screenshot({ path: `shots/t${tier}_shift${i}.png` }); }
  // breaker hold on the mouth
  await p.mouse.move(230, 190); await p.mouse.down(); await p.waitForTimeout(1500); await p.screenshot({ path: `shots/t${tier}_breaker.png` }); await p.mouse.up();
  const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); } requestAnimationFrame(f); }));
  console.log('fps', fps); console.log(errs.join('\n') || 'no errors'); await b.close();
})();
