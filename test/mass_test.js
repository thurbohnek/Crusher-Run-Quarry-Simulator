const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const { Sim, MATS, Rocks, Poly } = L;
const sim = new Sim({ tier: 0, css: 70, plates0: 0.1, tierBreaker: 0 }, { seed: 5 });
let worst = 0;
for (let k = 0; k < 200; k++) {
  const R = 30 + sim.rng() * 120;
  const poly = Rocks.genBlockPoly(R, MATS.granitt, sim.rng, 0);
  const b = sim.addRock(poly, 360, 600, 0, MATS.granitt, {});
  const m0 = b.rock.mass;
  const seeds = []; for (let i = 0; i < 2 + (k % 6); i++) seeds.push({ x: (sim.rng() - .5) * R, y: (sim.rng() - .5) * R });
  const cells = Rocks.voronoiCells(b.rock.poly, seeds);
  let areaSum = 0; for (const c of cells) areaSum += Math.abs(Poly.area(c));
  const pk = sim.parts.reduce((s, p) => s + p.kg, 0);
  const kids = sim.fragment(b, cells, {});
  const m1 = (kids || []).reduce((s, c) => s + c.rock.mass, 0) + sim.parts.reduce((s, p) => s + p.kg, 0) - pk;
  const ratio = m1 / m0; worst = Math.max(worst, Math.abs(ratio - 1));
  if (Math.abs(ratio - 1) > 0.02) console.log('k', k, 'R', R.toFixed(0), 'cells', cells.length, 'area ratio', (areaSum / b.rock.A).toFixed(3), 'mass ratio', ratio.toFixed(3));
  for (const c of kids || []) sim.removeRock(c);
  sim.parts.length = 0;
}
console.log('worst mass error', worst.toFixed(4));
