const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  const lights = process.argv[2] === 'lights';
  await p.evaluate((lights) => { const s = Career.newGame('Test Ltd'); s.tut = Object.assign({ coachOffice: 1, coachShift: 1 }, s.tut); s.tier = 0; s.day = 178; s.tut = { coachOffice: 1, coachShift: 1 }; s.up.lights = lights; s.up.autogrease = true; Career.store(s); console.log('month', Career.month(s.day), Career.dateStr(s.day)); }, lights);
  await p.reload(); await p.click('#intro'); await p.waitForTimeout(400); await p.click('#bCont'); await p.waitForTimeout(300); await p.screenshot({ path: `shots/d_office_${lights}.png` });
  await p.click('#bShift'); await p.waitForTimeout(1500); await p.click('#tFeed'); await p.waitForTimeout(6000); await p.screenshot({ path: `shots/d_shift_${lights}.png` });
  await p.click('#bView'); await p.waitForTimeout(700); await p.screenshot({ path: `shots/d_all_${lights}.png` });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
