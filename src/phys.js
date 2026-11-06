'use strict';
/*
 * Crusher Run: Quarry Simulator
 * Copyright (c) 2026 Ørjan Grane (Studio.grane). All rights reserved.
 * Proprietary software. See LICENSE. Unauthorised copying, modification or distribution is prohibited.
 */
/* ============================================================
   phys.js — a small 2D rigid body engine for convex polygons
   Box2D-style: SAT + reference-face clipping manifolds, persistent
   contacts with warm starting, sequential impulses with speculative
   contacts (no tunnelling at quarry speeds), non-linear Gauss-Seidel
   position correction, surface velocity for conveyor belts,
   kinematic bodies for the swing jaw, island-free sleeping.
   Units: px, s, kg.
   ============================================================ */
const Phys = (() => {
  const STATIC = 0, DYNAMIC = 1, KINEMATIC = 2;
  let shapeSeq = 1, bodySeq = 1;

  class Shape {
    constructor(body, verts, o = {}) {
      this.id = shapeSeq++;
      this.body = body;
      this.friction = o.friction ?? 0.6;
      this.restitution = o.restitution ?? 0.1;
      this.surfaceVel = o.surfaceVel || null;   // {x,y} surface motion (conveyor)
      this.tag = o.tag || null;
      this.user = o.user || null;
      this.wv = []; this.wn = [];
      this.aabb = { x0: 0, y0: 0, x1: 0, y1: 0 };
      this.setVerts(verts);
    }
    setVerts(verts) {
      const v = verts.map(p => ({ x: p.x, y: p.y }));
      if (Poly.area(v) < 0) v.reverse();
      this.lv = v; this.ln = [];
      for (let i = 0; i < v.length; i++) {
        const a = v[i], b = v[(i + 1) % v.length], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
        this.ln.push({ x: dy / l, y: -dx / l });
      }
      const c = Poly.centroid(v); this.lcx = c.x; this.lcy = c.y;
      let r = 0; for (const q of v) r = Math.max(r, Math.hypot(q.x - c.x, q.y - c.y)); this.lr = r;
      while (this.wv.length < v.length) { this.wv.push({ x: 0, y: 0 }); this.wn.push({ x: 0, y: 0 }); }
      this.wv.length = v.length; this.wn.length = v.length;
      if (this.body) this.body.dirty = true;
    }
  }

  class Body {
    constructor(type, x = 0, y = 0, a = 0) {
      this.id = bodySeq++;
      this.type = type;
      this.x = x; this.y = y; this.a = a;
      this.vx = 0; this.vy = 0; this.w = 0;
      this.fx = 0; this.fy = 0; this.tq = 0;
      this.m = 0; this.invM = 0; this.I = 0; this.invI = 0;
      this.shapes = [];
      this.linDamp = 0.1; this.angDamp = 1.5;
      this.gravityScale = 1;
      this.cat = 1; this.mask = 0xFFFF;
      this.awake = true; this.sleepT = 0; this.canSleep = true;
      this.world = null; this.dead = false;
      this.c = 1; this.s = 0;
      this.user = null;
      // per-step contact summary (filled by the solver)
      this.impX = 0; this.impY = 0; this.impAbs = 0; this.touch = [];
      this.dirty = true;
    }
    addShape(verts, o) { const s = new Shape(this, verts, o); this.shapes.push(s); if (this.world) this.world._addProxy(s); return s; }
    setMass(m, I) {
      if (this.type !== DYNAMIC) { this.m = this.invM = this.I = this.invI = 0; return; }
      this.m = m; this.invM = m > 0 ? 1 / m : 0; this.I = I; this.invI = I > 0 ? 1 / I : 0;
    }
    wake() { if (this.type === DYNAMIC && !this.awake) { this.awake = true; this.sleepT = 0; } else this.sleepT = 0; }
    applyImpulse(px, py, wx, wy) {
      if (this.type !== DYNAMIC) return;
      this.wake();
      this.vx += px * this.invM; this.vy += py * this.invM;
      this.w += this.invI * ((wx - this.x) * py - (wy - this.y) * px);
    }
    applyForce(fx, fy, wx, wy) {
      if (this.type !== DYNAMIC) return;
      this.wake();
      this.fx += fx; this.fy += fy;
      if (wx !== undefined) this.tq += (wx - this.x) * fy - (wy - this.y) * fx;
    }
    velAt(px, py) { return { x: this.vx - this.w * (py - this.y), y: this.vy + this.w * (px - this.x) }; }
    toLocal(px, py) { const c = Math.cos(this.a), s = Math.sin(this.a), dx = px - this.x, dy = py - this.y; return { x: dx * c + dy * s, y: -dx * s + dy * c }; }
    toWorld(lx, ly) { const c = Math.cos(this.a), s = Math.sin(this.a); return { x: this.x + lx * c - ly * s, y: this.y + lx * s + ly * c }; }
  }

  function updateShape(s, margin) {
    const b = s.body, c = b.c, sn = b.s, lv = s.lv, ln = s.ln, wv = s.wv, wn = s.wn;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < lv.length; i++) {
      const p = lv[i], q = wv[i];
      q.x = b.x + p.x * c - p.y * sn; q.y = b.y + p.x * sn + p.y * c;
      const n = ln[i], m = wn[i];
      m.x = n.x * c - n.y * sn; m.y = n.x * sn + n.y * c;
      if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
    }
    s.wcx = b.x + s.lcx * c - s.lcy * sn; s.wcy = b.y + s.lcx * sn + s.lcy * c;
    const a = s.aabb;
    // expand along the motion so speculative contacts see what is coming
    const ex = Math.abs(b.vx) * margin + 2, ey = Math.abs(b.vy) * margin + 2, er = Math.abs(b.w) * margin * 30;
    a.x0 = x0 - ex - er; a.x1 = x1 + ex + er; a.y0 = y0 - ey - er; a.y1 = y1 + ey + er;
  }

  // ---------- narrow phase ----------
  let _msI = 0, _msS = 0;
  function maxSep(A, B, lim) {
    let best = -Infinity, bi = 0;
    const av = A.wv, an = A.wn, bv = B.wv, nb = bv.length;
    for (let i = 0; i < av.length; i++) {
      const n = an[i], v = av[i], nx = n.x, ny = n.y, vx = v.x, vy = v.y;
      let mn = Infinity;
      for (let j = 0; j < nb; j++) { const q = bv[j]; const d = nx * (q.x - vx) + ny * (q.y - vy); if (d < mn) mn = d; }
      if (mn > best) { best = mn; bi = i; if (mn > lim) break; }
    }
    _msI = bi; _msS = best;
  }
  const _c = [{ x: 0, y: 0, id: 0 }, { x: 0, y: 0, id: 0 }, { x: 0, y: 0, id: 0 }];
  const _o = [{ x: 0, y: 0, id: 0 }, { x: 0, y: 0, id: 0 }, { x: 0, y: 0, id: 0 }];
  function clipSeg(inp, out, nx, ny, off) {
    let n = 0;
    const p0 = inp[0], p1 = inp[1];
    const d0 = nx * p0.x + ny * p0.y - off, d1 = nx * p1.x + ny * p1.y - off;
    if (d0 <= 0) { out[n].x = p0.x; out[n].y = p0.y; out[n].id = p0.id; n++; }
    if (d1 <= 0) { out[n].x = p1.x; out[n].y = p1.y; out[n].id = p1.id; n++; }
    if (d0 * d1 < 0) {
      const t = d0 / (d0 - d1);
      out[n].x = p0.x + t * (p1.x - p0.x); out[n].y = p0.y + t * (p1.y - p0.y); out[n].id = d0 > 0 ? p0.id : p1.id; n++;
    }
    return n;
  }
  // manifold scratch
  const M = { nx: 0, ny: 0, flip: false, rnx: 0, rny: 0, v11x: 0, v11y: 0, n: 0, pts: [{}, {}] };
  // prefFlip: the reference choice used last step (hysteresis keeps warm starting intact)
  function collide(A, B, margin, prefFlip) {
    const cdx = A.wcx - B.wcx, cdy = A.wcy - B.wcy, rr = A.lr + B.lr + margin;
    if (cdx * cdx + cdy * cdy > rr * rr) return null;
    maxSep(A, B, margin); const ea = _msI, sa = _msS; if (sa > margin) return null;
    maxSep(B, A, margin); const eb = _msI, sb = _msS; if (sb > margin) return null;
    let flip;
    if (prefFlip === true) flip = !(sa > sb + 0.1);
    else if (prefFlip === false) flip = sb > sa + 0.1;
    else flip = sb > sa + 0.05;
    const ref = flip ? B : A, inc = flip ? A : B, edge = flip ? eb : ea;
    const rn = ref.wn[edge], rv = ref.wv, iv = inc.wv, inn = inc.wn;
    let ie = 0, mind = Infinity;
    for (let k = 0; k < inn.length; k++) { const d = rn.x * inn[k].x + rn.y * inn[k].y; if (d < mind) { mind = d; ie = k; } }
    const ie2 = (ie + 1) % iv.length;
    const v11 = rv[edge], v12 = rv[(edge + 1) % rv.length];
    let tx = v12.x - v11.x, ty = v12.y - v11.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    _c[0].x = iv[ie].x; _c[0].y = iv[ie].y; _c[0].id = ie;
    _c[1].x = iv[ie2].x; _c[1].y = iv[ie2].y; _c[1].id = ie2;
    if (clipSeg(_c, _o, -tx, -ty, -(tx * v11.x + ty * v11.y)) < 2) return null;
    if (clipSeg(_o, _c, tx, ty, tx * v12.x + ty * v12.y) < 2) return null;
    let n = 0;
    for (let k = 0; k < 2; k++) {
      const p = _c[k];
      const sep = rn.x * (p.x - v11.x) + rn.y * (p.y - v11.y);
      if (sep <= margin) {
        const o = M.pts[n++];
        o.x = p.x - rn.x * sep * 0.5; o.y = p.y - rn.y * sep * 0.5; o.px = p.x; o.py = p.y; o.sep = sep;
        o.id = (edge << 12) | (p.id & 0xfff) | (flip ? 0x80000 : 0);
      }
    }
    if (!n) return null;
    M.n = n; M.flip = flip; M.ref = ref; M.inc = inc;
    M.nx = flip ? -rn.x : rn.x; M.ny = flip ? -rn.y : rn.y; M.rnx = rn.x; M.rny = rn.y; M.v11x = v11.x; M.v11y = v11.y;
    return M;
  }

  // ---------- world ----------
  class World {
    constructor(o = {}) {
      this.gx = o.gx ?? 0; this.gy = o.gy ?? 900;
      this.velIters = o.velIters ?? 10; this.posIters = o.posIters ?? 4;
      this.slop = 0.6; this.baumgarte = 0.25; this.maxCorr = 6;
      this.restThreshold = 60;
      this.bodies = []; this.proxies = []; this.arbiters = new Map(); this.active = [];
      this.events = []; this.stepCount = 0;
      this.sleepLin = 9; this.sleepAng = 0.12; this.sleepTime = 0.5;
      this.maxImpulse = Infinity;
    }
    add(b) { b.world = this; this.bodies.push(b); for (const s of b.shapes) this._addProxy(s); b.dirty = true; return b; }
    _addProxy(s) { this.proxies.push(s); s.body.dirty = true; }
    remove(b) {
      if (b.dead) return; b.dead = true;
      const i = this.bodies.indexOf(b); if (i >= 0) this.bodies.splice(i, 1);
      const ids = new Set(b.shapes.map(s => s.id));
      this.proxies = this.proxies.filter(s => !ids.has(s.id));
      for (const [k, arb] of this.arbiters) {
        if (arb.A.body === b || arb.B.body === b) { const o = arb.A.body === b ? arb.B.body : arb.A.body; o.wake(); this.arbiters.delete(k); }
      }
      this.active = this.active.filter(a => a.A.body !== b && a.B.body !== b);
    }
    removeShape(s) {
      const b = s.body; const i = b.shapes.indexOf(s); if (i >= 0) b.shapes.splice(i, 1);
      this.proxies = this.proxies.filter(p => p !== s);
      for (const [k, arb] of this.arbiters) if (arb.A === s || arb.B === s) { this.arbiters.delete(k); }
      this.active = this.active.filter(a => a.A !== s && a.B !== s);
    }

    step(dt) {
      this.stepCount++;
      const bodies = this.bodies;
      // 1. integrate velocities
      for (const b of bodies) {
        if (b.type !== DYNAMIC || !b.awake) { b.fx = b.fy = b.tq = 0; continue; }
        b.vx += (this.gx * b.gravityScale + b.fx * b.invM) * dt;
        b.vy += (this.gy * b.gravityScale + b.fy * b.invM) * dt;
        b.w += b.tq * b.invI * dt;
        b.vx /= 1 + dt * b.linDamp; b.vy /= 1 + dt * b.linDamp; b.w /= 1 + dt * b.angDamp;
        // speed limit keeps a pinched body from being shot out at absurd speed
        const sp = b.vx * b.vx + b.vy * b.vy, lim = 6000;
        if (sp > lim * lim) { const k = lim / Math.sqrt(sp); b.vx *= k; b.vy *= k; }
        if (b.w > 40) b.w = 40; else if (b.w < -40) b.w = -40;
        b.fx = b.fy = b.tq = 0;
      }
      // 2. transforms
      for (const b of bodies) {
        if (b.type === STATIC && !b.dirty) continue;
        if (b.type === DYNAMIC && !b.awake && !b.dirty) continue;
        b.c = Math.cos(b.a); b.s = Math.sin(b.a);
        for (const s of b.shapes) updateShape(s, dt);
        b.dirty = false;
      }
      // 3. broad + narrow phase
      this._collide(dt);
      // 4. prestep + warm start
      const act = this.active;
      for (const arb of act) this._prestep(arb, dt);
      for (const arb of act) this._warm(arb);
      // 5. velocity iterations
      for (let it = 0; it < this.velIters; it++) for (const arb of act) this._solveVel(arb);
      // 6. integrate positions
      for (const b of bodies) {
        if (b.type === STATIC) continue;
        if (b.type === DYNAMIC && !b.awake) continue;
        b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt;
        b.c = Math.cos(b.a); b.s = Math.sin(b.a); b.dirty = true;
      }
      // 7. position correction
      for (let it = 0; it < this.posIters; it++) {
        let minSep = 0;
        for (const arb of act) minSep = Math.min(minSep, this._solvePos(arb));
        if (minSep > -this.slop * 3) break;
      }
      // 8. post: contact summary, events, sleep
      this._post(dt);
    }

    _collide(dt) {
      const P = this.proxies;
      // insertion sort by aabb.x0 (nearly sorted frame to frame)
      for (let i = 1; i < P.length; i++) {
        const s = P[i], k = s.aabb.x0; let j = i - 1;
        while (j >= 0 && P[j].aabb.x0 > k) { P[j + 1] = P[j]; j--; }
        P[j + 1] = s;
      }
      const stamp = this.stepCount;
      const act = [];
      for (let i = 0; i < P.length; i++) {
        const A = P[i], aa = A.aabb, ba = A.body;
        for (let j = i + 1; j < P.length; j++) {
          const B = P[j], bb = B.aabb;
          if (bb.x0 > aa.x1) break;
          if (bb.y0 > aa.y1 || bb.y1 < aa.y0) continue;
          const bbd = B.body;
          if (ba === bbd) continue;
          if (ba.type !== DYNAMIC && bbd.type !== DYNAMIC) continue;
          if (!(ba.cat & bbd.mask) || !(bbd.cat & ba.mask)) continue;
          const aAw = ba.type === DYNAMIC ? ba.awake : false, bAw = bbd.type === DYNAMIC ? bbd.awake : false;
          if (!aAw && !bAw) {
            // a sleeping body touching a moving kinematic one must wake
            const kin = ba.type === KINEMATIC ? ba : bbd.type === KINEMATIC ? bbd : null;
            if (!kin || (kin.vx === 0 && kin.vy === 0 && kin.w === 0)) continue;
          }
          const S1 = A.id < B.id ? A : B, S2 = A.id < B.id ? B : A;
          const key = S1.id * 100003 + S2.id;
          const b1 = S1.body, b2 = S2.body;
          const margin = 1.5 + (Math.hypot(b1.vx - b2.vx, b1.vy - b2.vy) + (Math.abs(b1.w) + Math.abs(b2.w)) * 30) * dt;
          let arb = this.arbiters.get(key);
          const man = collide(S1, S2, margin, arb && arb.pts.length ? !arb.refIsA : undefined);
          if (!man) { if (arb) this.arbiters.delete(key); continue; }
          // wake sleeping partner if an awake body (or moving kinematic) touches it
          if (b1.type === DYNAMIC && !b1.awake) b1.wake();
          if (b2.type === DYNAMIC && !b2.awake) b2.wake();
          if (!arb) { arb = { A: S1, B: S2, pts: [], fresh: true, key }; this.arbiters.set(key, arb); }
          else arb.fresh = false;
          this._update(arb, man);
          arb.stamp = stamp;
          act.push(arb);
        }
      }
      // drop arbiters that are no longer overlapping (unless both asleep — keep them for wake-up)
      for (const [k, arb] of this.arbiters) {
        if (arb.stamp === stamp) continue;
        const a = arb.A.body, b = arb.B.body;
        const sleeping = (a.type !== DYNAMIC || !a.awake) && (b.type !== DYNAMIC || !b.awake);
        if (!sleeping) this.arbiters.delete(k);
      }
      this.active = act;
    }
    _update(arb, man) {
      const old = arb.pts;
      const A = arb.A, B = arb.B;
      arb.nx = man.nx; arb.ny = man.ny;
      arb.mu = Math.sqrt(A.friction * B.friction);
      arb.e = Math.max(A.restitution, B.restitution);
      const ref = man.ref, inc = man.inc, rb = ref.body, ib = inc.body;
      arb.refIsA = !man.flip;
      const rc = Math.cos(rb.a), rs = Math.sin(rb.a);
      arb.lnx = man.rnx * rc + man.rny * rs; arb.lny = -man.rnx * rs + man.rny * rc;
      const dx = man.v11x - rb.x, dy = man.v11y - rb.y;
      arb.lpx = dx * rc + dy * rs; arb.lpy = -dx * rs + dy * rc;
      const ic = Math.cos(ib.a), is = Math.sin(ib.a);
      const pts = arb.pts2 || (arb.pts2 = []);
      pts.length = 0;
      for (let k = 0; k < man.n; k++) {
        const p = man.pts[k];
        const ex = p.px - ib.x, ey = p.py - ib.y;
        let cp = null;
        // warm start: same feature id, else the nearest old point (survives reference flips)
        for (const o of old) if (o.id === p.id) { cp = o; break; }
        if (!cp) { let bd = 9; for (const o of old) { const d = (o.x - p.x) * (o.x - p.x) + (o.y - p.y) * (o.y - p.y); if (d < bd && !o._used) { bd = d; cp = o; } } }
        let q;
        if (cp && !cp._used) { q = cp; q._used = true; q.isNew = false; }
        else { q = { Pn: 0, Pt: 0, _used: true, isNew: true }; }
        q.x = p.x; q.y = p.y; q.sep = p.sep; q.id = p.id;
        q.lix = ex * ic + ey * is; q.liy = -ex * is + ey * ic;
        pts.push(q);
      }
      for (const q of pts) q._used = false;
      arb.pts2 = old; arb.pts = pts;
    }
    _prestep(arb, dt) {
      const a = arb.A.body, b = arb.B.body, nx = arb.nx, ny = arb.ny, tx = ny, ty = -nx;
      const mA = a.invM, mB = b.invM, iA = a.invI, iB = b.invI;
      const svA = arb.A.surfaceVel, svB = arb.B.surfaceVel;
      arb.svx = (svB ? svB.x : 0) - (svA ? svA.x : 0); arb.svy = (svB ? svB.y : 0) - (svA ? svA.y : 0);
      for (const p of arb.pts) {
        const rax = p.x - a.x, ray = p.y - a.y, rbx = p.x - b.x, rby = p.y - b.y;
        p.rax = rax; p.ray = ray; p.rbx = rbx; p.rby = rby;
        const rnA = rax * ny - ray * nx, rnB = rbx * ny - rby * nx;
        const kN = mA + mB + iA * rnA * rnA + iB * rnB * rnB;
        p.nm = kN > 0 ? 1 / kN : 0;
        const rtA = rax * ty - ray * tx, rtB = rbx * ty - rby * tx;
        const kT = mA + mB + iA * rtA * rtA + iB * rtB * rtB;
        p.tm = kT > 0 ? 1 / kT : 0;
        const dvx = b.vx - b.w * rby - a.vx + a.w * ray, dvy = b.vy + b.w * rbx - a.vy - a.w * rax;
        const vn = dvx * nx + dvy * ny;
        p.vn0 = vn;
        if (p.sep > 0) p.target = -p.sep / dt;
        else p.target = vn < -this.restThreshold ? -arb.e * vn : 0;
      }
      // 2-point block solver (solves both normal impulses together — needed for stable stacks)
      arb.block = false;
      if (arb.pts.length === 2) {
        const p1 = arb.pts[0], p2 = arb.pts[1];
        const rn1A = p1.rax * ny - p1.ray * nx, rn1B = p1.rbx * ny - p1.rby * nx;
        const rn2A = p2.rax * ny - p2.ray * nx, rn2B = p2.rbx * ny - p2.rby * nx;
        const k11 = mA + mB + iA * rn1A * rn1A + iB * rn1B * rn1B;
        const k22 = mA + mB + iA * rn2A * rn2A + iB * rn2B * rn2B;
        const k12 = mA + mB + iA * rn1A * rn2A + iB * rn1B * rn2B;
        const det = k11 * k22 - k12 * k12;
        if (k11 * k11 < 1000 * det && det > 0) {
          arb.block = true; arb.k11 = k11; arb.k22 = k22; arb.k12 = k12;
          const id = 1 / det; arb.i11 = k22 * id; arb.i22 = k11 * id; arb.i12 = -k12 * id;
        }
      }
    }
    _warm(arb) {
      const a = arb.A.body, b = arb.B.body, nx = arb.nx, ny = arb.ny, tx = ny, ty = -nx;
      const mA = a.invM, mB = b.invM, iA = a.invI, iB = b.invI;
      for (const p of arb.pts) {
        const Px = p.Pn * nx + p.Pt * tx, Py = p.Pn * ny + p.Pt * ty;
        a.vx -= mA * Px; a.vy -= mA * Py; a.w -= iA * (p.rax * Py - p.ray * Px);
        b.vx += mB * Px; b.vy += mB * Py; b.w += iB * (p.rbx * Py - p.rby * Px);
      }
    }
    _solveVel(arb) {
      const a = arb.A.body, b = arb.B.body, nx = arb.nx, ny = arb.ny, tx = ny, ty = -nx;
      const mA = a.invM, mB = b.invM, iA = a.invI, iB = b.invI, mu = arb.mu;
      const pts = arb.pts;
      // friction first, then normal (Box2D order)
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k];
        const dvx = b.vx - b.w * p.rby - a.vx + a.w * p.ray + arb.svx, dvy = b.vy + b.w * p.rbx - a.vy - a.w * p.rax + arb.svy;
        const vt = dvx * tx + dvy * ty;
        let lam = -p.tm * vt;
        const maxF = mu * p.Pn, np = clamp(p.Pt + lam, -maxF, maxF);
        lam = np - p.Pt; p.Pt = np;
        const Px = lam * tx, Py = lam * ty;
        a.vx -= mA * Px; a.vy -= mA * Py; a.w -= iA * (p.rax * Py - p.ray * Px);
        b.vx += mB * Px; b.vy += mB * Py; b.w += iB * (p.rbx * Py - p.rby * Px);
      }
      if (arb.block && !this.noBlock) { this._blockSolve(arb, a, b, nx, ny, mA, mB, iA, iB); return; }
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k];
        const dvx = b.vx - b.w * p.rby - a.vx + a.w * p.ray, dvy = b.vy + b.w * p.rbx - a.vy - a.w * p.rax;
        const vn = dvx * nx + dvy * ny;
        let lam = -p.nm * (vn - p.target);
        let np = Math.max(p.Pn + lam, 0);
        if (np > this.maxImpulse) np = this.maxImpulse;
        lam = np - p.Pn; p.Pn = np;
        const Px = lam * nx, Py = lam * ny;
        a.vx -= mA * Px; a.vy -= mA * Py; a.w -= iA * (p.rax * Py - p.ray * Px);
        b.vx += mB * Px; b.vy += mB * Py; b.w += iB * (p.rbx * Py - p.rby * Px);
      }
    }
    _blockSolve(arb, a, b, nx, ny, mA, mB, iA, iB) {
      const p1 = arb.pts[0], p2 = arb.pts[1];
      const v1x = b.vx - b.w * p1.rby - a.vx + a.w * p1.ray, v1y = b.vy + b.w * p1.rbx - a.vy - a.w * p1.rax;
      const v2x = b.vx - b.w * p2.rby - a.vx + a.w * p2.ray, v2y = b.vy + b.w * p2.rbx - a.vy - a.w * p2.rax;
      const vn1 = v1x * nx + v1y * ny, vn2 = v2x * nx + v2y * ny;
      const ax = p1.Pn, ay = p2.Pn;
      let bx = vn1 - p1.target - (arb.k11 * ax + arb.k12 * ay);
      let by = vn2 - p2.target - (arb.k12 * ax + arb.k22 * ay);
      let x1, x2;
      for (;;) {
        // case 1: both points active
        x1 = -(arb.i11 * bx + arb.i12 * by); x2 = -(arb.i12 * bx + arb.i22 * by);
        if (x1 >= 0 && x2 >= 0) break;
        // case 2: only point 1
        x1 = -bx / arb.k11; x2 = 0;
        if (x1 >= 0 && arb.k12 * x1 + by >= 0) break;
        // case 3: only point 2
        x1 = 0; x2 = -by / arb.k22;
        if (x2 >= 0 && arb.k12 * x2 + bx >= 0) break;
        // case 4: none
        x1 = 0; x2 = 0;
        if (bx >= 0 && by >= 0) break;
        // no solution (degenerate) — leave impulses as they were
        x1 = ax; x2 = ay; break;
      }
      const d1 = x1 - ax, d2 = x2 - ay;
      p1.Pn = x1; p2.Pn = x2;
      const P1x = d1 * nx, P1y = d1 * ny, P2x = d2 * nx, P2y = d2 * ny;
      a.vx -= mA * (P1x + P2x); a.vy -= mA * (P1y + P2y);
      a.w -= iA * (p1.rax * P1y - p1.ray * P1x + p2.rax * P2y - p2.ray * P2x);
      b.vx += mB * (P1x + P2x); b.vy += mB * (P1y + P2y);
      b.w += iB * (p1.rbx * P1y - p1.rby * P1x + p2.rbx * P2y - p2.rby * P2x);
    }
    _solvePos(arb) {
      const A = arb.A.body, B = arb.B.body;
      const mA = A.invM, mB = B.invM, iA = A.invI, iB = B.invI;
      if (mA === 0 && mB === 0) return 0;
      const ref = arb.refIsA ? A : B, inc = arb.refIsA ? B : A;
      let minSep = 0;
      const rc = Math.cos(ref.a), rs = Math.sin(ref.a), ic = Math.cos(inc.a), is = Math.sin(inc.a);
      for (const p of arb.pts) {
        let nx = arb.lnx * rc - arb.lny * rs, ny = arb.lnx * rs + arb.lny * rc;
        const ppx = ref.x + arb.lpx * rc - arb.lpy * rs, ppy = ref.y + arb.lpx * rs + arb.lpy * rc;
        const cx = inc.x + p.lix * ic - p.liy * is, cy = inc.y + p.lix * is + p.liy * ic;
        const sep = (cx - ppx) * nx + (cy - ppy) * ny;
        if (!arb.refIsA) { nx = -nx; ny = -ny; }
        minSep = Math.min(minSep, sep);
        const C = clamp(this.baumgarte * (sep + this.slop), -this.maxCorr, 0);
        if (C >= 0) continue;
        const px = cx, py = cy;
        const rax = px - A.x, ray = py - A.y, rbx = px - B.x, rby = py - B.y;
        const rnA = rax * ny - ray * nx, rnB = rbx * ny - rby * nx;
        const K = mA + mB + iA * rnA * rnA + iB * rnB * rnB;
        const imp = K > 0 ? -C / K : 0;
        const Px = imp * nx, Py = imp * ny;
        A.x -= mA * Px; A.y -= mA * Py; A.a -= iA * (rax * Py - ray * Px);
        B.x += mB * Px; B.y += mB * Py; B.a += iB * (rbx * Py - rby * Px);
      }
      return minSep;
    }
    _post(dt) {
      for (const b of this.bodies) { b.impX = 0; b.impY = 0; b.impAbs = 0; b.touch.length = 0; }
      const ev = this.events;
      for (const arb of this.active) {
        const a = arb.A.body, b = arb.B.body;
        let tot = 0, any = false;
        for (const p of arb.pts) {
          if (p.sep > 0.5 && p.Pn === 0) continue;
          any = true;
          tot += p.Pn;
          const ix = p.Pn * arb.nx + p.Pt * arb.ny, iy = p.Pn * arb.ny - p.Pt * arb.nx;
          // impulse on B is +I, on A is -I
          b.impX += ix; b.impY += iy; b.impAbs += p.Pn;
          a.impX -= ix; a.impY -= iy; a.impAbs += p.Pn;
          if (p.isNew && p.vn0 < -40) ev.push({ type: 'impact', x: p.x, y: p.y, speed: -p.vn0, imp: p.Pn, A: arb.A, B: arb.B });
          p.isNew = false;
        }
        if (any) { arb.touching = true; a.touch.push(arb); b.touch.push(arb); arb.imp = tot; } else { arb.touching = false; arb.imp = 0; }
      }
      // island sleeping: bodies joined by contacts sleep together once every one of them has been still;
      // an island touching a moving kinematic body or a conveyor stays awake
      const ls = this.sleepLin * this.sleepLin, B = this.bodies;
      const par = new Map();
      const find = (b) => { let r = b; while (par.get(r) !== r) r = par.get(r); let c = b; while (par.get(c) !== r) { const n = par.get(c); par.set(c, r); c = n; } return r; };
      for (const b of B) if (b.type === DYNAMIC && b.awake) {
        par.set(b, b); b._block = false;
        const still = b.canSleep && b.vx * b.vx + b.vy * b.vy < ls && Math.abs(b.w) < this.sleepAng;
        b.sleepT = still ? b.sleepT + dt : 0;
      }
      for (const arb of this.active) {
        if (!arb.touching) continue;
        const a = arb.A.body, b = arb.B.body;
        const da = a.type === DYNAMIC && a.awake, db = b.type === DYNAMIC && b.awake;
        if (da && db) { const ra = find(a), rb = find(b); if (ra !== rb) par.set(ra, rb); }
        const sv = arb.A.surfaceVel || arb.B.surfaceVel;
        // a moving kinematic body (the swing jaw) or a running conveyor wakes whatever sleeps against it
        const kb = b.type === KINEMATIC && (b.vx || b.vy || b.w), ka = a.type === KINEMATIC && (a.vx || a.vy || a.w);
        if (a.type === DYNAMIC && !a.awake && (kb || sv)) { a.awake = true; a.sleepT = 0; }
        if (b.type === DYNAMIC && !b.awake && (ka || sv)) { b.awake = true; b.sleepT = 0; }
        if (da && (sv || kb)) a._block = true;
        if (db && (sv || (a.type === KINEMATIC && (a.vx || a.vy || a.w)))) b._block = true;
      }
      const isl = new Map();
      for (const b of par.keys()) {
        const r = find(b); let g = isl.get(r);
        if (!g) { g = { min: Infinity, block: false, list: [] }; isl.set(r, g); }
        g.list.push(b); if (b.sleepT < g.min) g.min = b.sleepT; if (b._block || !b.canSleep) g.block = true;
      }
      for (const g of isl.values()) {
        if (g.block || g.min < this.sleepTime) continue;
        for (const b of g.list) { b.awake = false; b.vx = b.vy = b.w = 0; }
      }
    }

    // ---------- queries ----------
    pointQuery(x, y, filter) {
      const out = [];
      for (const s of this.proxies) {
        const a = s.aabb; if (x < a.x0 || x > a.x1 || y < a.y0 || y > a.y1) continue;
        if (filter && !filter(s)) continue;
        if (s.body.dirty) { const b = s.body; b.c = Math.cos(b.a); b.s = Math.sin(b.a); updateShape(s, 0); }
        if (Poly.contains(s.wv, x, y)) out.push(s);
      }
      return out;
    }
    // first hit along the segment (Cyrus–Beck against each convex shape)
    rayCast(x1, y1, x2, y2, filter) {
      let best = null, bt = 1;
      const dx = x2 - x1, dy = y2 - y1;
      const mnx = Math.min(x1, x2), mxx = Math.max(x1, x2), mny = Math.min(y1, y2), mxy = Math.max(y1, y2);
      for (const s of this.proxies) {
        const a = s.aabb; if (mxx < a.x0 || mnx > a.x1 || mxy < a.y0 || mny > a.y1) continue;
        if (filter && !filter(s)) continue;
        let tE = 0, tL = bt, en = null;
        const v = s.wv, n = s.wn;
        let ok = true;
        for (let i = 0; i < v.length; i++) {
          const num = n[i].x * (v[i].x - x1) + n[i].y * (v[i].y - y1), den = n[i].x * dx + n[i].y * dy;
          if (den === 0) { if (num < 0) { ok = false; break; } continue; }
          const t = num / den;
          if (den < 0) { if (t > tE) { tE = t; en = n[i]; } } else { if (t < tL) tL = t; }
          if (tE > tL) { ok = false; break; }
        }
        if (ok && en && tE < bt) { bt = tE; best = { shape: s, t: tE, x: x1 + dx * tE, y: y1 + dy * tE, nx: en.x, ny: en.y }; }
      }
      return best;
    }
    // shapes whose aabb overlaps
    queryAABB(x0, y0, x1, y1, filter) {
      const out = [];
      for (const s of this.proxies) { const a = s.aabb; if (x1 < a.x0 || x0 > a.x1 || y1 < a.y0 || y0 > a.y1) continue; if (!filter || filter(s)) out.push(s); }
      return out;
    }
  }

  return { STATIC, DYNAMIC, KINEMATIC, Body, Shape, World, collide };
})();
