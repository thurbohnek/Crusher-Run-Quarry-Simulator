// headless playthrough bot: feeds, sledges oversize at the mouth, clears trips
module.exports = function run(L, o) {
  const { Sim, MATS, Machine, TIERS, DAY_LEN } = L;
  const tier = o.tier || 0;
  const T = TIERS[tier];
  const save = Object.assign({ tier, css: Math.round((T.css[0] + T.css[1]) / 2 / 5) * 5, plates0: 0.15, up: { breaker: 0, hydro: false, magnet: false, loader: 0 } }, o.save || {});
  const sim = new Sim(save, { seed: o.seed || 99 }); if (o.pre) o.pre(sim);
  const mats = o.mats || (() => [MATS.marmor, MATS.skifer, MATS.gneis, MATS.granitt][Math.floor(sim.rng() * (o.hard ? 4 : 3))]);
  const dt = 1 / (o.hz || 120); let t = 0, nextFeed = 0.3, nextHit = 1, worst = 0, sum = 0, n = 0, nan = 0, maxRocks = 0, maxParts = 0;
  const secs = o.secs || DAY_LEN;
  const events = {};
  sim.on((type) => { events[type] = (events[type] || 0) + 1; if (type === 'trip') events['why_' + sim.m.tripWhy] = (events['why_' + sim.m.tripWhy] || 0) + 1; });
  while (t < secs) {
    if (t >= nextFeed) { if (sim.hopperLoad() < (o.fill || 0.55) && sim.m.state === 'run') sim.callLoader(sim.makeLoad(mats, o.x50), o.steel && sim.rng() < o.steel); nextFeed += o.interval || 2.5; }
    if (t >= nextHit && o.hammer !== false) {
      nextHit += 0.55;
      // oversize or anything resting at the mouth
      let best = null;
      for (const b of sim.rocks) if (b.y < Machine.G.TOP + 60 && b.y > -50 && !b.rock.steel && Math.hypot(b.vx, b.vy) < 300) { if (!best || b.rock.De > best.rock.De) best = b; }
      if (best) sim.sledgeHit(best.x + (sim.rng() - 0.5) * best.rock.rad, 1);
    }
    if (sim.m.state === 'trip' && sim.m.timer <= 0) sim.clearChamber();
    if (sim.m.state === 'stop') sim.start();
    const s0 = performance.now(); sim.step(dt); const e = performance.now() - s0; worst = Math.max(worst, e); sum += e; n++;
    t += dt;
    if (o.onStep) o.onStep(sim);
    maxRocks = Math.max(maxRocks, sim.rocks.length); maxParts = Math.max(maxParts, sim.parts.length);
    if (n % 120 === 0) for (const b of sim.rocks) if (!isFinite(b.x) || !isFinite(b.vx) || !isFinite(b.a)) nan++;
  }
  const D = sim.D;
  return { sim, D, perf: { avg: sum / n, worst }, nan, maxRocks, maxParts, events, perDay: D.tonnes * DAY_LEN / secs, rated: [T.cap[0] * 8, T.cap[1] * 8] };
};
