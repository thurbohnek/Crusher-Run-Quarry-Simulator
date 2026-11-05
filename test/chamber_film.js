// film the chamber: node test/chamber_film.js <tier> <css> <frames>
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const tier = +(process.argv[2] || 1), css = +(process.argv[3] || 160), N = +(process.argv[4] || 16);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 1 }); await p.addInitScript(() => { window.RC_NOTOUR = 1; });
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate(([tier, css]) => { const s = Career.newGame('T'); s.tut = { coachOffice: 1, coachShift: 1 }; s.tier = tier; s.day = 27; s.css = css; s.autoFeed = true; s.up.loader = 1; s.up.vfd = true; s.feedMm = 420; s.up.breaker = 1; s.up.hydro = true; s.speed = 2; Career.store(s); }, [tier, css]);
  await p.reload(); await p.click('#intro', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(500); await p.click('#bCont'); await p.click('#bShift');
  await p.waitForTimeout(15000);
  for (let i = 0; i < N; i++) { await p.screenshot({ path: `shots/film_${String(i).padStart(2, '0')}.png`, clip: { x: 0, y: 60, width: 405, height: 380 } }); await p.waitForTimeout(700); }
  await b.close();
})();
