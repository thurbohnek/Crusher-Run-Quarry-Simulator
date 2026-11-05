// one bot day at a given stage: node test/econ_day.js <tier> '<up json>' '<save json>'
const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js', 'career.js']);
const { Sim, MATS, Machine, TIERS, DAY_LEN, Career } = L;
const tier = +process.argv[2], up = JSON.parse(process.argv[3] || '{}'), extra = JSON.parse(process.argv[4] || '{}');
const s = Career.newGame('Bot'); s.seed = 11; s.tier = tier; s.css = [70, 110, 150, 200][tier]; Object.assign(s.up, up); Object.assign(s, extra); s.stats.totalT = [0, 3000, 15000, 50000][tier]; s.prodAvg = [300, 700, 1800, 3000][tier];
Career.genOffers(s); Career.grease(s);
const sim = new Sim(s, { seed: 5, weather: { wet: 0 } }); sim.haul = Sim.haulTime(s);
const dep = Career.deposit(s); const pick = () => { let tot = 0; for (const k in dep) tot += dep[k]; let r = sim.rng() * tot; for (const k in dep) { r -= dep[k]; if (r <= 0) return MATS[k]; } return MATS.marmor; };
let t = 0, nextHit = 1; const dt = 1 / 120, secs = +(process.env.SECS || DAY_LEN);
while (t < secs) {
  if (sim.m.state === 'run' && !sim.loader.busy && sim.loader.cd <= 0 && sim.feederRoom()) { const bl = Sim.blastSpec(s), items = []; for (let i = 0; i < Sim.truckBuckets(s.up.loader); i++) items.push(...sim.makeLoad(pick, bl)); sim.callLoader(items, false); }
  if (t >= nextHit) { nextHit += 0.6; let best = null; for (const b of sim.rocks) if (b.y < Machine.G.TOP + 60 && b.y > -50 && Math.hypot(b.vx, b.vy) < 300) if (!best || b.rock.De > best.rock.De) best = b; if (best) { if (s.up.breaker) sim.breakerBlow(best.x, best.y - best.rock.rad * 0.5); else sim.sledgeHit(best.x, 1); } }
  if (sim.m.state === 'trip' && sim.m.timer <= 0) sim.clearChamber(); if (sim.m.state === 'stop') sim.start();
  sim.step(dt); t += dt;
}
const k = DAY_LEN / secs; for (const f of ['tonnes', 'fedT', 'kWh', 'fillT']) sim.D[f] = (sim.D[f] || 0) * k; for (let i = 0; i < 12; i++) sim.D.hist[i] *= k; for (const m in sim.D.byMat) sim.D.byMat[m] *= k;
sim.flushTransit(); const m0 = s.money; const rep = Career.endDay(s, sim.D, sim);
console.log(`tier ${tier} ${JSON.stringify(up)} ${JSON.stringify(extra)}\n  t=${rep.tonnes.toFixed(0)} fed=${sim.D.fedT.toFixed(0)} fill=${(sim.D.fillT||0).toFixed(0)} income=${Math.round(rep.income)} costs=${Math.round(-rep.costs.reduce((a, c) => a + c[1], 0))} net=${Math.round(s.money - m0)} prod=${Object.entries(rep.prod).map(([k, v]) => k + ':' + v.toFixed(0)).join(',')}`);
for (const c of rep.costs) console.log('   ', c[0], Math.round(c[1]));
