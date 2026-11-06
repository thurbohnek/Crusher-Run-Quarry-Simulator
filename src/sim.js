'use strict';
/* ============================================================
   sim.js — the crusher world: physics, rocks, fines, feeding,
   the operator's tools, delivery and the day's measurements.
   No DOM here, so it runs headless in tests.
   Time: the physics runs in real time; a day's accounting is a
   time-lapse (TL) of the 8-hour shift.
   ============================================================ */
const DAY_LEN = 150;                      // seconds of play per shift
const TL = 8 * 3600 / DAY_LEN;            // real seconds of plant time per played second

class Sim {
  constructor(save, opt = {}) {
    this.save = save;                     // machine part of the career save (tier, css, wear, upgrades)
    this.rng = makeRng(opt.seed ?? (Date.now() & 0xffffff));
    this.tier = TIERS[save.tier];
    this.mmpx = Machine.mmpxOf(this.tier);
    // the side view shows one slice of the chamber: a wider jaw (600, 900, 1200, 1500 mm) has more slices side by side
    this.W = [1, 1.15, 1.3, 1.45][save.tier] || 1; this.TLm = TL * this.W;
    this.g = 9810 / this.mmpx;            // real gravity in px/s²
    this.beltV = 1250 / this.mmpx;        // 1.25 m/s belt
    this.world = new Phys.World({ gy: this.g, velIters: 8, posIters: 3 });
    this.world.sleepLin = 0.012 * 1000 / this.mmpx;   // 12 mm/s
    this.m = { pendingJ: 0 };
    const up = save.up || {};
    this.up = up;
    this.health = (0.75 + 0.25 * (save.bearing ?? 1)) * (0.82 + 0.18 * (save.vbelt ?? 1));
    this.rocks = []; this.parts = []; this.fx = []; this.time = 0; this.stepN = 0;
    this.weather = opt.weather || { wet: 0 };
    this.tool = null; this.sledge = null; this.pry = null; this.lift = null; this.breaker = null;
    this.loader = { queue: [], t: 0, busy: false, cd: 0 };
    this.D = this.newDay();
    Machine.build(this);
    Machine.initDrive(this);
    this.grid = new Map(); this.gridT = 0;
    this.listeners = [];
  }
  newDay() {
    return { tonnes: 0, kg: 0, hist: new Float64Array(12), byMat: {}, kWh: 0, crushes: 0, blows: 0, spalls: 0, splits: 0, trips: 0, toggles: 0, reliefs: 0, clears: 0,
      rejectT: 0, bySrc: {}, steelOut: 0, scrap: 0, maxAmps: 0, fedT: 0, dumps: 0, jamT: 0, oversizeIn: 0 };
  }
  emit(t, o = {}) { o.t = t; this.fx.push(o); if (this.fx.length > 400) this.fx.splice(0, 100); }
  on(fn) { this.listeners.push(fn); }
  event(type, o = {}) {
    const M = this.m; let fired = true;
    if (type === 'trip' && M.state === 'run') {
      M.state = 'trip'; M.timer = 150 / TL; /* thermal relay cools ~2½ min */ this.D.trips++; this.emit('trip');
    } else if (type === 'toggle' && (M.state === 'run' || M.state === 'relief') && !M.toggleBroken) {
      M.toggleBroken = true; M.phiFree = M.phi; M.phiOpen = M.phi + 0.14; M.state = 'broken'; this.D.toggles++;
      // with a spare on the shelf it is a quarter of an hour's job; without, someone drives to Mo for one
      if ((this.save.spareToggle || 0) > 0) { this.save.spareToggle--; M.timer = 40 * 60 / TL; /* spare on the shelf: ~40 min */ this.D.toggleKr = (this.D.toggleKr || 0) + 2500; }
      else { M.timer = 3 * 3600 / TL; /* no spare: fetch one from town, ~3 h */ this.D.toggleKr = (this.D.toggleKr || 0) + this.tier.toggle * 1.25 + 2500; }
      this.emit('toggle', { x: Machine.G.FX - 80, y: Machine.G.BOT });
    } else if (type === 'relief' && M.state === 'run') {
      M.state = 'relief'; M.timer = 0.9; this.D.reliefs++; this.emit('relief', o);
    } else if (type === 'cleared') this.emit('cleared');
    else if (type === 'guardBroken' || type === 'overspill') this.emit(type, o);
    else fired = false;
    if (fired) for (const f of this.listeners) f(type, o);
  }

