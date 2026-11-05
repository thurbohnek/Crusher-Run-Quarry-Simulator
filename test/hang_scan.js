// how long does a full chamber sit without crushing (motor near idle)?
const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js', 'career.js']);
const { Sim, MATS, Machine, DAY_LEN, Career } = L;
const n = +(process.argv[2] || 6); let worstAll = 0, tot = 0, hangTot = 0;
for (let seed = 1; seed <= n; seed++) {
  const s = Career.newGame('x'); s.seed = seed * 13; s.tier = 0; s.css = 100; s.plates0 = 0.3; s.day = 12 + seed;
  const w = Career.weather(s, s.day); w.kind = 'regn'; w.wet = 1;
  const sim = new Sim(s, { seed: seed * 7, weather: w });
  const pick = () => [MATS.skifer, MATS.marmor, MATS.marmor, MATS.gneis][(sim.rng() * 4) | 0];
  const G = Machine.G; let t = 0, idle = 0, worst = 0, hangT = 0, lastT = 0, nextHit = 1; const dt = 1 / 120;
  while (t < DAY_LEN * 0.6) {
    if (sim.m.state === 'run' && !sim.loader.busy && sim.loader.cd <= 0 && sim.feederRoom()) sim.callLoader([0,1,2,3,4,5].flatMap(() => sim.makeLoad(pick, 0.3)), false);
    if (t >= nextHit) { nextHit += 0.8; let best = null; for (const b of sim.rocks) if (b.y < G.TOP + 60 && b.y > -50 && !b.rock.steel && Math.hypot(b.vx, b.vy) < 300) { if (!best || b.rock.De > best.rock.De) best = b; } if (best && best.rock.De > s.css * 2.5) sim.sledgeHit(best.x, 1); }
    if (sim.m.state === 'trip' && sim.m.timer <= 0) sim.clearChamber();
    if (sim.m.state === 'stop') sim.start();
    sim.step(dt); t += dt;
    let inCh = 0; for (const b of sim.rocks) if (b.y > G.TOP + 40 && b.y < G.BOT && !b.rock.passed) inCh++;
    if (sim.D.tonnes > lastT + 0.3) { lastT = sim.D.tonnes; idle = 0; }
    else if (inCh >= 6 && sim.m.amps < sim.tier.kw * 1.72 * 0.75) { idle += dt; hangT += dt; worst = Math.max(worst, idle); } else idle = 0;
  }
  worstAll = Math.max(worstAll, worst); tot += sim.D.tonnes; hangTot += hangT;
  console.log('seed', seed, 't', sim.D.tonnes.toFixed(0), 'longest hang', worst.toFixed(1) + 's', 'hang total', hangT.toFixed(1) + 's');
}
console.log('worst', worstAll.toFixed(1), 's  avg t', (tot / n).toFixed(0), ' hang total', hangTot.toFixed(0), 's');
