// look at the stockpile: node test/pilecam.js <tier> <tonnes> <zoomfactor>
module.exports = (t, z) => `(() => { const s = window.__rcSim(); s.pileT = ${t}; for (const k of ['gneis','granitt']) s.D.byMat[k] = 50; s.D.hist[2] = 30; s.D.hist[4] = 20; s.D.hist[6] = 20; const P = s.pileShape(); Render.resetView(); const c = Render.camFor ? 0 : 0; })()`;
