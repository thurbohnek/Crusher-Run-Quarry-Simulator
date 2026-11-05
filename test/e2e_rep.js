const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); const errs = [];
  await p.addInitScript(() => { window.RC_NOTOUR = 1; });
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync(process.argv[2], 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate(() => { const s = Career.newGame('Test Ltd'); s.tier = 1; s.css = 110; s.up.lights = true; Career.genOffers(s); Career.store(s); });
  await p.reload(); await p.click('#intro'); await p.waitForTimeout(400); await p.click('#bCont'); await p.click('#bShift');
  await p.click('#tFeed'); await p.waitForTimeout(14000); await p.screenshot({ path: 'shots/r_ot.png' });
  await p.click('#bOtNo').catch(() => {}); await p.waitForTimeout(600); await p.screenshot({ path: 'shots/r_rep.png', fullPage: true });
  await p.click('#bOff'); await p.waitForTimeout(300);
  await p.click('[data-t="bank"]'); await p.waitForTimeout(200); await p.evaluate(() => document.querySelector('.ov').scrollTop = 500); await p.screenshot({ path: 'shots/r_bank.png' });
  await p.click('[data-t="verksted"]'); await p.waitForTimeout(200); await p.evaluate(() => document.querySelector('.ov').scrollTop = 600); await p.screenshot({ path: 'shots/r_ws.png' });
  await p.click('[data-t="set"]'); await p.waitForTimeout(200); await p.evaluate(() => document.querySelector('.ov').scrollTop = 400); await p.screenshot({ path: 'shots/r_set.png' });
  await p.click('[data-t="utstyr"]'); await p.waitForTimeout(200); await p.evaluate(() => document.querySelector('.ov').scrollTop = 900); await p.screenshot({ path: 'shots/r_eq.png' });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
