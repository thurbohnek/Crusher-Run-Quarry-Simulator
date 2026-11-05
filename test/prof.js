const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2.6 });
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/'); await p.click('#intro'); await p.waitForTimeout(500); await p.click('#bNew'); await p.click('#bGo'); await p.click('#bShift'); await p.click('#tAuto');
  await p.waitForTimeout(3000);
  const c = await p.context().newCDPSession(p); await c.send('Profiler.enable'); await c.send('Profiler.start');
  await p.waitForTimeout(8000);
  const { profile } = await c.send('Profiler.stop');
  const self = {}; const dt = profile.timeDeltas; const idIdx = {}; profile.nodes.forEach(n => idIdx[n.id] = n);
  profile.samples.forEach((id, i) => { const n = idIdx[id]; const k = n.callFrame.functionName + ':' + n.callFrame.lineNumber; self[k] = (self[k] || 0) + (dt[i] || 0); });
  const tot = Object.values(self).reduce((a, b) => a + b, 0);
  Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log((v / tot * 100).toFixed(1) + '%', k));
  await b.close();
})();
