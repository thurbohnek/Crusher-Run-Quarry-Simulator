const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js', 'career.js']);
const run = require('./bot');
const tier = +(process.argv[2] || 1);
for (const css of process.argv[3].split(',').map(Number)) {
  let h = new Float64Array(12), t = 0;
  for (const seed of [1, 2]) { const r = run(L, { tier, secs: 240, seed, hammer: true, save: { css } }); r.D.hist.forEach((v, i) => h[i] += v); t += r.D.tonnes; }
  console.log('css', css, Array.from(h).map(v => (v / t * 100).toFixed(0)).join('/'), 't', t.toFixed(0));
}
