const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const run = require('./bot');
for (const seed of [2, 3]) {
  const r = run(L, { tier: 0, secs: 60, seed, hammer: process.argv[2] !== 'nohammer' });
  console.log('seed', seed, 'total', r.D.tonnes.toFixed(0));
  for (const [k, v] of Object.entries(r.D.bySrc)) console.log('  ', k.padEnd(10), (v.t / r.D.tonnes * 100).toFixed(0).padStart(3) + '%', 'sieve%', Array.from(v.h).slice(0, 8).map(x => (x / v.t * 100).toFixed(0)).join('/'));
}
