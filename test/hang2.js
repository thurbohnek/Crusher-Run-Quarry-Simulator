// tier-1 chamber flow with full truck loads and the feeder flat out: how long do stones sit in the jaw?
const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js', 'career.js']);
const { Sim, MATS, Machine, Career } = L;
const tier = +(process.argv[2] || 1), css = +(process.argv[3] || 160), secs = +(process.argv[4] || 40), seed = +(process.argv[5] || 3);
const s = Career.newGame('x'); s.seed = seed; s.tier = tier; s.css = css; s.plates0 = 0.02; s.up.loader = 1; s.up.vfd = true; s.feedMm = 420; s.up.breaker = 1; s.up.hydro = true;
const sim = new Sim(s, { seed, weather: { wet: 1 } }); sim.haul = Sim.haulTime(s);
const pick = () => [MATS.skifer, MATS.marmor, MATS.gneis][(sim.rng() * 3) | 0];
const G = Machine.G; let t = 0, dt = 1 / 120, lastT = 0, idle = 0, worst = 0, hang = 0, midJam = 0, nextHit = 1;
const dwell = new Map(), dw = [];
while (t < secs) {
  if (sim.m.state === 'run' && !sim.loader.busy && sim.loader.cd <= 0 && sim.feederRoom()) { const it = []; for (let i = 0; i < Sim.truckBuckets(1); i++) it.push(...sim.makeLoad(pick, Sim.blastSpec(s))); sim.callLoader(it, false); }
  if (t >= nextHit) { nextHit += 0.6; let best = null; for (const b of sim.rocks) if (b.y < G.TOP + 60 && b.y > -50 && Math.hypot(b.vx, b.vy) < 300) if (!best || b.rock.De > best.rock.De) best = b; if (best && best.rock.De > sim.tier.feed * 0.85) sim.breakerBlow(best.x, best.y - best.rock.rad * 0.5); }
  if (sim.m.state === 'trip' && sim.m.timer <= 0) sim.clearChamber(); if (sim.m.state === 'stop') sim.start();
  sim.step(dt); t += dt;
  let inCh = 0, low = 0;
  for (const b of sim.rocks) { if (b.y > G.TOP + 40 && b.y < G.BOT && !b.rock.passed) { inCh++; if (b.y > G.TOP + (G.BOT - G.TOP) * 0.7) low++; if (!dwell.has(b)) dwell.set(b, t); } }
  for (const [b, t0] of dwell) if (b.rock.passed || !sim.rocks.includes(b)) { dw.push({ t: t - t0, De: b.rock.De }); dwell.delete(b); }
  if (sim.D.tonnes > lastT + 0.3) { lastT = sim.D.tonnes; idle = 0; } else if (inCh >= 5) { idle += dt; hang += dt; worst = Math.max(worst, idle); } else idle = 0;
  if (inCh >= 8 && low === 0) midJam += dt;
}
const small = dw.filter(d => d.De < css * 0.9), slow = small.filter(d => d.t > 1.2).length; console.log('small stones', small.length, 'of which >1.2 s in chamber', slow, 'De of the slowest', dw.slice().sort((a,b)=>b.t-a.t).slice(0,8).map(d=>d.De.toFixed(0)+'mm/'+d.t.toFixed(1)+'s').join(' '));
dw.sort((a, b) => a.t - b.t); const q = (k) => dw.length ? dw[Math.floor(dw.length * k)].t.toFixed(2) : '-';
console.log(`tier ${tier} css ${css}: t/day ${(sim.D.tonnes * 150 / secs).toFixed(0)} hang ${hang.toFixed(1)}s worst ${worst.toFixed(1)}s midJam ${midJam.toFixed(1)}s  dwell med ${q(0.5)} p90 ${q(0.9)} max ${q(0.999)} n ${dw.length} trips ${sim.D.trips}`);
