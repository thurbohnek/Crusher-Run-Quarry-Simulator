const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const run = require('./bot'); const { Machine } = L;
for (const seed of [1, 2, 3, 4, 5, 6]) {
  const hist = new Map(); let found = null;
  run(L, { tier: 0, secs: 150, seed, steel: 0.3, onStep: (sim) => {
    if (found || sim.stepN % 6) return;
    const G = Machine.G;
    for (const b of sim.rocks) {
      const fx = G.FX - Machine.gapAtY(sim, b.y) - sim.m.toothPx;   // face x at this height
      const h = hist.get(b) || []; h.push([sim.time.toFixed(2), b.x.toFixed(0), b.y.toFixed(0), b.vx.toFixed(0), b.vy.toFixed(0), fx.toFixed(0)]); if (h.length > 12) h.shift(); hist.set(b, h);
      if (b.y > G.TOP + 40 && b.y < G.BOT && b.x < fx - 30) { found = { b, h: h.slice(), De: b.rock.De, born: b.rock.born }; break; }
    }
  } });
  console.log('seed', seed, found ? 'BEHIND De ' + found.De.toFixed(0) + ' born ' + found.born.toFixed(2) + '\n' + found.h.map(r => r.join(' ')).join('\n') : 'ok');
}
