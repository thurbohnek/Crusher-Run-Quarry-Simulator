const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const run = require('./bot');
const tier = +(process.argv[2] || 0), secs = +(process.argv[3] || 150), hard = process.argv[4] === 'hard';
const r = run(L, { tier, secs, hard, steel: +(process.argv[5] || 0) });
const D = r.D;
console.log(`tier ${tier} ${secs}s: ${r.perDay.toFixed(0)} t/day-eq (rated ${r.rated.join('-')}), fed ${D.fedT.toFixed(0)} t, crushes ${D.crushes}, blows ${D.blows}, spalls ${D.spalls}, splits ${D.splits}, trips ${D.trips}, toggles ${D.toggles}, clears ${D.clears}, jamT ${D.jamT.toFixed(1)}s, kWh ${D.kWh.toFixed(0)} (${(D.kWh / Math.max(1, D.tonnes)).toFixed(2)} kWh/t), oversizeIn ${D.oversizeIn}`);
console.log('  sieve t:', Array.from(D.hist).map(v => v.toFixed(0)).join(' '), '| perf avg', r.perf.avg.toFixed(2), 'ms worst', r.perf.worst.toFixed(1), '| maxRocks', r.maxRocks, 'maxParts', r.maxParts, 'NaN', r.nan, 'events', JSON.stringify(r.events), 'wear', Math.max(...r.sim.save.wearM).toFixed(3));
