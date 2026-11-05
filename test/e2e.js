const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message + '\n' + e.stack));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  const html = fs.readFileSync('rock-crusher.html', 'utf8');
  await p.setContent('<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>' + html + '</body></html>');
  await p.waitForTimeout(1200); await p.screenshot({ path: 'shots/0intro.png' });
  await p.waitForTimeout(2500); await p.screenshot({ path: 'shots/1title.png' });
  await p.click('#bNew'); await p.waitForTimeout(300); await p.screenshot({ path: 'shots/2new.png' });
  await p.click('#bGo'); await p.waitForTimeout(400); await p.screenshot({ path: 'shots/3office.png' });
  for (const t of ['ordre','verksted','utstyr','bank','hb']) { await p.click(`[data-t="${t}"]`); await p.waitForTimeout(150); await p.screenshot({ path: `shots/4tab_${t}.png`, fullPage: false }); }
  await p.click('[data-t="ordre"]'); const acc = await p.$('[data-acc]'); if (acc) await acc.click();
  await p.click('#bShift'); await p.waitForTimeout(600);
  await p.click('#tAuto');
  for (let i = 0; i < 6; i++) { await p.waitForTimeout(4000); await p.screenshot({ path: `shots/5shift_${i}.png` }); }
  // try a sledge swing at the mouth
  const box = await p.$eval('#cv', c => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const st = await p.evaluate(() => 0);
  await p.mouse.move(box.x + box.w * 0.55, box.y + box.h * 0.2); await p.mouse.down(); await p.waitForTimeout(500);
  await p.screenshot({ path: 'shots/6aim.png' }); await p.mouse.up(); await p.waitForTimeout(120); await p.screenshot({ path: 'shots/7swing.png' });
  await p.waitForTimeout(1500);
  await p.keyboard.press('p'); await p.waitForTimeout(200); await p.screenshot({ path: 'shots/8pause.png' });
  await p.click('#bEnd'); await p.waitForTimeout(400); await p.screenshot({ path: 'shots/9report.png' });
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
