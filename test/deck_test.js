// drop heavy blocks on the feeder at tier 2 and count any that end up below the deck
const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js', 'career.js']);
const { Sim, MATS, Machine, Career } = L;
for (const tier of [0, 1, 2, 3]) {
  const s = Career.newGame('x'); s.tier = tier; s.css = [70, 110, 150, 200][tier];
  const sim = new Sim(s, { seed: 11 + tier });
  const F = Machine.G.FEED; let through = 0;
  for (let k = 0; k < 4; k++) { sim.loader.cd = 0; sim.loader.busy = false; sim.callLoader([0, 1, 2, 3, 4, 5].flatMap(() => sim.makeLoad(() => MATS.granitt, 0.3)), false); for (let i = 0; i < 120 * 7; i++) { sim.step(1 / 120); } }
  for (const b of sim.rocks) { const k = (b.x - F.x0) / (F.x1 - F.x0); if (k > 0.25 && k < 1 && b.y > F.y0 + (F.y1 - F.y0) * k + 30 && !b.rock.passed) through++; }
  console.log('tier', tier, 'rocks', sim.rocks.length, 'below deck', through, 'delivered t', sim.D.tonnes.toFixed(0));
}
