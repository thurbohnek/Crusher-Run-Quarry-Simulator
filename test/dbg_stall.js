const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js', 'career.js']);
const { Sim, MATS, Machine, DAY_LEN, Career } = L;
const day = +(process.argv[2] || 8), sd = +(process.argv[3] || 11);
const s = Career.newGame('x'); s.seed = sd; s.day = day; s.plates0 = 0.38;
const w = Career.weather(s, day);
const sim = new Sim(s, { seed: s.seed + day * 101, weather: w });
const dep = Career.deposit(s);
const pick = () => { let tot = 0; for (const k in dep) tot += dep[k]; let r = sim.rng() * tot; for (const k in dep) { r -= dep[k]; if (r <= 0) return MATS[k]; } return MATS.marmor; };
let t = 0, nextHit = 1; const dt = 1 / 120, G = Machine.G;
let lastFeed = 0;
while (t < 60) {
  if (sim.m.state === 'run' && !sim.loader.busy && sim.loader.cd <= 0 && sim.hopperLoad() < 0.42) { sim.callLoader(sim.makeLoad(pick, 0.25), false); lastFeed = t; }
  if (t >= nextHit) { nextHit += 0.6; let best = null; for (const b of sim.rocks) if (b.y < G.TOP + 60 && b.y > -50 && !b.rock.steel && Math.hypot(b.vx, b.vy) < 300) { if (!best || b.rock.De > best.rock.De) best = b; } if (best) sim.sledgeHit(best.x + (sim.rng() - 0.5) * best.rock.rad, 1); }
  if (sim.m.state === 'trip' && sim.m.timer <= 0) sim.clearChamber();
  if (sim.m.state === 'stop') sim.start();
  sim.step(dt); t += dt;
  if (Math.round(t*120) % 600 === 0) { let n=0,v=0; for (const b of sim.rocks) if (b.y>G.TOP) { n++; v+=Math.hypot(b.vx,b.vy);} console.log(t.toFixed(0),'n',n,'avgv',(v/Math.max(1,n)).toFixed(0),'t',sim.D.tonnes.toFixed(1),'w',(sim.m.w/sim.m.w0).toFixed(2),'gap', (Machine.measure(sim).css*sim.mmpx).toFixed(0)); }
}
console.log('state', sim.m.state, 'fed', sim.D.fedT.toFixed(0), 'lastFeed', lastFeed.toFixed(1), 'hopperLoad', sim.hopperLoad().toFixed(2), 'loader', JSON.stringify({ busy: sim.loader.busy, cd: sim.loader.cd }));
for (const b of sim.rocks) console.log(b.rock.mat.key, 'x', b.x.toFixed(0), 'y', b.y.toFixed(0), 'De', b.rock.De.toFixed(0), 'v', Math.hypot(b.vx, b.vy).toFixed(1), 'sleep', !b.awake, 'A', b.rock.A.toFixed(0));
