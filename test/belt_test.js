const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const run = require('./bot');
let fedMax = 0;
const r = run(L, { tier: 0, secs: 150, seed: 3 });
const sim = r.sim; const inTransit = sim.parts.filter(p => p.st >= 1 && p.st <= 3).reduce((a, p) => a + p.kg, 0);
console.log('delivered t', r.D.tonnes.toFixed(1), 'pile t', (sim.pileT || 0).toFixed(1), 'in transit kg', inTransit.toFixed(1), 'parts', sim.parts.length);
sim.flushTransit(); console.log('after flush t', sim.D.tonnes.toFixed(1), 'pile', sim.pileT.toFixed(1), 'pile shape', JSON.stringify(sim.pileShape()));