  // ---------- rocks ----------
  static sieveSize(minW, De, thMm) { const v = [minW, De * 1.1, thMm].sort((p, q) => p - q); return v[1]; }
  addRock(poly, x, y, a, mat, o = {}) {
    poly = Poly.simplify(poly, 2.4, 0.015);
    if (poly.length < 3) return null;
    if (Poly.area(poly) < 0) poly.reverse();
    const pr = Rocks.props(poly, mat, this.mmpx, o.thick);
    const b = new Phys.Body(Phys.DYNAMIC, x, y, a);
    b.addShape(poly, { friction: mat.steel ? 0.38 : (this.weather.wet ? 0.62 : 0.72), restitution: mat.steel ? 0.25 : 0.12 });
    const Iu = Poly.inertia(poly);
    b.setMass(pr.mass, pr.mass * Iu);
    b.linDamp = 0.08; b.angDamp = 1.2;
    const r = {
      mat, poly, A: pr.A, th: pr.th, mass: pr.mass, De: pr.De, minW: pr.minW, rad: Poly.radius(poly),
      tex: o.tex || Rocks.genTex(mat, Poly.radius(poly), this.rng, o.fol ?? this.rng() * Math.PI),
      tox: o.tox || 0, toy: o.toy || 0,
      cracks: o.cracks || [], dmg: o.dmg || 0, hp: Rocks.hpJ(mat, pr.De), crushT: 0, stage: 0, nipped: 0,
      fresh: Poly.freshFrac(poly), passed: !!o.passed, dirty: true, cv: null, id: b.id, born: this.time, steel: !!mat.steel
    };
    Object.defineProperty(r, 'folW', { get: () => b.a + r.tex.fol });
    b.rock = r;
    if (o.passed) b.cat = 2;
    this.world.add(b); this.rocks.push(b);
    return b;
  }
  removeRock(b) {
    this.world.remove(b);
    const i = this.rocks.indexOf(b); if (i >= 0) this.rocks.splice(i, 1);
    if (this.pry && this.pry.b === b) this.pry = null;
    if (this.lift && this.lift.b === b) this.lift = null;
  }
  // replace a rock by fragments (cells in its local frame)
  fragment(b, cells, o = {}) {
    const r = b.rock; if (b.dead || !cells || cells.length < 2) return null;
    const c = Math.cos(b.a), s = Math.sin(b.a), vx = b.vx, vy = b.vy, w = b.w;
    this.removeRock(b);
    const minA = this.rocks.length > 110 ? 1100 : this.rocks.length > 80 ? 800 : 560;
    const out = []; let massOut = 0;
    cells.sort((p, q) => Math.abs(Poly.area(q)) - Math.abs(Poly.area(p)));
    // the pieces can never weigh more than the stone (minus the fines it gives)
    let geo = 0;
    for (const cell of cells) { const A = Math.abs(Poly.area(cell)); if (A >= 2) geo += Rocks.props(cell, r.mat, this.mmpx, Math.min(r.th, 2.2 * Math.sqrt(A))).mass; }
    const kf = geo > 0 ? Math.min(1, Math.max(0, r.mass - (o.finesKg || 0)) / geo) : 1;
    cells.forEach((cell, idx) => {
      const A = Math.abs(Poly.area(cell)); if (A < 2) return;
      const cen = Poly.centroid(cell);
      const loc = cell.map(q => ({ x: q.x - cen.x, y: q.y - cen.y, f: q.f }));
      const rx = cen.x * c - cen.y * s, ry = cen.x * s + cen.y * c;
      const wx = b.x + rx, wy = b.y + ry;
      let cvx = vx - w * ry, cvy = vy + w * rx;
      if (o.from) {
        const dx = wx - o.from.x, dy = wy - o.from.y, d = Math.hypot(dx, dy) || 1;
        const k = (o.kick || 0) * (0.6 + this.rng() * 0.8) / (1 + A / 9000);
        cvx += dx / d * k; cvy += dy / d * k + (o.lift || 0) * k;
      }
      const thick = Math.min(r.th, 2.2 * Math.sqrt(A));
      const minW = Poly.minWidth(loc);
      if (A < minA || minW < 7) {
        const pr = Rocks.props(loc, r.mat, this.mmpx, thick);
        this.toParticles(wx, wy, cvx, cvy, pr.mass * kf, Math.max(2, Sim.sieveSize(pr.minW, pr.De, thick * this.mmpx)), r.mat, r.passed, Math.sqrt(A) * 0.5);
        massOut += pr.mass * kf; return;
      }
      const keep = o.keep && idx === 0;
      const nb = this.addRock(loc, wx, wy, b.a, r.mat, {
        tex: r.tex, tox: r.tox + cen.x, toy: r.toy + cen.y, thick, passed: r.passed,
        cracks: keep ? r.cracks.map(cr => Object.assign({}, cr, { x: cr.x - cen.x, y: cr.y - cen.y })) : [], dmg: keep ? r.dmg * 0.85 : 0
      });
      if (!nb) return;
      nb.rock.mass *= kf;
      // until the piece has its own sprite, it is drawn cut out of the parent's (no flash of flat colour)
      if (r.cv) { nb.rock.pcv = r.cv; nb.rock.pcvk = r.cvk; nb.rock.pox = cen.x; nb.rock.poy = cen.y; }
      nb.vx = cvx; nb.vy = cvy; nb.w = w + (this.rng() - 0.5) * (o.spin || 0);
      massOut += nb.rock.mass; out.push(nb);
    });
    // mass the 2D cells cannot hold: the block broke in the third dimension too → pieces of similar size
    let rest = r.mass - massOut - (o.finesKg || 0);
    // the fines come out of the stone: if the pieces already hold all the mass, take it from them
    if (rest < 0) {
      let mk = 0; for (const k of out) mk += k.rock.mass;
      if (mk > 0) { const f = Math.max(0, 1 + rest / mk); for (const k of out) k.rock.mass *= f; }
      rest = 0;
    }
    const fx = o.fz ? o.fz.x : b.x, fy = o.fz ? o.fz.y : b.y;
    if (rest > 0.0005) {
      let sz = 0; for (const k of out) sz += Sim.sieveSize(k.rock.minW, k.rock.De, k.rock.th * this.mmpx); sz = out.length ? sz / out.length : r.minW * 0.5;
      const n = clamp(Math.round(rest / Math.max(r.mass, 0.01) * 12) + 1, 1, 8);
      for (let i = 0; i < n; i++) this.addPart(fx + (this.rng() - .5) * r.rad * 0.7, fy + (this.rng() - .5) * r.rad * 0.7, vx * 0.6 + (this.rng() - .5) * 200, vy * 0.6 - this.rng() * 150, rest / n, sz * this.rng.range(0.35, 1), r.mat, r.passed);
    }
    // true fines (dust and grit) from the crushed zone
    if (o.finesKg > 0) {
      for (let i = 0; i < 5; i++) this.addPart(fx + (this.rng() - .5) * 16, fy + (this.rng() - .5) * 16, (this.rng() - .5) * 300, -this.rng() * 200, o.finesKg / 5, this.rng.range(0.3, 6), r.mat, r.passed);
    }
    return out;
  }
  crackRock(b, angW) {
    if (b.rock.mat.soil) return;
    const r = b.rock, lp = { x: (this.rng() - .5) * r.rad * 0.3, y: (this.rng() - .5) * r.rad * 0.3 };
    this.addCrack(r, lp.x, lp.y, angW - b.a + (this.rng() - .5) * 0.5, 0.9);
    this.emit('crackle', { x: b.x, y: b.y, size: r.De });
  }
  addCrack(r, x, y, a, grow = 0, oneSided = false) {
    const n = r.rad * 2.4, pts = [];
    let o = 0;
    for (let t = oneSided ? 0 : -n; t <= n; t += 5) { o += (this.rng() - 0.5) * 3.4; o *= 0.82; pts.push(t, oneSided ? o * Math.min(1, t / 12) : o); }
    const c = { x, y, a, pts, grow }; if (oneSided) c.len = 0;
    r.cracks.push(c); r.dirty = true;
    if (r.cracks.length > 6) { const i = r.cracks.findIndex(q => q.len == null); r.cracks.splice(i >= 0 ? i : 0, 1); }
    return c;
  }
  // distance from a point inside the block, along direction a, to where it leaves the block
  chordFrom(r, x, y, a) {
    const ca = Math.cos(a), sa = Math.sin(a), R = r.rad * 2.2;
    let t = 0; while (t < R && Poly.contains(r.poly, x + ca * (t + 2), y + sa * (t + 2))) t += 2;
    return Math.max(4, t);
  }
  // Soil does not fracture like rock: it crumbles. A lump that is hit, squeezed or dropped hard falls
  // apart into a few smaller rounded lumps and a heap of loose crumbs and grit. share = how much of it goes.
  crumble(b, x, y, share = 1, kick = 60) {
    // the lump falls apart into smaller lumps that keep its volume (real bodies that pile up), and some loose crumbs
    if (b.dead) return null;
    const r = b.rock, mat = r.mat, vx = b.vx, vy = b.vy, cx = b.x, cy = b.y;
    const M = r.mass, R = r.rad, A = r.A;
    this.removeRock(b); this._src = this._src || 'crush';
    const kids = [];
    let nSoil = 0; for (const o of this.rocks) if (o.rock.mat.soil) nSoil++;
    const crumbShare = R < 16 || nSoil > 60 ? 1 : R < 28 ? 0.45 : 0.25;   // small lumps (and a crowded plant) go to crumbs
    let bodyMass = 0;
    if (crumbShare < 1) {
      // piece sizes: with a light blow one big piece stays; a hard squeeze breaks it into several
      const n = R < 28 || share < 0.55 ? 2 : 3;
      const w = []; for (let k = 0; k < n; k++) w.push(k === 0 && share < 0.55 ? (1 - share) * 3 : 0.5 + this.rng());
      const ws = w.reduce((a, c) => a + c, 0);
      const a0 = this.rng() * TAU;
      for (let k = 0; k < n; k++) {
        const fA = (1 - crumbShare) * w[k] / ws, Rk = Math.sqrt(A * fA / Math.PI) * 1.02;
        const ang = a0 + k / n * TAU, d = n === 1 ? 0 : Math.max(0, R - Rk) * 0.85;
        let poly = Rocks.genLumpPoly(Rk, this.rng); { const sc = Math.sqrt(A * fA / Math.max(1, Math.abs(Poly.area(poly)))); poly = poly.map(q => ({ x: q.x * sc, y: q.y * sc, f: false })); }   // same area as its share
        const nb = this.addRock(poly, cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, this.rng() * TAU, mat, { tex: Rocks.genTex(mat, Poly.radius(poly), this.rng, 0), passed: r.passed });
        if (!nb) continue;
        const dx = Math.cos(ang), dy = Math.sin(ang), kk = kick * (0.2 + 0.3 * this.rng());
        nb.vx = vx + dx * kk; nb.vy = vy + dy * kk - kk * 0.3; nb.w = (this.rng() - 0.5) * 2;
        bodyMass += nb.rock.mass; kids.push(nb);
      }
      // the pieces carry exactly their share of the mass
      const want = M * (1 - crumbShare);
      if (bodyMass > 0) { const f = want / bodyMass; for (const k of kids) k.rock.mass *= f; bodyMass = want; }
    }
    // crumbs: as many as it takes to show the rest of the volume
    const left = M - bodyMass, Ac = A * (left / M), rp = clamp(R * 0.14, 2.2, 6), n = clamp(Math.round(Ac / (Math.PI * rp * rp)), 3, 60);
    for (let i = 0; i < n; i++) {
      const a = this.rng() * TAU, d = Math.sqrt(this.rng()) * R * 0.8, px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
      const dx = px - x, dy = py - y, l = Math.hypot(dx, dy) || 1, kk = kick * (0.2 + 0.6 * this.rng());
      this.addPart(px, py, vx + dx / l * kk, vy + dy / l * kk - kk * 0.3, left / n, this.rng.range(2, 20), mat, r.passed);
      const q = this.parts[this.parts.length - 1]; if (q) { q.soil = true; q.r = rp * (0.7 + this.rng() * 0.6); q.c = mat.soilC[(this.rng() * mat.soilC.length) | 0]; }
    }
    this.emit('dust', { x, y, amount: 0.25 + Math.min(1.5, M * 0.02), mat: mat.key });
    this.emit('crumble', { x, y, mass: M });
    this._src = null;
    return kids;
  }
  // jaw crushing: Voronoi fragments, seeds bunched at the two contacts (fines there), one split along the load
  crushRock(b, info) {
    if (b.dead) return null;
    if (b.rock.mat.soil) { this.D.crushes++; return this.crumble(b, (info.cm.x + info.cf.x) / 2, (info.cm.y + info.cf.y) / 2, 1, 40); }
    this._src = 'crush';
    const r = b.rock, mat = r.mat;
    const loc = (p) => b.toLocal(p.x, p.y);
    const a = loc(info.cm), f = loc(info.cf);
    const ratio = clamp(info.Fav / info.wF, 1, 6);
    const gapHere = Machine.gapAtY(this, (info.cm.y + info.cf.y) / 2);
    const K = clamp(Math.round(1.2 + (2 * r.rad) / Math.max(20, gapHere) * 0.9 + (ratio - 1) * 0.3), 2, 6);
    const R = r.rad;
    // Most nips do not break a block straight through: the teeth bite into the corners and edges at
    // the two contacts, chips and grit come off, the block rounds and sinks a little. Only when it is
    // already damaged, thin, or about the size of the gap does it fracture through.
    const relSize = (2 * R) / Math.max(20, gapHere);
    const pBreak = clamp(0.14 + 0.55 * r.dmg + (r.minW < 0.45 * r.De ? 0.2 : 0) + (relSize < 1.25 ? 0.35 : 0) + (ratio - 1) * 0.06, 0.08, 0.92);
    if (R > 9 && this.rng() > pBreak) {
      const chipped = this.chipRock(b, a, f, info, ratio);
      if (chipped) { this._src = null; return chipped; }
    }
    // well-spaced seeds give blocky fragments (no slivers); two sit near the contacts where the fines come from
    const dmin = 0.62 * Math.sqrt(r.A / K);
    const seeds = [];
    const tryAdd = (x, y) => { if (!Poly.contains(r.poly, x, y)) return false; for (const q of seeds) if ((q.x - x) ** 2 + (q.y - y) ** 2 < dmin * dmin) return false; seeds.push({ x, y }); return true; };
    tryAdd(a.x * 0.7, a.y * 0.7); tryAdd(f.x * 0.7, f.y * 0.7);
    for (let tries = 0; seeds.length < K && tries < 80; tries++) tryAdd((this.rng() * 2 - 1) * R * 0.85, (this.rng() * 2 - 1) * R * 0.85);
    if (seeds.length < 2) { seeds.length = 0; seeds.push({ x: a.x * 0.5, y: a.y * 0.5 }, { x: f.x * 0.5, y: f.y * 0.5 }); }
    const cells = Rocks.voronoiCells(r.poly, seeds);
    // energy out of the flywheel (Bond), wear on the teeth that did it
    const P80 = r.De * 0.5;
    const E = 0.6 * Rocks.bondJ(mat, r.mass, r.De, P80);   // a single nip is more efficient than grinding
    this.m.pendingJ += E;
    const realT = r.mass * this.TLm / 1000;
    Machine.addWear(this, info.cm.tooth, info.cf.tooth, realT, mat.ai);
    this.D.crushes++;
    const fines = 0.012 + 0.025 * (1 - mat.is50 / 12);
    const fz = { x: (info.cm.x + info.cf.x) / 2, y: (info.cm.y + info.cf.y) / 2 };
    this.emit('crush', { x: b.x, y: b.y, size: r.De, mass: r.mass, mat: mat.key, E });
    this.emit('dust', { x: fz.x, y: fz.y, amount: 0.4 + r.mass * fines * 2, mat: mat.key });
    const kids = this.fragment(b, cells, { from: fz, kick: 60 + 25 * ratio, lift: 0.4, spin: 3, fz, finesKg: r.mass * fines }); this._src = null; return kids;
  }

  // slow wear by rubbing against the plates: a thin skin comes off at the contact(s) as grit
  grindRock(b, cM, cF) {
    if (b.dead || (!cM && !cF)) return null;
    if (b.rock.mat.soil) { const c = cM || cF; return this.crumble(b, c.x, c.y, 1, 20); }
    const cA = cM || cF, cB = cM ? cF : null;
    const r = b.rock, mat = r.mat, R = r.rad;
    let core = r.poly; let capA = 0; const cells = [];
    for (const c of [cA, cB]) {
      if (!c) continue;
      const p = b.toLocal(c.x, c.y);
      const l = Math.hypot(p.x, p.y) || 1, ux = p.x / l, uy = p.y / l;
      // the most exposed corner near the contact goes first
      let far = 0; for (const q of core) far = Math.max(far, q.x * ux + q.y * uy);
      const depth = clamp(R * (0.06 + 0.04 * this.rng()) * (6 / (mat.is50 + 3)), 1.2, 7);
      const ta = (this.rng() - 0.5) * 0.9, nx = ux * Math.cos(ta) - uy * Math.sin(ta), ny = ux * Math.sin(ta) + uy * Math.cos(ta);
      const P = { x: ux * (far - depth), y: uy * (far - depth) };
      const keep = Poly.clip(core, P.x, P.y, nx, ny), cap = Poly.clip(core, P.x, P.y, -nx, -ny);
      if (keep.length < 3 || cap.length < 3) continue;
      const ak = Math.abs(Poly.area(keep)), ac = Math.abs(Poly.area(cap));
      if (ac < 1.5 || ak < ac * 3) continue;
      core = keep; cells.push(cap); capA += ac;
    }
    if (!cells.length) return null;
    this._src = 'crush';
    const share = capA / Math.max(1, r.A);
    this.m.pendingJ += 0.5 * Rocks.bondJ(mat, r.mass * share, r.De * 0.2, r.De * 0.03);
    Machine.addWear(this, cM && cM.tooth, cF && cF.tooth, r.mass * share * this.TLm / 1000, mat.ai);
    this.D.grinds = (this.D.grinds || 0) + 1;
    this.emit('dust', { x: cA.x, y: cA.y, amount: 0.08 + r.mass * share * 2, mat: mat.key });
    this.emit('grind', { x: cA.x, y: cA.y, mass: r.mass * share });
    const kids = this.fragment(b, [core, ...cells], { keep: true, from: { x: cA.x, y: cA.y }, kick: 8, lift: 0, spin: 0.3, fz: { x: cA.x, y: cA.y }, finesKg: r.mass * share * 0.3 });
    if (kids && kids[0]) { kids[0].rock.born -= 1; kids[0].rock.rub = 0; }
    this._src = null;
    return kids;
  }

