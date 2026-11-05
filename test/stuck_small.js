// pieces smaller than the gap where they sit, that have not moved down for 3 s
const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js', 'career.js']);
const { Sim, MATS, Machine, DAY_LEN, Career } = L;
let tot = 0, worst = 0;
for (let seed = 1; seed <= 5; seed++) {
  const s = Career.newGame('x'); s.seed = seed * 13; s.tier = 0; s.css = 100; s.plates0 = 0.3;
  const sim = new Sim(s, { seed: seed * 7 }); const G = Machine.G, mm = sim.mmpx;
  const hist = new Map(); let stuckSamples = 0, samples = 0, maxStuck = 0;
  for (let i = 0; i < 120 * 80; i++) {
    if (sim.m.state === 'run' && !sim.loader.busy && sim.loader.cd <= 0 && sim.feederRoom()) sim.callLoader([0,1,2,3,4,5].flatMap(() => sim.makeLoad(() => [MATS.marmor, MATS.skifer][(sim.rng() * 2) | 0], 0.3)), false);
    if (sim.m.state === 'trip' && sim.m.timer <= 0) sim.clearChamber(); if (sim.m.state === 'stop') sim.start();
    sim.step(1 / 120);
    if (i % 60) continue;
    let stuck = 0;
    for (const b of sim.rocks) {
      if (b.rock.passed || b.y < G.TOP + 40 || b.y > G.BOT) { hist.delete(b); continue; }
      const gap = Machine.gapAtY(sim, b.y);
      const h = hist.get(b) || { y: b.y, t: sim.time }; if (b.y > h.y + 8) { h.y = b.y; h.t = sim.time; } hist.set(b, h);
      if (b.rock.minW / mm < gap * 0.9 && sim.time - h.t > 3) stuck++;
    }
    samples++; if (stuck) stuckSamples++; maxStuck = Math.max(maxStuck, stuck);
  }
  tot += stuckSamples / samples; worst = Math.max(worst, maxStuck);
  console.log('seed', seed, 'time with stuck small pieces', (stuckSamples / samples * 100).toFixed(0) + '%', 'max at once', maxStuck, 't', sim.D.tonnes.toFixed(0));
}
console.log('avg', (tot / 5 * 100).toFixed(0) + '%', 'worst', worst);
