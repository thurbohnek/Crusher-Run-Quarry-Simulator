'use strict';
/*
 * Crusher Run: Quarry Simulator
 * Copyright (c) 2026 Ørjan Grane (Studio.grane). All rights reserved.
 * Proprietary software. See LICENSE. Unauthorised copying, modification or distribution is prohibited.
 */
/* ============================================================
   machine.js — single-toggle jaw crusher.
   Real geometry: fixed jaw vertical, swing jaw hung on an eccentric
   shaft, bottom held by a toggle plate against an adjustable seat
   (shims or hydraulic cylinder). Nip angle ≈ 20°.
   Drive: induction motor → V-belts → flywheels; crushing energy by
   Bond's law comes out of the flywheel; jaw force limited per size.
   ============================================================ */
const TIERS = [
  { id: 0, name: 'PE-400×600', gape: 400, feed: 340, css: [40, 100], cap: [16, 64], kw: 30, rpm: 275, stroke: 22, pitch: 62, tooth: 20,
    flyI: 110, Fmax: 720e3, plateLife: 12000, plates: 14000, toggle: 6500, price: 0, weight: 6.5, paint: [[70, 104, 132], [46, 72, 96]], rust: 0.5, year: 1998,
    note: 'Used jaw crusher. Shims and toggle plate. Fine to start with.' },
  { id: 1, name: 'PE-600×900', gape: 600, feed: 500, css: [65, 160], cap: [50, 180], kw: 55, rpm: 250, stroke: 26, pitch: 82, tooth: 26,
    flyI: 420, Fmax: 1600e3, plateLife: 30000, plates: 32000, toggle: 12000, price: 260000, weight: 16, paint: [[58, 110, 160], [38, 78, 118]], rust: 0.18, year: 2012,
    note: 'Double the capacity and 55 kW. Takes blocks up to half a metre.' },
  { id: 2, name: 'PE-900×1200', gape: 900, feed: 750, css: [100, 200], cap: [144, 304], kw: 132, rpm: 200, stroke: 32, pitch: 110, tooth: 34,
    flyI: 2300, Fmax: 3600e3, plateLife: 80000, plates: 78000, toggle: 26000, price: 920000, weight: 50, paint: [[214, 160, 40], [160, 112, 22]], rust: 0.06, year: 2019,
    note: 'Primary crusher for a proper quarry. 50 tonnes of steel, 132 kW.' },
  { id: 3, name: 'PE-1200×1500', gape: 1200, feed: 1020, css: [150, 300], cap: [400, 800], kw: 160, rpm: 180, stroke: 38, pitch: 140, tooth: 42,
    flyI: 5200, Fmax: 6400e3, plateLife: 150000, plates: 140000, toggle: 48000, price: 3400000, weight: 100, paint: [[92, 124, 96], [62, 88, 66]], rust: 0.03, year: 2024,
    note: 'Stationary primary plant. Metre-sized blocks, 400–800 t/h.' }
];

