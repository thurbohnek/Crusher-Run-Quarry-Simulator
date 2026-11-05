const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message + e.stack));
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.setContent('<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>');
  await p.waitForTimeout(4000);
  await p.evaluate(() => { document.getElementById('ovMain').style.display = 'none'; });
  for (let i = 0; i < 3; i++) { await p.waitForTimeout(3000); await p.screenshot({ path: `shots/view${i}.png` }); }
  console.log(errs.join('\n') || 'ok'); await b.close();
})();
