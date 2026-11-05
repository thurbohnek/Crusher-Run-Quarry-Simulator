const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js', 'career.js']);
const { Sim, MATS, Machine, Career } = L;
const s = Career.newGame('x'); s.seed = 3;
const sim = new Sim(s, { seed: 7 });
sim.callLoader(sim.makeLoad(() => MATS.gneis, 0.3), false);
let tr = null;
for (let i = 0; i < 120 * 7; i++) {
  sim.step(1 / 120);
  if (!tr && sim.rocks.length) tr = sim.rocks[0];
  if (tr && i % 12 === 0) console.log((i / 120).toFixed(2), tr.x.toFixed(0), tr.y.toFixed(0), 'v', tr.vx.toFixed(0), tr.vy.toFixed(0), 'awake', tr.awake, 'touch', tr.touch.map(a => (a.A.body === tr ? a.B : a.A).body.tag || 'rock').join(','));
}
