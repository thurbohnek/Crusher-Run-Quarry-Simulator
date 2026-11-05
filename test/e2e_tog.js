const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 } }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/'); await p.click('#intro'); await p.waitForTimeout(500);
  await p.click('#bNew'); await p.click('#bGo'); await p.evaluate(() => { const s = Career.load(); s.tut = { coachOffice: 1, coachShift: 1 }; Career.store(s); }); await p.click('#coachSkip').catch(() => {}); await p.click('#bShift');
  await p.evaluate(() => { const st = Sim.prototype.step; Sim.prototype.step = function (dt) { window.__sim = this; return st.call(this, dt); }; });
  await p.waitForTimeout(1500);
  const log = async (tag) => console.log(tag, await p.$eval('#hClock', e => e.textContent), '|', await p.$eval('#hState', e => e.textContent), '|', await p.$eval('#tMotorName', e => e.textContent), await p.$eval('#tMotorSub', e => e.textContent));
  await log('before');
  await p.evaluate(() => __sim.event('toggle'));
  for (let i = 0; i < 6; i++) { await p.waitForTimeout(1000); await log('t+' + (i + 1)); }
  await p.screenshot({ path: 'shots/tog.png' });
  await p.click('#tMotor'); await p.waitForTimeout(500); await log('started');
  // trip + clearing
  await p.evaluate(() => __sim.event('trip')); await p.waitForTimeout(600); await log('trip');
  await p.click('#tFeed'); for (let i = 0; i < 6; i++) { await p.waitForTimeout(1000); await log('clear+' + (i + 1)); }
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
