const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const p = await b.newPage({ viewport: { width: 405, height: 720 } }); if (!process.env.TOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate(() => { const s = Career.newGame('Test AS'); s.tut = Object.assign({ coachOffice: 1, coachShift: 1 }, s.tut); s.tier = 1; s.css = 110; s.up.loader = 1; Career.store(s); });
  await p.reload(); await p.click('#intro'); await p.waitForTimeout(500); await p.click('#bCont'); await p.click('#bShift');
  await p.evaluate(() => { const ac = Sound.ctx; const sp = ac.createScriptProcessor(4096, 2, 2); window._rec = []; sp.onaudioprocess = (e) => { window._rec.push(Array.from(e.inputBuffer.getChannelData(0))); }; Sound.out.connect(sp); sp.connect(ac.destination); });
  // tap analyser on the destination: reconnect master by monkeypatching is hard; sample via ScriptProcessor-free approach: use MediaStreamDestination? keep it simple
  await p.click('#tFeed');
  const t0 = Date.now(); const states = [];
  while (Date.now() - t0 < 20000) { await p.waitForTimeout(1000); states.push(await p.evaluate(() => ({ ready: Sound.ready, st: Sound.ctx && Sound.ctx.state }))); }
  const rec = await p.evaluate(() => window._rec.flat()); fs.writeFileSync('/tmp/claude-0/-home-claude/0c585022-0d1c-5dc3-b073-a0273320023e/scratchpad/rec.json', JSON.stringify(rec)); console.log('samples', rec.length, 'rate', await p.evaluate(() => Sound.ctx.sampleRate));
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
