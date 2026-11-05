// a brand-new player: new company, office tour, first shift with the goal card, report, milestones
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2 }); if (process.env.NOTOUR) await p.addInitScript(() => { window.RC_NOTOUR = 1; }); const errs = [];
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.route(/fonts/, r => r.abort());
  await p.route('http://test.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync('rock-crusher.html', 'utf8') + '</body></html>' }));
  await p.goto('http://test.local/');
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.click('#intro'); await p.waitForTimeout(400); await p.screenshot({ path: 'shots/t_title.png' });
  await p.click('#bNew'); await p.waitForTimeout(200); await p.click('#bGo'); await p.waitForTimeout(600); await p.screenshot({ path: 'shots/t_coach1.png' });
  await p.click('#coachNext'); await p.waitForTimeout(200); await p.screenshot({ path: 'shots/t_coach2.png' });
  await p.click('#coachNext'); await p.waitForTimeout(200); await p.screenshot({ path: 'shots/t_coach3.png' });
  await p.click('#coachNext'); await p.waitForTimeout(200); await p.screenshot({ path: 'shots/t_office.png' });
  await p.click('#bShift'); await p.waitForTimeout(1600); await p.screenshot({ path: 'shots/t_shift1.png' });
  await p.click('#coachNext'); await p.waitForTimeout(200); await p.screenshot({ path: 'shots/t_shift2.png' });
  await p.click('#coachNext'); await p.waitForTimeout(200); await p.click('#coachNext'); await p.waitForTimeout(200); await p.screenshot({ path: 'shots/t_shift4.png' });
  await p.click('#coachNext'); await p.waitForTimeout(300);
  await p.click('#tFeed'); await p.waitForTimeout(6000); await p.screenshot({ path: 'shots/t_goal.png' });
  await p.click('#fMinus'); await p.waitForTimeout(1500); await p.screenshot({ path: 'shots/t_goal2.png' });
  console.log(await p.evaluate(() => JSON.stringify(Career.load().goals)));
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
