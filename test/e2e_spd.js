const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 } }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/'); await p.click('#intro'); await p.waitForTimeout(500);
  await p.click('#bNew'); await p.click('#bGo'); await p.evaluate(() => { const s = Career.load(); s.tut = { coachOffice: 1, coachShift: 1 }; Career.store(s); }); await p.click('#coachSkip').catch(() => {}); await p.click('#bShift');
  await p.waitForTimeout(10000); const c1 = await p.$eval('#hClock', e => e.textContent);
  await p.click('#bPause'); await p.screenshot({ path: 'shots/spd_pause.png' });
  await p.click('[data-spd="1"]'); await p.click('#bRes');
  await p.waitForTimeout(10000); const c2 = await p.$eval('#hClock', e => e.textContent);
  console.log('clock after 10s normal', c1, 'then +10s sanntid', c2, errs.join('\n') || 'no errors'); await b.close();
})();
