// loads src files into one context for node tests
const fs = require('fs'), vm = require('vm'), path = require('path');
module.exports = function load(files) {
  const ctx = { console, Math, Date, performance: require('perf_hooks').performance, Set, Map, JSON, Object, Array, Infinity, NaN, isFinite, parseInt, parseFloat, Number, String, Boolean, Error };
  vm.createContext(ctx);
  let code = files.map(f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8')).join('\n');
  code += '\n;this.__exports = {' + 'TAU,clamp,lerp,makeRng,Poly,Phys' + (files.includes('rocks.js') ? ',Rocks,MATS' : '') + (files.includes('machine.js') ? ',Machine,TIERS' : '') + (files.includes('sim.js') ? ',Sim,TL,DAY_LEN' : '') + (files.includes('career.js') ? ',Career,UPGRADES,PRODUCTS' : '') + (files.includes('machine.js') ? ',Machine,TIERS' : '') + '};';
  vm.runInContext(code, ctx, { filename: 'bundle.js' });
  return ctx.__exports;
};
