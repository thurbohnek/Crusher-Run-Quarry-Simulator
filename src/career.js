'use strict';
/* ============================================================
   career.js — the company: calendar, weather, products & market,
   orders, costs, maintenance, upgrades, bank. No DOM.
   Prices (kr/t ex. VAT) follow a Norwegian quarry price list.
   ============================================================ */
const PRODUCTS = {
  spreng: { name: 'Shot rock', spec: 'unscreened', price: 79, demand: 160 },
  k0250: { name: 'Crusher run 0/250', spec: 'D95 ≤ 250 mm', price: 126, demand: 130, top: 250 },
  k0120: { name: 'Crusher run 0/120', spec: 'D95 ≤ 120 mm', price: 126, demand: 150, top: 120 },
  k090: { name: 'Crusher run 0/90', spec: 'D95 ≤ 90 mm', price: 132, demand: 120, top: 90 },
  k063: { name: 'Sub-base 0/63', spec: 'D95 ≤ 63 mm', price: 136, demand: 190, top: 63 },
  f032: { name: 'Base course 0/32', spec: 'screened', price: 136, demand: 210 },
  f3263: { name: 'Aggregate 32/63', spec: 'screened', price: 150, demand: 110 },
  f63120: { name: 'Rock fill 63/120', spec: 'screened', price: 130, demand: 100 },
  f04: { name: 'Crusher dust 0/4', spec: 'crushed and screened', price: 112, demand: 90 },
  f48: { name: 'Chippings 4/8', spec: 'crushed and screened', price: 199, demand: 55 },
  f816: { name: 'Aggregate 8/16', spec: 'crushed and screened', price: 150, demand: 120 },
  f1632: { name: 'Aggregate 16/32', spec: 'crushed and screened', price: 179, demand: 110 },
  f02: { name: 'Manufactured sand 0/2', spec: 'VSI-shaped, washed', price: 238, demand: 70 },
  fill: { name: 'Fill 0/63 (scalpings)', spec: 'soil, sand and grit', price: 42, demand: 240, cheap: true }
};
const SIEVE = [4, 8, 16, 32, 63, 90, 120, 180, 250, 400, 600, 9999];

const UPGRADES = [
  { id: 'breaker', group: 'Equipment', name: 'Pedestal-mounted hydraulic breaker', price: 290000, desc: 'Fixed boom at the feed opening. Breaks oversize blocks and clears bridging while the crusher runs, with nobody swinging a sledgehammer.', req: (s) => true },
  { id: 'breaker2', group: 'Equipment', name: 'Heavier hydraulic breaker (2,000 J)', price: 520000, desc: 'Bigger hammer and longer boom. Needed once the blocks are a metre across.', req: (s) => s.up.breaker >= 1 && s.tier >= 2 },
  { id: 'hydro', group: 'Equipment', name: 'Hydraulic setting and overload protection', price: 0, desc: 'Replaces the toggle plate and shims with cylinders. Passes steel and clears overloads automatically, and empties the chamber in seconds.', req: (s) => s.tier >= 1 },
  { id: 'vfd', group: 'Equipment', name: 'Frequency converter for the feeder', price: 38000, desc: 'Variable speed drive on the feeder motors. Replaces the five fixed steps with a slider, so you can set the feed rate to the millimetre per second.', req: (s) => !s.up.vfd },
  { id: 'early', group: 'Equipment', name: 'Early start for the driver', price: 25000, desc: 'The driver starts at 06:00 and has the feeder and hopper loaded when you arrive. Crushing from the first minute. Costs half an hour extra pay per day.', req: (s) => !s.up.early },
  { id: 'autogrease', group: 'Equipment', name: 'Automatic lubrication system', price: 32000, desc: 'A pump and lines to every bearing. The eccentric bearings get their grease every day without you remembering it. The grease itself still costs.', req: (s) => !s.up.autogrease },
  { id: 'lights', group: 'Equipment', name: 'Floodlight masts', price: 48000, desc: 'Two masts with LED floods over the hopper and the belt. Work in the dark: winter mornings, and overtime after sunset.', req: (s) => !s.up.lights },
  { id: 'magnet', group: 'Equipment', name: 'Overband magnet', price: 95000, desc: 'Lifts steel off the conveyor before it ends up in the delivery. The steel is sold as scrap.', req: (s) => true },
  { id: 'loader2', group: 'Equipment', name: 'Dump truck 25 t', price: 650000, desc: 'A dump truck instead of the tractor. Bigger loads, and the feeder stays full.', req: (s) => s.up.loader < 1 },
  { id: 'truck2', group: 'Equipment', name: 'Second truck and driver', price: 420000, desc: 'Two trucks on the haul road: one tips while the other is loading at the bench. The feed never waits for the haul. A bigger crusher needs it. Extra driver and diesel per day.', req: (s) => !s.up.truck2 && (s.up.loader >= 1 || s.tier >= 1) },
  { id: 'loader3', group: 'Equipment', name: 'Dump truck 40 t', price: 1450000, desc: 'A big dump truck for a big quarry and a big crusher.', req: (s) => s.up.loader === 1 && s.tier >= 2 },
  { id: 'blast', group: 'Quarry', name: 'Electronic detonators and new blast plan', price: 120000, desc: 'More even blasting: fewer oversize blocks, more rock that fits the jaw. Drilling and blasting costs a little more per tonne.', req: (s) => !s.up.blast },
  { id: 'scalper', group: 'Quarry', name: 'Scalper (pre-screen under the grizzly)', price: 165000, desc: 'The soil, sand and grit that fall through the grizzly go down a chute to their own pile instead of into your product. Dirty loads no longer spoil the price; the scalpings are sold as cheap fill.', req: (s) => !s.up.scalper },
  { id: 'mobile', group: 'Quarry', name: 'Tracked chassis (mobile crusher)', price: 0, desc: 'Puts the jaw on crawler tracks so it walks to the face. Much shorter haul, about 40% less haulage cost, and you pick the bench you crush from. Belongs to this crusher.', req: (s) => !s.up.mobile && s.tier >= 1 },
  { id: 'dust', group: 'Quarry', name: 'Water spray dust suppression', price: 65000, desc: 'Nozzles over the feed opening and the conveyor. Much less dust, fewer complaints from the neighbours.', req: (s) => !s.up.dust },
  { id: 'sales', group: 'Plant', name: 'Sales office', price: 180000, desc: 'A part-time salesperson with a phone and a price list. One more request every day, and customers pay about 6% more. Costs a little per day.', req: (s) => !s.up.sales },
  { id: 'stockloader', group: 'Plant', name: 'Wheel loader for the stockpile', price: 380000, desc: 'Loads customers\' trucks straight from the pile and keeps the stock area tidy. You can sell about half as much again at spot price, and the pile never grows over the plant. Driver and diesel cost per day.', req: (s) => !s.up.stockloader },
  { id: 'sikt', group: 'Plant', name: 'Screening plant (3 decks)', price: 420000, desc: 'Screens the product into 0/32, 32/63 and 63/120. Pays better than unscreened.', req: (s) => !s.up.sikt },
  { id: 'kjegle', group: 'Plant', name: 'Cone crusher (secondary)', price: 1450000, desc: 'Crushes coarse material down to aggregate and chippings: 0/4, 4/8, 8/16 and 16/32. This is where the good prices are. Handles hard, abrasive rock with little wear.', req: (s) => s.up.sikt && !s.up.kjegle && !s.up.hsi },
  { id: 'hsi', group: 'Plant', name: 'Impact crusher (HSI, secondary)', price: 980000, desc: 'Horizontal shaft impactor instead of a cone: blow bars throw the rock against aprons. Cubical chippings that pay about 7% more and a finer product. Cheap in marble and schist, but the blow bars wear fast in hard gneiss, granite and gabbro.', req: (s) => s.up.sikt && !s.up.kjegle && !s.up.hsi },
  { id: 'vsi', group: 'Plant', name: 'VSI sand crusher (tertiary)', price: 1250000, desc: 'Vertical shaft impactor: rock-on-rock crushing of the fines into manufactured sand 0/2, the best paid product in the quarry. Takes part of the 0/4 and 4/8.', req: (s) => (s.up.kjegle || s.up.hsi) && !s.up.vsi },
  { id: 'line', group: 'Plant', name: 'New crushing line with crew', price: 2600000, desc: 'An extra line deeper in the quarry, with its own operator. Produces about 60% of what you manage yourself.', req: (s) => s.tier >= 2 && s.up.lines < 2 }
];

