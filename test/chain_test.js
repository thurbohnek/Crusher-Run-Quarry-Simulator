// chain rule: a block deep in the chamber can't be slung; one in the mouth with a free top can; one under another can't
const L = require('./load')(['util.js', 'phys.js', 'rocks.js', 'machine.js', 'sim.js']);
const { Sim, MATS, Machine, Rocks } = L; const G = Machine.G;
const mk = () => { const s = new Sim({ tier: 0, css: 80, up: {} }, { seed: 1 }); s.m.state = 'stop'; return s; };
const rock = (s, x, y, mm) => { const b = s.addRock(Rocks.genBlockPoly(mm / 2 / s.mmpx, MATS.gneis, s.rng, 0), x, y, 0, MATS.gneis); s.step(1 / 2000); return b; };
const cx = (G.FX + 300) / 2;
let s = mk(); let b = rock(s, cx, G.TOP + (G.BOT - G.TOP) * 0.7, 150); console.log('deep:', s.liftStart(b.x, b.y).why || 'ok');
s = mk(); b = rock(s, cx, G.TOP + 30, 250); console.log('mouth:', s.liftStart(b.x, b.y).why || 'ok');
s = mk(); b = rock(s, cx, G.TOP + 120, 250); rock(s, cx, G.TOP - 60, 200); console.log('covered:', s.liftStart(b.x, b.y).why || 'ok');
s = mk(); b = rock(s, 1600, 150, 250); console.log('on feeder:', s.liftStart(b.x, b.y).why || 'ok');
