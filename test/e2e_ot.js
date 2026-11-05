const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync(process.argv[2], 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate(() => { const s = Career.newGame('Test AS'); s.tut = Object.assign({ coachOffice: 1, coachShift: 1 }, s.tut); s.tier = 1; s.css = 110; Career.store(s); });
  await p.reload(); await p.click('#intro'); await p.waitForTimeout(500); await p.click('#bCont'); await p.click('#bShift');
  await p.waitForTimeout(12000); await p.screenshot({ path: 'shots/ot_a.png' });
  await p.click('#bOtYes'); await p.waitForTimeout(3000); await p.screenshot({ path: 'shots/ot_b.png' });
  await p.click('#bOT'); await p.waitForTimeout(800); await p.screenshot({ path: 'shots/ot_c.png', fullPage: true });
  console.log(await p.evaluate(() => document.querySelector('#ovMain').innerText.slice(0, 900)));
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
