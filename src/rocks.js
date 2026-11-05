'use strict';
/* ============================================================
   rocks.js — rock types (real strength data), blasted-block
   shapes, textures shared between fragments, fracture
   (Voronoi crushing, splitting along cracks, edge spalls).
   Strength: point load index Is50 (MPa) → the force a jaw needs
   F = Is50 · De² · (50/De)^0.45   (De in mm, F in N)
   Energy: Bond's law with work index Wi (kWh/t).
   ============================================================ */
const MATS = {
  skifer: {
    key: 'skifer', name: 'Mica schist', rho: 2750, is50: 3.4, wi: 13, ai: 0.32, fol: 0.45, shape: 'slab', price: 0.82,
    base: [104, 98, 90], dark: [52, 48, 44], fresh: [150, 146, 138], rind: [128, 96, 64],
    spk: [[180, 176, 168, .55], [70, 64, 58, .6], [140, 120, 96, .4]], spkD: .006, spkR: [.5, 1.6],
    bands: [[78, 72, 66, .55], [146, 140, 130, .38]], bandW: [3, 7], sparkle: 0.012
  },
  marmor: {
    key: 'marmor', name: 'Marble', rho: 2710, is50: 4.4, wi: 11, ai: 0.02, fol: 0.85, shape: 'blocky', price: 0.92,
    base: [168, 164, 154], dark: [104, 101, 95], fresh: [204, 201, 192], rind: [168, 160, 146],
    spk: [[226, 226, 222, .7], [176, 176, 172, .5]], spkD: .003, spkR: [.6, 1.8], veins: [[120, 122, 126, .55], [150, 150, 152, .4]], sparkle: 0.004
  },
  gneis: {
    key: 'gneis', name: 'Gneiss', rho: 2700, is50: 7.4, wi: 16, ai: 0.5, fol: 0.62, shape: 'tabular', price: 1.0,
    base: [142, 138, 132], dark: [62, 60, 58], fresh: [196, 192, 186], rind: [150, 118, 84],
    spk: [[40, 40, 44, .8], [228, 224, 216, .7], [190, 150, 134, .55]], spkD: .0055, spkR: [.6, 1.9],
    bands: [[64, 62, 62, .5], [210, 204, 194, .35]], bandW: [3, 9], sparkle: 0.002
  },
  granitt: {
    key: 'granitt', name: 'Granite', rho: 2650, is50: 9.0, wi: 16, ai: 0.55, fol: 1, shape: 'blocky', price: 1.08,
    base: [168, 152, 146], dark: [86, 80, 78], fresh: [214, 204, 198], rind: [160, 128, 100],
    spk: [[28, 28, 32, .9], [242, 238, 234, .85], [206, 150, 138, .8], [120, 110, 108, .6]], spkD: .0075, spkR: [.8, 2.4], sparkle: 0.002
  },
  gabbro: {
    key: 'gabbro', name: 'Gabbro', rho: 2950, is50: 11.2, wi: 20, ai: 0.4, fol: 1, shape: 'equant', price: 1.16,
    base: [72, 78, 76], dark: [32, 36, 36], fresh: [122, 130, 126], rind: [112, 92, 70],
    spk: [[44, 50, 48, .8], [124, 136, 128, .6], [172, 176, 166, .45]], spkD: .0045, spkR: [.6, 1.7], sparkle: 0.001
  },
  // soil and gravel from the top of the bench: comes with the load, never a block, worth less in the product
  // moraine soil from the top of the bench: lumps of silty sand with pebbles and roots; weak, crumbles in the jaw
  jord: { key: 'jord', name: 'Soil and gravel', soil: true, soilC: ['#6b5338', '#5a4630', '#7a6142', '#4e3d2a', '#82694a', '#665040'], rho: 1900, is50: 0.35, wi: 6, ai: 0.1, fol: 1, shape: 'equant', price: 0.55,
    base: [104, 84, 60], dark: [58, 44, 30], fresh: [92, 72, 50], rind: [120, 100, 72],
    spk: [[150, 146, 138, .95], [176, 170, 160, .9], [60, 48, 34, .8], [128, 120, 110, .9], [44, 34, 24, .7]], spkD: .006, spkR: [1.2, 4.2] },
  steel: { key: 'steel', name: 'Steel', steel: true, rho: 7850, is50: 1e9, wi: 0, ai: 0, fol: 1, price: 0, base: [96, 104, 112], dark: [40, 44, 50], fresh: [170, 176, 184] }
};
for (const k in MATS) {
  const m = MATS[k];
  const c = (a, al = 1) => `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;
  const mx = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  m.grav = [c(m.fresh), c(mx(m.base, m.fresh, .5)), c(m.base), c(mx(m.base, m.dark, .35))];
  if (m.spk) m.spkC = m.spk.map(a => c(a, a[3]));
}

const Rocks = (() => {
  const rgb = (a, al = 1) => `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;

  // ---- blasted block shapes: a disc trimmed by joint planes ----
  function genBlockPoly(R, mat, rng, fol) {
    let p = [];
    for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; p.push({ x: Math.cos(a) * R * 1.45, y: Math.sin(a) * R * 1.45, f: false }); }
    const cut = (ang, d) => { const nx = Math.cos(ang), ny = Math.sin(ang); const q = Poly.clip(p, nx * d, ny * d, nx, ny); if (q.length >= 3) p = q; };
    const sh = mat.shape || 'blocky';
    if (sh === 'slab' || sh === 'tabular') {
      const th = sh === 'slab' ? rng.range(0.32, 0.55) : rng.range(0.45, 0.75);
      cut(fol + Math.PI / 2, R * th); cut(fol - Math.PI / 2, R * th * rng.range(0.8, 1.2));
      for (let i = 0; i < 4; i++) cut(fol + rng.range(-1.3, 1.3) + (i % 2 ? Math.PI : 0), R * rng.range(0.75, 1.15));
    } else {
      const j0 = rng() * TAU;
      const sets = sh === 'equant' ? [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2] : [0, Math.PI / 2 + rng.range(-0.25, 0.25), Math.PI, 3 * Math.PI / 2 + rng.range(-0.25, 0.25)];
      for (const s of sets) cut(j0 + s + rng.range(-0.15, 0.15), R * rng.range(0.62, 0.95));
      const extra = 2 + rng.int(0, 3);
      for (let i = 0; i < extra; i++) cut(rng() * TAU, R * rng.range(0.7, 1.05));
    }
    p = Poly.simplify(p, 3, 0.02);
    // not every block is fresh from the blast: some are weathered boulders from the overburden
    // (rounded), some are sub-rounded, most are sharp. Corner cutting (Chaikin) rounds them.
    const u = rng();
    const passes = R < 12 ? 0 : u < 0.22 ? 2 : u < 0.45 ? 1 : 0;
    for (let k = 0; k < passes; k++) {
      const q = [], t = k === 0 ? rng.range(0.18, 0.3) : 0.25;
      for (let i = 0; i < p.length; i++) { const A = p[i], B = p[(i + 1) % p.length]; q.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, f: false }, { x: A.x + (B.x - A.x) * (1 - t), y: A.y + (B.y - A.y) * (1 - t), f: false }); }
      p = Poly.simplify(q, 2.6, 0.01);
    }
    // the sharp ones: now and then a thin wedge or a pointed corner left by a joint
    if (!passes && rng() < 0.35) cut(rng() * TAU, R * rng.range(0.45, 0.65));
    const c = Poly.centroid(p);
    const out = p.map(q => ({ x: q.x - c.x, y: q.y - c.y, f: false }));
    out.round = passes;
    return out;
  }
  // a lump of soil: rounded and a little flattened, never with sharp corners
  function genLumpPoly(R, rng) {
    const n = 9, sq = 0.5 + rng() * 0.4, rot = rng() * TAU, pts = [];
    for (let i = 0; i < n; i++) { const a = (i + rng() * 0.6) / n * TAU, r = R * (0.68 + rng() * 0.45); pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * sq }); }
    const h = Poly.hull(pts).map(q => ({ x: q.x * Math.cos(rot) - q.y * Math.sin(rot), y: q.x * Math.sin(rot) + q.y * Math.cos(rot), f: false }));
    const c = Poly.centroid(h); return h.map(q => ({ x: q.x - c.x, y: q.y - c.y, f: false }));
  }
  function genSteelPoly(rng, mmpx) {
    let pts;
    const s = 1 / mmpx;
    if (rng() < 0.5) { const w = rng.range(180, 320) * s, h = rng.range(28, 40) * s; pts = [{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }]; } // drill steel / rebar bundle
    else { const L = rng.range(200, 280) * s, W = rng.range(70, 95) * s; pts = [{ x: -L / 2, y: -W / 2 }, { x: L * 0.3, y: -W * 0.32 }, { x: L / 2, y: 0 }, { x: L * 0.3, y: W * 0.32 }, { x: -L / 2, y: W / 2 }]; } // loader bucket tooth
    const c = Poly.centroid(pts); return pts.map(p => ({ x: p.x - c.x, y: p.y - c.y, f: false }));
  }

  // ---- textures (local coords of the original block; fragments share it with an offset) ----
  function genTex(mat, R, rng, fol) {
    if (mat.steel) return { steel: true, rust: Array.from({ length: 7 }, () => ({ x: rng.range(-R, R), y: rng.range(-R * .4, R * .4), r: rng.range(3, 9) })) };
    const S = R * 1.6, area = (2 * S) * (2 * S);
    const n = Math.min(520, Math.floor(area * mat.spkD));
    const spk = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { spk[i * 4] = rng.range(-S, S); spk[i * 4 + 1] = rng.range(-S, S); spk[i * 4 + 2] = mat.spkR[0] + rng() * (mat.spkR[1] - mat.spkR[0]); spk[i * 4 + 3] = (rng() * mat.spkC.length) | 0; }
    const t = { spk, S, fol, bands: null, veins: null, glints: null };
    // mottling and shallow hollows: large stones are never one flat tone
    const nb = Math.min(46, Math.floor(area / 900) + 3);
    t.blot = new Float32Array(nb * 4);
    for (let i = 0; i < nb; i++) { t.blot[i * 4] = rng.range(-S, S); t.blot[i * 4 + 1] = rng.range(-S, S); t.blot[i * 4 + 2] = rng.range(5, 22) * (0.6 + R / 160); t.blot[i * 4 + 3] = rng.range(-1, 1); }
    if (mat.bands) {
      t.bands = []; let u = -S * 1.2;
      while (u < S * 1.2) { const w = rng.range(mat.bandW[0], mat.bandW[1]); t.bands.push({ u, w, c: rng() < 0.5 ? 0 : 1, wob: rng.range(0, 3), ph: rng() * TAU }); u += w * rng.range(1.2, 2.6); }
    }
    if (mat.veins) {
      t.veins = [];
      for (let k = 0; k < 2 + rng.int(0, 2); k++) {
        let x = rng.range(-S, S), y = -S, a = rng.range(-0.6, 0.6) + Math.PI / 2; const pts = [];
        while (y < S && pts.length < 60) { pts.push(x, y); a += rng.range(-0.25, 0.25); x += Math.cos(a) * 8; y += Math.sin(a) * 8; }
        t.veins.push({ pts, w: rng.range(0.8, 2.6), c: rng.int(0, 1) });
      }
    }
    if (mat.sparkle) {
      const g = Math.floor(area * mat.sparkle); t.glints = new Float32Array(g * 3);
      for (let i = 0; i < g; i++) { t.glints[i * 3] = rng.range(-S, S); t.glints[i * 3 + 1] = rng.range(-S, S); t.glints[i * 3 + 2] = rng() * TAU; }
    }
    return t;
  }

  // ---- physical properties ----
  function props(poly, mat, mmpx, thick) {
    const A = Math.abs(Poly.area(poly));
    const th = thick || 0.82 * Math.sqrt(A);
    const m2 = A * mmpx * mmpx * 1e-6, t_m = th * mmpx * 1e-3;
    const mass = Math.max(0.001, m2 * t_m * mat.rho);
    const De = Math.sqrt(4 * A / Math.PI) * mmpx;   // equivalent diameter in mm
    const minW = Poly.minWidth(poly) * mmpx;
    return { A, th, mass, De, minW };
  }
  // jaw force (N) needed to break the rock; loading across the foliation is weaker in schists
  function Fcrit(r, loadAngleWorld) {
    const m = r.mat; if (m.steel) return Infinity;
    const De = Math.max(5, r.De);
    let F = m.is50 * De * De * Math.pow(50 / De, 0.45);
    if (m.fol < 1 && loadAngleWorld !== undefined) {
      const fw = r.folW;   // foliation direction in world
      const c = Math.abs(Math.cos(loadAngleWorld - fw));   // 1 = load along the foliation planes
      F *= lerp(1, m.fol, c);
    }
    // cracks from earlier blows weaken it
    F *= 1 - 0.5 * clamp(r.dmg / r.hp, 0, 1);
    return F;
  }
  // sledge energy (J) a block can absorb before it splits along its cracks
  function hpJ(mat, De_mm) { const d = De_mm / 1000; return mat.is50 * 9000 * d * d + 40; }
  // Bond's law: energy (J) to break mass m (kg) from size F to P (mm)
  function bondJ(mat, mkg, Fmm, Pmm) {
    const f = Math.max(Fmm, 1) * 1000, p = Math.max(Pmm, 0.5) * 1000;
    return Math.max(0, mat.wi * 3.6e6 * (mkg / 1000) * 10 * (1 / Math.sqrt(p) - 1 / Math.sqrt(f)));
  }

  // ---- cell generation ----
  function voronoiCells(poly, seeds) {
    const cells = [];
    for (let i = 0; i < seeds.length; i++) {
      let c = poly.map(q => ({ x: q.x, y: q.y, f: q.f }));
      const si = seeds[i];
      for (let j = 0; j < seeds.length && c.length >= 3; j++) {
        if (i === j) continue;
        const sj = seeds[j], nx = sj.x - si.x, ny = sj.y - si.y, l = Math.hypot(nx, ny);
        if (l < 1e-6) continue;
        c = Poly.clip(c, (si.x + sj.x) / 2, (si.y + sj.y) / 2, nx / l, ny / l);
      }
      if (c.length >= 3 && Math.abs(Poly.area(c)) > 1) cells.push(c);
    }
    return cells;
  }
  function lineCells(poly, lines) {
    let pieces = [poly];
    for (const L of lines) {
      const nx = -Math.sin(L.a), ny = Math.cos(L.a), nxt = [];
      for (const pc of pieces) {
        const A = Poly.clip(pc, L.x, L.y, nx, ny), B = Poly.clip(pc, L.x, L.y, -nx, -ny);
        const aa = A.length >= 3 ? Math.abs(Poly.area(A)) : 0, ba = B.length >= 3 ? Math.abs(Poly.area(B)) : 0;
        if (aa > 6 && ba > 6) nxt.push(A, B); else nxt.push(pc);
      }
      pieces = nxt;
    }
    return pieces;
  }
  // a flake off the boundary between arc positions s1..s2, cut slightly inside
  function spallCells(poly, s0, L, depth) {
    const per = Poly.perimeter(poly);
    const s1 = ((s0 - L * 0.5) % per + per) % per, s2 = (s0 + L * 0.5) % per;
    const P1 = Poly.perimPoint(poly, s1), P2 = Poly.perimPoint(poly, s2);
    const dx = P2.x - P1.x, dy = P2.y - P1.y, l = Math.hypot(dx, dy); if (l < 2) return null;
    // inward normal of the chord (towards centroid at origin)
    let nx = -dy / l, ny = dx / l; if (nx * -P1.x + ny * -P1.y < 0) { nx = -nx; ny = -ny; }
    const px = P1.x + nx * depth, py = P1.y + ny * depth;
    // keep side containing the centroid: clip keeps (q-P)·n <= 0 → use n pointing away from centroid
    const big = Poly.clip(poly, px, py, -nx, -ny), small = Poly.clip(poly, px, py, nx, ny);
    if (big.length < 3 || small.length < 3) return null;
    const ab = Math.abs(Poly.area(big)), as = Math.abs(Poly.area(small));
    if (as < 4 || ab < as) return null;
    return [big, small];
  }

  // ---- sprite rendering (texture + fresh faces + weathering rind + cracks) ----
  // small inward notches along long edges (deterministic per stone)
  function roughen(p, seed) {
    let h = (seed * 2654435761) >>> 0;
    const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      out.push(a);
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
      if (L < 14) continue;
      // inward normal (polygon is CCW in y-down screen space → test against centroid at origin)
      let nx = -dy / L, ny = dx / L; if (nx * -a.x + ny * -a.y < 0) { nx = -nx; ny = -ny; }
      const n = Math.min(9, Math.floor(L / 9));
      const amp = Math.min(3.2, 0.5 + L * 0.03);
      let o = 0;
      for (let j = 1; j < n; j++) {
        const t = j / n + (rnd() - 0.5) * 0.5 / n;
        o = o * 0.5 + rnd() * amp * (rnd() < 0.2 ? 2 : 1);
        const e = Math.min(t, 1 - t) * 4;                    // stay at the corners
        const d = o * Math.min(1, e);
        out.push({ x: a.x + dx * t + nx * d, y: a.y + dy * t + ny * d, f: a.f });
      }
    }
    return out;
  }
  function renderSprite(r, k, wet) {
    const mat = r.mat, p = r.poly;
    const R = r.rad;
    const size = Math.max(4, Math.ceil((R * 2 + 6) * k));
    const c = r.cv || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (!c) return;
    if (c.width !== size) { c.width = size; c.height = size; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, size, size);
    g.setTransform(k, 0, 0, k, size / 2, size / 2);
    // visual outline: the physics shape is convex, but a real broken edge is never a ruler line.
    // Long edges get small notches and steps cut *inwards* (the outline stays inside the body).
    const vp = r.vpoly || (r.vpoly = roughen(p, r.id || 1));
    const path = () => { g.beginPath(); g.moveTo(vp[0].x, vp[0].y); for (let i = 1; i < vp.length; i++) g.lineTo(vp[i].x, vp[i].y); g.closePath(); };
    path();
    const t = r.tex;
    if (mat.steel) {
      const gr = g.createLinearGradient(0, -R, 0, R); gr.addColorStop(0, '#9aa3ad'); gr.addColorStop(0.45, '#5d656e'); gr.addColorStop(1, '#3a4047');
      g.fillStyle = gr; g.fill(); g.save(); g.clip();
      for (const s of t.rust) { g.fillStyle = 'rgba(150,72,30,.5)'; g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-R, -R * 0.15); g.lineTo(R, -R * 0.15); g.stroke();
      g.restore(); path(); g.strokeStyle = '#1e2226'; g.lineWidth = 1.4; g.stroke();
      r.cvk = k; r.dirty = false; r.cv = c; return;
    }
    if (mat.soil) {
      // a lump of moist soil: dark mottled earth, pebbles and grit pressed into it, a crumbly soft edge
      g.fillStyle = rgb(mat.base); g.fill();
      g.save(); g.clip();
      g.save(); g.translate(-r.tox, -r.toy);
      const bl = t.blot || [];
      for (let i = 0; i < bl.length / 4; i++) { const x = bl[i * 4], y = bl[i * 4 + 1], rr = bl[i * 4 + 2] * 0.8, v = bl[i * 4 + 3]; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, v > 0 ? 'rgba(140,112,78,.45)' : 'rgba(40,30,20,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      const spk = t.spk, nS = spk.length / 4;
      for (let i = 0; i < nS; i++) { const x = spk[i * 4], y = spk[i * 4 + 1], sz = spk[i * 4 + 2]; g.fillStyle = mat.spkC[spk[i * 4 + 3]]; g.beginPath(); g.ellipse(x, y, sz, sz * 0.75, i, 0, TAU); g.fill(); if (sz > 2.5) { g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x + sz * 0.3, y + sz * 0.4, sz * 0.8, sz * 0.4, 0, 0, TAU); g.fill(); } }
      g.restore();
      // the edge crumbles: dark under-side, a lighter dry rim on top
      g.lineWidth = Math.max(2, R * 0.12); g.strokeStyle = 'rgba(30,22,14,.45)'; path(); g.stroke();
      g.restore();
      const crumbs = Math.min(18, Math.round(R / 3));
      for (let i = 0; i < crumbs; i++) { const q = vp[(i * 7) % vp.length], s2 = 1.2 + ((i * 37) % 5) * 0.5; g.fillStyle = i % 3 ? rgb(mat.dark, 0.9) : rgb(mat.base, 1); g.beginPath(); g.arc(q.x * (0.96 + (i % 4) * 0.02), q.y * (0.96 + (i % 3) * 0.02), s2, 0, TAU); g.fill(); }
      if (wet) { path(); g.fillStyle = 'rgba(20,16,12,.25)'; g.fill(); }
      r.cv = c; r.cvk = k; r.dirty = false; return;
    }
    const fr = r.fresh;
    // the body colour is the rock's own; fresh breaks only show on the broken faces, so a piece keeps the colour of the stone it came from
    g.fillStyle = rgb(mat.base);
    g.fill();
    g.save(); g.clip();
    const ox = r.tox, oy = r.toy;
    g.save(); g.translate(-ox, -oy);
    if (t.bands) {
      g.save(); g.rotate(t.fol);
      for (const b of t.bands) {
        const col = mat.bands[b.c]; g.fillStyle = rgb(col, col[3]);
        g.beginPath(); g.moveTo(-t.S * 1.5, b.u);
        for (let x = -t.S * 1.5; x <= t.S * 1.5; x += 10) g.lineTo(x, b.u + Math.sin(x * 0.05 + b.ph) * b.wob);
        for (let x = t.S * 1.5; x >= -t.S * 1.5; x -= 10) g.lineTo(x, b.u + b.w + Math.sin(x * 0.05 + b.ph + 0.7) * b.wob);
        g.closePath(); g.fill();
      }
      g.restore();
    }
    if (t.veins) for (const v of t.veins) {
      const col = mat.veins[v.c]; g.strokeStyle = rgb(col, col[3]); g.lineWidth = v.w; g.beginPath();
      for (let i = 0; i < v.pts.length; i += 2) i ? g.lineTo(v.pts[i], v.pts[i + 1]) : g.moveTo(v.pts[i], v.pts[i + 1]); g.stroke();
    }
    const spk = t.spk, nS = spk.length / 4, lim = R + Math.hypot(ox, oy) + 4;
    for (let i = 0; i < nS; i++) {
      const x = spk[i * 4], y = spk[i * 4 + 1];
      if (Math.abs(x - ox) > R + 3 || Math.abs(y - oy) > R + 3) continue;
      const s = spk[i * 4 + 2]; g.fillStyle = mat.spkC[spk[i * 4 + 3]]; g.fillRect(x - s / 2, y - s / 2, s, s * 0.8);
    }
    void lim;
    if (t.blot) {
      const bl = t.blot, nb = bl.length / 4;
      for (let i = 0; i < nb; i++) {
        const x = bl[i * 4], y = bl[i * 4 + 1], rr = bl[i * 4 + 2], v = bl[i * 4 + 3];
        if (Math.abs(x - ox) > R + rr || Math.abs(y - oy) > R + rr) continue;
        const gr = g.createRadialGradient(x, y, 0, x, y, rr);
        const c0 = v > 0 ? `rgba(255,250,238,${0.10 * v})` : `rgba(30,24,16,${-0.16 * v})`;
        gr.addColorStop(0, c0); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
        // a shallow hollow: dark rim on the lower side, catch light on the upper
        if (v < -0.55 && rr > 7) { g.strokeStyle = 'rgba(20,15,10,.22)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, rr * 0.35, 0.2, 2.9); g.stroke(); g.strokeStyle = 'rgba(255,250,240,.16)'; g.beginPath(); g.arc(x, y, rr * 0.35, 3.4, 6.0); g.stroke(); }
      }
    }
    g.restore();
    // weathering rind on old faces, bright clean stone on fresh breaks
    const ew = clamp(R * 0.3, 3, 10);
    for (let i = 0; i < vp.length; i++) {
      const a = vp[i], q = vp[(i + 1) % vp.length];
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(q.x, q.y);
      if (a.f) { g.strokeStyle = rgb(mat.fresh, 0.38); g.lineWidth = ew; g.stroke(); g.strokeStyle = rgb([Math.min(255, mat.fresh[0] + 18), Math.min(255, mat.fresh[1] + 18), Math.min(255, mat.fresh[2] + 18)], 0.45); g.lineWidth = 1.6; g.stroke(); }
      else { g.strokeStyle = rgb(mat.rind, 0.4); g.lineWidth = ew * 0.9; g.stroke(); g.strokeStyle = rgb(mat.dark, 0.35); g.lineWidth = 2.4; g.stroke(); }
    }
    void fr;
    // cracks
    const df = clamp(r.dmg / r.hp, 0, 1);
    for (const cr of r.cracks) {
      const ca = Math.cos(cr.a), sa = Math.sin(cr.a);
      // a crack driven in from a struck face (len, one-sided) only ever grows; crusher cracks are symmetric
      const one = cr.len != null, L = one ? cr.len : R * Math.min(2.4, 0.25 + 1.9 * Math.max(df, cr.grow || 0));
      const k = one ? clamp(cr.len / Math.max(1, cr.chord || R), 0, 1) : df;
      g.beginPath(); let st = false;
      for (let i = 0; i < cr.pts.length; i += 2) {
        const tt = cr.pts[i], o = cr.pts[i + 1]; if (one ? (tt < 0 || tt > L) : Math.abs(tt) > L) continue;
        const x = cr.x + ca * tt - sa * o, y = cr.y + sa * tt + ca * o; st ? g.lineTo(x, y) : g.moveTo(x, y); st = true;
      }
      g.strokeStyle = 'rgba(255,248,235,.25)'; g.lineWidth = 2.6 + k * 1.5; g.stroke();
      g.strokeStyle = 'rgba(16,12,8,.88)'; g.lineWidth = 1 + k * 1.8; g.stroke();
      // a short side branch now and then, where the crack front has stepped
      if (one && cr.len > 20 && cr.br) { const t0 = cr.len * cr.br, bx = cr.x + ca * t0, by = cr.y + sa * t0, ba = cr.a + (cr.br > 0.5 ? 0.7 : -0.7), bl = Math.min(cr.len * 0.25, 18);
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl); g.strokeStyle = 'rgba(16,12,8,.6)'; g.lineWidth = 0.9; g.stroke(); }
    }
    if (wet) { path(); g.fillStyle = 'rgba(20,24,30,.22)'; g.fill(); }
    g.restore();
    path(); g.strokeStyle = rgb(mat.dark, 0.95); g.lineWidth = 1.2; g.stroke();
    r.cv = c; r.cvk = k; r.dirty = false;
  }

  return { genBlockPoly, genLumpPoly, genSteelPoly, genTex, props, Fcrit, hpJ, bondJ, voronoiCells, lineCells, spallCells, renderSprite };
})();
