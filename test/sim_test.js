const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const { Sim, MATS, Machine, TIERS, TL, DAY_LEN } = L;
const tier = +(process.argv[2] || 0), secs = +(process.argv[3] || 60), interval = +(process.argv[4] || 3.5);
const save = { tier, css: tier === 0 ? 70 : (TIERS[tier].css[0] + TIERS[tier].css[1]) / 2, plates0: 0.2, hydro: false, magnet: false, tierBreaker: 0 };
const sim = new Sim(save, { seed: 1234 });
const r0 = Machine.measure(sim);
console.log('tier', TIERS[tier].name, 'mm/px', sim.mmpx.toFixed(3), 'g', sim.g.toFixed(0), 'CSS px', r0.css.toFixed(1), '=', (r0.css * sim.mmpx).toFixed(1), 'mm, OSS', (r0.oss * sim.mmpx).toFixed(1), 'stroke', (r0.stroke * sim.mmpx).toFixed(1), 'mm, ecc px', sim.m.ecc.toFixed(2), 'teeth', sim.m.nTeeth);
const mats = () => [MATS.marmor, MATS.skifer, MATS.gneis][Math.floor(sim.rng() * 3)];
let t = 0, nextFeed = 0.2, worst = 0, sumT = 0, steps = 0, nan = 0;
const dt = 1 / 120;
const log = [];
let lastBlock = 0;
while (t < secs) {
  if (t >= nextFeed) { if (sim.hopperLoad() < 0.9) sim.callLoader(sim.makeLoad(mats), false); nextFeed += interval; }
  const s = performance.now(); sim.step(dt); const e = performance.now() - s; worst = Math.max(worst, e); sumT += e; steps++;
  t += dt;
  for (const b of sim.rocks) if (!isFinite(b.x) || !isFinite(b.vx)) nan++;
  if (Math.floor(t) !== Math.floor(t - dt)) log.push(`${Math.floor(t)}s rocks ${sim.rocks.length} parts ${sim.parts.length} w ${(sim.m.w / sim.m.w0 * 100).toFixed(0)}% amps ${sim.m.amps.toFixed(0)} state ${sim.m.state} t ${sim.D.tonnes.toFixed(1)} crushes ${sim.D.crushes} block ${sim.m.block.toFixed(2)}`);
  if (sim.m.state === 'trip' && sim.m.timer <= 0) { sim.clearChamber(); }
  if (sim.m.state === 'stop') sim.start();
}
console.log(log.filter((_, i) => i % Math.max(1, Math.floor(secs / 15)) === 0).join('\n'));
const D = sim.D;
console.log('RESULT day-equivalent tonnes', D.tonnes.toFixed(1), '(rated', TIERS[tier].cap.join('-'), 't/h →', (TIERS[tier].cap[0] * 8) + '-' + (TIERS[tier].cap[1] * 8), 't/day; this run =', (D.tonnes * DAY_LEN / secs).toFixed(0), 't/day-equiv), fed', D.fedT.toFixed(1), 'crushes', D.crushes, 'trips', D.trips, 'kWh', D.kWh.toFixed(1), 'jamT', D.jamT.toFixed(1));
console.log('hist', Array.from(D.hist).map(v => v.toFixed(1)).join(' '));
console.log('perf avg', (sumT / steps).toFixed(2), 'ms/step worst', worst.toFixed(1), 'NaN', nan, 'wear max', Math.max(...save.wearM).toFixed(3));
