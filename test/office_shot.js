const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate(() => { const s = Career.newGame('Test AS'); s.tut = { coachOffice: 1, coachShift: 1 }; s.tier = 2; s.money = 5e6; s.up.sikt = true; s.up.mobile = true; s.up.loader = 1; s.stats.days = 12; Career.store(s); });
  await p.reload(); await p.click('#intro', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(400); await p.click('#bCont');
  await p.click('[data-t="verksted"]'); await p.waitForTimeout(200); await p.screenshot({ path: 'shots/of_ws.png' });
  await p.click('#bBl_coarse'); await p.waitForTimeout(200); await p.screenshot({ path: 'shots/of_ws2.png' });
  await p.click('[data-t="utstyr"]'); await p.waitForTimeout(200); await p.screenshot({ path: 'shots/of_eq.png', fullPage: true });
  await p.evaluate(() => { const el = document.querySelector('.tabBody, #oBody, .office .body') || document.scrollingElement; }); 
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
