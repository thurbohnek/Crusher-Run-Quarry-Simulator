const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const { Sim, MATS, TL } = L;
const sim = new Sim({ tier: 0, css: 70, plates0: 0.15, tierBreaker: 0 }, { seed: 99 });
const tot = () => sim.rocks.reduce((s, b) => s + b.rock.mass, 0) + sim.parts.reduce((s, p) => s + p.kg, 0) + sim.D.kg;
let fedKg = 0; const od = sim.dump.bind(sim); sim.dump = (items, st) => { const before = tot(); od(items, st); fedKg += tot() - before; };
const orig = {}; for (const f of ['step']) { orig[f] = sim[f].bind(sim); sim[f] = function (...a) { const b = tot(); const r = orig[f](...a); const d = tot() - b; if (Math.abs(d) > 0.01) console.log(f, 'Δkg', d.toFixed(3)); return r; }; }
for (let i = 0; i < 120 * 20; i++) { if (i % 300 === 0) sim.callLoader(sim.makeLoad(() => MATS.marmor), false); sim.step(1 / 120); }
console.log('fed', fedKg.toFixed(1), 'system', tot().toFixed(1));