// ---------- milestones: the first ones teach the game, the later ones mark the way to a real quarry ----------
// check(s, D, f): s = save, D = today's counters (null between shifts), f = flags the UI sets (s.goals.flags)
const GOALS = [
  { id: 'tip1', name: 'Tip the first load', how: 'Tap Tip load. The tractor backs up the ramp and tips shot rock onto the vibrating feeder.', live: true, check: (s, D) => D && D.dumps >= 1, rep: 1 },
  { id: 'crush5', name: 'Crush 5 tonnes', how: 'The feeder shakes the rock into the jaw. Keep the ammeter out of the red.', live: true, check: (s, D) => D && D.tonnes >= 5, rep: 1 },
  { id: 'feed', name: 'Set the feeder speed', how: 'Use − and + under Feeder. Slower when the needle goes red, faster when the jaw runs empty.', live: true, check: (s, D, f) => !!f.feed, rep: 1 },
  { id: 'sledge', name: 'Break a block with the sledgehammer', how: 'Pick Sledge, hold your finger on top of a block in the feed opening, let go to strike. Corners first; it splits once the cracks have grown.', live: true, check: (s, D) => D && (D.splits + D.spalls) >= 1, rep: 2 },
  { id: 'shift1', name: 'Finish your first shift', how: 'Work until 15:00 and read the report: what you made, what it cost.', live: true, check: (s) => s.stats.days >= 1, rep: 2, grant: 15000 },
  { id: 'grease', name: 'Grease the bearings before a shift', how: 'Workshop → Grease. Every day. Dry bearings run hot and wear out.', check: (s, D, f) => !!f.grease || s.up.autogrease, rep: 1 },
  { id: 'order1', name: 'Accept an order', how: 'Orders → tap a request for details and the advised setting, then Accept.', check: (s, D, f) => !!f.order || s.contracts.length > 0 || s.stats.ordersDone > 0, rep: 1 },
  { id: 'deliver1', name: 'Deliver a whole order', how: 'Set the CSS the order asks for and keep crushing until it is filled. Late delivery costs 4% a day.', check: (s) => s.stats.ordersDone >= 1, rep: 3, grant: 20000 },
  { id: 'day150', name: 'Deliver 150 t in one day', how: 'Keep the chamber full all day: AUTO feed, the right feeder speed, and clear jams fast.', live: true, check: (s, D) => s.stats.bestDay >= 150 || (D && D.tonnes >= 150), rep: 2 },
  { id: 'spare', name: 'Keep a spare toggle plate in stock', how: 'Workshop → Spare toggle plate. Steel in the jaw snaps it; without a spare the plant stands for hours.', check: (s) => s.spareToggle >= 1 || s.up.hydro, rep: 1 },
  { id: 'plates', name: 'Turn or replace the jaw plates', how: 'Workshop → turn a plate when the bottom teeth are 30–50% worn, replace when both ends are gone.', check: (s, D, f) => !!f.plates, rep: 1 },
  { id: 'upgrade1', name: 'Buy your first upgrade', how: 'Equipment. Small things first: a spare, the frequency converter, early start.', check: (s) => (s.stats.upgrades || 0) >= 1, rep: 2 },
  { id: 'week', name: 'Run the quarry for two weeks', how: 'Ten working days without going bust.', check: (s) => s.stats.days >= 10, rep: 2 },
  { id: 'tier1', name: 'Buy the PE-600×900', how: 'Equipment → New crusher. Save up, or borrow against the machines in the Bank.', check: (s) => s.tier >= 1, rep: 4 },
  { id: 'sikt', name: 'Install the screening plant', how: 'Equipment → Plant. Screened products pay better and open new orders.', check: (s) => s.up.sikt, rep: 3 },
  { id: 't5000', name: 'Deliver 5,000 tonnes in total', how: 'Keep going.', check: (s) => s.stats.totalT >= 5000, rep: 3 },
  { id: 'tier2', name: 'Buy the PE-900×1200', how: 'A primary crusher for a proper quarry.', check: (s) => s.tier >= 2, rep: 5 },
  { id: 'kjegle', name: 'Install the cone crusher', how: 'Equipment → Plant. Chippings and fine aggregate: the best prices.', check: (s) => s.up.kjegle, rep: 4 },
  { id: 't50000', name: 'Deliver 50,000 tonnes in total', how: 'Two crushing lines help.', check: (s) => s.stats.totalT >= 50000, rep: 4 },
  { id: 'tier3', name: 'Buy the PE-1200×1500', how: 'The biggest jaw in the catalogue.', check: (s) => s.tier >= 3, rep: 6 },
  { id: 'lines', name: 'Run three crushing lines', how: 'Equipment → New crushing line with crew, twice.', check: (s) => s.up.lines >= 2, rep: 5 },
  { id: 'quarry', name: 'A real quarry: 250,000 tonnes', how: 'From a used PE-400 and a tractor to a quarry that supplies the whole region.', check: (s) => s.stats.totalT >= 250000, rep: 10, final: true }
];

