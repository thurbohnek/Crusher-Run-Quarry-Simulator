const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const run = require('./bot'); const { TL } = L;
for (const seed of [1, 2]) {
  const tier = +(process.argv[2] || 0), scalper = process.argv[3] === 'scalper';
  const r = run(L, { tier, secs: 150, seed, hard: true, save: { up: { breaker: 0, hydro: false, magnet: false, loader: 0, scalper } } });
  const sim = r.sim; let inSys = 0;
  for (const b of sim.rocks) if (!b.rock.steel) inSys += b.rock.mass;
  for (const p of sim.parts) if (!p.mat.steel && !p.counted && p.st !== 4) inSys += p.kg;
  for (const it of (sim.loader.busy ? sim.loader.items : [])) if (!it.out && !it.mat.steel) inSys += 0;
  const inT = inSys * sim.TLm / 1000, out = sim.D.tonnes + (sim.D.fillT || 0);
  console.log('seed', seed, 'fed', sim.D.fedT.toFixed(1), 't  delivered', sim.D.tonnes.toFixed(1), 'fill', (sim.D.fillT || 0).toFixed(1), '  still in plant', inT.toFixed(1), '  balance', (sim.D.fedT - out - inT).toFixed(2), 't');
}
