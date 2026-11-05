const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const { Sim, MATS, Machine } = L;
const save = { tier: 0, css: 70, plates0: 0.2, hydro: false, magnet: false, tierBreaker: 0 };
const sim = new Sim(save, { seed: 7 });
sim.dump([{ mm: 180, mat: MATS.marmor }], false);
let lastY = 0;
for (let i = 0; i < 120 * 3; i++) { sim.step(1 / 120);
  const b = sim.rocks[0]; if (!b) { console.log(i, 'gone; crushes', sim.D.crushes); break; }
  if (i % 12 === 0) { const tags = b.touch.map(a => { const o = a.A.body === b ? a.B.body : a.A.body; return o.rock ? 'R' : (o.tag || '?'); });
    console.log(i, 'y', b.y.toFixed(0), 'x', b.x.toFixed(0), 'awake', b.awake, 'touch', tags.join(','), 'crushT', b.rock.crushT.toFixed(2), 'Fcrit kN', (L.Rocks.Fcrit(b.rock, 0)/1000).toFixed(0), 'w%', (sim.m.w/sim.m.w0*100).toFixed(0), 'pitvx', sim.m.pit.vx.toFixed(0)); }
}
