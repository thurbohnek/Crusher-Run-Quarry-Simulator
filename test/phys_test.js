const L = require('./load')(['util.js', 'phys.js']);
const { Phys, Poly, makeRng } = L;
const rng = makeRng(42);
function box(w, h) { return [{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }]; }
function dyn(world, verts, x, y, a = 0, dens = 0.003) {
  const b = new Phys.Body(Phys.DYNAMIC, x, y, a);
  const c = Poly.centroid(verts); const v = verts.map(p => ({ x: p.x - c.x, y: p.y - c.y }));
  b.addShape(v, { friction: 0.7, restitution: 0.1 });
  const A = Math.abs(Poly.area(v)), m = A * dens; b.setMass(m, m * Poly.inertia(v));
  world.add(b); return b;
}
function stat(world, verts, o) { const b = new Phys.Body(Phys.STATIC); b.addShape(verts, o); world.add(b); return b; }

// Test 1: box stack stability
{
  const w = new Phys.World({ gy: 1200 });
  stat(w, [{ x: -500, y: 600 }, { x: 1200, y: 600 }, { x: 1200, y: 700 }, { x: -500, y: 700 }]);
  const bs = []; for (let i = 0; i < 10; i++) bs.push(dyn(w, box(60, 40), 300 + (i % 2) * 2, 580 - i * 41));
  for (let i = 0; i < 600; i++) w.step(1 / 120);
  const drift = Math.max(...bs.map(b => Math.abs(b.x - 300)));
  const top = bs[9].y;
  console.log('stack: top y', top.toFixed(1), 'expected ~', (600 - 20 - 9 * 40).toFixed(1), 'max x drift', drift.toFixed(2), 'asleep', bs.filter(b => !b.awake).length);
}
// Test 2: random rock pile in V hopper + timing
{
  const w = new Phys.World({ gy: 1500 });
  stat(w, [{ x: 0, y: 200 }, { x: 40, y: 200 }, { x: 330, y: 900 }, { x: 290, y: 920 }]);
  stat(w, [{ x: 680, y: 200 }, { x: 720, y: 200 }, { x: 430, y: 920 }, { x: 390, y: 900 }]);
  stat(w, [{ x: 250, y: 900 }, { x: 470, y: 900 }, { x: 470, y: 960 }, { x: 250, y: 960 }]);
  const rocks = [];
  for (let i = 0; i < 120; i++) {
    const R = 12 + rng() * 40, n = 6 + Math.floor(rng() * 5), pts = [];
    for (let k = 0; k < n; k++) { const a = k / n * 6.283 + rng() * 0.4, r = R * (0.7 + 0.3 * rng()); pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r }); }
    rocks.push(dyn(w, Poly.hull(pts), 150 + rng() * 420, -i * 60 + rng() * 20, rng() * 6));
  }
  const t0 = performance.now(); let worst = 0;
  for (let i = 0; i < 1200; i++) { const s = performance.now(); w.step(1 / 120); worst = Math.max(worst, performance.now() - s); }
  const t = performance.now() - t0;
  // penetration audit
  let maxPen = 0; for (const arb of w.active) for (const p of arb.pts) maxPen = Math.min(maxPen, p.sep);
  const escaped = rocks.filter(b => b.y > 1000 || b.x < -50 || b.x > 770 || !isFinite(b.x)).length;
  const kin = rocks.reduce((s, b) => s + b.vx * b.vx + b.vy * b.vy, 0) / rocks.length;
  console.log('pile: 1200 steps', t.toFixed(0), 'ms, avg', (t / 1200).toFixed(2), 'ms/step, worst', worst.toFixed(1), 'ms; maxPen', maxPen.toFixed(2), 'escaped', escaped, 'mean v²', kin.toFixed(1), 'asleep', rocks.filter(b => !b.awake).length, 'contacts', w.active.length);
}
// Test 3: conveyor
{
  const w = new Phys.World({ gy: 1500 });
  stat(w, [{ x: 0, y: 500 }, { x: 2000, y: 500 }, { x: 2000, y: 540 }, { x: 0, y: 540 }], { surfaceVel: { x: 200, y: 0 }, friction: 0.8 });
  const b = dyn(w, box(40, 30), 100, 470);
  for (let i = 0; i < 240; i++) w.step(1 / 120);
  console.log('conveyor: vx', b.vx.toFixed(1), '(want 200)');
}
// Test 4: fast small body vs thin wall (tunnelling)
{
  const w = new Phys.World({ gy: 0 });
  stat(w, [{ x: 400, y: 0 }, { x: 410, y: 0 }, { x: 410, y: 600 }, { x: 400, y: 600 }]);
  const b = dyn(w, box(10, 10), 100, 300); b.vx = 5000;
  for (let i = 0; i < 60; i++) w.step(1 / 120);
  console.log('tunnel: x', b.x.toFixed(1), b.x < 400 ? 'OK (stopped)' : 'TUNNELLED');
}
// Test 5: kinematic jaw pinching a rock against a wall
{
  const w = new Phys.World({ gy: 1500 });
  stat(w, [{ x: 500, y: 0 }, { x: 560, y: 0 }, { x: 560, y: 800 }, { x: 500, y: 800 }]);
  stat(w, [{ x: 0, y: 800 }, { x: 800, y: 800 }, { x: 800, y: 860 }, { x: 0, y: 860 }]);
  const k = new Phys.Body(Phys.KINEMATIC, 300, 400); k.addShape(box(60, 700)); w.add(k);
  const r = dyn(w, box(80, 80), 420, 760);
  let maxImp = 0;
  for (let i = 0; i < 240; i++) { const t = i / 120; k.vx = 60 * Math.cos(t * 6); w.step(1 / 120); maxImp = Math.max(maxImp, r.impAbs); }
  console.log('pinch: rock x', r.x.toFixed(1), 'finite', isFinite(r.x), 'max impulse sum', maxImp.toFixed(0), 'mass', r.m.toFixed(1));
}
