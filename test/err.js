const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message, e.stack.split('\n')[1]));
  await p.route(/fonts/, r => r.abort());
  await p.setContent('<!doctype html><html><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>'); await p.waitForTimeout(1500); await b.close(); })();
