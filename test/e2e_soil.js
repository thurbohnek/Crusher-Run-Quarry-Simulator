const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); const errs = [];
  await p.addInitScript(() => { window.RC_NOTOUR = 1; });
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate(() => { const s = Career.newGame('Test Ltd'); s.tier = 0; Career.store(s);
    const o = Sim.prototype.callLoader; Sim.prototype.callLoader = function (...a) { const r = o.apply(this, a); if (r && !this.demo) this.loader.soil = 0.36; return r; }; });
  await p.reload();
  await p.evaluate(() => { const o = Sim.prototype.callLoader; Sim.prototype.callLoader = function (...a) { const r = o.apply(this, a); if (r && !this.demo) this.loader.soil = 0.36; return r; }; });
  await p.click('#intro'); await p.waitForTimeout(400); await p.click('#bCont'); await p.click('#bShift'); await p.waitForTimeout(800);
  await p.evaluate(() => { window.__rcSim().forceSoil = 0.36; });
  await p.evaluate(() => { const sim = window.__rcSim(), F = Machine.G.FEED; const c = Render.camBase(sim); Render.panBy(sim, (c.cx - (F.x1 - 700)) * c.Z, (c.cy - (F.y1 - 150)) * c.Z); Render.zoomAt(sim, 360, 640, 0.75); });
  await p.click('#tFeed'); 
  for (const t of [2600, 1200, 2500]) { await p.waitForTimeout(t); await p.screenshot({ path: `shots/soil_${t}.png` }); }
  await p.evaluate(() => { const s = Career.load(); window.__rcSim().save.feedLv = 0; }); await p.click('#fMinus'); await p.click('#fMinus'); await p.click('#fMinus'); await p.waitForTimeout(500); await p.screenshot({ path: 'shots/soil_jaw.png' });
  await p.click('#tHammer'); await p.evaluate(() => { const sim = window.__rcSim(); const c = Render.camBase(sim); const l = sim.rocks.filter(b => b.rock.mat.soil && !b.rock.passed).sort((a, b) => Math.hypot(a.x - c.cx, a.y - c.cy) / a.rock.rad - Math.hypot(b.x - c.cx, b.y - c.cy) / b.rock.rad)[0]; window.__hit = l && [l.x | 0, l.y | 0, l.rock.rad | 0]; if (l) { sim.strike(l, l.x, l.y - l.rock.rad * 0.6, 300, 'sledge'); } });
  await p.waitForTimeout(150); await p.screenshot({ path: 'shots/soil_hit.png' }); await p.waitForTimeout(1200); await p.screenshot({ path: 'shots/soil_hit2.png' });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