const Machine = (() => {
  // ---------- fixed layout (px) ----------
  const G = {
    FX: 470,            // fixed jaw plate base line
    TOP: 300, BOT: 1040, // chamber
    GAPE: 360,
    E0: { x: 54, y: 262 },
    BELT_Y: 1190, BELT_X0: 110, BELT_X1: 560,   // the belt runs to the LEFT in a pit under the crusher (clear of the swing jaw), onto the stacker
    PLAT_Y: 176,        // (old right catwalk level)
    PLAT_L: 150,        // operator platform level, left of the mouth
    FEED: { x0: 476, y0: 252, x1: 1080, y1: 196 },   // vibrating feeder deck (discharge end at the mouth)
    TOG_LEN: 132, TOG_ANG: 0.55
  };
  const mmpxOf = (tier) => tier.gape / G.GAPE;

  function quad(ax, ay, bx, by, cx, cy, dx, dy) { return [{ x: ax, y: ay }, { x: bx, y: by }, { x: cx, y: cy }, { x: dx, y: dy }]; }

  // ---------- build ----------
  function build(sim) {
    const M = sim.m;  // machine runtime state
    const T = sim.tier, mmpx = sim.mmpx, W = sim.world;
    const ps = T.pitch / mmpx, th0 = T.tooth / mmpx;
    M.pitchPx = ps; M.toothPx = th0;
    const nT = Math.max(6, Math.round((G.BOT - G.TOP) / ps));
    M.nTeeth = nT;
    if (!sim.save.wearM || sim.save.wearM.length !== nT) { sim.save.wearM = new Array(nT).fill(sim.save.plates0 ?? 0); sim.save.wearF = new Array(nT).fill(sim.save.plates0 ?? 0); }

    // static: fixed jaw (plate + teeth), hopper walls, chute skirt, belt
    const fix = new Phys.Body(Phys.STATIC); fix.tag = 'jawF';
    fix.addShape(quad(G.FX, G.TOP - 6, G.FX + 40, G.TOP - 6, G.FX + 40, G.BOT + 24, G.FX, G.BOT + 24), { friction: 0.42, restitution: 0.1, user: { jaw: 'F', base: 1 } });
    M.teethF = [];
    for (let i = 0; i < nT; i++) {
      const y0 = G.TOP + i * ps, s = fix.addShape(quad(G.FX, y0, G.FX - 1, y0 + 1, G.FX - 1, y0 + 2, G.FX, y0 + 3), { friction: 0.5, restitution: 0.1, user: { jaw: 'F', tooth: i } });
      M.teethF.push(s);
    }
    fix.mask = 0xFFFF & ~2;   // product that has left the chamber no longer touches the fixed jaw
    W.add(fix); M.fix = fix;
    // hopper: left lip over the pitman top, right wall down to the fixed jaw top
    const hop = new Phys.Body(Phys.STATIC); hop.tag = 'hopper';
    hop.addShape([{ x: -40, y: 150 }, { x: 0, y: 150 }, { x: 124, y: 288 }, { x: 96, y: 312 }, { x: -40, y: 312 }], { friction: 0.55, restitution: 0.15 });
    // guard plate on the rim over the eccentric shaft and flywheel: stones cannot roll over behind the swing jaw.
    // It takes the blows of an overfilled hopper and can be beaten through (sim.save.guard = condition 0..1)
    if ((sim.save.guard ?? 1) > 0) M.guard = hop.addShape(quad(-62, -170, -18, -150, -18, 160, -62, 160), { friction: 0.5, restitution: 0.12, tag: 'guard' });
    else hop.addShape(quad(-60, 120, -20, 120, -20, 160, -60, 160), { friction: 0.5 });   // only the stump of the broken plate
    W.add(hop); M.hop = hop;
    // vibrating feeder (apron of a grizzly feeder): a pan sloping gently down to the mouth. The
    // excavator puts the load on it; the vibration walks the stones forward at a set speed.
    const fd = new Phys.Body(Phys.STATIC); fd.tag = 'feeder';
    // feeder length suits the machine: ~3.3 m on the small crusher, ~5.5 m on the big one
    const F = G.FEED; { const Lf = [3300, 4200, 5000, 5600][sim.save.tier || 0] / mmpx; F.x1 = Math.round(F.x0 + Lf); F.y1 = Math.round(F.y0 - Math.tan(4 * Math.PI / 180) * Lf); }
    M.feedDeck = fd.addShape([{ x: F.x0, y: F.y0 }, { x: F.x1, y: F.y1 }, { x: F.x1, y: F.y1 + 90 }, { x: F.x0, y: F.y0 + 90 }],   // thick, so heavy blocks cannot punch through
      { friction: 0.62, restitution: 0.08, surfaceVel: { x: 0, y: 0 }, tag: 'feeder' });
    fd.addShape(quad(F.x1 - 4, F.y1 - 520, F.x1 + 36, F.y1 - 520, F.x1 + 36, F.y1 + 26, F.x1 - 4, F.y1 + 26), { friction: 0.5 });   // back plate
    fd.addShape([{ x: G.FX - 4, y: 296 }, { x: F.x0 + 4, y: F.y0 + 2 }, { x: F.x0 + 4, y: F.y0 + 40 }, { x: G.FX + 30, y: 330 }], { friction: 0.55 });   // lip down into the mouth
    W.add(fd); M.feeder = fd;
    // under-crusher chute: back skirt and belt
    const ch = new Phys.Body(Phys.STATIC); ch.tag = 'chute';
    ch.addShape(quad(G.BELT_X1, 1040, G.BELT_X1 + 16, 1040, G.BELT_X1 + 16, G.BELT_Y + 2, G.BELT_X1, G.BELT_Y + 2), { friction: 0.5 });   // tail skirt
    M.beltShape = ch.addShape(quad(G.BELT_X0 - 20, G.BELT_Y, G.BELT_X1 + 20, G.BELT_Y, G.BELT_X1 + 20, G.BELT_Y + 30, G.BELT_X0 - 20, G.BELT_Y + 30), { friction: 0.85, restitution: 0.05, surfaceVel: { x: -sim.beltV, y: 0 }, tag: 'belt' });
    // catch floor far below (anything that falls off is gone)
    W.add(ch); M.chute = ch;

    // kinematic swing jaw, origin = eccentric shaft centre
    const pit = new Phys.Body(Phys.KINEMATIC, G.E0.x, G.E0.y, 0); pit.tag = 'jawM';
    M.pit = pit;
    // design: open position face from (FX-GAPE, TOP) to (FX - OSS - teeth, BOT)
    const oss0 = (T.css[0] + T.css[1]) / 2 / mmpx + T.stroke / mmpx + 2 * th0;
    const Ft = { x: G.FX - G.GAPE - G.E0.x, y: G.TOP - G.E0.y };
    const Fb = { x: G.FX - oss0 - G.E0.x, y: G.BOT - G.E0.y };
    M.Ft = Ft; M.Fb = Fb;
    const fdx = Fb.x - Ft.x, fdy = Fb.y - Ft.y, fl = Math.hypot(fdx, fdy);
    M.fu = { x: fdx / fl, y: fdy / fl };        // along face (down)
    M.fn = { x: fdy / fl, y: -fdx / fl };       // outward normal (into the chamber, to the right)
    if (M.fn.x < 0) { M.fn.x = -M.fn.x; M.fn.y = -M.fn.y; }
    M.faceLen = fl;
    const bk = 30, nx = -M.fn.x, ny = -M.fn.y;  // into the pitman
    pit.addShape([{ x: Ft.x, y: Ft.y - 8 }, { x: Fb.x, y: Fb.y + 18 }, { x: Fb.x + nx * bk, y: Fb.y + 18 + ny * bk }, { x: Ft.x + nx * bk, y: Ft.y - 8 + ny * bk }], { friction: 0.42, restitution: 0.1, user: { jaw: 'M', base: 1 } });
    // pitman casting behind the plate (keeps rock out of the back) + top cap
    pit.addShape([{ x: Ft.x + nx * bk, y: Ft.y + ny * bk - 8 }, { x: Fb.x + nx * bk, y: Fb.y + ny * bk + 18 }, { x: Fb.x + nx * bk - 90, y: Fb.y + 30 }, { x: -70, y: 40 }, { x: -40, y: -50 }], { friction: 0.5, user: { jaw: 'M', body: 1 } });
    pit.addShape([{ x: -50, y: -60 }, { x: 40, y: -60 }, { x: Ft.x + 6, y: Ft.y - 10 }, { x: Ft.x + nx * bk, y: Ft.y + ny * bk - 8 }, { x: -40, y: 20 }], { friction: 0.5, user: { jaw: 'M', body: 1 } });
    M.teethM = [];
    for (let i = 0; i < nT; i++) { const s = pit.addShape(quad(0, 0, 1, 0, 1, 1, 0, 1), { friction: 0.5, restitution: 0.1, user: { jaw: 'M', tooth: i } }); M.teethM.push(s); }
    pit.mask = 0xFFFF & ~2;   // product that has left the chamber (on the belt below) no longer touches the swing jaw
    W.add(pit);
    // toggle seat on the pitman (local) and toggle frame seat (world, moved by shims)
    M.Lt = { x: Fb.x + nx * bk - 70, y: Fb.y + 26 };
    const tw = { x: G.E0.x + M.Lt.x, y: G.E0.y + M.Lt.y };
    M.S0 = { x: tw.x - G.TOG_LEN * Math.cos(G.TOG_ANG), y: tw.y + G.TOG_LEN * Math.sin(G.TOG_ANG) };
    M.S = { x: M.S0.x, y: M.S0.y };
    M.theta = 0; M.phi = 0; M.ecc = 6;
    updateTeeth(sim, true);
    // tune eccentric throw so the bottom stroke matches the real machine, then set CSS
    tuneStroke(sim);
    setCSS(sim, sim.save.css);
    poseAt(sim, M.theta, true);
  }

  // tooth profiles from wear (w: 0 new, 1 teeth gone, >1 plate eroding)
  function toothVerts(baseX, y0, ps, h, dir) {
    // trapezoid tooth on the plate line; dir = +1 points right (moving jaw), -1 left (fixed jaw)
    const b0 = y0 + ps * 0.06, b1 = y0 + ps * 0.94, t0 = y0 + ps * 0.36, t1 = y0 + ps * 0.64;
    const hh = Math.max(0.6, h);
    return [{ x: baseX, y: b0 }, { x: baseX + dir * hh, y: t0 }, { x: baseX + dir * hh, y: t1 }, { x: baseX, y: b1 }];
  }
  function toothH(sim, w) { return sim.m.toothPx * clamp(1 - w, 0, 1); }
  function plateEro(sim, w) { return sim.m.toothPx * 0.6 * clamp(w - 1, 0, 0.8); }
  function updateTeeth(sim, force) {
    const M = sim.m, nT = M.nTeeth, ps = M.pitchPx, wm = sim.save.wearM, wf = sim.save.wearF;
    for (let i = 0; i < nT; i++) {
      // fixed jaw teeth face left; teeth on the two plates are offset half a pitch (tip faces valley)
      const hf = toothH(sim, wf[i]), ef = plateEro(sim, wf[i]);
      const key = Math.round(hf * 2) + ':' + Math.round(ef * 2);
      const sf = M.teethF[i];
      if (force || sf._k !== key) {
        const y0 = G.TOP + i * ps + ps * 0.5 - ps * 0.5;
        sf.setVerts(toothVerts(G.FX + ef, y0, ps, hf, -1)); sf._k = key; M.fix.dirty = true;
      }
      const hm = toothH(sim, wm[i]), em = plateEro(sim, wm[i]);
      const km = Math.round(hm * 2) + ':' + Math.round(em * 2);
      const sm = M.teethM[i];
      if (force || sm._k !== km) {
        // along the swing jaw face, in pitman-local coordinates
        const s0 = (i + 0.5) / nT * M.faceLen - ps / 2;
        const bx = M.Ft.x + M.fu.x * s0 - M.fn.x * em, by = M.Ft.y + M.fu.y * s0 - M.fn.y * em;
        const at = (s, h) => ({ x: bx + M.fu.x * s + M.fn.x * h, y: by + M.fu.y * s + M.fn.y * h });
        const hh = Math.max(0.6, hm);
        sm.setVerts([at(ps * 0.06, 0), at(ps * 0.36, hh), at(ps * 0.64, hh), at(ps * 0.94, 0)]);
        sm._k = km;
      }
    }
  }

  // ---------- kinematics ----------
  function solvePhi(M, ex, ey, phi0) {
    let phi = phi0;
    const L = M.Lt, S = M.S, Lg = G.TOG_LEN;
    for (let it = 0; it < 12; it++) {
      const c = Math.cos(phi), s = Math.sin(phi);
      const tx = ex + L.x * c - L.y * s, ty = ey + L.x * s + L.y * c;
      const dx = tx - S.x, dy = ty - S.y;
      const f = dx * dx + dy * dy - Lg * Lg;
      const dtx = -L.x * s - L.y * c, dty = L.x * c - L.y * s;
      const df = 2 * (dx * dtx + dy * dty);
      if (Math.abs(df) < 1e-9) break;
      const step = f / df; phi -= step;
      if (Math.abs(step) < 1e-9) break;
    }
    return phi;
  }
  function eccPos(M, th) { return { x: G.E0.x + M.ecc * Math.cos(th), y: G.E0.y + M.ecc * Math.sin(th) }; }
  // pose for a shaft angle; with "open" the toggle is gone or the seat retracted
  function poseAt(sim, th, snap) {
    const M = sim.m, e = eccPos(M, th);
    let phi;
    if (M.toggleBroken) phi = M.phiFree;
    else {
      phi = solvePhi(M, e.x, e.y, M.phiSolved ?? M.phi); M.phiSolved = phi;
      // after a toggle change the jaw is jacked back into place, not snapped
      if (M.returnT > 0) phi = lerp(phi, M.phiFrom, smooth(clamp(M.returnT / 1.6, 0, 1)));
    }
    if (snap) { M.pit.x = e.x; M.pit.y = e.y; M.pit.a = phi; M.pit.dirty = true; M.phi = phi; }
    return { x: e.x, y: e.y, a: phi };
  }
  // bottom gap (tooth tip to tooth tip) for a shaft angle
  function gapAt(sim, th) {
    const M = sim.m, e = eccPos(M, th), phi = solvePhi(M, e.x, e.y, M.phi);
    const nT = M.nTeeth, i = nT - 1;
    const hm = toothH(sim, sim.save.wearM[i]) - plateEro(sim, sim.save.wearM[i]);
    const hf = toothH(sim, sim.save.wearF[i]) - plateEro(sim, sim.save.wearF[i]);
    const lx = M.Fb.x + M.fn.x * hm, ly = M.Fb.y + M.fn.y * hm;
    const c = Math.cos(phi), s = Math.sin(phi);
    const wx = e.x + lx * c - ly * s;
    return (G.FX - hf) - wx;
  }
  function measure(sim) {
    let mn = Infinity, mx = -Infinity;
    const keep = sim.m.phi;
    for (let k = 0; k < 48; k++) { const g = gapAt(sim, k / 48 * TAU); if (g < mn) mn = g; if (g > mx) mx = g; }
    sim.m.phi = keep;
    return { css: mn, oss: mx, stroke: mx - mn };
  }
  function tuneStroke(sim) {
    const M = sim.m, want = sim.tier.stroke / sim.mmpx;
    let lo = 1, hi = 60;
    for (let it = 0; it < 30; it++) { M.ecc = (lo + hi) / 2; const r = measure(sim); if (r.stroke < want) lo = M.ecc; else hi = M.ecc; }
  }
  function setCSS(sim, cssMm) {
    const M = sim.m, want = cssMm / sim.mmpx;
    let lo = M.S0.x - 200, hi = M.S0.x + 200;
    for (let it = 0; it < 40; it++) { M.S.x = (lo + hi) / 2; const r = measure(sim); if (r.css > want) lo = M.S.x; else hi = M.S.x; }
    M.Sset = M.S.x;
    const r = measure(sim); M.cssPx = r.css; M.ossPx = r.oss;
    return r;
  }

  // ---------- drive: motor, V-belts, flywheel ----------
  function initDrive(sim) {
    const M = sim.m, T = sim.tier;
    M.w0 = T.rpm / 60 * TAU;                     // shaft speed at rated load
    M.Prated = T.kw * 1000;
    M.T0 = M.Prated / M.w0;                      // rated shaft torque
    M.slip = 0.03; M.wSync = M.w0 / (1 - M.slip);
    M.I = T.flyI;
    M.w = sim.save.running === false ? 0 : M.w0;
    M.heat = 0; M.amps = 0; M.beltSlip = 0; M.power = 0; M.energyJ = 0;
    M.state = 'run'; M.timer = 0; M.toggleBroken = false; M.relief = 0; M.Sclear = 0;
    M.block = 0; M.stallT = 0; M.load = 0;
  }
  function motorTorque(M, w) {
    // induction motor: torque ∝ slip up to ~2.6× rated (pull-out), starting torque ~1.8×
    const s = (M.wSync - w) / M.wSync;
    let T;
    if (s <= 0) T = (s / M.slip) * M.T0;
    else if (s < 0.15) T = Math.min(2.6, s / M.slip) * M.T0;
    else T = lerp(2.6, 1.8, clamp((s - 0.15) / 0.85, 0, 1)) * M.T0;
    return T;
  }
  // called before the physics step
  function drive(sim, dt) {
    const M = sim.m;
    const on = M.state === 'run' || M.state === 'relief';
    let Tm = 0;
    if (on) {
      Tm = motorTorque(M, M.w);
      // V-belts slip above ~2.2× rated torque
      const cap = 2.2 * M.T0;
      M.beltSlip = Tm > cap ? clamp((Tm - cap) / M.T0, 0, 1) : 0;
      if (Tm > cap) Tm = cap;
    } else M.beltSlip = 0;
    const Tfric = (0.04 + 0.02 * (M.w / M.w0)) * M.T0 * Math.sign(M.w);
    // a jammed chamber the jaw cannot close on brakes the shaft hard
    let Tblock = 0;
    if (M.block > 0 && M.w > 0) Tblock = M.block * 6 * M.T0;
    // shaft dynamics (torque form, so a stalled shaft can restart)
    const dw = (Tm - Tfric - Tblock) / M.I * dt;
    M.w = Math.max(0, M.w + dw);
    // crushing energy comes out of the flywheel at once
    if (M.pendingJ > 0) { M.w = Math.sqrt(Math.max(0, M.w * M.w - 2 * M.pendingJ / M.I)); M.pendingJ = 0; }
    if (!on && M.w < 0.05) M.w = 0;
    M.power = on ? Tm * M.w : 0;
    M.energyJ += M.power * dt;
    // ammeter: current follows torque (with a magnetising share)
    M.amps = on ? (0.3 + 0.7 * Math.abs(Tm) / M.T0) * sim.tier.kw * 1.72 : 0;
    // thermal overload relay (class 10-ish): I²t above rated
    const ir = on ? Math.abs(Tm) / M.T0 : 0;
    M.heat = Math.max(0, M.heat + (ir * ir - 1.05) * dt / 9);
    if (on && M.w < 0.25 * M.w0) M.stallT += dt; else M.stallT = Math.max(0, M.stallT - dt);
    if (M.state === 'run' && (M.heat > 1 || M.stallT > 1.6)) { M.tripWhy = M.heat > 1 ? 'heat' : 'stall'; sim.event('trip'); }
    M.theta += M.w * dt;
    // hydraulic relief / chamber clearing moves the toggle seat back
    let target = M.Sset;
    if (M.state === 'relief') { target = M.Sset - 70; M.timer -= dt; if (M.timer <= 0) M.state = 'run'; }
    if (M.state === 'clearing') {
      M.timer -= dt * (sim.skip || 1); const el = M.clearDur - M.timer;
      target = el > M.clearOpenAt && M.timer > (M.clearCloseAt || 1.6) ? M.Sset - 95 : M.Sset;
      if (M.timer <= 0) { M.state = 'stop'; sim.event('cleared'); }
    }
    const rate = (M.state === 'relief' ? 900 : M.state === 'clearing' ? (sim.up.hydro ? 260 : 45) : 300) * (M.state === 'clearing' ? (sim.skip || 1) : 1);
    const d = target - M.S.x; M.S.x += clamp(d, -rate * dt, rate * dt);
    // broken toggle: pitman bottom swings back freely
    if (M.toggleBroken) M.phiFree = lerp(M.phiFree, M.phiOpen, 1 - Math.exp(-dt * 3));
    if (M.returnT > 0) M.returnT -= dt;
    // set kinematic velocity so the solver sees the real jaw motion
    const P = poseAt(sim, M.theta, false);
    const pit = M.pit;
    pit.vx = (P.x - pit.x) / dt; pit.vy = (P.y - pit.y) / dt; pit.w = (P.a - pit.a) / dt;
    M.phi = P.a;
    M.block = 0;
  }

  // ---------- crushing ----------
  // after the physics step: find rocks nipped between the jaws (directly or through other rocks)
  function crushStep(sim, dt) {
    const M = sim.m, pit = M.pit, fix = M.fix;
    const touchM = new Map(), touchF = new Map();
    for (const b of sim.rocks) {
      for (const arb of b.touch) {
        const other = arb.A.body === b ? arb.B : arb.A, oB = other.body;
        if (oB === pit) {
          // contact normal pointing into the rock and jaw velocity there
          const sgn = arb.A.body === b ? -1 : 1;
          const nx = arb.nx * sgn, ny = arb.ny * sgn;
          const p = arb.pts[0]; const v = pit.velAt(p.x, p.y);
          const vn = v.x * nx + v.y * ny;
          const prev = touchM.get(b);
          if (!prev || vn > prev.vn) touchM.set(b, { vn, x: p.x, y: p.y, nx, ny, tooth: other.user && other.user.tooth });
        } else if (oB === fix) {
          const p = arb.pts[0];
          touchF.set(b, { x: p.x, y: p.y, tooth: other.user && other.user.tooth });
        }
      }
    }
    grindStep(sim, dt, touchM, touchF);
    if (!touchM.size) return;
    const T = sim.tier, w01 = clamp(M.w / M.w0, 0, 1.1);
    const done = new Set();
    for (const [b0, cm] of touchM) {
      if (cm.vn < 1 || done.has(b0) || b0.dead) continue;     // jaw must be closing on it
      // breadth-first through rock contacts to a rock touching the fixed jaw
      const prev = new Map([[b0, null]]); let q = [b0], end = null;
      for (let depth = 0; depth < 4 && q.length && !end; depth++) {
        const nq = [];
        for (const b of q) {
          if (touchF.has(b)) { end = b; break; }
          for (const arb of b.touch) {
            const o = arb.A.body === b ? arb.B.body : arb.A.body;
            if (!o.rock || o.dead || prev.has(o)) continue;
            prev.set(o, b); nq.push(o);
          }
        }
        q = nq;
      }
      if (!end) continue;
      const chain = []; for (let b = end; b; b = prev.get(b)) chain.push(b);
      const cf = touchF.get(end);
      const ang = Math.atan2(cf.y - cm.y, cf.x - cm.x);
      // jaw force available here: more at the bottom (toggle leverage), boosted by flywheel speed
      const yy = (cm.y + cf.y) / 2;
      const pos = clamp((yy - G.TOP) / (G.BOT - G.TOP), 0, 1);
      const Fav = T.Fmax * (0.75 + 0.25 * pos) * (0.6 + 0.4 * w01) * sim.health;
      // the weakest rock in the chain breaks first (stone-on-stone crushing)
      // loose small pieces are not carrying the load; fresh fragments need a moment to settle
      const gapHere = gapAtY(sim, yy);
      let weak = null, wF = Infinity, weak2 = null, wF2 = Infinity;
      // steel anywhere in the load path cannot give way
      const steelB = chain.find(b => b.rock.steel);
      for (const b of chain) {
        if (b.rock.steel) continue;
        const r = b.rock;
        const F = Rocks.Fcrit(r, ang);
        if (F < wF2) { wF2 = F; weak2 = b; }
        if ((chain.length > 1 && r.minW / sim.mmpx < gapHere * 0.28) || sim.time - r.born < 0.15) continue;
        if (F < wF) { wF = F; weak = b; }
      }
      // steel with nothing weaker in the chain (or wedged alone across the jaws)
      if (steelB && (!weak || wF > Fav)) {
        for (const b of chain) done.add(b);
        // steel: nothing gives — the toggle plate is the fuse
        if (sim.up.hydro) sim.event('relief', { steel: true });
        else if (w01 > 0.45) sim.event('toggle');
        else M.block = Math.max(M.block, 3);
        continue;
      }
      if (!weak) {
        // only thin pieces in the chain: usually loose and falling, but if the same load path keeps
        // standing across the jaws it is an arch (slabs wedged on edge) and the weakest of them goes
        b0.rock.archT = (b0.rock.archT || 0) + dt;
        if (b0.rock.archT < 0.45 || !weak2 || weak2.rock.steel) continue;
        weak = weak2; wF = wF2;
      }
      for (const b of chain) done.add(b);
      const r = weak.rock;
      if (wF <= Fav) {
        r.crushT += dt * clamp((Fav / wF - 1) * 10 + 1.2, 0, 40);
        r.nipped = 2;
        // visible cracking before it goes
        if (r.crushT > 0.35 && r.stage === 0) { r.stage = 1; sim.crackRock(weak, ang); }
        if (r.crushT >= 1) sim.crushRock(weak, { ang, cm, cf, Fav, wF });
        M.block = Math.max(M.block, 0.12 * wF / Fav);
      } else if (yy < G.TOP + (G.BOT - G.TOP) * 0.2) {
        // a block lying across the mouth: the nip angle is too steep, the jaw cannot grip it.
        // It rides and chatters on the teeth until somebody breaks it down.
        r.riding = 0.3;
        if (sim.rng() < dt * 6) weak.applyImpulse((sim.rng() - 0.5) * weak.m * 30, -weak.m * 25, weak.x, weak.y);
      } else {
        // too strong for this jaw: it jams
        const k = wF / Fav;
        M.block = Math.max(M.block, clamp(k - 0.6, 0.3, 4));
        r.jam = (r.jam || 0) + dt;
        if (sim.up.hydro && k > 1.25 && M.state === 'run') sim.event('relief', { steel: false });
      }
    }
  }

  // Attrition: stones lying against the plates are rubbed by the moving jaw (and by each other);
  // corners and edges wear off as grit, so a stone that is slightly too big for the gap but too small
  // to be nipped properly does not sit there forever — it slowly wears down and drops through.
  function grindStep(sim, dt, touchM, touchF) {
    const M = sim.m; if (M.state !== 'run') return;
    const w01 = clamp(M.w / M.w0, 0, 1.1); if (w01 < 0.3) return;
    let budget = 3;
    const seen = new Set();
    for (const map of [touchM, touchF]) for (const [b, c] of map) {
      if (seen.has(b)) continue; seen.add(b);
      const r = b.rock;
      if (!r || r.steel || r.passed || b.dead || b.y < G.TOP - 40 || b.y > G.BOT + 20) continue;
      const gap = gapAtY(sim, b.y);
      const rel = r.minW / sim.mmpx / Math.max(4, gap);
      if (rel > 2.6) continue;                     // big blocks are crushed, not ground
      const both = touchM.has(b) && touchF.has(b);
      const abr = 6 / (r.mat.is50 + 3);
      // the moving jaw rubs hardest; a stone only on the fixed plate is worked by the stones around it
      const k = (touchM.has(b) ? 1 : 0.35) * (both ? 2.2 : 1) * abr * w01 * (rel < 1.4 ? 1.4 : 1);
      r.rub = (r.rub || 0) + dt * k;
      if (r.rub < 0.9 || budget <= 0) continue;
      r.rub = 0; budget--;
      sim.grindRock(b, touchM.get(b) || null, touchF.get(b) || null);
    }
  }

  // current horizontal opening between the plates at height y (px)
  function gapAtY(sim, y) {
    const M = sim.m, pit = M.pit, c = Math.cos(pit.a), s = Math.sin(pit.a);
    const ftx = pit.x + M.Ft.x * c - M.Ft.y * s, fty = pit.y + M.Ft.x * s + M.Ft.y * c;
    const fbx = pit.x + M.Fb.x * c - M.Fb.y * s, fby = pit.y + M.Fb.x * s + M.Fb.y * c;
    const x = ftx + (fbx - ftx) * (y - fty) / (fby - fty);
    return Math.max(4, G.FX - x - M.toothPx);
  }
  // wear on the teeth that did the work
  function addWear(sim, toothM, toothF, tonnesReal, ai) {
    const T = sim.tier, nT = sim.m.nTeeth;
    // plate life is quoted for average rock (Ai ≈ 0.5); most work is done by the lower third
    const per = tonnesReal * (ai / 0.5 + 0.08) / (T.plateLife * (sim.save.hiMn ? 1.4 : 1) / (nT * 0.4));   // 22% Mn plates last ~40% longer
    const add = (arr, i) => { if (i === undefined || i === null) return; for (let d = -1; d <= 1; d++) { const j = i + d; if (j >= 0 && j < nT) arr[j] += per * (d === 0 ? 0.6 : 0.2); } };
    add(sim.save.wearM, toothM); add(sim.save.wearF, toothF);
  }
  function plateState(sim) {
    const wm = sim.save.wearM, wf = sim.save.wearF;
    const mxM = Math.max(...wm), mxF = Math.max(...wf);
    const avg = (wm.reduce((a, b) => a + b, 0) + wf.reduce((a, b) => a + b, 0)) / (wm.length * 2);
    return { maxM: mxM, maxF: mxF, worst: Math.max(mxM, mxF), avg };
  }

  return { G, TIERS, mmpxOf, gapAtY, build, updateTeeth, poseAt, measure, setCSS, initDrive, drive, crushStep, addWear, plateState, eccPos };
})();
