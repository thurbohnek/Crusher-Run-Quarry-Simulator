'use strict';
/*
 * Crusher Run: Quarry Simulator
 * Copyright (c) 2026 Ørjan Grane (Studio.grane). All rights reserved.
 * Proprietary software. See LICENSE. Unauthorised copying, modification or distribution is prohibited.
 */
const GAME_VERSION = '1.0.0';
/* ============================================================
   util.js — math, seeded RNG, convex polygon helpers
   ============================================================ */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

// mulberry32 — fast seeded RNG; the sim only uses this so test runs are reproducible
function makeRng(seed) {
  let s = seed >>> 0;
  const f = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.gauss = () => { let u = 0, v = 0; while (u === 0) u = f(); while (v === 0) v = f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  f.seed = () => s;
  return f;
}

const Poly = {
  area(p) { let a = 0; for (let i = 0, n = p.length; i < n; i++) { const q = p[i], r = p[(i + 1) % n]; a += q.x * r.y - r.x * q.y; } return a / 2; },
  centroid(p) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, n = p.length; i < n; i++) { const q = p[i], r = p[(i + 1) % n]; const c = q.x * r.y - r.x * q.y; a += c; cx += (q.x + r.x) * c; cy += (q.y + r.y) * c; }
    a /= 2;
    if (Math.abs(a) < 1e-9) { let x = 0, y = 0; for (const q of p) { x += q.x; y += q.y; } return { x: x / p.length, y: y / p.length }; }
    return { x: cx / (6 * a), y: cy / (6 * a) };
  },
  // polar moment of inertia about the centroid, per unit density (polygon must be centred)
  inertia(p) {
    let num = 0, den = 0;
    for (let i = 0, n = p.length; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n];
      const cr = Math.abs(a.x * b.y - b.x * a.y);
      num += cr * (a.x * a.x + a.x * b.x + b.x * b.x + a.y * a.y + a.y * b.y + b.y * b.y);
      den += cr;
    }
    return den ? num / (6 * den) : 0; // inertia per unit mass (I/m) about the origin
  },
  hull(pts) {
    pts = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-9) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 1e-9) up.pop(); up.push(p); }
    up.pop(); lo.pop(); return lo.concat(up);
  },
  // CCW (in y-down screen coords this is the order with positive area by the shoelace formula)
  ensureCCW(p) { if (Poly.area(p) < 0) p.reverse(); return p; },
  // Half-plane clip keeping (q - P)·n <= 0. Each vertex carries f = "edge from here to next is fresh fracture".
  clip(poly, px, py, nx, ny) {
    const out = [], n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      const da = (a.x - px) * nx + (a.y - py) * ny, db = (b.x - px) * nx + (b.y - py) * ny;
      if (da <= 0) {
        out.push({ x: a.x, y: a.y, f: a.f });
        if (db > 0) { const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, f: true }); }
      } else if (db <= 0) {
        const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, f: a.f });
      }
    }
    return out;
  },
  // remove near-duplicate and near-collinear vertices so the solver gets clean convex shapes
  simplify(p, minEdge = 2.2, colTol = 0.012) {
    let pts = p.slice();
    let changed = true, guard = 0;
    while (changed && pts.length > 3 && guard++ < 50) {
      changed = false;
      for (let i = 0; i < pts.length && pts.length > 3; i++) {
        const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
        const lab = Math.hypot(b.x - a.x, b.y - a.y), lbc = Math.hypot(c.x - b.x, c.y - b.y);
        const cr = ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) / ((lab * lbc) || 1);
        if (lbc < minEdge || Math.abs(cr) < colTol) {
          // drop b; the merged edge a->c is fresh if either part was
          a.f = a.f || b.f;
          pts.splice(i, 1); changed = true; i--;
        }
      }
    }
    return pts;
  },
  radius(p) { let r = 0; for (const q of p) r = Math.max(r, Math.hypot(q.x, q.y)); return r; },
  perimeter(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += Math.hypot(b.x - a.x, b.y - a.y); } return s; },
  freshFrac(p) { let t = 0, f = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; const l = Math.hypot(b.x - a.x, b.y - a.y); t += l; if (a.f) f += l; } return t ? f / t : 0; },
  contains(p, x, y) { // convex CCW
    for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false; }
    return true;
  },
  // smallest width (caliper) of a convex polygon — used as the "particle size" a screen sees
  minWidth(p) {
    let best = Infinity;
    for (let i = 0, n = p.length; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n], ex = b.x - a.x, ey = b.y - a.y, l = Math.hypot(ex, ey) || 1;
      const nx = -ey / l, ny = ex / l;
      let mn = Infinity, mx = -Infinity;
      for (const q of p) { const d = q.x * nx + q.y * ny; if (d < mn) mn = d; if (d > mx) mx = d; }
      best = Math.min(best, mx - mn);
    }
    return best;
  },
  perimPoint(p, s) {
    const n = p.length; let acc = 0;
    for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n], l = Math.hypot(b.x - a.x, b.y - a.y); if (acc + l >= s) { const t = l ? (s - acc) / l : 0; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, i }; } acc += l; }
    return { x: p[0].x, y: p[0].y, i: 0 };
  },
  // arc-length position of the closest boundary point to (x,y)
  perimParam(p, x, y) {
    let per = 0, best = 0, bd = Infinity;
    for (let i = 0, n = p.length; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
      const t = l2 ? clamp(((x - a.x) * dx + (y - a.y) * dy) / l2, 0, 1) : 0;
      const d = Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
      if (d < bd) { bd = d; best = per + t * l; }
      per += l;
    }
    return { s: best, per, d: bd };
  }
};

// money is kept internally in one unit; the player picks the currency it is shown in (Settings)
const CURRENCIES = {
  USD: { sym: '$', rate: 0.093, pre: true, name: 'US dollar' },
  EUR: { sym: '€', rate: 0.086, pre: true, name: 'Euro' },
  GBP: { sym: '£', rate: 0.074, pre: true, name: 'Pound sterling' },
  NOK: { sym: 'kr', rate: 1, pre: false, name: 'Krone' }
};
const fmt = {
  cur: (() => { try { return localStorage.getItem('rc_cur') || 'USD'; } catch (e) { return 'USD'; } })(),
  setCur(c) { if (CURRENCIES[c]) { this.cur = c; try { localStorage.setItem('rc_cur', c); } catch (e) {} } },
  t(v) { return v >= 100 ? Math.round(v).toLocaleString('en-GB') : v.toFixed(1); },
  // whole amounts: rounded to a sensible step in the chosen currency
  kr(v) {
    const C = CURRENCIES[this.cur] || CURRENCIES.USD, x = Math.abs(v) * C.rate;
    const n = Math.round(x).toLocaleString('en-GB'), sg = v < 0 ? '−' : '';
    return C.pre ? sg + C.sym + n : sg + n + ' ' + C.sym;
  },
  // prices per tonne: small numbers, so one decimal in the strong currencies
  pt(v) {
    const C = CURRENCIES[this.cur] || CURRENCIES.USD, x = v * C.rate;
    const n = x < 100 ? x.toFixed(2) : Math.round(x).toLocaleString('en-GB');
    return (C.pre ? C.sym + n : n + ' ' + C.sym) + '/t';
  },
  pct(v) { return Math.round(v * 100) + '%'; }
};
