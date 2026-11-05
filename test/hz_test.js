const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const run = require('./bot');
for (const hz of [120, 60]) for (const seed of [1, 2, 3]) {
  const r = run(L, { tier: 0, secs: 90, hz, seed });
  let pen = 0; for (const a of r.sim.world.active) for (const p of a.pts) pen = Math.min(pen, p.sep);
  console.log(hz + 'Hz seed', seed, 'perStep', r.perf.avg.toFixed(2), 'ms → per sim-second', (r.perf.avg * hz).toFixed(0), 'ms | t/day', r.perDay.toFixed(0), 'crushes', r.D.crushes, 'trips', r.D.trips, 'maxPen', pen.toFixed(1), 'NaN', r.nan);
}
