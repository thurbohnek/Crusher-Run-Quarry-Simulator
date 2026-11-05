const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const run = require('./bot');
const cfgs = [[8, 3], [6, 2], [5, 2], [4, 1]];
for (const [vi, pi] of cfgs) {
  const L2 = L; const orig = L2.Sim.prototype.constructor;
  let tot = 0, td = 0, pen = 0;
  for (const seed of [1, 2, 3]) {
    const o = { tier: 0, secs: 60, seed };
    const save = {};
    const r = (function () { const S = L.Sim; const oc = S.prototype.step; return run(L, Object.assign(o, { pre: (sim) => { sim.world.velIters = vi; sim.world.posIters = pi; } })); })();
    tot += r.perf.avg; td += r.perDay; for (const a of r.sim.world.active) for (const p of a.pts) pen = Math.min(pen, p.sep);
  }
  console.log('vel', vi, 'pos', pi, 'ms/step', (tot / 3).toFixed(2), 't/day', (td / 3).toFixed(0), 'worst pen', pen.toFixed(1));
}
