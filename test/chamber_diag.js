const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js', 'career.js']);
const { Sim, MATS, Machine, Career } = L;
const tier = +(process.argv[2] || 1);
const s = Career.newGame('x'); s.tier = tier; s.css = [70, 110, 150, 200][tier];
const sim = new Sim(s, { seed: 5 }); const G = Machine.G;
const hist = new Map();
for (let i = 0; i < 120 * 120; i++) {
  if (sim.m.state === 'run' && !sim.loader.busy && sim.loader.cd <= 0 && sim.feederRoom()) sim.callLoader([0, 1, 2, 3, 4].flatMap(() => sim.makeLoad(() => MATS.gneis, 0.3)), false);
  if (sim.m.state === 'trip' && sim.m.timer <= 0) sim.clearChamber();
  if (sim.m.state === 'stop') sim.start();
  sim.step(1 / 120);
  if (i % 60 === 0) for (const b of sim.rocks) { if (b.y > G.TOP + 100 && b.y < G.BOT) { const h = hist.get(b) || { t0: sim.time, y0: b.y }; h.t1 = sim.time; h.y1 = b.y; hist.set(b, h); } }
}
let stuck = 0, n = 0;
for (const b of sim.rocks) if (b.y > G.TOP + 100 && b.y < G.BOT) {
  n++; const h = hist.get(b); const gap = Machine.gapAtY(sim, b.y);
  const age = h ? h.t1 - h.t0 : 0;
  if (age > 8) { stuck++; console.log('rock y', b.y.toFixed(0), 'minW', b.rock.minW.toFixed(0), 'De', b.rock.De.toFixed(0), 'gap', gap.toFixed(0), 'age', age.toFixed(1), 'awake', b.awake, 'dy', (h.y1 - h.y0).toFixed(0), 'crushT', b.rock.crushT.toFixed(2)); }
}
console.log('chamber rocks', n, 'stuck >8s', stuck, 'tonnes', sim.D.tonnes.toFixed(0));
