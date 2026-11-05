const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const file = process.argv[2] || 'rock-crusher.html', dbg = process.argv[3] || '{}', tier = +(process.argv[4] || 0);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); await p.addInitScript((d) => { window.RC_NOTOUR = 1; window.RC_DBG = JSON.parse(d); }, dbg);
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync(file, 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate((tier) => { const s = Career.newGame('T'); s.tut = { coachOffice: 1, coachShift: 1 }; s.tier = tier; s.day = 3; s.css = [70, 110, 150, 200][tier]; s.autoFeed = true; Career.store(s); }, tier);
  await p.reload(); await p.click('#intro', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(500); await p.click('#bCont'); await p.click('#bShift');
  await p.waitForTimeout(4000);
  const n0 = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (window.RC_DBG.pan) Render.panBy(window.__rcSim(), (n % 120 < 60 ? 2 : -2), 0); if (performance.now() - t0 < 6000) requestAnimationFrame(f); else r(n / 6); }; requestAnimationFrame(f); }));
  const sp = await p.evaluate(() => [window.__sprN, Object.values({}).length]); console.log(file.split('/').pop(), dbg, 'fps', n0.toFixed(1), 'sprites built', sp[0]); await b.close();
})();
