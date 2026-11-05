const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const run = require('./bot');
let tot = 0, td = 0, mr = 0, mp = 0;
const hard = process.argv[2] === 'hard', tier = +(process.argv[3] || 0), secs = +(process.argv[4] || 60);
for (const seed of [1, 2, 3]) { const r = run(L, { tier, secs, seed, hard, hammer: process.argv[5] !== 'nohammer' }); tot += r.perf.avg; td += r.perDay; mr = Math.max(mr, r.maxRocks); mp = Math.max(mp, r.maxParts); console.log(' seed', seed, 't/day', r.perDay.toFixed(0), 'crushes', r.D.crushes, 'trips', r.D.trips, 'toggles', r.D.toggles, 'sieve', Array.from(r.D.hist).slice(0, 8).map(v => (v / Math.max(1, r.D.tonnes) * 100).toFixed(0)).join('/'), 'ms', r.perf.avg.toFixed(2), 'worst', r.perf.worst.toFixed(0)); }
console.log('AVG ms/step', (tot / 3).toFixed(2), 't/day', (td / 3).toFixed(0), 'maxRocks', mr, 'maxParts', mp);
