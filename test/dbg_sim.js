const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const { Sim, MATS, Machine } = L;
const save = { tier: 0, css: 70, plates0: 0.2, hydro: false, magnet: false, tierBreaker: 0 };
const sim = new Sim(save, { seed: 1234 });
const r0 = Machine.measure(sim); console.log('ecc', sim.m.ecc.toFixed(1), 'stroke mm', (r0.stroke*sim.mmpx).toFixed(1));
const mats = () => MATS.marmor;
sim.callLoader(sim.makeLoad(mats), false);
for (let i = 0; i < 120 * 8; i++) sim.step(1 / 120);
console.log('hopperLoad', sim.hopperLoad().toFixed(2), 'pit', sim.m.pit.x.toFixed(1), sim.m.pit.y.toFixed(1), sim.m.pit.a.toFixed(3), 'state', sim.m.state);
for (const b of sim.rocks) {
  const tags = b.touch.map(a => { const o = a.A.body === b ? a.B.body : a.A.body; return o.rock ? 'R' + o.id : (o.tag || '?'); });
  console.log('rock', b.id, 'x', b.x.toFixed(0), 'y', b.y.toFixed(0), 'De', b.rock.De.toFixed(0), 'mm awake', b.awake, 'touch', tags.join(','));
}
