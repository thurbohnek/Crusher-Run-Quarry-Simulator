const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const tier = +(process.argv[2] || 0);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); await p.addInitScript(() => { window.RC_NOTOUR = 1; });
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate((tier) => { const s = Career.newGame('Test AS'); s.tier = tier; s.css = [70, 110, 150, 200][tier]; if (tier >= 2) Object.assign(s.up, { sikt: true, hsi: true, scalper: true, loader: 2, breaker: 2 }); Career.store(s); }, tier);
  await p.reload(); await p.click('#intro', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(600); await p.click('#bCont'); await p.click('#bShift'); await p.click('#tAuto');
  await p.evaluate(() => { const f = Render.frame; window.__rt = []; Render.frame = function (...a) { const t = performance.now(); f.apply(this, a); window.__rt.push(performance.now() - t); }; const st = Sim.prototype.step; window.__st = []; Sim.prototype.step = function (dt) { const t = performance.now(); st.call(this, dt); window.__st.push(performance.now() - t); }; });
  await p.waitForTimeout(15000);
  const r = await p.evaluate(() => { const q = (a, k) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length * k)].toFixed(2); }; return { frames: __rt.length, renderMed: q(__rt, .5), render95: q(__rt, .95), stepMed: q(__st, .5), step95: q(__st, .95), steps: __st.length }; });
  console.log('tier', tier, JSON.stringify(r)); await b.close();
})();
