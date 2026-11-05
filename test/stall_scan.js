const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js', 'career.js']);
const { Sim, MATS, Machine, DAY_LEN, Career, TIERS } = L;
const tier = +(process.argv[2] || 0), n = +(process.argv[3] || 12), from = +(process.argv[4] || 1);
const res = [];
for (let seed = from; seed < from + n; seed++) {
  const s = Career.newGame('x'); s.seed = seed * 13; s.tier = tier; s.css = Math.round((TIERS[tier].css[0] + TIERS[tier].css[1]) / 2 / 5) * 5; s.plates0 = 0.3; s.day = 5 + seed;
  const sim = new Sim(s, { seed: seed * 7, weather: Career.weather(s, s.day) });
  const pick = () => [MATS.skifer, MATS.marmor, MATS.gneis, MATS.granitt][(sim.rng() * 4) | 0];
  let t = 0, nextHit = 1, maxIdle = 0, idle = 0, lastT = 0; const dt = 1 / 120;
  while (t < DAY_LEN) {
    if (sim.m.state === 'run' && !sim.loader.busy && sim.loader.cd <= 0 && sim.feederRoom()) sim.callLoader([0,1,2,3,4,5].flatMap(() => sim.makeLoad(pick, 0.3)), false);
    if (t >= nextHit) { nextHit += 0.6; let best = null; for (const b of sim.rocks) if (b.y < Machine.G.TOP + 60 && b.y > -50 && !b.rock.steel && Math.hypot(b.vx, b.vy) < 300) { if (!best || b.rock.De > best.rock.De) best = b; } if (best) sim.sledgeHit(best.x + (sim.rng() - 0.5) * best.rock.rad, 1); }
    if (sim.m.state === 'trip' && sim.m.timer <= 0) sim.clearChamber();
    if (sim.m.state === 'stop') sim.start();
    sim.step(dt); t += dt;
    if (sim.D.tonnes > lastT + 0.5) { lastT = sim.D.tonnes; idle = 0; } else { idle += dt; maxIdle = Math.max(maxIdle, idle); }
  }
  res.push(sim.D.tonnes);
  console.log('seed', seed, 't', sim.D.tonnes.toFixed(0), 'maxIdle', maxIdle.toFixed(1) + 's', 'trips', sim.D.trips, 'crushes', sim.D.crushes);
}
console.log('min', Math.min(...res).toFixed(0), 'avg', (res.reduce((a, b) => a + b) / res.length).toFixed(0));
