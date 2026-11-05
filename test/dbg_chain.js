const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const run = require('./bot');
const r = run(L, { tier: 0, secs: 30, seed: 1 });
const sim = r.sim, M = sim.m;
console.log('crushes', sim.D.crushes, 'rocks', sim.rocks.length, 'state', M.state, 'w', (M.w / M.w0).toFixed(2));
let nM = 0, nF = 0, closing = 0;
for (const b of sim.rocks) {
  let tm = false, tf = false, vnMax = -1e9;
  for (const a of b.touch) { const o = a.A.body === b ? a.B.body : a.A.body; if (o === M.pit) { tm = true; const sgn = a.A.body === b ? -1 : 1; const v = M.pit.velAt(a.pts[0].x, a.pts[0].y); vnMax = Math.max(vnMax, v.x * a.nx * sgn + v.y * a.ny * sgn); } if (o === M.fix) tf = true; }
  if (tm) nM++; if (tf) nF++; if (tm && vnMax > 1) closing++;
  if (b.y > 300 && b.y < 1050) console.log('rock', b.id, 'y', b.y.toFixed(0), 'x', b.x.toFixed(0), 'minWpx', (b.rock.minW / sim.mmpx).toFixed(0), 'gapHere', L.Machine.gapAtY(sim, b.y).toFixed(0), 'awake', b.awake, 'touch', b.touch.length, tm ? 'M(vn ' + vnMax.toFixed(0) + ')' : '', tf ? 'F' : '', 'age', (sim.time - b.rock.born).toFixed(2), 'Fcrit kN', (L.Rocks.Fcrit(b.rock, 0) / 1000).toFixed(0));
}
console.log('touch M', nM, 'F', nF, 'closing', closing);
// pitman velocity over a cycle
const vs = []; for (let i = 0; i < 30; i++) { sim.step(1 / 120); vs.push(M.pit.vx.toFixed(0) + '/' + M.pit.w.toFixed(2)); } console.log(vs.join(' '));