  // attrition at the jaw contacts: cut a cap off at each contact point (local coords a, f)
  chipRock(b, a, f, info, ratio) {
    const r = b.rock, mat = r.mat, R = r.rad;
    let core = r.poly; const caps = [];
    for (const p of [a, f]) {
      const l = Math.hypot(p.x, p.y) || 1, ux = p.x / l, uy = p.y / l;
      // how far the teeth bite in: deeper for weak stone and a strong nip
      const depth = clamp(R * (0.1 + 0.08 * this.rng()) * (1 + (ratio - 1) * 0.12) * (6 / (mat.is50 + 3)) * 1.6, 2.5, R * 0.35);
      const P = { x: p.x - ux * depth, y: p.y - uy * depth };
      // the cut is a little tilted, so faces do not come out parallel
      const ta = (this.rng() - 0.5) * 0.7, nx = ux * Math.cos(ta) - uy * Math.sin(ta), ny = ux * Math.sin(ta) + uy * Math.cos(ta);
      const keep = Poly.clip(core, P.x, P.y, nx, ny), cap = Poly.clip(core, P.x, P.y, -nx, -ny);
      if (keep.length < 3 || cap.length < 3) continue;
      const ak = Math.abs(Poly.area(keep)), ac = Math.abs(Poly.area(cap));
      if (ac < 3 || ak < ac * 2.5) continue;
      core = keep; caps.push(cap);
    }
    if (!caps.length) return null;
    // caps crumble into a few chips
    const cells = [core];
    for (const cap of caps) {
      const A = Math.abs(Poly.area(cap)), cen = Poly.centroid(cap), n = A > 900 ? 3 : A > 250 ? 2 : 1;
      if (n === 1) { cells.push(cap); continue; }
      const seeds = []; for (let i = 0; i < n * 3 && seeds.length < n; i++) { const sx = cen.x + (this.rng() - .5) * Math.sqrt(A), sy = cen.y + (this.rng() - .5) * Math.sqrt(A); if (Poly.contains(cap, sx, sy)) seeds.push({ x: sx, y: sy }); }
      if (seeds.length < 2) cells.push(cap); else cells.push(...Rocks.voronoiCells(cap, seeds));
    }
    let capA = 0; for (let i = 1; i < cells.length; i++) capA += Math.abs(Poly.area(cells[i]));
    const share = capA / Math.max(1, r.A);
    // energy and wear for the part actually crushed
    this.m.pendingJ += 0.6 * Rocks.bondJ(mat, r.mass * share, r.De * 0.25, r.De * 0.06) + 0.25 * Rocks.bondJ(mat, r.mass, r.De, r.De * 0.9);
    Machine.addWear(this, info.cm.tooth, info.cf.tooth, r.mass * share * this.TLm / 1000, mat.ai);
    this.D.crushes++;
    const fines = (0.03 + 0.05 * (1 - mat.is50 / 12)) * r.mass * share;
    const fz = { x: (info.cm.x + info.cf.x) / 2, y: (info.cm.y + info.cf.y) / 2 };
    this.emit('chip', { x: info.cm.x, y: info.cm.y, size: r.De * Math.sqrt(share), mass: r.mass * share, mat: mat.key });
    this.emit('dust', { x: info.cm.x, y: info.cm.y, amount: 0.2 + fines * 3, mat: mat.key });
    this.emit('dust', { x: info.cf.x, y: info.cf.y, amount: 0.15 + fines * 2, mat: mat.key });
    const kids = this.fragment(b, cells, { keep: true, from: fz, kick: 25, lift: 0.2, spin: 1, fz, finesKg: fines });
    if (kids && kids[0]) {
      const nr = kids[0].rock; nr.dmg = Math.min(1.5, r.dmg * 0.85 / 0.85 + 0.18 + 0.1 * this.rng());
      // a few fresh hairline cracks from the bite
      if (this.rng() < 0.5) this.addCrack(nr, (this.rng() - .5) * nr.rad * 0.4, (this.rng() - .5) * nr.rad * 0.4, Math.atan2(f.y - a.y, f.x - a.x) + (this.rng() - .5) * 0.6, 0.6);
    }
    return kids;
  }

