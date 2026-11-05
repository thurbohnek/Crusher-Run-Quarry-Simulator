const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate(() => { const s = Career.newGame('T'); s.tut = Object.assign({ coachOffice: 1, coachShift: 1 }, s.tut); s.guard = 0.3; Career.store(s); });
  await p.reload(); await p.click('#intro'); await p.waitForTimeout(400); await p.click('#bCont'); await p.click('[data-t="verksted"]'); await p.waitForTimeout(200);
  const card = await p.$eval('#bGuard', e => e.textContent); console.log('workshop button:', card);
  await p.click('[data-t="oversikt"]'); await p.click('#bShift'); await p.waitForTimeout(800); await p.screenshot({ path: 'shots/guard.png' });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
