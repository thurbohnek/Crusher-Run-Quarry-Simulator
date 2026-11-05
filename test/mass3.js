const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const { Sim, MATS } = L;
const sim = new Sim({ tier: 0, css: 70, plates0: 0.15, tierBreaker: 0 }, { seed: 99 });
const tot = () => sim.rocks.reduce((s, b) => s + b.rock.mass, 0) + sim.parts.reduce((s, p) => s + p.kg, 0) + sim.D.kg;
let fedKg = 0; const od = sim.dump.bind(sim); sim.dump = (items, st) => { const before = tot(); od(items, st); fedKg += tot() - before; };
const wrap = (name) => { const o = sim[name].bind(sim); sim[name] = function (...a) { const b = tot(); const r = o(...a); const d = tot() - b; if (d > 0.01) console.log(name, d.toFixed(3), JSON.stringify(a.slice(1, 3)).slice(0, 60)); return r; }; };
for (const n of ['crushRock', 'strike', 'partStep', 'updateLoader']) wrap(n);
const ow = sim.world.step.bind(sim.world); sim.world.step = (dt) => { const b = tot(); ow(dt); const d = tot() - b; if (d > 0.01) console.log('world.step', d.toFixed(3)); };
for (let i = 0; i < 120 * 20; i++) { if (i % 300 === 0) sim.callLoader(sim.makeLoad(() => MATS.marmor), false); const b = tot(); sim.step(1 / 120); }
console.log('fed', fedKg.toFixed(1), 'system', tot().toFixed(1));
