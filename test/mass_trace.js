const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const run = require('./bot'); const { TL } = L;
let prev = null; const acc = {};
const tot = (sim) => { let m = 0; for (const b of sim.rocks) if (!b.rock.steel) m += b.rock.mass; for (const p of sim.parts) if (!p.mat.steel) m += p.kg; return m + sim.D.kg; };
let fed0 = 0;
run(L, { tier: 0, secs: 150, seed: 2, hard: true, onStep: (sim) => {
  const m = tot(sim), fed = sim.D.fedT * 1000 / TL;
  if (prev !== null) {
    const d = (m - prev) - (fed - fed0);
    if (Math.abs(d) > 0.05) { const k = [...new Set(sim.fx.map(e => e.t))].join(',') || 'none'; acc[k] = (acc[k] || 0) + d; }
  }
  prev = m; fed0 = fed; sim.fx.length = 0;
} });
console.log(Object.entries(acc).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 12).map(([k, v]) => k + ': ' + v.toFixed(1) + ' kg').join('\n'));
