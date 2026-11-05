const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js', 'career.js']);
const { Sim, MATS, Machine, Career } = L;
for (const lv of [3, 5]) {
  const s = Career.newGame('x'); s.feedLv = lv;
  const sim = new Sim(s, { seed: 21 });
  const ev = {}; sim.on((t, o) => { ev[t] = (ev[t] || 0) + 1; if (t === 'overspill') console.log('  overspill at', o.x.toFixed(0), o.y.toFixed(0), 'mass', o.mass.toFixed(1), 'state', sim.m.state, 'S', (sim.m.S.x - sim.m.Sset).toFixed(0)); });
  for (let i = 0; i < 120 * 150; i++) {
    if (sim.m.state === 'run' && !sim.loader.busy && sim.loader.cd <= 0 && sim.feederRoom()) sim.callLoader([0, 1, 2, 3, 4].flatMap(() => sim.makeLoad(() => [MATS.gneis, MATS.granitt][(sim.rng() * 2) | 0], 0.3)), false);
    if (sim.m.state === 'trip' && sim.m.timer <= 0) sim.clearChamber();
    if (sim.m.state === 'stop') sim.start();
    sim.step(1 / 120);
  }
  console.log('feeder level', lv, 't', sim.D.tonnes.toFixed(0), 'guard', s.guard.toFixed(2), 'hits', sim.D.guardHits || 0, 'overspill', sim.D.overspill || 0, 'events', JSON.stringify(ev));
}
