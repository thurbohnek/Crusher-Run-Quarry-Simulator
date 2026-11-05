const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const { Sim, MATS, TIERS } = L;
for (const [tier, lv, plan] of [[0, 0, 'normal'], [1, 1, 'normal'], [2, 2, 'normal'], [2, 2, 'coarse'], [2, 2, 'xcoarse'], [3, 2, 'xcoarse']]) {
  const T = TIERS[tier], save = { tier, css: Math.round((T.css[0] + T.css[1]) / 10) * 5, up: { loader: lv }, blastPlan: plan };
  let tot = 0, n = 0, bodies = 0;
  for (let k = 0; k < 5; k++) { const sim = new Sim(save, { seed: k + 1 }); const it = []; for (let i = 0; i < Sim.truckBuckets(lv); i++) it.push(...sim.makeLoad(() => MATS.gneis, Sim.blastSpec(save))); sim.forceSoil = 0.1; sim.callLoader(it, false); const Lo = sim.loader; tot += (Lo.estMass + (Lo.gritKg || 0)) * sim.TLm / 1000; bodies += Lo.items.length; n++; }
  console.log(tier, lv, plan, 't/load', (tot / n).toFixed(0), 'bodies', (bodies / n).toFixed(0));
}
