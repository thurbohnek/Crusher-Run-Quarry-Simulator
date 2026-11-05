const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 } }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/'); await p.click('#intro'); await p.waitForTimeout(400); await p.click('#bNew'); await p.click('#bGo'); await p.evaluate(() => { const s = Career.load(); s.tut = { coachOffice: 1, coachShift: 1 }; Career.store(s); }); await p.click('#coachSkip').catch(() => {}); await p.click('#bShift');
  await p.evaluate(() => { const st = Sim.prototype.step; Sim.prototype.step = function (dt) { window.__sim = this; return st.call(this, dt); }; });
  await p.waitForTimeout(300);
  const cam = () => p.evaluate(() => { const c = Render.camFor(__sim); return c.ox.toFixed(0) + ',' + c.oy.toFixed(0) + ' Z' + c.Z.toFixed(2); });
  console.log('start', await cam());
  await p.mouse.move(200, 400); await p.mouse.down(); await p.mouse.move(120, 300, { steps: 6 }); await p.mouse.up();
  console.log('after pan (no tool)', await cam());
  await p.click('#tHammer'); const c0 = await cam();
  await p.mouse.move(200, 250); await p.mouse.down(); await p.waitForTimeout(700); const c1 = await cam(); await p.mouse.up(); await p.waitForTimeout(700); const c2 = await cam();
  console.log('with sledge', c0, c1, c2, c0 === c1 && c1 === c2 ? 'STILL' : 'MOVED');
  await p.click('#tHammer'); console.log('hammer on?', await p.$eval('#tHammer', e => e.classList.contains('on')));
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
