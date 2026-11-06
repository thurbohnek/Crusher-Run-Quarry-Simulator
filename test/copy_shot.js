const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync('rock-crusher.html', 'utf8') }));
  await p.goto('http://test.local/'); await p.click('#intro', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(1500);
  await p.screenshot({ path: 'shots/copy_title.png' });
  await p.click('#bSet'); await p.waitForTimeout(300);
  await p.evaluate(() => { const h = [...document.querySelectorAll('h3')].find(e => e.textContent === 'About'); h && h.scrollIntoView(); });
  await p.screenshot({ path: 'shots/copy_set.png' }); console.log(errs.join('\n') || 'no errors'); await b.close();
})();