  // ---------- fines / gravel particles ----------
  addPart(x, y, vx, vy, kg, sizeMm, mat, passed) {
    if (this.parts.length > 1700) { this.deliver(kg, sizeMm, mat); return; }
    const r = clamp(sizeMm / this.mmpx * 0.5, 0.8, 5.5);
    this.parts.push({ src: this._src || 'other', x, y, vx, vy, r, kg, size: sizeMm, mat, c: mat.grav ? mat.grav[(this.rng() * mat.grav.length) | 0] : '#999', st: 0, passed: !!passed, rot: this.rng() * 3 });
  }
  toParticles(x, y, vx, vy, kg, sizeMm, mat, passed, spread) {
    const n = clamp(Math.round(sizeMm / 6) + 1, 1, 6);
    for (let i = 0; i < n; i++) this.addPart(x + (this.rng() - .5) * spread, y + (this.rng() - .5) * spread, vx + (this.rng() - .5) * 60, vy + (this.rng() - .5) * 60, kg / n, sizeMm * (0.6 + this.rng() * 0.4), mat, passed);
  }
  buildGrid() {
    const G = this.grid; G.clear();
    const cs = 48, big = this._big || (this._big = []); big.length = 0;
    for (const s of this.world.proxies) {
      const a = s.aabb;
      if (s.body.dirty) { const b = s.body; b.c = Math.cos(b.a); b.s = Math.sin(b.a); }
      const x0 = Math.floor(a.x0 / cs), x1 = Math.floor(a.x1 / cs), y0 = Math.floor(a.y0 / cs), y1 = Math.floor(a.y1 / cs);
      if ((x1 - x0) * (y1 - y0) > 400) { big.push(s); continue; }   // long shapes (the feeder pan, the belt) are tested directly
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) { const k = gx * 4096 + gy; let l = G.get(k); if (!l) G.set(k, l = []); l.push(s); }
    }
  }
  partStep(dt) {
    const G = this.grid, cs = 48, g = this.g, MG = Machine.G;
    this.buildGrid();
    const bx0 = MG.BELT_X0, bx1 = MG.BELT_X1;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (p.st === 1) {   // riding the crusher belt towards the stacker
        p.x -= this.beltV * dt;
        if (p.x < bx0 + 10) {
          // weighed by the belt scale as it goes onto the stacker; grains travel on in small bundles
          this.deliver(p.kg, p.size, p.mat, p.src, false); p.counted = true;
          const lt = this._lastT;
          if (lt && lt.st === 2 && lt.s < 30 && !lt.chunk && lt.mat === p.mat && lt.kg < 3) { lt.kg += p.kg; lt.r = Math.min(6, Math.max(lt.r, p.r) * 1.04); this.parts.splice(i, 1); continue; }
          p.st = 2; p.s = 0; p.lift = p.y - MG.BELT_Y; this._lastT = p;
        }
        continue;
      }
      if (p.st === 5) {   // down the scalper chute onto the fill pile beside the feeder
        p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y > this.fillY(p.x)) { this.deliver(p.kg, p.size, p.mat, 'scalp'); this.parts.splice(i, 1); }
        continue;
      }
      if (p.st >= 2) { if (this.stackerStep(p, dt)) this.parts.splice(i, 1); continue; }
      p.vy += g * dt; p.vx *= 0.995;
      const py0 = p.y;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y > MG.BOT + 12) p.passed = true;
      // swept test against the belt surface so fast grains cannot tunnel through it
      if (py0 <= MG.BELT_Y && p.y >= MG.BELT_Y - 1 && p.x > bx0 - 10 && p.x < bx1 + 20) { p.st = 1; p.y = MG.BELT_Y - p.r - this.rng() * 2; p.passed = true; continue; }
      // collide with shapes (point pushed out of convex polygons)
      const l0 = G.get(Math.floor(p.x / cs) * 4096 + Math.floor(p.y / cs)), big = this._big;
      const l = l0 ? (big.length ? l0.concat(big) : l0) : big;
      if (l) for (const s of l) {
        const a = s.aabb; if (p.x < a.x0 || p.x > a.x1 || p.y < a.y0 || p.y > a.y1) continue;
        const wv = s.wv, wn = s.wn; let best = -Infinity, bi = -1;
        const rr = (p.fine || p.soil) && p.y < MG.TOP ? p.r * 0.7 : 0;   // crumbs sit on surfaces; in the jaw they squash and pass
        for (let k = 0; k < wv.length; k++) { const d = wn[k].x * (p.x - wv[k].x) + wn[k].y * (p.y - wv[k].y); if (d > rr) { best = 1; bi = -1; break; } if (d > best) { best = d; bi = k; } }
        if (bi < 0) continue;
        const n = wn[bi], pen = rr - best;
        p.x += n.x * (pen + 0.3); p.y += n.y * (pen + 0.3);
        // velocity relative to the surface (moving jaw / belt / falling rock)
        const b = s.body; let sx = 0, sy = 0;
        if (b.type !== Phys.STATIC) { const v = b.velAt(p.x, p.y); sx = v.x; sy = v.y; }
        if (s.surfaceVel) { sx += s.surfaceVel.x; sy += s.surfaceVel.y; }
        const rvx = p.vx - sx, rvy = p.vy - sy, vn = rvx * n.x + rvy * n.y;
        if (vn < 0) {
          const tx = rvx - vn * n.x, ty = rvy - vn * n.y;
          p.vx = sx + tx * 0.6 - vn * n.x * 0.18; p.vy = sy + ty * 0.6 - vn * n.y * 0.18;
        }
        // grizzly bars at the discharge end of the feeder: fines drop through and bypass the jaw onto the belt
        if (s.tag === 'feeder' && p.x < MG.FEED.x0 + 160 && this.up.scalper) {
          // scalper: the grizzly fines (soil, sand, grit) go down a chute to their own pile instead of into the product
          p.st = 5; p.x = 1150 + this.rng() * 30; p.y = 880; p.vx = 120 + this.rng() * 160; p.vy = 60; p.passed = true; p.src = 'scalp'; break;
        }
        if (s.tag === 'feeder' && p.x < MG.FEED.x0 + 160) { p.x = MG.BELT_X1 - 30 + this.rng() * 20; p.y = MG.BELT_Y - 60; p.vx = -20; p.vy = 0; p.passed = true; p.grizzly = true; break; }
        if (s.tag === 'belt' && n.y < -0.7) { p.st = 1; p.y = MG.BELT_Y - p.r - this.rng() * 2; p.passed = true; break; }
      }
      { // grains that slipped off behind or under the feeder are shovelled back onto it
        const F = MG.FEED;
        if (!p.passed && p.x > F.x0 + 250 && p.x < F.x1 + 400) { const yd = F.y0 + (F.y1 - F.y0) * (p.x - F.x0) / (F.x1 - F.x0); if (p.y > yd + 150) { p.x = F.x1 - 200 - this.rng() * 300; p.y = F.y0 + (F.y1 - F.y0) * (p.x - F.x0) / (F.x1 - F.x0) - 80; p.vx = p.vy = 0; } }
      }
      if (p.y > 1400) { this.deliver(p.kg, p.size, p.mat, p.src); this.parts.splice(i, 1); }
      else if (p.x < -80 || p.x > Machine.G.FEED.x1 + 400) { if (p.passed) { this.deliver(p.kg, p.size, p.mat, p.src); this.parts.splice(i, 1); } else { p.x = this.rng.range(260, 560); p.y = 60; p.vx = 0; p.vy = 0; } }   // spill goes back in
    }
  }
  // grains touch each other: they heap up on the feeder and in the hopper instead of passing through one another
  grainContacts() {
    const cs = 10, H = this._gh || (this._gh = new Map()); H.clear();
    const list = [];
    for (const p of this.parts) if (p.st === 0 && !p.grizzly) { list.push(p); const k = Math.floor(p.x / cs) * 8192 + Math.floor(p.y / cs); let a = H.get(k); if (!a) H.set(k, a = []); a.push(p); }
    if (list.length < 2) return;
    for (const p of list) {
      const cx = Math.floor(p.x / cs), cy = Math.floor(p.y / cs);
      for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) {
        const a = H.get(ix * 8192 + iy); if (!a) continue;
        for (const q of a) {
          if (q === p || q.x < p.x || (q.x === p.x && q.y <= p.y)) continue;
          const dx = q.x - p.x, dy = q.y - p.y, R = (p.r + q.r) * 0.85, d2 = dx * dx + dy * dy;
          if (d2 >= R * R || d2 < 1e-6) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = (R - d) * 0.5;
          p.x -= nx * pen; p.y -= ny * pen; q.x += nx * pen; q.y += ny * pen;
          const rv = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
          if (rv < 0) { const j = rv * 0.6; p.vx += nx * j; p.vy += ny * j; q.vx -= nx * j; q.vy -= ny * j;
            // friction between grains: a heap holds its slope
            const tx = -ny, ty = nx, rt = (q.vx - p.vx) * tx + (q.vy - p.vy) * ty, jt = rt * 0.25; p.vx += tx * jt; p.vy += ty * jt; q.vx -= tx * jt; q.vy -= ty * jt; }
        }
      }
    }
  }

  // ---------- stacker conveyor and stockpile ----------
  // The stacker belt carries everything up to its head; it is thrown off and lands on the pile.
  // Delivery (tonnes, gradation) is counted when it lands. Each grain stands for TL grains of the
  // time-lapsed shift, so the pile grows with the day's tonnes.
  stacker() {
    if (!this._st) {
      const G = Machine.G, mm = this.mmpx, a = 21 * Math.PI / 180, L = 11000 / mm;   // a radial stacker: head about 4 m up
      const p0 = { x: G.BELT_X0 - 30, y: G.BELT_Y + 8 }, dir = { x: -Math.cos(a), y: -Math.sin(a) };
      const head = { x: p0.x + dir.x * L, y: p0.y + dir.y * L };
      this._st = { a, L, p0, dir, head, cx: head.x - 1300 / mm, ground: 1130 };
    }
    return this._st;
  }
  pileShape() {
    const st = this.stacker(), mm = this.mmpx, V = (this.pileT || 0) / 1.6;   // m³ (bulk 1.6 t/m³)
    const tan = Math.tan(36 * Math.PI / 180), hMax = Math.max(0.3, (st.ground - st.head.y) * mm / 1000 - 0.5) * (this.up.stockloader ? 0.7 : 1);   // a wheel loader keeps the pile low and wide
    let h = Math.cbrt(3 * V * tan * tan / Math.PI), r = h / tan, top = 0;
    // a full stockpile does not grow over the plant: a loader keeps pushing it back into the stock area
    let stockV = 0;
    if (h > hMax) {
      // at the head of the stacker the cone stops growing: the wheel loader takes from the toe and
      // pushes it back onto the stock heap behind, which grows instead
      h = hMax; const rf = h / tan; const Vc = Math.PI * rf * rf * h / 3;
      r = Math.min(Math.sqrt(3 * V / (Math.PI * h)), rf * 1.08); top = Math.max(0, r - rf); stockV = Math.max(0, V - Vc * 1.2);
    }
    // the stock heap: a long, low windrow behind and left of the cone
    const sh = Math.min(hMax * 1.15, Math.cbrt(3 * stockV * tan * tan / Math.PI)), sr = sh > 0 && !this.up.sikt ? Math.max(sh / tan, Math.min(stockV / Math.max(0.1, sh) / 2.2, sh / tan * 1.6)) : 0;
    return { cx: st.cx, R: r * 1000 / mm, H: h * 1000 / mm, top: top * 1000 / mm, stock: { cx: st.cx - (r + sr * 0.8 + 1.5) * 1000 / mm, R: sr * 1000 / mm, H: sh * 1000 / mm, top: Math.max(0, sr - sh / tan) * 1000 / mm } };
  }
  // the scalpings heap beside the crusher (soil and fines from the scalper chute): soil stands steeper
  fillShape() {
    const mm = this.mmpx, V = (this.fillPileT || 0) / 1.7, tan = Math.tan(38 * Math.PI / 180), hMax = 1.0;   // a loader keeps the scalpings heap low and carts it to the fill stock
    let h = Math.cbrt(3 * V * tan * tan / Math.PI), r = h / tan, top = 0;
    if (h > hMax) { h = hMax; const rf = h / tan; r = Math.min(Math.sqrt(3 * V / (Math.PI * h)), rf * 1.2); top = Math.max(0, r - rf); }
    return { cx: 1240, R: r * 1000 / mm, H: h * 1000 / mm, top: top * 1000 / mm };
  }
  fillY(x) { const P = this.fillShape(), d = Math.abs(x - P.cx); if (P.R <= 0 || d >= P.R) return Sim.GROUND; if (d <= P.top) return Sim.GROUND - P.H; return Sim.GROUND - P.H * (P.R - d) / Math.max(1, P.R - P.top); }
  pileY(x) {
    const P = this.pileShape(), st = this.stacker(), d = Math.abs(x - P.cx);
    if (P.R <= 0 || d >= P.R) return st.ground;
    if (d <= P.top) return st.ground - P.H;
    return st.ground - P.H * (P.R - d) / Math.max(1, P.R - P.top);
  }
  stackerStep(p, dt) {
    const st = this.stacker();
    if (p.st === 2) {                     // riding up the incline
      p.s += this.beltV * dt;
      const lift = Math.min(-p.r, p.lift ?? -p.r);
      p.x = st.p0.x + st.dir.x * p.s - st.dir.y * 0; p.y = st.p0.y + st.dir.y * p.s + lift;
      if (p.s >= st.L) { p.st = 3; p.vx = st.dir.x * this.beltV; p.vy = st.dir.y * this.beltV; }
      return false;
    }
    if (p.st === 3) {                     // thrown off the head pulley
      p.vy += this.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 4;
      const gy = this.pileY(p.x);
      if (p.y + p.r * 0.5 >= gy) {
        // lands: it is delivered now and becomes part of the pile, then rolls a little way down the face
        if (p.counted) this.pileT = (this.pileT || 0) + p.kg * this.TLm / 1000; else this.deliver(p.kg, p.size, p.mat, p.src);
        this.pileHits = (this.pileHits || 0) + 1;
        p.st = 4; p.y = gy - p.r * 0.5; p.t = 0; p.dirX = p.x < this.pileShape().cx ? -1 : 1; p.vx = p.dirX * (60 + Math.random() * 120);
      }
      return false;
    }
    // rolling down the face, then it settles into the heap
    p.t += dt; p.x += p.vx * dt; p.vx *= 0.97; p.y = this.pileY(p.x) - p.r * 0.5; p.rot += p.vx * dt * 0.05;
    return p.t > 0.9 || Math.abs(p.vx) < 8;
  }
  // at the end of the shift what is still on the belts is run off onto the pile
  flushTransit() {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (p.st >= 1 && p.st <= 3) { if (p.counted) this.pileT = (this.pileT || 0) + p.kg * this.TLm / 1000; else this.deliver(p.kg, p.size, p.mat, p.src); this.parts.splice(i, 1); }
      else if (p.st === 5) { this.deliver(p.kg, p.size, p.mat, 'scalp'); this.parts.splice(i, 1); }
    }
    for (const b of this.rocks.slice()) if (b.rock.passed) { this.removeRock(b); this.deliver(b.rock.mass, Sim.sieveSize(b.rock.minW, b.rock.De, b.rock.th * this.mmpx), b.rock.mat); }
    // what is still lying in the hopper and the chamber is crushed first thing tomorrow: not charged for today
    let left = 0; for (const b of this.rocks) if (!b.rock.passed && !b.rock.steel) left += b.rock.mass;
    for (const p of this.parts) if (!p.passed && p.st === 0) left += p.kg;
    for (const it of (this.loader.busy && this.loader.items) || []) if (!it.out && !it.mat.steel) left += Rocks.props(it.poly, it.mat, this.mmpx).mass;
    this.D.leftT = Math.min(this.D.fedT, left * this.TLm / 1000);
  }

  // ---------- delivery & measurement ----------
  // feeder speed in mm/s: five fixed steps, or any speed with a frequency converter
  static feedMm(save) {
    const lv = save.feedLv ?? 3, steps = [0, 100, 170, 250, 330, 420];
    if (save.up && save.up.vfd && save.feedMm != null) return clamp(save.feedMm, 0, 420);
    return steps[clamp(lv, 0, 5)];
  }
  static sieveBin(mm) { const S = [4, 8, 16, 32, 63, 90, 120, 180, 250, 400, 600]; for (let i = 0; i < S.length; i++) if (mm <= S[i]) return i; return S.length; }
  deliver(kg, sizeMm, mat, src = 'rock', toPile = true) {
    if (mat.steel) { this.D.steelOut++; this.D.claimKr = (this.D.claimKr || 0) + 6000; this.emit('steelOut'); return; }
    const realT = kg * this.TLm / 1000;
    if (src === 'scalp') {   // scalpings: sold as cheap fill, kept out of the product and its grading
      this.D.fillT = (this.D.fillT || 0) + realT; this.fillPileT = (this.fillPileT || 0) + realT;
      return;
    }
    if (toPile) this.pileT = (this.pileT || 0) + realT;   // everything delivered ends up on the stockpile
    const D = this.D;
    D.kg += kg; D.tonnes += realT;
    D.hist[Sim.sieveBin(sizeMm)] += realT;
    D.byMat[mat.key] = (D.byMat[mat.key] || 0) + realT;
    const bs = D.bySrc[src] || (D.bySrc[src] = { t: 0, h: new Float64Array(12) }); bs.t += realT; bs.h[Sim.sieveBin(sizeMm)] += realT;
  }

  // ---------- feeding (wheel loader) ----------
  // blasted rock: Rosin–Rammler sizes, x50 ≈ 0.28 × gape, about 1 in 10 blocks oversize for the jaw
  // Shot rock from the bench. Its size is set by the quarry and the blast plan, never by the crusher:
  // the same bench feeds a small jaw and a big one, so a bigger machine swallows the blocks a small one chokes on.
  // bl = { f: size factor of the blast plan, n: Rosin-Rammler uniformity (electronic detonators give a narrower curve) }
  makeLoad(mats, bl) {
    if (typeof bl === 'number') bl = { f: bl / 0.3 };
    bl = bl || {};
    const Q = Sim.QUARRY * (bl.f || 1), n = bl.n || 1.4, x50 = 0.3 * Q, xc = x50 / Math.pow(Math.LN2, 1 / n);
    // a bucket holds a volume, not a number of stones: fill to a target (in mm², side view)
    const target = (0.8 + 0.4 * this.rng()) * 4.5 * Math.pow(0.36 * Sim.QUARRY, 2), items = [];   // a bucket holds the same tonnes whatever the blast: coarse rock is fewer, bigger stones
    // a block bigger than a bucket is a bucket (or several) on its own: carry the overshoot to the next ones
    let fill = this._fillDebt || 0;
    if (fill >= target) { this._fillDebt = fill - target; return items; }
    while (fill < target && items.length < 16) {
      let x = xc * Math.pow(-Math.log(1 - this.rng() * 0.999), 1 / n);
      x = clamp(x, 0.08 * Q, Math.min(1.7 * Q, bl.maxMm || 2400));   // a block never weighs more than the truck carries: bigger ones are broken on the bench
      items.push({ mm: x, mat: mats() }); fill += Math.pow(x, 2.5) / Sim.FILLREF;
    }
    this._fillDebt = Math.max(0, fill - target);
    return items;
  }
  static blastSpec(save) {
    const P = Sim.BLAST[save.blastPlan || 'normal'] || Sim.BLAST.normal, el = save.up && save.up.blast;
    const n = P.n || 1.4; return { f: P.f * (el ? 0.92 : 1), n: el ? n + 0.5 : n, kr: P.kr + (el ? 3 : 0), maxMm: Math.pow(Sim.truckBuckets(save.up && save.up.loader) * 4.5 * Math.pow(0.36 * Sim.QUARRY, 2) * Sim.FILLREF * 0.6, 0.4) };
  }
  static truckBuckets(lv) { return [12, 30, 48][lv || 0]; }
  // minutes of haul from the bench and back, as game seconds; a second truck waits ready while the first is away
  static haulTime(save) { const u = save.up || {}; let h = [2.6, 3.0, 3.4][u.loader || 0]; if (u.truck2) h *= 0.3; if (save.plant === 'mobile') h *= 0.55; return h; }
  dump(items, steel) {
    this._src = 'blast';
    const MG = Machine.G;
    let y = 40, tot = 0;
    for (const it of items) {
      const R = it.mm / 2 / this.mmpx;
      const fol = this.rng() * Math.PI;
      const poly = Rocks.genBlockPoly(R, it.mat, this.rng, fol);
      const rad = Poly.radius(poly);
      const x = this.rng.range(200, 620 - rad * 0.4);
      const b = this.addRock(poly, clamp(x, 120 + rad * 0.5, 680 - rad * 0.5), y - rad, this.rng() * TAU, it.mat, { fol });
      if (b) { b.vx = this.rng.range(-120, -20) * (1000 / this.mmpx) / 900; b.vy = 200; b.w = this.rng.range(-2, 2); tot += b.rock.mass; if (it.mm > this.tier.feed) this.D.oversizeIn++; }
      y -= rad * 2 + 20;
    }
    if (steel) {
      const poly = Rocks.genSteelPoly(this.rng, this.mmpx);
      const b = this.addRock(poly, this.rng.range(300, 520), y - 60, this.rng() * TAU, MATS.steel, {});
      if (b) this.emit('steelIn');
    }
    // fines that come with blasted rock
    const fm = tot * 0.1, mat = items[0].mat;
    for (let i = 0; i < 16; i++) this.addPart(this.rng.range(220, 600), this.rng.range(-20, 60), this.rng.range(-60, 30), 300, fm / 16, 0.08 * this.tier.gape * Math.pow(this.rng(), 0.7), mat, false);
    this.D.fedT += (tot + fm) * this.TLm / 1000; this.D.dumps++;
    this.emit('dump', { mass: tot }); this._src = null;
    void MG;
  }
  // the back part of the feeder is free: room for the next tipper load
  feederRoom() { const F = Machine.G.FEED, xm = F.x0 + (F.x1 - F.x0) * 0.68; for (const b of this.rocks) if (b.x > xm && b.y < F.y0 + 40) return false; return !this.loader.busy; }
  hopperLoad() { let a = 0; const G = Machine.G; for (const b of this.rocks) if (b.y < G.BOT - 40 && !b.rock.steel && !b.rock.passed && (b.y < G.TOP + 20 || b.x > G.FX - Machine.gapAtY(this, b.y) - this.m.toothPx - 40)) a += b.rock.A; return a / (Machine.G.GAPE * (Machine.G.BOT - Machine.G.TOP) * 0.6); }

  // ---------- operator tools ----------
  // the sledge comes down from above: first rock surface met at column x
  topHit(x) {
    let best = null;
    const h = this.world.rayCast(x, -2500, x, 1300, s => !!s.body.rock || s.body === this.m.pit || s.body === this.m.fix || s.body === this.m.hop);
    if (h && h.shape.body.rock) best = { b: h.shape.body, x: h.x, y: h.y, nx: h.nx, ny: h.ny };
    else if (h) best = { b: null, x: h.x, y: h.y, nx: h.nx, ny: h.ny, steelHit: true };
    return best;
  }
  sledgeReach() { return 1350 / this.mmpx; }
  workerPos(x) { return { x: clamp(x - 300, -460, -200), y: Machine.G.PLAT_L - 10 }; }   // both feet on the platform (it ends at x = −40)
  sledgeCheck(x) {
    const tg = this.topHit(x);
    if (!tg) return { ok: false, why: 'none' };
    const wp = this.workerPos(x);
    if (Math.hypot(tg.x - wp.x, tg.y - wp.y) > this.sledgeReach()) return { ok: false, why: 'reach', tg };
    if (tg.y > Machine.G.TOP + 26) return { ok: false, why: this.m.state === 'run' ? 'running' : 'deep', tg };
    return { ok: true, tg };
  }
  sledgeHit(x, charge) {
    const c = this.sledgeCheck(x);
    if (!c.ok) { if (c.tg) this.emit('whoosh'); return c; }
    const tg = c.tg;
    const v = 6 + 6 * charge, E = 0.5 * 5 * v * v;           // 5 kg head, 6–12 m/s
    this.D.blows++;
    if (!tg.b) { this.emit('sledge', { x: tg.x, y: tg.y, E, onSteel: true }); return c; }
    const b = tg.b, r = b.rock;
    // impulse into the rock (momentum of the head, partly elastic)
    const J = 5 * v * 1.3 * 1000 / this.mmpx;
    b.applyImpulse(-tg.nx * J * 0.2, Math.abs(tg.ny) * J * 0.6 + J * 0.2, tg.x, tg.y);
    if (r.steel) { this.emit('sledge', { x: tg.x, y: tg.y, E, onSteel: true }); return c; }
    this.emit('sledge', { x: tg.x, y: tg.y, E, mat: r.mat.key });
    this.strike(b, tg.x, tg.y, E, 'sledge');
    return c;
  }
  // energy E (J) delivered at a surface point: bruise, crack, spall or split
  strike(b, x, y, E, kind) {
    if (b.dead) return 'none';
    this._src = 'hammer'; try { return this._strike(b, x, y, E, kind); } finally { this._src = null; }
  }
  _strike(b, x, y, E, kind) {
    const r = b.rock, lp = b.toLocal(x, y), mat = r.mat;
    // soil: the hammer just smashes a lump apart
    if (mat.soil) { this.D.blows++; const sh = clamp(E / (Rocks.hpJ(mat, r.De) * 0.6), 0.35, 1); this.crumble(b, x, y, sh, 90 + E / 4); this.D.spalls++; return 'split'; }
    // Fracture by repeated blows: each blow drives a crack in from the struck face. The crack front
    // advances by the share of the blow energy that reaches it, against the energy the rock needs to
    // split across that section (∝ Is50 · D²). Blows on the crack, or on its mouth, drive it further.
    // When it has run across the block, the block splits along it. Cracks never close again.
    const eff = kind === 'breaker' ? 0.85 : 0.7;
    let near = null, nd = Infinity;
    for (const c of r.cracks) {
      if (c.len == null) continue;
      const ca = Math.cos(c.a), sa = Math.sin(c.a), rx = lp.x - c.x, ry = lp.y - c.y;
      const t = clamp(rx * ca + ry * sa, 0, c.len), d = Math.hypot(rx - ca * t, ry - sa * t);
      if (d < nd) { nd = d; near = c; }
    }
    const onCrack = near && nd < Math.max(10, r.rad * 0.22);
    const bonus = onCrack ? 1.9 : 1;
    r.dmg += E * eff * bonus;
    r.dirty = true;
    // brittleness: marble and granite crack readily, gabbro is tough; schist and gneiss split along the foliation
    const brit = { skifer: 1.25, marmor: 1.2, gneis: 1.0, granitt: 1.1, gabbro: 0.75 }[mat.key] || 1;
    const along = (a) => mat.fol < 1 ? 1 + (1 / mat.fol - 1) * Math.pow(Math.abs(Math.cos(a - (r.tex.fol || 0))), 2) : 1;
    const drive = (c) => {
      const sh = this.chordFrom(r, c.x, c.y, c.a); c.chord = sh;
      const need = Rocks.hpJ(mat, Math.max(30, sh * this.mmpx));       // energy to split across this section
      const da = sh * clamp(E * eff * bonus / need, 0, 1) * 1.15 * brit * along(c.a) * (0.75 + 0.5 * this.rng());
      c.len = Math.min(sh, c.len + da);
      if (!c.br && c.len > sh * 0.4 && this.rng() < 0.4) c.br = 0.3 + this.rng() * 0.5;
      return c.len >= sh * 0.97;
    };
    let through = false, cut = null;
    if (onCrack) { through = drive(near); cut = near; }
    else if (r.cracks.filter(c => c.len != null).length < 4 && this.rng() < (kind === 'breaker' ? 0.75 : 0.45 + 0.4 * Math.min(1, E / 360))) {
      // a new crack from the struck face, roughly towards the middle (or along the foliation)
      let a = Math.atan2(-lp.y, -lp.x) + (this.rng() - .5) * 0.6;
      if (mat.fol < 1 && this.rng() < 0.6) { const f = r.tex.fol || 0, f2 = Math.abs(Math.cos(a - f)) > Math.abs(Math.cos(a - f - Math.PI)) ? f : f + Math.PI; a = a + (f2 - a) * 0.6; }
      const c = this.addCrack(r, lp.x * 0.94, lp.y * 0.94, a, 0, true);
      through = drive(c); cut = c;
    }
    if (through && cut) {
      const cells = Rocks.lineCells(r.poly, [{ x: cut.x, y: cut.y, a: cut.a }]).filter(c => Poly.minWidth(c) > 0.12 * Math.sqrt(Math.abs(Poly.area(c))));
      const kids = cells.length >= 2 ? this.fragment(b, cells, { from: { x, y }, kick: 50 + E / 6, spin: 1.5, fz: { x, y } }) : null;
      if (kids) { this.D.splits++; this.emit('split', { x, y, size: r.De, mat: mat.key }); this.emit('dust', { x, y, amount: 1.2, mat: mat.key }); this.emit('dust', { x, y, amount: 0.8, mat: mat.key }); return 'split'; }
    }
    this.emit('dust', { x, y, amount: 0.15 + E / 2000, mat: mat.key });
    for (let i = 0; i < 2 + E / 150; i++) this.addPart(x, y - 2, (this.rng() - .5) * 500, -150 - this.rng() * 400, 0.0004, this.rng.range(1, 6), mat, false);
    // a block splits along its cracks once it has taken enough
    if (r.dmg >= r.hp) {
      const lines = r.cracks.slice(-3).map(c => ({ x: c.x, y: c.y, a: c.a }));
      if (!lines.length) lines.push({ x: lp.x * 0.85, y: lp.y * 0.85, a: Math.atan2(-lp.y, -lp.x) + (this.rng() - .5) * 0.5 });
      if (r.mat.fol < 1 && this.rng() < 0.6) lines.push({ x: (this.rng() - .5) * r.rad * 0.4, y: (this.rng() - .5) * r.rad * 0.4, a: r.tex.fol + (this.rng() - .5) * 0.15 });
      const cells = Rocks.lineCells(r.poly, lines.slice(0, 2)).filter(c => Poly.minWidth(c) > 0.18 * Math.sqrt(Math.abs(Poly.area(c))));
      const kids = cells.length >= 2 ? this.fragment(b, cells, { from: { x, y }, kick: 60 + E / 6, spin: 1.5, fz: { x, y } }) : null;
      if (kids) { this.D.splits++; this.emit('split', { x, y, size: r.De, mat: mat.key }); this.emit('dust', { x, y, amount: 1.2, mat: mat.key }); return 'split'; }
    }
    // spalls: flakes off edges and corners; corners go easily, flat faces rarely
    let nearV = Infinity; for (const q of r.poly) nearV = Math.min(nearV, Math.hypot(q.x - lp.x, q.y - lp.y));
    const cornerPx = 40 / this.mmpx * 1.11;
    const pSp = (nearV < cornerPx ? 0.85 : 0.32) * (kind === 'breaker' ? 0.5 : 1);
    if (r.A > 900 && this.rng() < pSp) {
      const chipKg = E * 0.0026 / (mat.is50 / 6);
      const Lmm = Math.cbrt(chipKg / mat.rho) * 1000 * 1.7;
      const L = clamp(Lmm / this.mmpx, 8, r.rad * 1.1);
      const pp = Poly.perimParam(r.poly, lp.x, lp.y);
      const cells = Rocks.spallCells(r.poly, pp.s, L, (1 + 3 * this.rng()) * Math.min(1.5, E / 200));
      if (cells) {
        const kids = this.fragment(b, cells, { from: { x, y }, kick: 140 + E / 3, spin: 6, keep: true, fz: { x, y } });
        if (kids) { this.D.spalls++; this.emit('spall', { x, y, mat: mat.key }); return 'spall'; }
      }
    }
    return 'hit';
  }
  // pedestal rock breaker: a chisel blow every 1/8 s at the boom tip
  breakerReach(x, y) { const B = { x: 690, y: 150 }; return Math.hypot(x - B.x, y - B.y) < 640 && y < Machine.G.TOP + (Machine.G.BOT - Machine.G.TOP) * 0.38 && x > 90; }
  breakerBlow(x, y) {
    const E = this.up.breaker >= 2 ? 2000 : 900;
    const h = this.world.pointQuery(x, y + 4, s => !!s.body.rock)[0] || this.world.pointQuery(x, y + 14, s => !!s.body.rock)[0];
    this.emit('breaker', { x, y, hit: !!h });
    if (!h) { const st = this.world.pointQuery(x, y + 6, s => s.body === this.m.pit || s.body === this.m.fix || s.body === this.m.hop)[0]; if (st) this.emit('sparks', { x, y }); return; }
    const b = h.body; b.applyImpulse(0, 25 * 1000 / this.mmpx, x, y);
    if (b.rock.steel) { this.emit('sparks', { x, y }); return; }
    this.strike(b, x, y, E, 'breaker');
  }
  // pry bar and chain: spring-damper towards a target with a force limit
  pryStart(x, y) {
    const inCh = this.inChamber(x, y);
    if (inCh && this.m.state === 'run') return { ok: false, why: 'running' };
    const s = this.world.pointQuery(x, y, sh => !!sh.body.rock)[0] || this.world.pointQuery(x, y + 10, sh => !!sh.body.rock)[0];
    if (!s) return { ok: false, why: 'none' };
    const b = s.body; const lp = b.toLocal(x, y);
    // a pry bar is a lever, not a crane: the tip bites where you put it and can only move a short
    // stroke (the bar turns over its fulcrum). The force is your weight on the handle times the lever.
    this.pry = { b, lx: lp.x, ly: lp.y, x0: x, y0: y, tx: x, ty: y, ax: x, ay: y, F: 0, fx: 0, fy: 0, side: 1 };
    this.emit('pry', { x, y });
    return { ok: true };
  }
  pryStep(dt) {
    const p = this.pry, b = p.b, mm = this.mmpx;
    const c = Math.cos(b.a), sn = Math.sin(b.a);
    const ax = b.x + p.lx * c - p.ly * sn, ay = b.y + p.lx * sn + p.ly * c;
    // stroke: the tip moves at most ~15 cm from where it bit, then you have to take a new bite
    const light = b.rock.mass < 25;   // a bucket tooth or a small stone you can just shove and flick along with the bar
    let dx = p.tx - p.x0, dy = p.ty - p.y0; const stroke = (light ? 700 : 150) / mm, dl = Math.hypot(dx, dy);
    if (dl > stroke) { dx *= stroke / dl; dy *= stroke / dl; }
    const gx = p.x0 + dx, gy = p.y0 + dy;
    // 1.6 m bar, bite ~12 cm from the fulcrum: ~13:1 on ~450 N of body weight → ~6 kN at the tip
    const Fmax = 6000 * 1000 / mm;
    const v = b.velAt(ax, ay);
    const vx = (gx - ax) * 8, vy = (gy - ay) * 8;
    let Fx = b.m * (vx - v.x) / 0.06, Fy = b.m * (vy - v.y) / 0.06 - (light ? b.m * this.g * 0.9 : 0);   // heavy stones get no help against gravity: only the lever
    const Fm = Math.hypot(Fx, Fy); if (Fm > Fmax) { Fx *= Fmax / Fm; Fy *= Fmax / Fm; }
    b.applyForce(Fx, Fy, ax, ay); b.wake();
    // the fulcrum: the bar rests on whatever touches the stone near the tip; a stone there is pushed the other way
    let best = null, bd = Infinity;
    for (const arb of b.touch) {
      const o = arb.A.body === b ? arb.B.body : arb.A.body; const q = arb.pts[0]; if (!q) continue;
      const d = (q.x - ax) ** 2 + (q.y - ay) ** 2; if (d < bd) { bd = d; best = { o, q }; }
    }
    if (best && best.o.rock && !best.o.dead && bd < (260 / mm) ** 2) { best.o.applyForce(-Fx * 0.6, -Fy * 0.6, best.q.x, best.q.y); best.o.wake(); }
    p.ax = ax; p.ay = ay; p.F = Math.hypot(Fx, Fy) / (1000 / mm); p.fx = Fx; p.fy = Fy;
    if (Math.abs(dx) > 2) p.side = dx > 0 ? 1 : -1;
    return { ax, ay };
  }
  liftStart(x, y) {
    if (this.inChamber(x, y) && this.m.state === 'run') return { ok: false, why: 'running' };
    const s = this.world.pointQuery(x, y, sh => !!sh.body.rock)[0] || this.world.pointQuery(x, y + 10, sh => !!sh.body.rock)[0];
    if (!s) return { ok: false, why: 'none' };
    const b = s.body; const lp = b.toLocal(x, y);
    // A chain has to go round the block: only a stone in the mouth, with its top free, can be slung.
    // Down in the chamber there is no room for a chain between the plates.
    const G = Machine.G, r = b.rock.rad || 30, top = b.y - r;
    const inMouth = b.x < G.FX + 30 && b.y > G.TOP - 40;
    if (inMouth && top > G.TOP + (G.BOT - G.TOP) * 0.28) return { ok: false, why: 'deep' };
    if (inMouth) for (const o of this.rocks) { if (o === b || !o.rock || o.rock.passed) continue; const orr = o.rock.rad || 20; if (o.y < b.y - r * 0.4 && Math.abs(o.x - b.x) < r * 0.8 + orr * 0.5 && o.y + orr > top - 4) return { ok: false, why: 'covered' }; }
    this.lift = { b, lx: lp.x, ly: lp.y, hx: x, ax: x, ay: y, t: 0 };
    this.emit('chain');
    return { ok: true };
  }
  inChamber(x, y) {
    const G = Machine.G;
    if (y < G.TOP + 20 || y > G.BOT + 20) return false;
    const pit = this.m.pit, c = Math.cos(pit.a), s = Math.sin(pit.a);
    const ft = { x: pit.x + this.m.Ft.x * c - this.m.Ft.y * s, y: pit.y + this.m.Ft.x * s + this.m.Ft.y * c };
    const fb = { x: pit.x + this.m.Fb.x * c - this.m.Fb.y * s, y: pit.y + this.m.Fb.x * s + this.m.Fb.y * c };
    const lx = ft.x + (fb.x - ft.x) * (y - ft.y) / (fb.y - ft.y);
    return x > lx - 20 && x < G.FX + 10;
  }
  springTo(b, lx, ly, tx, ty, Fmax, k, vmax) {
    const c = Math.cos(b.a), s = Math.sin(b.a);
    const ax = b.x + lx * c - ly * s, ay = b.y + lx * s + ly * c;
    let dvx = (tx - ax) * k, dvy = (ty - ay) * k; const dl = Math.hypot(dvx, dvy); if (dl > vmax) { dvx *= vmax / dl; dvy *= vmax / dl; }
    const v = b.velAt(ax, ay);
    let Fx = b.m * (dvx - v.x) / 0.05, Fy = b.m * (dvy - v.y) / 0.05 - b.m * this.g;
    const Fm = Math.hypot(Fx, Fy); if (Fm > Fmax) { Fx *= Fmax / Fm; Fy *= Fmax / Fm; }
    b.applyForce(Fx, Fy, ax, ay);
    b.w *= 0.96;
    return { ax, ay };
  }

  // ---------- controls ----------
  stop() { const M = this.m; if (M.state === 'run' || M.state === 'relief') { M.state = 'stop'; this.emit('stop'); return true; } return false; }
  start() {
    const M = this.m;
    if (M.state === 'stop' || (M.state === 'trip' && M.timer <= 0)) { M.state = 'run'; M.heat = Math.min(M.heat, 0.5); M.stallT = 0; this.emit('start'); return true; }
    return false;
  }
  clearChamber() {
    const M = this.m; if (M.state !== 'stop' && !(M.state === 'trip')) return false;
    M.state = 'clearing'; M.clearDur = this.up.hydro ? 8 * 60 / TL : 30 * 60 / TL; M.clearOpenAt = this.up.hydro ? 0.3 : 2.4; M.clearCloseAt = this.up.hydro ? 0.6 : 2.6; /* hydraulic ~8 min, shims and tension rod ~30 min */ M.timer = M.clearDur;
    this.D.clears++; this.emit('clearing', { hydro: !!this.up.hydro });
    return true;
  }

  // ---------- main step ----------
  step(dt) {
    this.time += dt; this.stepN++;
    const M = this.m, G = Machine.G;
    // repair and cool-down time can be spooled (skip > 1) without speeding up the physics
    const sk = this.skip || 1;
    if (M.state === 'trip' && M.timer > 0) M.timer -= dt * sk;
    if (M.state === 'broken') { M.timer -= dt * sk; if (M.timer <= 0) { M.toggleBroken = false; M.state = 'stop'; M.phiFrom = M.phiFree; M.returnT = 1.6; for (const b of this.rocks.slice()) if (b.rock.steel && b.y > G.TOP - 40 && b.y < G.BELT_Y) { this.removeRock(b); this.D.scrap++; } this.emit('repaired'); } }
    Machine.drive(this, dt);
    // tools that pull on bodies
    if (this.pry) {
      const p = this.pry;
      if (!p.b.rock || p.b.dead) this.pry = null;
      else {
        const r = this.pryStep(dt);
        if (M.state === 'run' && this.inChamber(r.ax, r.ay)) { this.pry = null; this.emit('deny', { why: 'pry' }); }
      }
    }
    if (this.lift) {
      const L = this.lift; L.t += dt;
      if (!L.b.rock || L.b.dead) this.lift = null;
      else {
        const cap = [3000, 5000, 9000][this.up.loader || 0] * 9.81 * 1000 / this.mmpx;
        const r = this.springTo(L.b, L.lx, L.ly, L.hx, L.ay - 300, cap, 3, 350 / this.mmpx);
        L.ax = r.ax; L.ay = r.ay;
        if (L.b.y < 70) {
          const b = L.b; this.removeRock(b);
          if (b.rock.steel) { this.D.scrap++; this.emit('scrap', { x: r.ax, y: 120 }); }
          else { this.D.rejectT += b.rock.mass * this.TLm / 1000; this.emit('setAside', { x: r.ax, y: 120 }); }
          this.lift = null;
        }
      }
    }
    // feeder: vibration walks the stones down the pan; speed set by the operator (0 = off)
    { const F = G.FEED, on = M.state === 'run' || M.state === 'relief';   // interlocked with the crusher
      const v = (on ? Sim.feedMm(this.save) : 0) / this.mmpx, dx = F.x0 - F.x1, dy = F.y0 - F.y1, l = Math.hypot(dx, dy);
      M.feedDeck.surfaceVel.x = v * dx / l; M.feedDeck.surfaceVel.y = v * dy / l; M.feedV = v; }
    // stones in the crushing chamber never doze off: the jaw keeps them moving
    { const top = G.TOP - 80, bot = G.BOT + 30, mu0 = this.weather.wet ? 0.62 : 0.72, muC = Sim.CHAMBER_MU ?? mu0;
      for (const b of this.rocks) { const inCh = b.y > top && b.y < bot && b.x < G.FX + 30 && !b.rock.passed; b.canSleep = !inCh; if (inCh && !b.awake) b.wake();
        // every stroke of the jaw shakes the packed chamber: the stones slip past each other instead of arching
        if (!b.rock.steel) { const mu = inCh && b.y > G.TOP ? muC : mu0; for (const sh of b.shapes) sh.friction = mu; } } }
    this.world.step(dt);
    Machine.crushStep(this, dt);
    // soil lumps shaken on the feeder pan, or pressed against stones, fall apart bit by bit
    if (this.stepN % 30 === 0) {
      const deck = M.feedDeck, on = (M.feedV || 0) > 0;
      for (const b of this.rocks.slice()) {
        const r = b.rock; if (!r.mat.soil || b.dead || this.time - r.born < 0.5) continue;
        let shake = 0, press = 0;
        for (const arb of b.touch) { const o = arb.A.body === b ? arb.B : arb.A; if (o === deck && on) shake = 1; else if (o.body.rock && !o.body.rock.mat.soil) press += 1; }
        const rate = 0.25 * shake + 0.12 * Math.min(3, press);   // per second
        if (rate > 0 && this.rng() < rate * 0.25 * (r.rad > 12 ? 1 : 0.6)) this.crumble(b, b.x, b.y - r.rad * 0.3, 0.45, 12);
      }
    }
    // impacts → sound/visual events
    const ev = this.world.events;
    for (const e of ev) {
      if (e.speed < 120) continue;
      const a = e.A.body, b = e.B.body;
      const steel = (a.rock && a.rock.steel) || (b.rock && b.rock.steel) || (!a.rock && a.tag !== 'chute') || (!b.rock && b.tag !== 'chute');
      const belt = e.A.tag === 'belt' || e.B.tag === 'belt';
      const m = Math.min(a.rock ? a.rock.mass : 1e9, b.rock ? b.rock.mass : 1e9);
      this.emit('impact', { x: e.x, y: e.y, v: e.speed * this.mmpx / 1000, m, steel, belt, mat: (a.rock || b.rock || {}).mat?.key });
      // a soil lump that lands hard, or is hit by a falling stone, breaks up
      for (const bb of [a, b]) if (bb.rock && bb.rock.mat.soil && !bb.dead && !bb.rock.born2) {
        const v = e.speed * this.mmpx / 1000, other = bb === a ? b : a, stone = other.rock && !other.rock.mat.soil;
        const mo = stone ? Math.min(other.rock.mass, 400) + bb.rock.mass : bb.rock.mass;
        // loose moist soil: a knock from a stone or a drop of about a metre is enough to break a lump
        const E = 0.5 * mo * v * v, need = stone ? Math.max(Rocks.hpJ(bb.rock.mat, bb.rock.De) * 0.25, bb.rock.mass * 9.81 * 0.35) : Math.max(Rocks.hpJ(bb.rock.mat, bb.rock.De) * 0.6, bb.rock.mass * 9.81 * 1.0);
        if (E > need && this.time - bb.rock.born > 0.12) { bb.rock.born2 = 1; this.crumble(bb, e.x, e.y, clamp(E / need * 0.35, 0.3, 1), 30); }
      }
      // stones striking the guard plate dent it: impact energy in J against a plate good for ~25 kJ of blows
      if ((e.A.tag === 'guard' || e.B.tag === 'guard') && this.m.guard && m < 1e8) {
        const v = e.speed * this.mmpx / 1000, E = 0.5 * m * v * v;
        if (E > 40) {
          this.save.guard = Math.max(0, (this.save.guard ?? 1) - E / 25000 * (this.tier.gape / 400));
          this.D.guardHits = (this.D.guardHits || 0) + 1;
          this.emit('guardHit', { x: e.x, y: e.y, E });
          if (this.save.guard <= 0) { this.world.removeShape(this.m.guard); this.m.guard = null; this.event('guardBroken'); }
        }
      }
    }
    ev.length = 0;
    // rocks: passing, delivery, scrap, magnet
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const b = this.rocks[i], r = b.rock;
      if (r.nipped > 0) r.nipped -= dt; else if (r.crushT > 0) r.crushT = Math.max(0, r.crushT - dt * 0.5);
      if (r.archT > 0) r.archT = Math.max(0, r.archT - dt * 0.25);
      // passed: below the jaw, or resting on the belt under the jaw lip (it must be free to ride out)
      if (!r.passed && (b.y > G.BOT + 14 || (b.y > G.BOT - 40 && b.y + r.rad * 0.75 > G.BELT_Y - 6))) {
        r.passed = true; b.cat = 2;
        if (!r.steel && r.A < 1400) { this.removeRock(b); this._src = 'smallRock'; this.toParticles(b.x, b.y, b.vx, b.vy, r.mass, Sim.sieveSize(r.minW, r.De, r.th * this.mmpx), r.mat, true, r.rad); this._src = null; continue; }
      }
      // stone spilt onto the operator platform is shovelled back off it
      if (!r.passed && !r.over && r.mass > 4 && b.x < -30 && b.y > 120 && b.y < 900) {
        // over the rim: it falls down past the eccentric shaft and flywheel and lands on the belt below
        r.over = true;
        const hit = Math.min(1, r.mass / 60);
        this.save.bearing = Math.max(0, (this.save.bearing ?? 1) - 0.04 * hit);
        this.D.beltDmgKr = (this.D.beltDmgKr || 0) + Math.round(1500 + 9000 * hit * (this.tier.gape / 400));
        this.D.overspill = (this.D.overspill || 0) + 1;
        this.event('overspill', { mass: r.mass, x: b.x, y: b.y });
      }
      if (r.steel) {
        if (b.x < -60 && b.y < Machine.G.PLAT_L) { this.removeRock(b); this.D.scrap++; this.emit('scrap', { x: b.x, y: b.y }); continue; }
        if (this.up.magnet && r.passed && b.x > G.BELT_X0 && b.x < G.BELT_X0 + 150 && b.y > G.BELT_Y - 120) { this.removeRock(b); this.D.scrap++; this.emit('magnet', { x: b.x, y: b.y }); continue; }
        if (r.passed && b.y < G.BELT_Y - 160 && b.x > G.FX + 40) { this.removeRock(b); this.D.scrap++; this.emit('scrap', { x: b.x, y: b.y }); continue; }
      }
      if (r.passed && b.x < G.BELT_X0 + 10 && b.y > G.BELT_Y - 200) {
        // onto the stacker belt: the stone rides on as one chunk, same size, same colour
        this.removeRock(b);
        const sz = Sim.sieveSize(r.minW, r.De, r.th * this.mmpx);
        const c = r.mat.grav ? r.mat.grav[1] : '#999';
        if (!r.mat.steel) this.deliver(r.mass, sz, r.mat, 'rock', false);
        this.parts.push({ src: 'rock', x: b.x, y: b.y, vx: 0, vy: 0, r: Math.max(2, r.rad * 0.8), kg: r.mass, size: sz, mat: r.mat, c, st: 2, s: 0, lift: -r.rad * 0.6, passed: true, rot: b.a, chunk: true, poly: r.poly, counted: !r.mat.steel });
        continue;
      }
      if (!r.passed && b.x > Machine.G.FEED.x1 + 20 && b.y > Machine.G.FEED.y1 + 120) { b.x = Machine.G.FEED.x1 - 200; b.y = Machine.G.FEED.y1 - 200; b.vx = b.vy = 0; b.wake && b.wake(); continue; }
      if (!r.passed && b.y <= 1360 && (b.x < -100 || b.x > Machine.G.FEED.x1 + 400)) { b.x = this.rng.range(260, 560); b.y = 40; b.vx = b.vy = 0; b.wake && b.wake(); continue; }
      if (b.y > 1360 || b.x < -100 || b.x > Machine.G.FEED.x1 + 400) {
        this.removeRock(b);
        if (r.passed || b.y > 1360) this.deliver(r.mass, Sim.sieveSize(r.minW, r.De, r.th * this.mmpx), r.mat);
      }
    }
    // fines move at 60 Hz
    if (dt > 1 / 90) this.partStep(dt); else if (this.stepN % 2 === 0) this.partStep(dt * 2);
    // keep tooth geometry in step with wear
    if (this.stepN % 20 === 0) Machine.updateTeeth(this);
    // loader
    this.updateLoader(dt);
    const D = this.D;
    D.kWh = M.energyJ / 3.6e6 * this.TLm;
    D.maxAmps = Math.max(D.maxAmps, M.amps);
    if (M.block > 0.5) D.jamT += dt;
    if (M.beltSlip > 0) D.slipT = (D.slipT || 0) + dt;
  }
  // early start: the driver has already tipped a load; the stones lie on the feeder pan at 07:00
  preload(items) {
    const F = Machine.G.FEED, mm = this.mmpx;
    const dx = F.x1 - F.x0, dy = F.y1 - F.y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = uy, ny = -ux;
    const all = items.map(it => ({ mm: it.mm, mat: it.mat })).sort((p, q) => q.mm - p.mm);
    let s = L * 0.97, row = 0, est = 0;
    this._src = 'blast';
    for (const it of all) {
      const fol = this.rng() * Math.PI, poly = Rocks.genBlockPoly(it.mm / 2 / mm, it.mat, this.rng, fol), rad = Poly.radius(poly);
      if (s - rad < L * 0.3) { s = L * 0.97; row++; if (row > 2) break; }
      s -= rad;
      const h = rad + 6 + row * rad * 1.6;
      const b = this.addRock(poly, F.x0 + ux * s + nx * h, F.y0 + uy * s + ny * h, this.rng() * TAU, it.mat, { fol, tex: Rocks.genTex(it.mat, rad, this.rng, fol) });
      s -= rad * 0.9;
      if (b) { b.vx = b.vy = 0; est += b.rock.mass; this.D.fedT += b.rock.mass * this.TLm / 1000; }
    }
    this._src = null;
    // and the soil and grit that came with it, on the pan
    const fm = est * 0.08;
    for (let i = 0; i < 16; i++) { const t = this.rng.range(0.35, 0.95); this.addPart(F.x0 + dx * t, F.y0 + dy * t - 20, 0, 0, fm / 16, this.rng.range(2, 40), all[0] ? all[0].mat : MATS.gneis, false); }
    this.D.fedT += fm * this.TLm / 1000;
  }
  // ---------- feeding: a tipper backs up the ramp and tips onto the back of the vibrating feeder ----------
  // (as in small plants: tractor with tipping trailer, later dump trucks). Shared with the renderer.
  trGeom() {
    const lv = this.up.loader || 0, mm = this.mmpx, F = Machine.G.FEED, P = (v) => v / mm;
    const spec = [
      { L: 4200, H: 900, axle: 900, wheel: 560, tilt: 0.85, kind: 'tractor' },
      { L: 5200, H: 1250, axle: 1150, wheel: 760, tilt: 0.88, kind: 'dumper' },
      { L: 6400, H: 1600, axle: 1400, wheel: 900, tilt: 0.9, kind: 'dumper' }][lv];
    const hinge = { x: F.x1 - P(250), y: F.y1 - P(230) };          // tail of the bed just above the back of the feeder
    const rampY = hinge.y + P(spec.axle + spec.wheel * 0.2);       // top of the earth ramp the tipper stands on
    return { spec, rampY, hinge, Lb: P(spec.L), Hb: P(spec.H), T1: 1.6, T2: 3.6, T3: 4.6, T4: 6.0 };
  }
  trPose(t) {
    const g = this.trGeom(), mm = this.mmpx;
    let off = 0, tilt = 0;
    if (t < g.T1) { const k = 1 - smooth(clamp(t / g.T1, 0, 1)); off = k * 9000 / mm; }
    else if (t < g.T2) tilt = g.spec.tilt * smooth((t - g.T1) / (g.T2 - g.T1));
    else if (t < g.T3) tilt = g.spec.tilt * (1 - smooth((t - g.T2) / (g.T3 - g.T2)));
    else { const k = smooth(clamp((t - g.T3) / (g.T4 - g.T3), 0, 1)); off = k * 9000 / mm; }
    return { H: { x: g.hinge.x + off, y: g.hinge.y }, tilt, off, g };
  }
  updateLoader(dt) {
    const L = this.loader;
    if (L.cd > 0) L.cd -= dt;
    if (!L.busy) return;
    L.t += dt; const p1 = this.trPose(L.t);
    if (L.t > L.dumpAt && !L.dumped) { L.dumped = true; this.D.dumps++; this.emit('dump', { mass: L.estMass }); }
    if (L.dumped) {
      // stones slide out over the tail as the bed rises; the ones nearest the tail go first
      const c = Math.cos(-p1.tilt), sn = Math.sin(-p1.tilt);
      for (const it of L.items) {
        if (it.out) continue;
        // once the bed is steep enough the stone slides down the floor towards the tail
        if (p1.tilt > it.thr) it.sl = (it.sl || 0) + dt * (500 / this.mmpx) * (0.4 + 2 * (p1.tilt - it.thr));
        const lx = it.lx - (it.sl || 0);
        if (lx > it.rad * 0.9 && L.t < p1.g.T2) continue;   // by full tilt everything has slid out
        it.out = true;
        const ly = Math.min(it.ly, -it.rad * 0.9);
        const rx = it.rad * 0.6 * c - ly * sn, ry = it.rad * 0.6 * sn + ly * c;
        this._src = 'blast';
        const b = this.addRock(it.poly, p1.H.x + rx, p1.H.y + ry, it.a - p1.tilt, it.mat, { fol: it.fol, tex: it.tex });
        this._src = null;
        if (!b) continue;
        const sp = 350 / this.mmpx;   // sliding off the bed
        b.vx = -Math.cos(p1.tilt) * sp + this.rng.range(-40, 40); b.vy = Math.sin(p1.tilt) * sp * 0.5; b.w = this.rng.range(-1.5, 1.5);
        if (it.mat.steel) this.emit('steelIn');
        else { this.D.fedT += b.rock.mass * this.TLm / 1000; L.mass += b.rock.mass; if (it.mm > this.tier.feed) this.D.oversizeIn++; }
        if (!L.fines) {
          // the fines of the load: crushed-rock gravel and grit, plus soil and gravel from the top of the bench.
          // They run out over the tail with the stones (spawned over the tip below), as real grains
          L.fines = true; const share = L.soil ?? 0.1, rockF = L.estMass * 0.06 + (L.gritKg || 0), soilF = L.soilFinesKg || 0;
          const nR = Math.round(clamp(40 + (L.gritKg || 0) / Math.max(1, L.estMass) * 300, 40, 140)), nS = soilF > 0 ? Math.round(clamp(share * 500, 10, 200)) : 0;
          L.fq = { mat: it.mat, rockKg: rockF / nR, soilKg: nS ? soilF / nS : 0, nR, nS, nR0: nR, nS0: nS };
          this.D.fedT += (rockF + soilF) * this.TLm / 1000;
          if (share > 0.14) { this.D.dirty = (this.D.dirty || 0) + 1; this.emit('dirty', { share }); }
        }
      }
    }
    // fines run out over the tail while the bed is up: a stream of grit, sand and soil
    if (L.dumped && L.fq && (L.fq.nR + L.fq.nS) > 0 && (p1.tilt > 0.25 || L.t > L.dumpAt + 2.6)) {
      const f = L.fq, tot0 = f.nR0 + f.nS0, k = L.t > L.dumpAt + 2.6 ? f.nR + f.nS : Math.max(1, Math.round(tot0 * dt / 1.1));
      for (let i = 0; i < k && (f.nR + f.nS) > 0; i++) {
        const soil = f.nS > 0 && (f.nR <= 0 || this.rng() < f.nS / (f.nR + f.nS));
        const F = Machine.G.FEED, sp = (500 + this.rng() * 500) / this.mmpx, x = Math.min(p1.H.x, F.x1 - 60) - this.rng.range(0, 60), y = Math.min(p1.H.y, F.y1 - 30) - this.rng.range(10, 140);
        const vx = -Math.cos(p1.tilt) * sp + this.rng.range(-30, 30), vy = Math.sin(p1.tilt) * sp * 0.4;
        if (soil) { f.nS--; const gravel = this.rng() < 0.35; this.addPart(x, y, vx, vy, f.soilKg, gravel ? this.rng.range(6, 30) : this.rng.range(0.3, 4), MATS.jord, false); const q = this.parts[this.parts.length - 1];
          if (q) { q.soil = true; q.r = clamp(q.r, 1.3, 3.2); if (!gravel) q.c = MATS.jord.soilC[(this.rng() * MATS.jord.soilC.length) | 0]; } }
        else { f.nR--; this.addPart(x, y, vx, vy, f.rockKg, 0.08 * Sim.QUARRY * Math.pow(this.rng(), 0.7), f.mat, false); const q = this.parts[this.parts.length - 1]; if (q) q.r = Math.max(q.r, 1.8); }
      }
    }
    if (L.t > L.trT4) {
      // anything that did not slide out (rare) is tipped out at the end
      if (L.fq && (L.fq.nR + L.fq.nS) > 0) { /* still pouring */ }
      else if (L.items.every(it => it.out)) { L.busy = false; L.cd = this.haul ?? 0.4; L.cd0 = L.cd; }
    }
  }
  callLoader(items, steel) {
    const L = this.loader; if (L.busy || L.cd > 0) return false;
    const g = this.trGeom(), mm = this.mmpx;
    // stones under ~14 px across are too small to matter as bodies here: they ride along as grit in the fines stream
    let gritKg = 0;
    const all = [];
    const gritMm = Math.max(14 * mm, (this.save.css || 80) * 0.55);   // these pass the jaw without being touched
    for (const it of items) { if (it.mm < gritMm && !it.mat.steel) gritKg += Rocks.props(Rocks.genBlockPoly(it.mm / 2 / mm, it.mat, this.rng, 0), it.mat, mm).mass; else all.push({ mm: it.mm, mat: it.mat }); }
    if (steel) all.push({ mm: 0, mat: MATS.steel });
    for (const it of all) {
      if (it.mat.steel) it.poly = Rocks.genSteelPoly(this.rng, mm);
      else { it.fol = this.rng() * Math.PI; it.poly = Rocks.genBlockPoly(it.mm / 2 / mm, it.mat, this.rng, it.fol); }
      it.rad = Poly.radius(it.poly); it.tex = Rocks.genTex(it.mat, it.rad, this.rng, it.fol ?? 0); it.a = this.rng() * TAU;
    }
    // how much soil and gravel comes with it: usually a little, now and then a dirty load from the top of the bench
    { const u = this.rng(); L.soil = this.forceSoil || (u < 0.7 ? this.rng.range(0.07, 0.12) : u < 0.92 ? this.rng.range(0.15, 0.24) : this.rng.range(0.28, 0.4));
      // overburden stripped off the bench before blasting: the dirty top layer never reaches the truck
      if (this.save.strip && !this.forceSoil) L.soil = u < 0.93 ? this.rng.range(0.03, 0.07) : this.rng.range(0.1, 0.16); }
    // the soil comes as lumps (real bodies that lie between the stones and crumble in the jaw) and as loose fines
    let estRock = 0; for (const it of all) if (!it.mat.steel) estRock += Rocks.props(it.poly, it.mat, mm).mass;
    const soilTot = estRock * L.soil / (1 - L.soil), soilLumps = soilTot * 0.65;
    let lumpKg = 0;
    for (let n = 0; n < 24 && lumpKg < soilLumps; n++) {
      const d = Math.max(16 * mm, (0.07 + 0.42 * Math.pow(this.rng(), 1.7)) * Sim.QUARRY), it = { mm: d, mat: MATS.jord, fol: 0 };   // many small, a few big
      it.poly = Rocks.genLumpPoly(d / 2 / mm, this.rng); it.rad = Poly.radius(it.poly); it.tex = Rocks.genTex(MATS.jord, it.rad, this.rng, 0); it.a = this.rng() * TAU;
      lumpKg += Rocks.props(it.poly, MATS.jord, mm).mass; all.push(it);
    }
    L.soilFinesKg = Math.max(0, soilTot - lumpKg) * 0.6;
    // load the bed (local frame: hinge at the tail, +x towards the cab, −y up): the excavator drops each
    // stone where the heap is lowest near the middle, so the load crowns like a real heaped body
    all.sort((p, q) => q.rad - p.rad);
    const x0 = g.Lb * 0.05, x1 = g.Lb * 0.95, NB = 48, bw = (x1 - x0) / NB, hm = new Float64Array(NB);
    let est = 0;
    for (const it of all) {
      const d = it.rad * 1.7, w = Math.max(1, Math.ceil(d / bw)), span = NB - w;
      let best = 0, bestS = Infinity;
      for (let t = 0; t < 6; t++) {   // a few tries, biased to the middle
        const u = (this.rng() + this.rng() + this.rng()) / 3, b0 = clamp(Math.round(u * span), 0, Math.max(0, span));
        let h = 0; for (let k = b0; k < Math.min(NB, b0 + w); k++) h = Math.max(h, hm[k]);
        const sc = h + Math.abs(u - 0.5) * g.Hb * 0.3; if (sc < bestS) { bestS = sc; best = b0; }
      }
      let h = 0; for (let k = best; k < Math.min(NB, best + w); k++) h = Math.max(h, hm[k]);
      const nh = h + d * 0.82; for (let k = best; k < Math.min(NB, best + w); k++) hm[k] = nh;
      it.lx = x0 + (best + w / 2) * bw; it.ly = -(h + d / 2);
      if (!it.mat.steel) est += Rocks.props(it.poly, it.mat, mm).mass;
    }
    // the crown rises a little over the side boards (the floor under a thin load is assumed full of fines)
    { let top = 0; for (const it of all) top = Math.min(top, it.ly - it.rad); const want = -g.Hb * 1.45; if (top > want) { const dy = want - top; for (const it of all) it.ly += dy; } }
    // stones slide once the bed is steep enough; the ones near the tail and on top go first
    const order = all.slice().sort((p, q) => (p.lx + p.ly * 0.5) - (q.lx + q.ly * 0.5));
    order.forEach((it, i) => { it.thr = 0.25 + 0.3 * (i / Math.max(1, order.length - 1)); it.sl = 0; });
    L.busy = true; L.t = 0; L.dumpAt = g.T1; L.exT3 = g.T4; L.trT4 = g.T4; L.dumped = false; L.items = all; L.steel = steel; L.fines = false; L.mass = 0; L.estMass = est; L.gritKg = gritKg;
    this.emit('loaderCome');
    return true;
  }


}
Sim.GROUND = 1130;   // y of the yard in world px (as drawn)
Sim.CHAMBER_MU = 0.3;   // friction between stones in the working chamber (the strokes keep the pack loose)
Sim.QUARRY = 400;
Sim.FILLREF = 16.2;   // fill measure per bucket: x^2.5 / FILLREF (between the volume and the side-view area of the stones)   // mm: the reference scale of the bench (blast holes, bucket) — fixed, whatever crusher stands below it
Sim.BLAST = {
  fine: { f: 0.75, kr: 7, name: 'Fine', desc: 'Tight pattern, more explosive. Small rock, few blocks, costs more per tonne.' },
  normal: { f: 1.0, kr: 0, name: 'Normal', desc: 'Standard pattern for the bench.' },
  coarse: { f: 1.8, n: 1.25, kr: -5, name: 'Coarse', desc: 'Wider pattern, less explosive. Cheaper, but many blocks need breaking: for a big jaw.' },
  xcoarse: { f: 2.8, n: 1.15, kr: -9, name: 'Big holes', desc: 'Large-diameter rig, wide pattern. The cheapest rock per tonne, metre-sized blocks. Only for the biggest crushers.' }
};
