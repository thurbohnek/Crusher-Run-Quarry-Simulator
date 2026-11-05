const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/'); await p.click('#intro'); await p.waitForTimeout(500); await p.click('#bNew'); await p.click('#bGo'); await p.click('#bShift');
  await p.evaluate(() => { const st = Sim.prototype.step; Sim.prototype.step = function (dt) { window.__sim = this; return st.call(this, dt); }; });
  await p.waitForTimeout(300); await p.mouse.move(200, 300);
  const cam = () => p.evaluate(() => JSON.stringify(Render.camFor(__sim)));
  console.log('start', await cam());
  for (let i = 0; i < 6; i++) await p.mouse.wheel(0, 200); await p.waitForTimeout(200); console.log('out', await cam());
  for (let i = 0; i < 12; i++) await p.mouse.wheel(0, -200); await p.waitForTimeout(200); console.log('in', await cam());
  await b.close();
})();
