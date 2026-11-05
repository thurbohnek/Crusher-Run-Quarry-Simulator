// CPU profile of the running game: self time per function
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const tier = +(process.argv[2] || 0), secs = +(process.argv[3] || 12);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); await p.addInitScript(() => { window.RC_NOTOUR = 1; });
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate((tier) => { const s = Career.newGame('T'); s.tut = { coachOffice: 1, coachShift: 1 }; s.tier = tier; s.day = 3; s.css = [70, 110, 150, 200][tier]; s.autoFeed = true; if (tier >= 2) Object.assign(s.up, { sikt: true, kjegle: true, scalper: true, loader: 2, breaker: 2 }); Career.store(s); }, tier);
  await p.reload(); await p.click('#intro', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(500); await p.click('#bCont'); await p.click('#bShift');
  await p.waitForTimeout(3000);
  if (process.env.ALL) await p.evaluate(() => { const s = window.__rcSim(); s.pileT = 600; Render.showAll(s); });
  await p.evaluate(() => { window.__fr = 0; const f = Render.frame; Render.frame = function (...a) { window.__fr++; return f.apply(this, a); }; });
  const cdp = await p.context().newCDPSession(p); await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
  await p.waitForTimeout(secs * 1000);
  const { profile } = await cdp.send('Profiler.stop'); const fr = await p.evaluate(() => window.__fr);
  const self = {}, byId = {}; for (const n of profile.nodes) byId[n.id] = n;
  const dt = {}; for (let i = 0; i < profile.samples.length; i++) dt[profile.samples[i]] = (dt[profile.samples[i]] || 0) + (profile.timeDeltas[i] || 0);
  let tot = 0; for (const id in dt) { const n = byId[id], k = (n.callFrame.functionName || '(anon)') + ':' + n.callFrame.lineNumber; self[k] = (self[k] || 0) + dt[id] / 1000; tot += dt[id] / 1000; }
  console.log('fps', (fr / secs).toFixed(1), 'total ms', tot.toFixed(0));
  Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(v.toFixed(0).padStart(6), (v / tot * 100).toFixed(1).padStart(5) + '%', k));
  await b.close();
})();
