const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/'); await p.click('#intro'); await p.waitForTimeout(400); await p.click('#bNew'); await p.click('#bGo'); await p.click('#bShift');
  await p.evaluate(() => { const st = Sim.prototype.step; Sim.prototype.step = function (dt) { window.__sim = this; return st.call(this, dt); }; });
  await p.click('#tFeed'); await p.waitForTimeout(600);
  console.log(await p.evaluate(() => JSON.stringify(__sim.loader.items.map(it => ({ mm: Math.round(it.mm), lx: Math.round(it.lx), ly: Math.round(it.ly), rad: Math.round(it.rad), cv: !!it.cv, cvk: it.cvk, out: !!it.out, thr: it.thr.toFixed(2) })))));
  console.log(await p.evaluate(() => JSON.stringify(__sim.exPose(__sim.loader.t))));
  await b.close();
})();
