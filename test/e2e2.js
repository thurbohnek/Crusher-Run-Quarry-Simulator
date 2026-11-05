const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 405, height: 720 } });
  const p = await ctx.newPage(); const errs = []; await p.addInitScript(() => { window.RC_NOTOUR = 1; });
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message + '\n' + e.stack));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/'); await p.click('#intro'); await p.waitForTimeout(700);
  await p.click('#bNew'); await p.click('#bGo'); await p.evaluate(() => { const s = Career.load(); s.tut = { coachOffice: 1, coachShift: 1 }; Career.store(s); }); await p.click('#coachSkip').catch(() => {});
  for (let day = 0; day < 3; day++) {
    await p.click('[data-t="verksted"]'); await p.click('#bGrease');
    if (day === 1) { await p.click('#bTurnM'); await p.click('#bTog'); await p.$eval('#iCss', e => { e.value = 60; e.dispatchEvent(new Event('input')); }); }
    await p.click('[data-t="ordre"]'); const a = await p.$('[data-acc]:not([disabled])'); if (a) await a.click();
    await p.click('[data-t="bank"]'); if (day === 2) await p.click('#bL1');
    await p.click('[data-t="utstyr"]'); await p.click('[data-t="oversikt"]');
    await p.click('#bShift'); await p.click('#tAuto');
    await p.waitForTimeout(6000);
    await p.click('#tMotor'); await p.waitForTimeout(500);   // stop
    await p.click('#tPry'); await p.mouse.move(200, 500); await p.mouse.down(); await p.mouse.move(220, 400, { steps: 5 }); await p.mouse.up();
    await p.click('#tFeed'); await p.waitForTimeout(5000);   // clear (Rydd)
    await p.click('#tMotor'); await p.waitForTimeout(2000);
    await p.keyboard.press('Escape'); await p.click('#bEnd'); await p.waitForTimeout(300);
    await p.screenshot({ path: `shots/r_day${day}.png` });
    await p.click('#bOff');
  }
  await p.reload(); await p.click('#intro'); await p.waitForTimeout(700);
  const cont = await p.$('#bCont'); console.log('continue button:', cont ? await cont.innerText() : 'MISSING');
  await p.screenshot({ path: 'shots/r_title.png' });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