const Career = (() => {
  const VERSION = 5;
  const KEY = 'rc_save_v5';
  const START = Date.UTC(2027, 3, 5);   // Monday 5 April 2027
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function newGame(company) {
    return {
      v: VERSION, company: company || 'Rockside Ltd', day: 1, money: 140000, loan: 0, rep: 40, seed: (Math.random() * 1e9) | 0,
      tier: 0, css: 70, plates0: 0.34, wearM: null, wearF: null, turnedM: false, turnedF: false,
      up: { breaker: 0, hydro: false, magnet: false, vfd: false, early: false, autogrease: false, lights: false, sales: false, stockloader: false, sikt: false, kjegle: false, loader: 0, blast: false, dust: false, lines: 0, truck2: false, scalper: false, mobile: false, hsi: false, vsi: false },
      blastPlan: 'normal', strip: false, bench: 'mixed',
      spareToggle: 0, guard: 1, bearing: 0.92, vbelt: 0.8, greased: false, lastGrease: 0,
      stock: {}, contracts: [], offers: [], offersDay: 0,
      stats: { totalT: 0, totalKr: 0, bestDay: 0, days: 0, crushes: 0, blows: 0, ordersDone: 0, ordersLate: 0, upgrades: 0, splits: 0 },
      goals: { done: {}, flags: {} }, autoFeed: false, hiMn: false,
      hist: [], neg: 0, over: false, tut: {}, sound: true, speed: 1, feedLv: 3, prodAvg: 0
    };
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.v === VERSION) { const d = newGame(s.company); const out = Object.assign(d, s); out.up = Object.assign(newGame().up, s.up || {}); out.stats = Object.assign(newGame().stats, s.stats || {}); out.tut = s.tut || {}; out.goals = Object.assign({ done: {}, flags: {} }, s.goals || {}); return out; } } catch (e) {}
    return null;
  }
  function store(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function wipe() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // ---------- calendar & weather ----------
  function dateOf(day) {
    // working days only (Mon–Fri)
    let d = START, n = 1;
    while (n < day) { d += 86400000; const wd = new Date(d).getUTCDay(); if (wd !== 0 && wd !== 6) n++; }
    return new Date(d);
  }
  function dateStr(day) { const d = dateOf(day); return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function month(day) { return dateOf(day).getUTCMonth(); }
  function seasonFactor(day) { const m = month(day); return [0.45, 0.45, 0.6, 1.0, 1.2, 1.25, 1.0, 1.15, 1.2, 1.05, 0.75, 0.5][m]; }
  function weather(s, day) {
    const r = makeRng(s.seed + day * 7919);
    const m = month(day), winter = m <= 2 || m >= 10;
    const u = r();
    let w;
    if (winter) w = u < 0.3 ? 'snø' : u < 0.5 ? 'frost' : u < 0.7 ? 'overskyet' : 'klart';
    else w = u < 0.28 ? 'regn' : u < 0.5 ? 'overskyet' : u < 0.62 ? 'tåke' : 'sol';
    const temp = Math.round((winter ? -6 : [0, 0, 0, 4, 9, 14, 16, 15, 10, 5, 0, 0][m]) + (r() - 0.5) * 8);
    return { kind: w, temp, wet: w === 'regn' || w === 'snø' ? 1 : w === 'tåke' ? 0.4 : 0, wind: r() };
  }
  // ---------- deposit: what rock the face gives as you work deeper ----------
  function deposit(s) {
    const d0 = depositBase(s);
    if (!s.up.mobile || !s.bench || s.bench === 'mixed') return d0;
    // a mobile crusher walks to the bench you choose: the upper bench is soft, the deep one hard
    const soft = s.bench === 'soft', out = {};
    for (const k in d0) out[k] = d0[k] * ((k === 'marmor' || k === 'skifer') === soft ? 2.4 : 0.35);
    return out;
  }
  function depositBase(s) {
    const d = s.stats.totalT;   // the more you have taken out, the deeper the bench
    if (d < 2500) return { marmor: 55, skifer: 35, gneis: 10 };
    if (d < 12000) return { marmor: 30, skifer: 20, gneis: 40, granitt: 10 };
    if (d < 45000) return { marmor: 15, skifer: 10, gneis: 40, granitt: 30, gabbro: 5 };
    return { marmor: 10, gneis: 30, granitt: 35, gabbro: 25 };
  }
  function depositName(s) { const d = deposit(s); return Object.entries(d).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => MATS[k].name.toLowerCase()).join(' and '); }

  // ---------- products ----------
  function d95(hist) {
    const tot = hist.reduce((a, b) => a + b, 0); if (!tot) return 0;
    let acc = 0;
    for (let i = 0; i < hist.length; i++) { acc += hist[i]; if (acc / tot >= 0.95) return SIEVE[i]; }
    return 9999;
  }
  const ALLIN = ['k063', 'k090', 'k0120', 'k0250'];
  function fits(have, want) { return have === want || (ALLIN.includes(want) && ALLIN.indexOf(have) >= 0 && ALLIN.indexOf(have) < ALLIN.indexOf(want)); }
  function allInKey(top) { return top <= 63 ? 'k063' : top <= 90 ? 'k090' : top <= 120 ? 'k0120' : top <= 250 ? 'k0250' : 'spreng'; }
  function canMake(s) {
    if (s.up.kjegle || s.up.hsi) return (s.up.vsi ? ['f02'] : []).concat(['f04', 'f48', 'f816', 'f1632', 'f3263', 'f63120']);
    if (s.up.sikt) return ['f032', 'f3263', 'f63120'];
    return ['k063', 'k090', 'k0120', 'k0250'];
  }
  // split the day's measured gradation into saleable products
  function classify(s, hist, tonnes) {
    const out = {};
    const add = (k, t) => { if (t > 0.01) out[k] = (out[k] || 0) + t; };
    const H = Array.from(hist);
    if (!s.up.sikt) { add(allInKey(d95(H)), tonnes); return out; }
    const fine = H[0] + H[1] + H[2] + H[3], b3263 = H[4], b63120 = H[5] + H[6], over = H.slice(7).reduce((a, b) => a + b, 0);
    if (!s.up.kjegle && !s.up.hsi) { add('f032', fine); add('f3263', b3263); add('f63120', b63120); add('spreng', over); return out; }
    // the secondary takes the coarse stream (with capacity), its product is screened with the jaw fines.
    // An impactor has a bigger reduction ratio: more capacity and a finer, more cubical product than a cone
    const hsi = s.up.hsi && !s.up.kjegle, cap = [260, 520, 1300, 2600][s.tier] * (hsi ? 1.25 : 1);
    const coarse = b3263 + b63120 + over, toSec = Math.min(coarse, cap), left = coarse - toSec;
    const sp = hsi ? [0.26, 0.16, 0.27, 0.31] : [0.2, 0.14, 0.27, 0.39];
    let f04 = H[0] + toSec * sp[0], f48 = H[1] + toSec * sp[1];
    if (s.up.vsi) { const cap3 = [90, 180, 420, 800][s.tier], take = Math.min(cap3, f04 * 0.55 + f48 * 0.35), k = take / Math.max(1e-9, f04 * 0.55 + f48 * 0.35); add('f02', take * 0.96); f04 -= f04 * 0.55 * k; f48 -= f48 * 0.35 * k; add('f04', take * 0.04); }
    add('f04', f04); add('f48', f48); add('f816', H[2] + toSec * sp[2]); add('f1632', H[3] + toSec * sp[3]);
    if (left > 0) { const k = left / coarse; add('f3263', b3263 * k); add('f63120', (b63120 + over) * k); }
    Object.defineProperty(out, '_sec', { value: toSec, enumerable: false });
    return out;
  }
  // expected share of the product passing d (mm) at a CSS: scaled from your last shift's grading if there
  // is one (crusher products are close to self-similar in CSS), otherwise a Rosin–Rammler fit of the jaw
  function passing(s, css, d) {
    if (d >= 9999) return 1;
    if (s.lastHist && s.lastCss) {
      const dd = d * s.lastCss / css, cum = []; let a = 0; for (let i = 0; i < SIEVE.length; i++) { a += s.lastHist[i] || 0; cum.push(a); }
      if (dd <= SIEVE[0]) return cum[0] * dd / SIEVE[0];
      for (let i = 1; i < SIEVE.length; i++) if (dd <= SIEVE[i]) { const t = Math.log(dd / SIEVE[i - 1]) / Math.log(SIEVE[i] / SIEVE[i - 1]); return cum[i - 1] + (cum[i] - cum[i - 1]) * t; }
      return 1;
    }
    const d63 = 0.72 * css; return 0.06 + 0.94 * (1 - Math.exp(-Math.pow(d / d63, 2.05)));
  }
  const RANGE = { f032: [0, 32], f3263: [32, 63], f63120: [63, 120] };
  // what to set the jaw to for a product, and what share of the output it will be
  function advise(s, key) {
    const T = TIERS[s.tier], P = PRODUCTS[key], lo = T.css[0], hi = T.css[1];
    const r = { key, css: null, share: 1, needs: [], note: '' };
    if (['f04', 'f48', 'f816', 'f1632'].includes(key)) {
      if (!s.up.sikt) r.needs.push('screening plant'); if (!s.up.kjegle) r.needs.push('cone crusher');
      r.css = Math.round((lo + (hi - lo) * 0.3) / 5) * 5;
      const sh = { f04: 0.2, f48: 0.14, f816: 0.27, f1632: 0.39 }[key];
      r.share = sh * 0.85; r.note = 'The cone crusher makes these from everything over 32 mm. A smaller CSS on the jaw gives the cone less work and more capacity.';
      return r;
    }
    if (RANGE[key]) {
      if (!s.up.sikt) r.needs.push('screening plant');
      // the widest setting that still gives (almost) the most of this fraction: more capacity, less wear
      const sh = (c) => { const [a, b] = RANGE[key]; return passing(s, c, b) - passing(s, c, a); };
      let bs = -1; for (let c = lo; c <= hi; c += 5) bs = Math.max(bs, sh(c));
      let best = lo; for (let c = lo; c <= hi; c += 5) if (sh(c) >= bs - 0.025) best = c;
      bs = sh(best);
      r.css = best; r.share = Math.max(0, bs);
      r.note = 'The screen sorts the whole output into 0/32, 32/63 and 63/120 at the same time, so one setting serves all screened orders. A tighter CSS also lowers the capacity.';
      return r;
    }
    if (P.top) {
      if (s.up.sikt) r.note = 'With the screening plant running, the output is sold screened, not as an all-in mix.';
      const c = Math.floor((P.top / 1.45 - 5) / 5) * 5;
      if (c < lo) { r.css = lo; r.share = 0; r.note = `Your crusher cannot go below ${lo} mm, which gives a top size of about ${Math.round(lo * 1.45)} mm. You need a screen to make this.`; if (!s.up.sikt) r.needs.push('screening plant'); }
      else { r.css = Math.min(hi, c); r.note = r.note || `The top size (D95) is about 1.45 × CSS. Keep ~5 mm margin: worn plates open the gap during the day. Any finer all-in also counts.`; }
      return r;
    }
    r.css = hi; r.note = 'Shot rock is anything the crusher lets through.';
    return r;
  }
  function quality(byMat) {
    let t = 0, q = 0; for (const k in byMat) { t += byMat[k]; q += byMat[k] * MATS[k].price; }
    return t ? q / t : 1;
  }
  function spotPrice(s, key, day) {
    const r = makeRng(s.seed + day * 31 + key.length * 97);
    return Math.round(PRODUCTS[key].price * (0.95 + r() * 0.1) * (seasonFactor(day) > 1 ? 1.03 : seasonFactor(day) < 0.7 ? 0.95 : 1));
  }
  function demand(s, key, day) {
    const size = (1 + s.tier * 0.6 + s.up.lines * 0.5) * (s.up.stockloader ? 1.5 : 1);   // a bigger plant reaches a wider market, but not without limit
    return Math.round(PRODUCTS[key].demand * 1.5 * seasonFactor(day) * (0.7 + s.rep / 150) * size);
  }

  // ---------- orders ----------
  const CUSTOMERS = [
    ['Riverside Council', 'water main trench'], ['County Highways', 'road widening'], ['Baker & Sons Builders', 'house plot'],
    ['National Roads Agency', 'motorway junction'], ['Northern Power', 'access road to a substation'], ['Harbour Industrial Park', 'foundation for a new hall'],
    ['Valley Council', 'footpath and cycle track'], ['Stonebridge Construction', 'car park'], ['Private customer', 'driveway and drainage'],
    ['Rail Network', 'level crossing'], ['Coastline Fish Farms', 'quay and breakwater'], ['City Asphalt Works', 'aggregate for asphalt']
  ];
  function genOffers(s) {
    const r = makeRng(s.seed + s.day * 131);
    const prods = canMake(s);
    const avg = Math.max(60, s.prodAvg || [120, 380, 1100, 2200][s.tier]);
    const n = Math.max(0, Math.min(s.up.sales ? 4 : 3, (s.up.sales ? 5 : 4) - s.offers.length));
    for (let i = 0; i < n; i++) {
      const [cust, job] = CUSTOMERS[Math.floor(r() * CUSTOMERS.length)];
      // now and then an order for something you cannot make yet — a reason to invest
      const future = r() < 0.18 && !s.up.kjegle;
      let pool = future ? (s.up.sikt ? ['f48', 'f816', 'f1632'] : ['f032', 'f3263']) : prods;
      if (!future && !s.up.sikt && s.lastMain && r() < 0.65) pool = ALLIN.filter(k => fits(s.lastMain, k));
      const key = pool[Math.floor(r() * pool.length)];
      const days = future ? 8 + Math.floor(r() * 7) : 2 + Math.floor(r() * 5);
      const t = Math.max(30, Math.round(avg * (0.3 + r() * 0.5) * days / 10) * 10);
      const prem = 1.08 + r() * 0.2 + s.rep / 1000 + (s.up.sales ? 0.06 : 0);
      s.offers.push({ id: s.day * 10 + i + Math.floor(r() * 1e6), cust, job, key, t, price: Math.round(PRODUCTS[key].price * prem), days, need: future, made: 0 });
    }
    s.offersDay = s.day;
  }
  function acceptOffer(s, id) {
    if (s.contracts.length >= 4) return 'full';
    const i = s.offers.findIndex(o => o.id === id); if (i < 0) return 'gone';
    const o = s.offers.splice(i, 1)[0];
    o.due = s.day + o.days; o.made = 0; s.contracts.push(o);
    return 'ok';
  }
  function declineOffer(s, id) { s.offers = s.offers.filter(o => o.id !== id); }

  // ---------- money ----------
  function machineValue(s) {
    let v = TIERS[s.tier].price || 180000;
    for (const u of UPGRADES) if (owned(s, u.id)) v += priceOf(s, u) * 0.6;
    return v;
  }
  function loanLimit(s) { return Math.round((200000 + machineValue(s) * 0.55) / 10000) * 10000; }
  function owned(s, id) {
    const u = s.up;
    switch (id) {
      case 'vfd': return u.vfd; case 'early': return u.early; case 'autogrease': return u.autogrease; case 'lights': return u.lights; case 'sales': return u.sales; case 'stockloader': return u.stockloader; case 'breaker': return u.breaker >= 1; case 'breaker2': return u.breaker >= 2; case 'hydro': return u.hydro; case 'magnet': return u.magnet;
      case 'loader2': return u.loader >= 1; case 'loader3': return u.loader >= 2; case 'blast': return u.blast; case 'dust': return u.dust;
      case 'sikt': return u.sikt; case 'kjegle': return u.kjegle; case 'line': return false;
    }
    return !!u[id];
  }
  function priceOf(s, u) {
    if (u.id === 'hydro') return [0, 240000, 620000, 1100000][s.tier];
    if (u.id === 'line') return u.price * (s.up.lines + 1);
    if (u.id === 'mobile') return [0, 380000, 720000, 1300000][s.tier];
    return u.price;
  }
  function buyUpgrade(s, id) {
    const u = UPGRADES.find(x => x.id === id); if (!u || owned(s, id) || !u.req(s)) return 'no';
    const p = priceOf(s, u); if (s.money < p) return 'money';
    s.money -= p; s.stats.upgrades = (s.stats.upgrades || 0) + 1;
    const up = s.up;
    if (id === 'vfd') up.vfd = true; else if (id === 'early') up.early = true; else if (id === 'autogrease') up.autogrease = true; else if (id === 'lights') up.lights = true; else if (id === 'sales') up.sales = true; else if (id === 'stockloader') up.stockloader = true; else if (id === 'breaker') up.breaker = 1; else if (id === 'breaker2') up.breaker = 2; else if (id === 'hydro') up.hydro = true; else if (id === 'magnet') up.magnet = true;
    else if (id === 'loader2') up.loader = 1; else if (id === 'loader3') up.loader = 2; else if (id === 'blast') up.blast = true; else if (id === 'dust') up.dust = true;
    else if (id === 'sikt') up.sikt = true; else if (id === 'kjegle') up.kjegle = true; else if (id === 'line') up.lines++;
    else up[id] = true;
    return 'ok';
  }
  function buyTier(s) {
    const next = TIERS[s.tier + 1]; if (!next) return 'no';
    const trade = Math.round((TIERS[s.tier].price || 180000) * 0.32);
    const p = next.price - trade; if (s.money < p) return 'money';
    s.money -= p; s.tier++;
    s.wearM = null; s.wearF = null; s.plates0 = 0; s.hiMn = false; s.turnedM = s.turnedF = false; s.up.hydro = false; s.up.mobile = false; s.bench = 'mixed'; s.spareToggle = 0;
    s.css = Math.round((next.css[0] + next.css[1]) / 2 / 5) * 5; s.bearing = 1; s.vbelt = 1;
    return 'ok';
  }
  function tierOffer(s) { const next = TIERS[s.tier + 1]; if (!next) return null; const trade = Math.round((TIERS[s.tier].price || 180000) * 0.32); return { next, trade, price: next.price - trade }; }

  // ---------- maintenance ----------
  function turnPlates(s, which) {
    const k = which === 'M' ? 'wearM' : 'wearF', tk = which === 'M' ? 'turnedM' : 'turnedF';
    if (!s[k] || s[tk]) return 'no';
    s[k] = s[k].slice().reverse(); s[tk] = true; return 'ok';
  }
  function newPlates(s, hiMn) {
    const p = Math.round(TIERS[s.tier].plates * (hiMn ? 1.6 : 1)); if (s.money < p) return 'money';
    s.money -= p; s.hiMn = !!hiMn; s.wearM = s.wearM ? s.wearM.map(() => 0) : null; s.wearF = s.wearF ? s.wearF.map(() => 0) : null; s.plates0 = 0; s.turnedM = s.turnedF = false; return 'ok';
  }
  function buySpareToggle(s) { const p = TIERS[s.tier].toggle; if (s.money < p) return 'money'; s.money -= p; s.spareToggle++; return 'ok'; }
  function newBelts(s) { const p = [3200, 5400, 11800, 19600][s.tier]; if (s.money < p) return 'money'; s.money -= p; s.vbelt = 1; return 'ok'; }
  function newGuard(s) { const p = [9000, 16000, 30000, 52000][s.tier]; if (s.money < p) return 'money'; s.money -= p; s.guard = 1; return 'ok'; }
  function grease(s) { s.greased = true; return 'ok'; }
  function bearingService(s) { const p = [18000, 34000, 72000, 140000][s.tier]; if (s.money < p) return 'money'; s.money -= p; s.bearing = 1; return 'ok'; }
  function plateLife(s) {
    const wm = s.wearM || [], wf = s.wearF || [];
    const w = Math.max(0, ...wm, ...wf, s.plates0 || 0);
    return clamp(1 - w, 0, 1);
  }
  function healthFactor(s) { return (0.75 + 0.25 * s.bearing) * (0.82 + 0.18 * s.vbelt); }

  // ---------- end of day ----------
  function endDay(s, D, sim) {
    const day = s.day;
    const T = TIERS[s.tier];
    const rep = { day, date: dateStr(day), lines: [], costs: [], deliveries: [], events: [] };
    // production into stock
    const prod = classify(s, D.hist, D.tonnes);
    const qm = quality(D.byMat);
    { let tot = 0; for (const k in D.byMat) tot += D.byMat[k]; const soil = tot ? (D.byMat.jord || 0) / tot : 0; rep.soil = soil;
      if (soil > 0.08) rep.events.push({ good: false, text: `${Math.round(soil * 100)}% of today's product was soil and gravel from dirty loads. Customers pay less for it.` + (!s.up.scalper ? ' A scalper under the grizzly keeps it out of the product' + (s.strip ? '.' : ', and stripping the overburden (Workshop) keeps it out of the loads.') : '') });
      if (D.fillT > 0.5) { s.stock.fill = (s.stock.fill || 0) + D.fillT; rep.fillT = D.fillT; } }
    for (const k in prod) s.stock[k] = (s.stock[k] || 0) + prod[k];
    // extra lines (crew) produce 60 % of your average into the same products
    let linesT = 0;
    if (s.up.lines) {
      linesT = s.up.lines * 0.6 * Math.max(D.tonnes, s.prodAvg * 0.8);
      const share = classify(s, D.hist.map ? D.hist : D.hist, 1);
      for (const k in share) s.stock[k] = (s.stock[k] || 0) + share[k] * linesT;
    }
    // contracts get stock first
    let income = 0;
    for (const c of s.contracts) {
      // a finer all-in material meets a coarser spec (0/63 is fine where 0/90 is asked for)
      const srcs = ALLIN.includes(c.key) ? [c.key, ...ALLIN.slice(0, ALLIN.indexOf(c.key)).reverse()] : [c.key];
      let take = 0;
      for (const k of srcs) { const need = c.t - c.made - take, have = s.stock[k] || 0, tk = Math.min(need, have); if (tk > 0) { take += tk; s.stock[k] = have - tk; } }
      if (take > 0) { c.made += take; const kr = take * c.price * qOf(c.key); income += kr; rep.deliveries.push({ c, take, kr }); }
    }
    function qOf(k) { return k === 'fill' ? 1 : qm * (s.up.hsi && !s.up.kjegle && (k === 'f48' || k === 'f816' || k === 'f1632') ? 1.07 : 1); }
    const done = [], late = [];
    for (const c of s.contracts) {
      if (c.made >= c.t - 0.5) { done.push(c); s.rep = Math.min(100, s.rep + 3); s.stats.ordersDone = (s.stats.ordersDone || 0) + 1; rep.events.push({ good: true, text: `${c.cust}: the order for ${Math.round(c.t)} t ${PRODUCTS[c.key].name} is delivered.` }); }
      else if (day >= c.due) {
        const over = day - c.due + 1;
        if (over >= 3) { late.push(c); s.rep = Math.max(0, s.rep - 9); s.stats.ordersLate = (s.stats.ordersLate || 0) + 1; rep.events.push({ good: false, text: `${c.cust} cancelled the order: three days late.` }); }
        else { const fee = Math.round(c.t * c.price * 0.04); rep.costs.push(['Daily penalty, late order (' + c.cust + ')', -fee]); s.rep = Math.max(0, s.rep - 2); }
      }
    }
    s.contracts = s.contracts.filter(c => !done.includes(c) && !late.includes(c));
    // spot market sells what demand allows
    const sales = [];
    for (const k in s.stock) {
      const have = s.stock[k]; if (have < 0.5) { delete s.stock[k]; continue; }
      const reserved = s.contracts.filter(c => c.key === k).reduce((a, c) => a + (c.t - c.made), 0);
      const sellable = Math.max(0, have - reserved * 0.5);
      const sell = Math.min(sellable, demand(s, k, day));
      if (sell > 0.5) { const price = spotPrice(s, k, day) * qOf(k); s.stock[k] = have - sell; income += sell * price; sales.push({ k, t: sell, price }); }
    }
    rep.sales = sales;
    // costs
    const fedT = Math.max(0, D.fedT - (D.leftT || 0)) + linesT * 1.08;
    const bl = Sim.blastSpec(s), blastKr = fedT * (28 + bl.kr);
    const loaderKr = [4400, 6900, 11200][s.up.loader] * (1 + s.up.lines * 0.8) * (s.up.mobile ? 0.6 : 1) * (s.up.truck2 ? 1.85 : 1);
    const energyKr = (D.kWh * (1 + s.up.lines * 0.6)) * 1.35 + (s.up.sikt ? 600 : 0) + (s.up.kjegle ? 2400 : 0) + (s.up.hsi ? 2100 : 0) + (s.up.vsi ? 1800 : 0) + (s.up.scalper ? 150 : 0);
    const royalty = (D.tonnes + linesT) * 8;
    const fixed = [1400, 2600, 5200, 9800][s.tier] + (s.up.sikt ? 800 : 0) + (s.up.kjegle ? 1900 : 0) + (s.up.hsi ? 1500 : 0) + (s.up.vsi ? 1200 : 0) + s.up.lines * 6500;
    const crew = s.up.lines * 7800;
    const grease = s.greased ? [150, 220, 380, 600][s.tier] : 0;
    const interest = Math.round(s.loan * 0.075 / 250 + Math.max(0, -s.money) * 0.12 / 250);
    const repairs = D.toggles * (s.spareToggle >= 0 ? 0 : 0);
    const wearKr = (D.tonnes + linesT) * 9;            // liners, screens, hydraulic oil, service
    const wage = 3400;                                  // your own day's pay (operator)
    // blow bars and aprons in the impactor wear with the abrasiveness of the rock
    if (s.up.hsi && !s.up.kjegle && prod._sec) { let t = 0, a = 0; for (const k in D.byMat) { if (!MATS[k] || MATS[k].soil) continue; t += D.byMat[k]; a += D.byMat[k] * MATS[k].ai; } const ai = t ? a / t : 0.3; rep.costs.push(['Blow bars and aprons, impact crusher (' + (ai < 0.15 ? 'soft' : ai < 0.4 ? 'medium' : 'hard, abrasive') + ' rock)', -Math.round(prod._sec * (2 + 60 * ai))]); }
    if (s.strip) rep.costs.push(['Stripping overburden (' + Math.round(fedT) + ' t)', -Math.round(fedT * 4)]);
    rep.costs.push(['Drilling and blasting, ' + (Sim.BLAST[s.blastPlan || 'normal'] || Sim.BLAST.normal).name.toLowerCase() + ' plan (' + Math.round(fedT) + ' t)', -blastKr], ['Haulage from the bench (' + (s.up.truck2 ? 'two trucks, ' : '') + (s.up.mobile ? 'short haul, ' : '') + 'drivers and diesel)', -loaderKr], ['Electricity (' + Math.round(D.kWh) + ' kWh)', -energyKr],
      ['Wear parts and service (per tonne)', -wearKr], ['Your own wages', -wage],
      ['Landowner royalty (per tonne)', -royalty], ['Insurance, permits, office', -fixed]);
    if (D.otHours > 0.05) { rep.otHours = D.otHours; rep.costs.push(['Overtime ' + D.otHours.toFixed(1) + ' h (50% premium)', -Math.round(D.otHours * (wage / 8 + loaderKr / 8 * (1 + s.up.lines * 0.3)) * 1.5)]); }
    if (crew) rep.costs.push(['Crew, extra lines', -crew]);
    if (s.up.early) rep.costs.push(['Driver early start (½ h)', -Math.round([4400, 6900, 11200][s.up.loader] / 16)]);
    if (s.up.sales) rep.costs.push(['Sales office', -900]);
    if (s.up.stockloader) rep.costs.push(['Wheel loader, stockpile (driver and diesel)', -1400]);
    if (s.up.lights && D.darkT > 0.05) rep.costs.push(['Floodlights (' + D.darkT.toFixed(1) + ' h)', -Math.round(D.darkT * 24 * 1.35)]);
    if (D.leftT > 0.5) rep.events.push({ good: true, text: Math.round(D.leftT) + ' t of rock is still in the hopper and on the feeder. It waits there for tomorrow and is only paid for when it is crushed.' });
    if (grease) rep.costs.push(['Bearing lubrication', -grease]);
    if (interest) rep.costs.push(['Interest', -interest]);
    if (D.toggleKr) rep.costs.push(['Toggle plate', -D.toggleKr]);
    if (D.claimKr) rep.costs.push(['Claim: steel in the delivery', -D.claimKr]);
    if (D.beltDmgKr) { rep.costs.push(['Repair: rock over the edge (' + D.overspill + ' pcs)', -D.beltDmgKr]); rep.events.push({ good: false, text: `${D.overspill} rocks went over the edge behind the swing jaw and hit the eccentric shaft and the conveyor.` }); }
    if ((s.guard ?? 1) <= 0) rep.events.push({ good: false, text: 'The guard plate over the flywheel is smashed. Replace it in the Workshop before the next shift.' });
    else if (D.guardHits > 6) rep.events.push({ good: false, text: `The guard plate took ${D.guardHits} heavy hits today. The hopper has been overfilled.` });
    if (D.scrap) income += D.scrap * 450, rep.lines.push(['Scrap iron (' + D.scrap + ' pcs)', D.scrap * 450]);
    void repairs;
    const costs = -rep.costs.reduce((a, c) => a + c[1], 0);
    // dust complaints: dry, windy days without water spray
    const w = weather(s, day);
    if (!s.up.dust && !w.wet && w.wind > 0.72 && D.tonnes > 60) { const fine = 8000; s.money -= fine; rep.costs.push(['Neighbour complaint about dust (fine)', -fine]); s.rep = Math.max(0, s.rep - 3); rep.events.push({ good: false, text: 'The neighbours complained about dust. Water spray helps.' }); }
    s.money += income - costs;
    rep.income = income;
    if (D.tonnes > 5) { const tot = D.hist.reduce ? Array.from(D.hist).reduce((x, y) => x + y, 0) : 0; if (tot > 0) { s.lastHist = Array.from(D.hist).map(v => v / tot); s.lastCss = s.css; } }
    rep.prod = prod; rep.qm = qm; { const mk = Object.entries(prod).sort((a, b) => b[1] - a[1])[0]; if (mk) s.lastMain = mk[0]; } rep.tonnes = D.tonnes; rep.linesT = linesT; rep.d95 = d95(Array.from(D.hist));
    // wear & maintenance
    if (s.up.autogrease && !s.greased) { s.greased = true; rep.costs.push(['Grease (automatic lubrication)', -[150, 220, 380, 600][s.tier]]); }
    if (!s.greased) { s.bearing = Math.max(0, s.bearing - 0.07); if (day - s.lastGrease > 2) rep.events.push({ good: false, text: 'The bearings were not greased. The temperature is rising and the bearings are wearing.' }); }
    else { s.lastGrease = day; s.bearing = Math.min(1, s.bearing + 0.01); }
    s.greased = false;
    s.vbelt = Math.max(0, s.vbelt - 0.01 - (D.slipT || 0) * 0.02);
    // stats
    rep.prevT = s.hist.length ? s.hist[s.hist.length - 1].t : null; rep.newBest = s.stats.days >= 1 && D.tonnes > s.stats.bestDay;
    s.stats.totalT += D.tonnes + linesT; s.stats.totalKr += income; s.stats.days++; s.stats.bestDay = Math.max(s.stats.bestDay, D.tonnes);
    s.stats.crushes += D.crushes; s.stats.blows += D.blows; s.stats.splits = (s.stats.splits || 0) + (D.splits || 0) + (D.spalls || 0);
    s.prodAvg = s.prodAvg ? s.prodAvg * 0.7 + D.tonnes * 0.3 : D.tonnes;
    s.hist.push({ day, t: Math.round(D.tonnes + linesT), net: Math.round(income - costs), money: Math.round(s.money) });
    if (s.hist.length > 60) s.hist.shift();
    // money trouble: the bank allows −100 000 on the credit line; five days below that ends the company
    if (s.money < -100000) s.neg++; else s.neg = 0;
    if (s.neg >= 5) s.over = true;
    rep.money = s.money; rep.netDay = income - costs - (rep.costs.find(c => c[0].startsWith('Neighbour complaint')) ? 8000 : 0);
    s.day++;
    s.offers = s.offers.filter(o => Math.random() < 0.6);
    genOffers(s);
    return rep;
  }
  // milestones: returns the goals completed just now (and applies their rewards)
  function checkGoals(s, D) {
    if (!s.goals) s.goals = { done: {}, flags: {} };
    const out = [];
    for (const g of GOALS) {
      if (s.goals.done[g.id]) continue;
      let ok = false; try { ok = !!g.check(s, D, s.goals.flags || {}); } catch (e) { ok = false; }
      if (!ok) continue;
      s.goals.done[g.id] = s.day; s.rep = Math.min(100, s.rep + (g.rep || 0));
      if (g.grant) { s.money += g.grant; }
      out.push(g);
    }
    return out;
  }
  // the next goal to show: the first not done (tutorial goals in order, later ones as they come)
  function nextGoal(s) { if (!s.goals) return null; return GOALS.find(g => !s.goals.done[g.id]) || null; }
  function goalsDone(s) { return s.goals ? Object.keys(s.goals.done).length : 0; }
  function takeLoan(s, amt) { const lim = loanLimit(s); const a = Math.min(amt, lim - s.loan); if (a <= 0) return 'limit'; s.loan += a; s.money += a; return 'ok'; }
  function repay(s, amt) { const a = Math.min(amt, s.loan, Math.max(0, s.money)); if (a <= 0) return 'no'; s.loan -= a; s.money -= a; return 'ok'; }

  return {
    VERSION, newGame, load, store, wipe, dateOf, dateStr, month, weather, deposit, depositName, seasonFactor,
    d95, classify, canMake, fits, passing, advise, ALLIN, quality, spotPrice, demand, genOffers, acceptOffer, declineOffer,
    machineValue, loanLimit, owned, priceOf, buyUpgrade, buyTier, tierOffer, turnPlates, newPlates, buySpareToggle, newBelts, newGuard, grease, bearingService, plateLife, healthFactor,
    endDay, takeLoan, repay, GOALS, checkGoals, nextGoal, goalsDone
  };
})();
