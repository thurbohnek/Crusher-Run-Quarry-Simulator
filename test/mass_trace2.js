const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const run = require('./bot'); const { TL } = L;
let prev = null, fed0 = 0, nr0 = 0, np0 = 0, kg0 = 0, rm0 = 0, pm0 = 0, shown = 0;
run(L, { tier: 0, secs: 60, seed: 2, hard: true, onStep: (sim) => {
  let rm = 0, pm = 0; for (const b of sim.rocks) if (!b.rock.steel) rm += b.rock.mass; for (const p of sim.parts) if (!p.mat.steel) pm += p.kg;
  const fed = sim.D.fedT * 1000 / TL, m = rm + pm + sim.D.kg;
  if (prev !== null) {
    const d = (m - prev) - (fed - fed0);
    if (d > 0.3 && sim.fx.length === 0 && shown < 8) { shown++; console.log('t', sim.time.toFixed(3), 'd', d.toFixed(2), 'rocks', nr0, '->', sim.rocks.length, 'rm', (rm - rm0).toFixed(2), 'parts', np0, '->', sim.parts.length, 'pm', (pm - pm0).toFixed(2), 'Dkg', (sim.D.kg - kg0).toFixed(2), 'fed', (fed - fed0).toFixed(2), 'loader', sim.loader.busy, sim.loader.t.toFixed(2)); }
  }
  prev = m; fed0 = fed; nr0 = sim.rocks.length; np0 = sim.parts.length; kg0 = sim.D.kg; rm0 = rm; pm0 = pm; sim.fx.length = 0;
} });
