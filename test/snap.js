// run the node bot and render the world to PNG via chromium
const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const run = require('./bot');
const { chromium } = require('playwright');
module.exports = async function snap(opts, times, out) {
  const frames = [];
  let sim;
  const o = Object.assign({}, opts, { secs: Math.max(...times), onStep: (s) => { sim = s; if (times.length && s.time >= times[0]) { times.shift(); frames.push(dumpWorld(s)); } } });
  const r = run(L, o);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 360 * frames.length, height: 640 } });
  await p.setContent(`<canvas id=c width=${720 * frames.length} height=1280 style="width:${360 * frames.length}px;height:640px"></canvas>`);
  await p.evaluate((frames) => {
    const ctx = document.getElementById('c').getContext('2d');
    frames.forEach((f, i) => {
      ctx.save(); ctx.translate(720 * i, 0); ctx.fillStyle = '#ddd'; ctx.fillRect(0, 0, 720, 1280);
      for (const s of f.shapes) { ctx.beginPath(); s.v.forEach((q, k) => k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fillStyle = s.c; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 0.7; ctx.stroke(); }
      ctx.fillStyle = '#420'; for (const q of f.parts) ctx.fillRect(q[0] - q[2], q[1] - q[2], q[2] * 2, q[2] * 2);
      ctx.fillStyle = '#000'; ctx.font = '22px sans-serif'; ctx.fillText(f.txt, 10, 26);
      ctx.restore();
    });
  }, frames);
  await p.screenshot({ path: out }); await b.close();
  return r;
};
function dumpWorld(sim) {
  const shapes = [];
  for (const b of sim.world.bodies) for (const s of b.shapes) {
    const c = Math.cos(b.a), sn = Math.sin(b.a);
    shapes.push({ v: s.lv.map(p => [b.x + p.x * c - p.y * sn, b.y + p.x * sn + p.y * c]), c: b.rock ? (b.rock.steel ? '#678' : (b.rock.nipped > 0 ? '#c64' : b.awake ? '#a98' : '#887')) : (b.type === 2 ? '#36a' : '#555') });
  }
  return { shapes, parts: sim.parts.map(p => [p.x, p.y, p.r]), txt: `t ${sim.time.toFixed(1)} ${sim.m.state} w ${(sim.m.w / sim.m.w0 * 100).toFixed(0)}% rocks ${sim.rocks.length} out ${sim.D.tonnes.toFixed(0)}t cr ${sim.D.crushes}` };
}
if (require.main === module) {
  const times = (process.argv[2] || '5,15,30,50').split(',').map(Number);
  module.exports({ tier: +(process.argv[3] || 0), seed: +(process.argv[4] || 1), hammer: process.argv[5] !== 'nohammer' }, times, __dirname + '/snap.png').then(r => console.log('t/day', r.perDay.toFixed(0)));
}
