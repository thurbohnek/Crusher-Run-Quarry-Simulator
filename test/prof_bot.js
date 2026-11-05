const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const run = require('./bot');
const r = run(L, { tier: 0, secs: 60 });
console.log('perf', r.perf.avg.toFixed(2), 'worst', r.perf.worst.toFixed(1), 'perDay', r.perDay.toFixed(0), 'ecc', r.sim.m.ecc.toFixed(1), 'maxRocks', r.maxRocks, 'maxParts', r.maxParts);
