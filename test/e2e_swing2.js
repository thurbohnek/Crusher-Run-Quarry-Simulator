const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/'); await p.click('#intro'); await p.waitForTimeout(400); await p.click('#bNew'); await p.click('#bGo'); await p.evaluate(() => { const s = Career.load(); s.tut = { coachOffice: 1, coachShift: 1 }; Career.store(s); }); await p.click('#coachSkip').catch(() => {}); await p.click('#bShift');
  await p.evaluate(() => { const st = Sim.prototype.step; Sim.prototype.step = function (dt) { window.__sim = this; return st.call(this, dt); }; });
  await p.waitForTimeout(300);
  await p.evaluate(() => { const s = __sim; const poly = Rocks.genBlockPoly(560 / 2 / s.mmpx, MATS.granitt, s.rng, 0); s.addRock(poly, 300, 150, 0.2, MATS.granitt, {}); });
  await p.waitForTimeout(2500);
  const pt = await p.evaluate(() => { const s = __sim; const b = s.rocks[0]; const c = Render.camFor(s); const r = document.getElementById('cv').getBoundingClientRect(); return { x: r.left + (c.ox + b.x * c.Z) / 720 * r.width, y: r.top + (c.oy + (b.y - b.rock.rad * 0.6) * c.Z) / 1280 * r.height }; });
  await p.mouse.move(pt.x, pt.y); await p.mouse.down();
  const seq = [['c1', 250], ['c2', 450], ['c3', 500], ]; for (const [n, w] of seq) { await p.waitForTimeout(w); await p.screenshot({ path: `shots/s2_${n}.png` }); }
  await p.mouse.up();
  for (const [n, w] of [['d1', 90], ['d2', 120], ['d3', 200], ['d4', 500], ['d5', 900]]) { await p.waitForTimeout(w); await p.screenshot({ path: `shots/s2_${n}.png` }); }
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
