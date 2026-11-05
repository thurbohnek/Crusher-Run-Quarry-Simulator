const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate(() => { const s = Career.newGame('Test Ltd'); s.tut = Object.assign({ coachOffice: 1, coachShift: 1 }, s.tut); s.tier = 1; s.css = 110; s.up.sikt = true; s.up.hydro = true; s.up.vfd = true; s.up.early = true; s.pileT = 0; Career.genOffers(s); Career.store(s); });
  await p.reload(); await p.click('#intro'); await p.waitForTimeout(400); await p.click('#bCont');
  await p.click('[data-t="ordre"]'); await p.click('[data-od]'); await p.waitForTimeout(200); await p.screenshot({ path: 'shots/n_detail.png' });
  await p.click('#bOdBack'); await p.click('[data-t="set"]'); await p.click('[data-cur="EUR"]'); await p.screenshot({ path: 'shots/n_set.png' });
  await p.click('#bShift'); await p.waitForTimeout(2500); await p.screenshot({ path: 'shots/n_shift0.png' });
  await p.click('#cMinus'); await p.click('#cMinus'); await p.waitForTimeout(3000); await p.screenshot({ path: 'shots/n_shift1.png' });
  await p.click('#bView'); await p.waitForTimeout(25000); await p.screenshot({ path: 'shots/n_over.png' });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
