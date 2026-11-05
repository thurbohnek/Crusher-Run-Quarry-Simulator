// fill the chamber, stop the crusher until everything sleeps, start again: does the chamber empty?
const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js', 'career.js']);
const { Sim, MATS, Machine, Career } = L;
for (const seed of [1, 2, 3]) {
  const s = Career.newGame('x'); s.tier = 0; s.css = 100; const sim = new Sim(s, { seed });
  const G = Machine.G, inCh = () => sim.rocks.filter(b => b.y > G.TOP + 40 && b.y < G.BOT && !b.rock.passed).length;
  for (let i = 0; i < 3; i++) { sim.loader.cd = 0; sim.loader.busy = false; sim.callLoader([0,1,2,3,4,5].flatMap(() => sim.makeLoad(() => MATS.marmor, 0.3)), false); for (let k = 0; k < 120 * 7; k++) sim.step(1 / 120); }
  sim.stop(); for (let k = 0; k < 120 * 4; k++) sim.step(1 / 120);
  const asleep = sim.rocks.filter(b => !b.awake).length, before = inCh(), t0 = sim.D.tonnes;
  sim.start(); for (let k = 0; k < 120 * 6; k++) sim.step(1 / 120);
  console.log('seed', seed, 'asleep while stopped', asleep, 'chamber before', before, 'after 6 s running', inCh(), 'crushed t', (sim.D.tonnes - t0).toFixed(1));
}
