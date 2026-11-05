const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js', 'career.js']);
const { Sim, MATS, Machine, Rocks, Career } = L;
const s = Career.newGame('x'); s.seed = 3;
const sim = new Sim(s, { seed: 5 });
sim.on(t => console.log('EVENT', t, sim.time.toFixed(2)));
const poly = Rocks.genSteelPoly(sim.rng, sim.mmpx);
const b = sim.addRock(poly, 400, 600, 0.3, MATS.steel, {});
console.log('Fcrit steel', Rocks.Fcrit(b.rock, 0), 'De', b.rock.De, 'minW', b.rock.minW);
for (let i = 0; i < 120 * 8; i++) {
  sim.step(1 / 120);
  if (i % 60 === 0) { let tm = 0, tf = 0; for (const a of b.touch) { const o = a.A.body === b ? a.B.body : a.A.body; if (o === sim.m.pit) { tm++; const sgn = a.A.body === b ? -1 : 1; const p = a.pts[0]; const v = sim.m.pit.velAt(p.x, p.y); tm += ' vn=' + (v.x * a.nx * sgn + v.y * a.ny * sgn).toFixed(1) + ' inRocks=' + sim.rocks.includes(b); } if (o === sim.m.fix) tf++; } console.log((i / 120).toFixed(1), b.x.toFixed(0), b.y.toFixed(0), 'touchM', tm, 'touchF', tf, 'state', sim.m.state, 'block', sim.m.block.toFixed(2)); }
}
