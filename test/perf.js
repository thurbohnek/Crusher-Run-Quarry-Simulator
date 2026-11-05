const L = require('./load')(['util.js', 'phys.js']);
const { Phys, Poly, makeRng } = L;
function dyn(world, verts, x, y, a = 0, dens = 0.003) {
  const b = new Phys.Body(Phys.DYNAMIC, x, y, a);
  const c = Poly.centroid(verts); const v = verts.map(p => ({ x: p.x - c.x, y: p.y - c.y }));
  b.addShape(v, { friction: 0.7, restitution: 0.1 });
  const A = Math.abs(Poly.area(v)), m = A * dens; b.setMass(m, m * Poly.inertia(v));
  world.add(b); return b;
}
function stat(world, verts, o) { const b = new Phys.Body(Phys.STATIC); b.addShape(verts, o); world.add(b); return b; }
const hz = +process.argv[2] || 120;
const rng = makeRng(42);
const w = new Phys.World({ gy: 1500, velIters: +process.argv[3] || 10 });
stat(w, [{ x: 0, y: -2000 }, { x: 40, y: -2000 }, { x: 330, y: 900 }, { x: 290, y: 920 }]);
stat(w, [{ x: 680, y: -2000 }, { x: 720, y: -2000 }, { x: 430, y: 920 }, { x: 390, y: 900 }]);
stat(w, [{ x: 250, y: 900 }, { x: 470, y: 900 }, { x: 470, y: 960 }, { x: 250, y: 960 }]);
const rocks = [];
for (let i = 0; i < 150; i++) {
  const R = 12 + rng() * 40, n = 6 + Math.floor(rng() * 5), pts = [];
  for (let k = 0; k < n; k++) { const a = k / n * 6.283 + rng() * 0.4, r = R * (0.7 + 0.3 * rng()); pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r }); }
  rocks.push(dyn(w, Poly.hull(pts), 150 + rng() * 420, -i * 40 + rng() * 20, rng() * 6));
}
const T = { collide: 0, total: 0 };
const oc = w._collide.bind(w); w._collide = function (dt) { const s = performance.now(); oc(dt); T.collide += performance.now() - s; };
const N = hz * 10; let t0 = performance.now();
const marks = [];
for (let i = 0; i < N; i++) { w.step(1 / hz); if (i % hz === hz - 1) { marks.push(((performance.now() - t0) / hz).toFixed(2)); t0 = performance.now(); } }
let maxPen = 0; for (const arb of w.active) for (const p of arb.pts) maxPen = Math.min(maxPen, p.sep);
console.log(hz + 'Hz ms/step per second:', marks.join(' '), '| collide share', (T.collide / marks.reduce((a, b) => a + +b * hz, 0) * 100).toFixed(0) + '%', 'asleep', rocks.filter(b => !b.awake).length, 'maxPen', maxPen.toFixed(2), 'escaped', rocks.filter(b => b.y > 1000).length);
const vs = rocks.filter(b=>b.y<1000).map(b => Math.hypot(b.vx, b.vy)).sort((a, b) => a - b);
console.log('active arbiters', w.active.length, 'pts', w.active.reduce((s, a) => s + a.pts.length, 0), 'v median', vs[vs.length >> 1].toFixed(2), 'v90', vs[Math.floor(vs.length * 0.9)].toFixed(2), 'w med', rocks.map(b=>Math.abs(b.w)).sort((a,b)=>a-b)[75].toFixed(3));
let matched=0,tot=0; const old=new Map(); for (const a of w.active) for (const p of a.pts) old.set(a.key+':'+p.id,1);
w.step(1/hz); for (const a of w.active) for (const p of a.pts) { tot++; if (old.has(a.key+':'+p.id)) matched++; }
console.log('warm-start id match', (matched/tot*100).toFixed(1)+'%');
