const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/'); await p.click('#intro'); await p.waitForTimeout(400); await p.click('#bNew'); await p.click('#bGo'); await p.click('#bShift');
  await p.evaluate(() => { const st = Sim.prototype.step; Sim.prototype.step = function (dt) { window.__sim = this; return st.call(this, dt); }; });
  await p.waitForTimeout(300);
  await p.evaluate(() => { const s = __sim; const poly = Rocks.genBlockPoly(560 / 2 / s.mmpx, MATS.granitt, s.rng, 0); s.addRock(poly, 300, 150, 0.2, MATS.granitt, {}); });
  await p.waitForTimeout(2500);
  console.log(await p.evaluate(() => { const s = __sim, b = s.rocks[0]; const c = s.sledgeCheck(b.x); return JSON.stringify({ bx: b.x, by: b.y, rad: b.rock.rad, ok: c.ok, why: c.why, tg: c.tg && { x: c.tg.x, y: c.tg.y }, wp: s.workerPos(b.x), state: s.m.state, top: Machine.G.TOP }); }));
  await b.close();
})();
