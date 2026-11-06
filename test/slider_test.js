const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2, hasTouch: true }); await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate(() => { const s = Career.newGame('T'); s.tut = { coachOffice: 1, coachShift: 1 }; s.up.vfd = true; s.feedMm = 100; Career.store(s); });
  await p.reload(); await p.click('#intro', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(400); await p.click('#bCont'); await p.click('#bShift'); await p.waitForTimeout(800);
  const r = await p.evaluate(() => { const b = document.getElementById('fSlW').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const val = () => p.evaluate(() => document.getElementById('fSl').value);
  // tap near the top edge of the box, off the knob (at the side)
  await p.mouse.move(r.x + r.w - 3, r.y + r.h * 0.2); await p.mouse.down(); console.log('tap at 20% from top ->', await val());
  await p.mouse.move(r.x + 4, r.y + r.h * 0.7, { steps: 5 }); console.log('drag to 70% ->', await val());
  await p.mouse.move(r.x + r.w / 2, r.y + r.h + 40, { steps: 5 }); console.log('drag below box ->', await val());
  await p.mouse.up(); console.log('saved', await p.evaluate(() => Career.load().feedMm));
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
