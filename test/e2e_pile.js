const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/'); await p.click('#intro'); await p.waitForTimeout(400); await p.click('#bNew'); await p.click('#bGo'); await p.evaluate(() => { const s = Career.load(); s.tut = { coachOffice: 1, coachShift: 1 }; Career.store(s); }); await p.click('#coachSkip').catch(() => {}); await p.click('#bShift'); await p.click('#tAuto'); await p.evaluate(() => { const st = Sim.prototype.step; Sim.prototype.step = function (dt) { window.__sim = this; return st.call(this, dt); }; });
  await p.waitForTimeout(1000); await p.screenshot({ path: 'shots/pl_0.png' });
  await p.mouse.move(60, 500); for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 200); await p.waitForTimeout(50); }
  await p.waitForTimeout(500); await p.screenshot({ path: 'shots/pl_1.png' });
  for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, 200); await p.waitForTimeout(50); }
  await p.waitForTimeout(20000); await p.evaluate(() => Render.panBy(__sim, 300, 0)); await p.waitForTimeout(300); await p.screenshot({ path: 'shots/pl_2.png' });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
