const fs = require('fs');
const order = ['util','phys','rocks','machine','sim','career','audio','render','game'];
const js = order.map(n => `/* ---- ${n}.js ---- */\n` + fs.readFileSync(`src/${n}.js`, 'utf8').replace(/^'use strict';\n/, '')).join('\n');
let html = fs.readFileSync('src/shell.html', 'utf8');
html = html.trimEnd() + `\n<script>\n'use strict';\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n`;
fs.writeFileSync('rock-crusher.html', html);
console.log('built', (html.length/1024).toFixed(0)+' KB');
