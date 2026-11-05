const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js', 'career.js']);
const { Sim, MATS, Machine, Career } = L;
const s = Career.newGame('x'); s.seed = 3;
const sim = new Sim(s, { seed: 7 });
const pick = () => MATS.gneis;
sim.callLoader([...sim.makeLoad(pick, 0.3), ...sim.makeLoad(pick, 0.3)], false);
const F = Machine.G.FEED; let lost = 0;
const orig = sim.removeRock.bind(sim);
const why = {}; sim.removeRock = (b) => { const st = new Error().stack.split('\n')[2].trim(); why[st] = (why[st] || 0) + 1; if (!b.rock.passed && b.y > 1300) lost++; orig(b); };
for (let i = 0; i < 120 * 10; i++) {
  sim.step(1 / 120);
  if (i === 120 * 6 + 60 || i === 120 * 7 + 60) { for (const b of sim.rocks.slice(0, 8)) console.log("   r", b.x.toFixed(0), b.y.toFixed(0), "v", b.vx.toFixed(0), b.vy.toFixed(0), "rad", b.rock.rad.toFixed(0)); }
  if (i % 120 === 0) { const on = sim.rocks.filter(b => b.x > F.x0 && b.x < F.x1 + 40 && b.y < F.y0 + 20).length; const out = sim.loader.items.filter(it => it.out).length; console.log((i / 120).toFixed(0), 's  released', out, '/', sim.loader.items.length, ' on feeder', on, ' rocks total', sim.rocks.length, ' lost', lost, ' feedV', sim.m.feedV.toFixed(1)); }
}
console.log(JSON.stringify(why, null, 1)); const g = sim.trGeom(); console.log('F', JSON.stringify(F), 'hinge', JSON.stringify(g.hinge), 'rampY', g.rampY);
for (const b of sim.rocks.slice(0, 6)) console.log('rock', b.x.toFixed(0), b.y.toFixed(0), b.rock.rad.toFixed(0));
