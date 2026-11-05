const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const run = require('./bot');
let hits = 0, steps = 0;
run(L, { tier: +(process.argv[2] || 0), secs: 120, seed: 4, onStep: (sim) => { steps++; for (const b of sim.rocks) if (b.rock.passed) for (const a of b.touch) { const o = a.A.body === b ? a.B.body : a.A.body; if (o === sim.m.pit && b.y + b.rock.rad * 0.6 > L.Machine.G.BELT_Y - 8) { hits++; break; } } } });
console.log('passed-rock contacts with the swing jaw:', hits, 'in', steps, 'steps');
