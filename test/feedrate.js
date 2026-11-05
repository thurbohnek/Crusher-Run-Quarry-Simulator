// how fast does each crusher eat full truck loads? feeds whenever the truck is free and there is room
const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const { Sim, MATS, TIERS, DAY_LEN } = L;
const tier = +(process.argv[2] || 0), lv = +(process.argv[3] || 0), plan = process.argv[4] || 'normal', haul = +(process.argv[5] || 0.4), secs = +(process.argv[6] || 40);
const T = TIERS[tier];
const save = { tier, css: Math.round((T.css[0] + T.css[1]) / 2 / 5) * 5, plates0: 0.1, up: { breaker: 2, hydro: true, loader: lv, vfd: true }, feedMm: 420, blastPlan: plan };
const sim = new Sim(save, { seed: 7 }); sim.haul = haul;
const mats = () => [MATS.marmor, MATS.gneis, MATS.granitt][Math.floor(sim.rng() * 3)];
let t = 0, dt = 1 / 120, idle = 0, n = 0, sum = 0, worst = 0, maxR = 0, loads = 0, nextHit = 1;
while (t < secs) {
  if (!sim.loader.busy && sim.loader.cd <= 0 && sim.feederRoom()) { const it = []; for (let i = 0; i < Sim.truckBuckets(lv); i++) it.push(...sim.makeLoad(mats, Sim.blastSpec(save))); sim.callLoader(it, false); loads++; }
  if (t >= nextHit) { nextHit += 0.5; let best = null; for (const b of sim.rocks) if (b.y < L.Machine.G.TOP + 60 && b.y > -50 && Math.hypot(b.vx, b.vy) < 300) if (!best || b.rock.De > best.rock.De) best = b; if (best && best.rock.De > T.feed * 0.9) sim.breakerBlow(best.x, best.y - best.rock.rad * 0.5); }
  if (sim.m.state === 'trip' && sim.m.timer <= 0) sim.clearChamber();
  if (sim.m.state === 'stop') sim.start();
  const s0 = performance.now(); sim.step(dt); const e = performance.now() - s0; sum += e; n++; worst = Math.max(worst, e);
  if (sim.hopperLoad() < 0.1) idle += dt;
  maxR = Math.max(maxR, sim.rocks.length); t += dt;
}
console.log(`tier ${tier} truck ${lv} ${plan} haul ${haul}: t/day ${(sim.D.tonnes * DAY_LEN / secs).toFixed(0)} rated ${T.cap[0] * 8}-${T.cap[1] * 8}, loads ${loads}, idle ${(idle / secs * 100).toFixed(0)}% ovs ${sim.D.oversizeIn} blows ${sim.D.blows}, maxRocks ${maxR}, ms ${(sum / n).toFixed(2)} worst ${worst.toFixed(0)}`);
