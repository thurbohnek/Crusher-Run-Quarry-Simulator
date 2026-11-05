// screenshots for the look: node test/shot.js <name> <tier> '<json save patch>' <secs>
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const name = process.argv[2] || 'look', tier = +(process.argv[3] || 0), patch = JSON.parse(process.argv[4] || '{}'), secs = +(process.argv[5] || 20);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate(([tier, patch]) => { const s = Career.newGame('Test AS'); s.tut = Object.assign({ coachOffice: 1, coachShift: 1 }, s.tut); s.tier = tier; s.css = [70, 110, 150, 200][tier]; s.seed = 5; s.autoFeed = true;
    for (const k in patch) { if (k === 'up') Object.assign(s.up, patch.up); else s[k] = patch[k]; } Career.store(s); }, [tier, patch]);
  await p.reload(); await p.click('#intro', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(500); await p.click('#bCont'); await p.click('#bShift');
  await p.waitForTimeout(1200); await p.click('#tFeed').catch(() => {});
  if (process.argv[6]) await p.evaluate(process.argv[6]);
  await p.waitForTimeout(secs * 1000 / 2);
  await p.screenshot({ path: `shots/${name}_a.png` });
  await p.waitForTimeout(secs * 1000 / 2);
  if (!process.env.NOALL) { await p.evaluate(() => Render.showAll(window.__rcSim())); await p.waitForTimeout(600); }
  await p.screenshot({ path: `shots/${name}_all.png` });
  if (process.env.TRUCK) { await p.evaluate(() => { const s = window.__rcSim(), g = s.trGeom(); Render.resetView(); }); }
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
