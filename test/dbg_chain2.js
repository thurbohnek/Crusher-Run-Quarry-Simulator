const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const run = require('./bot');
let sim;
const r = run(L, { tier: 0, secs: 40, seed: 2, onStep: s => { sim = s; } });
const M = sim.m;
for (let k = 0; k < 40; k++) {
  sim.step(1 / 120);
  let nM = 0, nF = 0, cl = 0, maxvn = -1e9;
  const tm = new Set(), tf = new Set();
  for (const b of sim.rocks) for (const a of b.touch) { const o = a.A.body === b ? a.B.body : a.A.body; if (o === M.pit) { tm.add(b); const sgn = a.A.body === b ? -1 : 1; const v = M.pit.velAt(a.pts[0].x, a.pts[0].y); const vn = v.x * a.nx * sgn + v.y * a.ny * sgn; maxvn = Math.max(maxvn, vn); if (vn > 1) cl++; } if (o === M.fix) tf.add(b); }
  if (k % 4 === 0) console.log(k, 'touchM', tm.size, 'touchF', tf.size, 'closingContacts', cl, 'maxvn', maxvn.toFixed(0), 'crushes', sim.D.crushes, 'pit w', M.pit.w.toFixed(2), 'awake in chamber', sim.rocks.filter(b => b.y > 300 && b.y < 1040 && b.awake).length, '/', sim.rocks.filter(b => b.y > 300 && b.y < 1040).length);
}
