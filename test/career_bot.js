// plays whole careers headless: daily bot shifts + a simple management policy
const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js', 'career.js']);
const ctx = L; const { Sim, MATS, Machine, TIERS, DAY_LEN, Career } = L;
const days = +(process.argv[2] || 20), seed = +(process.argv[3] || 7), skill = +(process.argv[4] || 1);
const s = Career.newGame('Bot AS'); s.seed = seed; Career.genOffers(s);
const prio = ['blast', 'magnet', 'dust', 'scalper', 'TIER', 'sikt', 'hydro', 'breaker', 'loader2', 'truck2', 'TIER', 'kjegle', 'breaker2', 'TIER', 'loader3', 'vsi', 'line', 'line'];
const t0 = Date.now();
for (let d = 0; d < days && !s.over; d++) {
  // morning
  Career.grease(s);
  if (s.offersDay !== s.day && s.offers.length < 2) Career.genOffers(s);
  for (const o of s.offers.slice()) { const com = s.contracts.reduce((a, c) => a + c.t - c.made, 0); if (!o.need && Career.fits(s.lastMain || 'k090', o.key) && s.contracts.length < 4 && com + o.t <= Math.max(60, s.prodAvg || 100) * o.days * 0.75) Career.acceptOffer(s, o.id); }
  if (Career.plateLife(s) < 0.45 && s.wearM && !s.turnedM) { Career.turnPlates(s, 'M'); Career.turnPlates(s, 'F'); }
  if (Career.plateLife(s) < 0.2) Career.newPlates(s);
  if (s.vbelt < 0.5) Career.newBelts(s); if (s.bearing < 0.6) Career.bearingService(s);
  if (s.spareToggle < 1 && s.money > 60000) Career.buySpareToggle(s);
  let nth = 0;
  for (const id of prio) {
    if (id === 'TIER' && s.tier >= ++nth) continue;
    if (id === 'TIER') { const o = Career.tierOffer(s); if (o && s.money > o.price + 200000) { Career.buyTier(s); console.log(`  day ${s.day}: bought ${TIERS[s.tier].name}`); } break; }
    const u = UPGRADES_find(id); if (!u || Career.owned(s, id) || !u.req(s)) continue;
    const p = Career.priceOf(s, u); if (s.money > p + 150000) { Career.buyUpgrade(s, id); console.log(`  day ${s.day}: bought ${id} ${p}`); }
    break;
  }
  // shift
  const w = Career.weather(s, s.day);
  s.blastPlan = s.tier >= 2 ? 'coarse' : s.tier === 1 ? 'normal' : 'fine';
  const sim = new Sim(s, { seed: s.seed + s.day * 101, weather: w }); sim.haul = Sim.haulTime(s);
  const T = TIERS[s.tier]; const dt = 1 / 120; let t = 0, nextHit = 1;
  const dep = Career.deposit(s);
  const pick = () => { let tot = 0; for (const k in dep) tot += dep[k]; let r = sim.rng() * tot; for (const k in dep) { r -= dep[k]; if (r <= 0) return MATS[k]; } return MATS.marmor; };
  while (t < DAY_LEN) {
    if (sim.m.state === 'run' && !sim.loader.busy && sim.loader.cd <= 0 && sim.feederRoom()) {
      const bl = Sim.blastSpec(s), items = [];
      for (let i = 0; i < Sim.truckBuckets(s.up.loader); i++) items.push(...sim.makeLoad(pick, bl));
      sim.callLoader(items, sim.rng() < 0.016);
    }
    if (t >= nextHit) {
      nextHit += 0.6 / skill;
      let best = null;
      for (const b of sim.rocks) if (b.y < Machine.G.TOP + 60 && b.y > -50 && !b.rock.steel && Math.hypot(b.vx, b.vy) < 300) { if (!best || b.rock.De > best.rock.De) best = b; }
      if (best) { if (s.up.breaker) sim.breakerBlow(best.x, best.y - best.rock.rad * 0.5); else sim.sledgeHit(best.x + (sim.rng() - 0.5) * best.rock.rad, 1); }
      // steel: pull it out with the bar if it is in the hopper (a careful player does)
      for (const b of sim.rocks) if (b.rock.steel && b.y < Machine.G.TOP && skill >= 1) { sim.removeRock(b); sim.D.scrap++; break; }
    }
    if (sim.m.state === 'trip' && sim.m.timer <= 0) sim.clearChamber();
    if (sim.m.state === 'stop') sim.start();
    sim.step(dt); t += dt;
    if (!sim._found && sim.stepN % 60 === 0) {
      const H = sim._hist || (sim._hist = new Map());
      for (const b of sim.rocks) {
        const fx = Machine.G.FX - Machine.gapAtY(sim, b.y) - sim.m.toothPx;
        const h = H.get(b) || []; h.push([sim.time.toFixed(2), sim.m.state, b.x.toFixed(0), b.y.toFixed(0), b.vx.toFixed(0), b.vy.toFixed(0), fx.toFixed(0), (sim.m.S.x - sim.m.Sset).toFixed(0)]); if (h.length > 15) h.shift(); H.set(b, h);
        if (b.y > Machine.G.TOP + 40 && b.y < Machine.G.BOT && b.x < fx - 30) { sim._found = 1; console.log('BEHIND day', s.day, b.rock.mat.key, 'De', b.rock.De.toFixed(0), 'born', b.rock.born.toFixed(2), '\n' + h.map(r => r.join(' ')).join('\n')); break; }
      }
    }
  }
  if (sim.D.fedT < 80) { console.log('LOW FEED state', sim.m.state, 'timer', sim.m.timer, 'hopper', sim.hopperLoad().toFixed(2), 'loader', sim.loader.busy, sim.loader.cd, 'block', sim.m.block, 'w', (sim.m.w / sim.m.w0).toFixed(2)); for (const b of sim.rocks) console.log('   ', b.rock.mat.key, b.x.toFixed(0), b.y.toFixed(0), 'De', b.rock.De.toFixed(0), 'v', Math.hypot(b.vx, b.vy).toFixed(0), 'awake', b.awake, 'crushT', (b.rock.crushT||0).toFixed(2), 'dmg', (b.rock.dmg||0).toFixed(2)); }
  sim.flushTransit(); const rep = Career.endDay(s, sim.D, sim);
  console.log(`day ${rep.day} ${T.name} t=${rep.tonnes.toFixed(0)} d95=${rep.d95} inc=${Math.round(rep.income)} net=${Math.round(rep.netDay)} money=${Math.round(s.money)} rep=${s.rep.toFixed(0)} plate=${Career.plateLife(s).toFixed(2)} trips=${sim.D.trips} tog=${sim.D.toggles} contracts=${s.contracts.length} jam=${sim.D.jamT.toFixed(0)} ovs=${sim.D.oversizeIn} blows=${sim.D.blows} fed=${sim.D.fedT.toFixed(0)} w=${w.kind} fill=${(sim.D.fillT||0).toFixed(0)} ${Object.entries(rep.prod).map(([k, v]) => k + ':' + v.toFixed(0)).join(',')}`);
}
console.log('done in', ((Date.now() - t0) / 1000).toFixed(0), 's; over', s.over);
function UPGRADES_find(id) { return ctx.UPGRADES ? ctx.UPGRADES.find(u => u.id === id) : null; }
