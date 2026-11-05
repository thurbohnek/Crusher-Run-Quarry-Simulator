'use strict';
/* ============================================================
   render.js — canvas renderer.
   Static art (sky, quarry, machine frame) is cached per day;
   moving parts, rocks, fines, dust and tools draw every frame.
   Light follows the sun through the shift (07–15) and the weather.
   ============================================================ */
const Render = (() => {
  const W = 720, H = 1280;
  let cv, ctx, RS = 1, QK = 1, dpr = 1, spriteBudget = 4;
  let layers = {}, tex = {}, view = { hour: 7, sunA: -0.6, month: null }, fxp = { dust: [], sparks: [], chips: [], flashes: [], drops: [] };
  let lastKey = '', dayInfo = null;
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  function init(canvas) { cv = canvas; ctx = cv.getContext('2d'); makeTextures(); }
  function resize(cssW, cssH, ratio) {
    dpr = ratio; cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    RS = cv.width / W; lastKey = '';
  }
  function off(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

  // ---------- procedural textures ----------
  function makeTextures() {
    // brushed / blasted steel noise
    const n = off(256, 256), g = n.getContext('2d'), id = g.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) { const v = 128 + (Math.random() - 0.5) * 50 + (Math.random() < 0.02 ? -50 : 0); id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 38; }
    g.putImageData(id, 0, 0);
    tex.noise = n;
    // rust / grime blotches
    const r = off(256, 256), gr = r.getContext('2d');
    for (let i = 0; i < 70; i++) { const x = Math.random() * 256, y = Math.random() * 256, rad = 4 + Math.random() * 26; const rg = gr.createRadialGradient(x, y, 0, x, y, rad); rg.addColorStop(0, `rgba(${110 + Math.random() * 40},${52 + Math.random() * 20},${24},${0.12 + Math.random() * 0.22})`); rg.addColorStop(1, 'rgba(110,52,24,0)'); gr.fillStyle = rg; gr.beginPath(); gr.arc(x, y, rad, 0, TAU); gr.fill(); }
    for (let i = 0; i < 40; i++) { const x = Math.random() * 256, y = Math.random() * 256; gr.strokeStyle = `rgba(90,44,20,${0.08 + Math.random() * 0.12})`; gr.lineWidth = 1 + Math.random() * 2; gr.beginPath(); gr.moveTo(x, y); gr.lineTo(x + (Math.random() - .5) * 4, y + 20 + Math.random() * 50); gr.stroke(); }
    tex.rust = r;
    // dust puff sprite
    const d = off(64, 64), gd = d.getContext('2d'), rg = gd.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.4, 'rgba(255,255,255,0.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    gd.fillStyle = rg; gd.fillRect(0, 0, 64, 64); tex.puff = d;
    // grating for the catwalk
    const gt = off(24, 24), gg = gt.getContext('2d'); gg.fillStyle = '#3b3d3f'; gg.fillRect(0, 0, 24, 24); gg.fillStyle = '#1f2022'; gg.fillRect(3, 3, 7, 18); gg.fillRect(14, 3, 7, 18); tex.grate = gt;
    // fine grain of a rock face: speckle and short cracks, grey around 50% for an overlay pass
    { const rg2 = off(256, 256), q = rg2.getContext('2d'), N = makeNoise(5), im = q.createImageData(256, 256); for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const v = 128 + (N.fbm(x / 24, y / 24, 4) - 0.5) * 90 + (Math.random() - 0.5) * 40, o = (y * 256 + x) * 4; im.data[o] = im.data[o + 1] = im.data[o + 2] = v; im.data[o + 3] = 255; } q.putImageData(im, 0, 0);
      for (let i = 0; i < 900; i++) { const v = Math.random() < 0.5 ? 60 : 200; q.fillStyle = `rgba(${v},${v},${v},.35)`; q.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2); } tex.rockgrain = rg2; }
  }
  const patC = {};
  function pat(name) { return patC[name] || (patC[name] = ctx.createPattern(tex[name], 'repeat')); }

  // ---------- light ----------
  // daylight by season (a northern quarry): sunrise and sunset per month, and how dark it is at an hour
  const SUNRISE = [9.0, 8.0, 6.7, 5.3, 4.2, 3.4, 3.8, 5.0, 6.3, 7.5, 8.6, 9.3];
  const SUNSET = [15.2, 16.6, 18.0, 19.6, 21.2, 22.6, 22.2, 20.8, 19.3, 17.8, 16.2, 15.0];
  function darkness(hour, month) {
    if (month == null) return 0;
    const r = SUNRISE[month], st = SUNSET[month];
    return clamp(Math.max((r + 0.5 - hour) / 1.3, (hour - (st - 0.5)) / 1.3), 0, 1);
  }
  function lightAt(hour, weather) {
    // sun from the left in the morning, right in the afternoon; low and warm at the ends
    const u = clamp((hour - 7) / 8, 0, 1);
    const ang = lerp(-2.35, -0.8, u);                       // direction the light comes FROM (screen)
    const warm = 1 - Math.sin(u * Math.PI);
    const over = weather && (weather.kind === 'overskyet' || weather.kind === 'regn' || weather.kind === 'snø' || weather.kind === 'tåke');
    const col = over ? [214, 218, 222] : mixc([255, 248, 236], [255, 206, 150], warm * 0.8);
    const dk = darkness(hour, view.month);
    return { lx: Math.cos(ang), ly: Math.sin(ang), col: dk > 0 ? mixc(col, [150, 170, 215], dk * 0.6) : col, contrast: (over ? 0.45 : 1) * (1 - dk * 0.5), shadow: (over ? 0.12 : 0.26) * (1 - dk * 0.7), sx: -Math.cos(ang) * 7, sy: 8, dark: dk };
  }

  // ---------- far scene: sky, mountain range, the quarry face, the gravel yard ----------
  // value noise for the procedural paintings (deterministic per seed)
  function makeNoise(seed) {
    const P = new Uint8Array(512); let sd = seed | 0 || 1; const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (let i = 0; i < 256; i++) P[i] = i; for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = P[i]; P[i] = P[j]; P[j] = t; } for (let i = 0; i < 256; i++) P[256 + i] = P[i];
    const V = new Float32Array(256); for (let i = 0; i < 256; i++) V[i] = r();
    const n2 = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, a = xi & 255, b = yi & 255;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const v00 = V[P[P[a] + b]], v10 = V[P[P[a + 1] + b]], v01 = V[P[P[a] + b + 1]], v11 = V[P[P[a + 1] + b + 1]];
      return v00 + (v10 - v00) * u + (v01 - v00) * v + (v00 - v10 - v01 + v11) * u * v; };
    const fbm = (x, y, o = 4) => { let s = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < o; i++) { s += a * n2(x * f, y * f); t += a; a *= 0.5; f *= 2.03; } return s / t; };
    const h = (x, y) => V[P[P[x & 255] + (y & 255)]];
    return { n2, fbm, h, r };
  }
  function skyCols(weather, L) {
    const over = L.contrast < 1, snow = weather.kind === 'snø';
    if (snow) return { top: [138, 146, 154], mid: [186, 192, 198], hor: [214, 218, 220], over };
    if (over) return { top: [118, 128, 138], mid: [168, 175, 181], hor: [204, 206, 204], over };
    return { top: mixc([58, 110, 172], [80, 112, 160], 0.2), mid: mixc([140, 180, 214], L.col, 0.12), hor: mixc([222, 226, 222], L.col, 0.35), over };
  }
  // the sky fills the whole screen; the sun sits where the light comes from
  function buildBg(save, weather, hour) {
    const c = off(W * RS, H * RS), g = c.getContext('2d'); g.setTransform(RS, 0, 0, RS, 0, 0);
    const L = lightAt(hour, weather), S = skyCols(weather, L);
    const sky = g.createLinearGradient(0, 0, 0, H * 0.75);
    sky.addColorStop(0, rgb(S.top)); sky.addColorStop(0.45, rgb(S.mid)); sky.addColorStop(1, rgb(S.hor));
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const sx = W / 2 - L.lx * 330, sy = 150 + (1 - Math.abs(L.ly)) * 120;
    if (!S.over) {
      const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 420); sg.addColorStop(0, rgb(mixc(L.col, [255, 255, 255], 0.4), 0.85)); sg.addColorStop(0.08, rgb(L.col, 0.5)); sg.addColorStop(0.35, rgb(L.col, 0.16)); sg.addColorStop(1, rgb(L.col, 0));
      g.fillStyle = sg; g.fillRect(0, 0, W, H);
    }
    // clouds: soft heaps with lit tops and grey bellies; overcast is a layered deck
    const N = makeNoise(31 + (save ? save.day : 0) * 7), R = N.r;
    const cloud = (x, y, w, h, lit, dark, a) => {
      for (let i = 0; i < 26; i++) {
        const px = x + (R() - 0.5) * w, py = y + (R() - 0.5) * h * 0.5 - Math.sin((px - x) / w * Math.PI + Math.PI / 2) * h * 0.25, r = h * (0.35 + R() * 0.45);
        const cg = g.createRadialGradient(px - L.lx * r * 0.25, py - r * 0.35, r * 0.1, px, py, r);
        cg.addColorStop(0, rgb(lit, a * 0.6)); cg.addColorStop(0.5, rgb(mixc(lit, dark, 0.45), a * 0.4)); cg.addColorStop(1, rgb(dark, 0));
        g.fillStyle = cg; g.beginPath(); g.ellipse(px, py, r * 1.5, r, 0, 0, TAU); g.fill();
      }
    };
    if (S.over) {
      // a layered stratus deck: long soft bands, darker bellies, a brighter gap low over the hills
      for (let i = 0; i < 70; i++) { const y = 20 + Math.pow(R(), 1.4) * 520, x = R() * W, w = 160 + R() * 340, h = 14 + R() * 30, dk = R() < 0.55;
        const cg = g.createRadialGradient(x, y, 0, x, y, w); const cc = dk ? mixc(S.top, [60, 64, 70], 0.25) : mixc(S.mid, [236, 236, 234], 0.3);
        cg.addColorStop(0, rgb(cc, 0.22)); cg.addColorStop(1, rgb(cc, 0)); g.fillStyle = cg; g.save(); g.translate(x, y); g.scale(1, h / w); g.beginPath(); g.arc(0, 0, w, 0, TAU); g.fill(); g.restore(); }
      const gap = g.createLinearGradient(0, 420, 0, 640); gap.addColorStop(0, rgb(S.hor, 0)); gap.addColorStop(1, rgb(mixc(S.hor, [255, 255, 255], 0.2), 0.5)); g.fillStyle = gap; g.fillRect(0, 420, W, 220);
    } else {
      for (let i = 0; i < 6; i++) cloud(R() * W, 90 + R() * 260, 140 + R() * 160, 50 + R() * 50, mixc([255, 255, 255], L.col, 0.25), mixc(S.mid, [110, 118, 132], 0.45), 0.7);
      g.globalAlpha = 0.25; for (let i = 0; i < 5; i++) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2 + R() * 4; g.beginPath(); const y = 40 + R() * 90, x = R() * W; g.moveTo(x - 120, y); g.quadraticCurveTo(x, y - 8, x + 140, y + 4); g.stroke(); } g.globalAlpha = 1;
    }
    if (weather.kind === 'tåke') { g.fillStyle = 'rgba(214,218,220,.55)'; g.fillRect(0, 0, W, H); }
    return c;
  }
  // mountains and forest beyond the quarry rim: fractal ridges with snow above a ragged snow line
  function buildRange(save, weather, L) {
    const RW = 1600, RH = 460, c = off(RW * RS, RH * RS), g = c.getContext('2d'); g.setTransform(RS, 0, 0, RS, 0, 0);
    const N = makeNoise(77), S = skyCols(weather, L), month = Career.month(save ? save.day : 1), winter = month <= 3 || month >= 10;
    const ridge = (base, amp, freq, col, haze, snowLine, sd) => {
      const pts = []; for (let x = 0; x <= RW; x += 4) { const u = x / RW; const f = N.fbm(u * freq + sd, sd, 6); let y = base - amp * (0.35 + 0.65 * Math.pow(f, 1.6) * 1.6 + 0.25 * Math.pow(1 - Math.abs(N.n2(u * freq * 2.3, sd + 1) * 2 - 1), 3)) * 0.75; pts.push([x, y]); }
      const cc = mixc(col, S.hor, haze);
      const gr = g.createLinearGradient(0, base - amp, 0, base); gr.addColorStop(0, rgb(mixc(cc, [255, 255, 255], 0.06))); gr.addColorStop(1, rgb(mixc(cc, S.hor, 0.35)));
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, RH); for (const [x, y] of pts) g.lineTo(x, y); g.lineTo(RW, RH); g.closePath(); g.fill();
      // slopes facing the sun are lighter: shade by the local gradient of the ridge
      g.save(); g.clip();
      // slopes facing the sun are lighter: shade by the smoothed slope of the ridge, as polygons down the flanks
      for (let i = 3; i < pts.length - 3; i++) {
        const d = (pts[i + 3][1] - pts[i - 3][1]) / 24, lit = clamp(-d * L.lx * 0.9, -0.6, 0.6);
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], dep = (base - Math.min(y0, y1)) * (0.5 + 0.5 * N.n2(x0 * 0.02, sd + 9));
        g.fillStyle = lit > 0 ? `rgba(255,250,240,${lit * 0.22 * L.contrast})` : `rgba(26,34,48,${-lit * 0.3 * L.contrast + 0.02})`;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.6, y1); g.lineTo(x1 + 0.6, y1 + dep); g.lineTo(x0, y0 + dep); g.closePath(); g.fill();
      }
      if (snowLine != null) {
        // snow: from the crest down to a ragged snow line that dips into the gullies
        g.fillStyle = rgb(mixc([240, 244, 248], S.hor, haze * 0.55), 0.95);
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
        for (const [x, y] of pts) g.lineTo(x, y);
        for (let i = pts.length - 1; i >= 0; i--) { const [x, y] = pts[i]; const sl = snowLine + (N.fbm(x * 0.007, sd + 2, 3) - 0.5) * 80 + (N.n2(x * 0.05, sd + 5) - 0.5) * 14; g.lineTo(x, Math.max(y, sl)); }
        g.closePath(); g.fill();
        // the snow is shaded too: the flank away from the sun is blue-grey
        for (let i = 3; i < pts.length - 3; i++) { const d = (pts[i + 3][1] - pts[i - 3][1]) / 24, sh = d * L.lx; if (sh < 0.04) continue; const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; g.fillStyle = `rgba(110,130,160,${clamp(sh, 0, 0.7) * 0.32})`; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + 0.6, y1); g.lineTo(x1 + 0.6, snowLine + 50); g.lineTo(x0, snowLine + 50); g.closePath(); g.fill(); }
        // rock ribs show through the snow
        g.fillStyle = rgb(mixc(cc, [40, 46, 56], 0.2), 0.16); for (let i = 0; i < 40; i++) { const x = N.r() * RW, j = Math.min(pts.length - 1, Math.round(x / 4)), y0 = pts[j][1]; if (y0 > snowLine) continue; g.beginPath(); g.moveTo(x, y0 + 2); g.lineTo(x + 1.5 + N.r() * 2, y0 + 2); g.lineTo(x + (N.r() - 0.3) * 18, y0 + 10 + N.r() * 26); g.closePath(); g.fill(); }
      }
      g.restore();
    };
    ridge(300, 230, 2.2, [96, 112, 132], 0.45, winter ? 160 : 130, 1.3);
    ridge(360, 170, 3.1, [80, 96, 112], 0.3, winter ? 250 : 215, 4.1);
    ridge(410, 110, 4.6, [70, 82, 88], 0.2, winter ? 350 : null, 7.7);
    // forest: spruce silhouettes of mixed height on the last ridge and in front of it
    for (let x = -6; x < RW + 6; x += 3.2) {
      const n = N.fbm(x * 0.01, 9.3, 3), y = 430 - n * 28, h = 10 + N.r() * 16 + n * 10, w = h * 0.28;
      const tc = winter ? mixc([46, 58, 56], [200, 206, 210], N.r() * 0.25) : mixc([34, 52, 42], [62, 76, 54], N.r() * 0.6);
      g.fillStyle = rgb(mixc(tc, S.hor, 0.15)); g.beginPath(); g.moveTo(x - w, y); g.lineTo(x, y - h); g.lineTo(x + w, y); g.closePath(); g.fill();
    }
    g.fillStyle = rgb(mixc(winter ? [60, 70, 70] : [36, 50, 40], S.hor, 0.12)); g.fillRect(0, 428, RW, RH - 428);
    if (weather.kind === 'tåke') { g.fillStyle = 'rgba(214,218,220,.7)'; g.fillRect(0, 0, RW, RH); }
    else { const hz = g.createLinearGradient(0, 120, 0, RH); hz.addColorStop(0, rgb(S.hor, 0)); hz.addColorStop(1, rgb(S.hor, S.over ? 0.35 : 0.18)); g.fillStyle = hz; g.fillRect(0, 0, RW, RH); }
    return c;
  }
  // The quarry face behind the plant, painted pixel by pixel: three benches of blasted rock with
  // drill-hole traces, joints and facets, rust and water stains, scree at each toe, the berms, and
  // soil and trees on the rim. 300 m wide and 42 m high, 8 px per metre.
  const FACE = { Wm: 300, Hm: 42, ppm: 8, rim: 1.5, benches: [[1.5, 13], [14.5, 27], [28.5, 42]] };
  function buildFace(save, weather) {
    const ppm = FACE.ppm, FW = FACE.Wm * ppm, FH = FACE.Hm * ppm, c = off(FW, FH + 40 * 1), g = c.getContext('2d');
    const N = makeNoise(4242 + (save ? save.seed % 1000 : 0)), id = g.createImageData(FW, FH), d = id.data;
    const dep = save ? Career.deposit(save) : { gneis: 1 };
    let rc = [0, 0, 0], tw = 0; for (const k in dep) { const m = MATS[k]; if (!m) continue; const w = dep[k], col = mixc(m.base, m.rind, 0.35); rc = rc.map((v, i) => v + col[i] * w); tw += w; }
    rc = rc.map(v => v / Math.max(1, tw));
    const wet = weather && weather.wet > 0.5, winter = weather && (weather.kind === 'snø' || weather.kind === 'frost');
    const B = FACE.benches;
    const edge = (x, i) => (N.fbm(x * 0.02, i * 7.1, 3) - 0.5) * 1.6;   // ragged bench crests (m)
    for (let py = 0; py < FH; py++) {
      const v = py / ppm;
      for (let px = 0; px < FW; px++) {
        const u = px / ppm; let r, gg, b;
        // which band: rim, face k, berm
        let k = -1; for (let i = 0; i < 3; i++) { const t0 = B[i][0] + edge(u, i), t1 = B[i][1] + (i < 2 ? edge(u, i + 3) * 0.6 : 0); if (v >= t0 && v < t1) { k = i; break; } }
        if (v < B[0][0] + edge(u, 0)) { // soil rim
          const n = N.fbm(u * 0.4, v * 0.6, 3); r = 92 + n * 40; gg = 74 + n * 30; b = 52 + n * 20;
        } else if (k < 0) { // berm: gravel and rubble, lit from above
          const n = N.fbm(u * 1.3, v * 2.5, 4), hf = N.h(px * 3, py * 5) / 1; const l = 1.12 + (hf - 0.5) * 0.35;
          r = rc[0] * l + n * 18; gg = rc[1] * l + n * 16; b = rc[2] * l + n * 14;
        } else {
          const t0 = B[k][0], t1 = B[k][1], fv = (v - t0) / (t1 - t0);
          const n1 = N.fbm(u * 0.08 + k, v * 0.08, 4), n2 = N.fbm(u * 0.6, v * 0.6 + k * 3, 4);
          // blocky facets between joints: each block lit or in shadow
          const wu = u + (n2 - 0.5) * 3.2, wv = v + (n1 - 0.5) * 2.4;
          const ju = (wu * 0.94 + wv * 0.34) / (2.2 + n1 * 2.6), jv = (-wu * 0.22 + wv * 0.97) / (1.6 + n2 * 1.8), bi = Math.floor(ju), bj = Math.floor(jv);
          const facet = (N.h(bi + k * 31, bj) - 0.5) * 0.2 + (N.h(bi * 3 + 1, bj * 5 + k) - 0.5) * 0.08;
          const fu = ju - bi, fvv = jv - bj, open = N.h(bi * 7, bj * 3 + 11) > 0.35;
          const joint = (open && Math.min(fu, 1 - fu) < 0.03) || (N.h(bi, bj * 9 + 4) > 0.5 && Math.min(fvv, 1 - fvv) < 0.025) ? -0.26 : (Math.min(fu, 1 - fu) < 0.07 ? 0.06 : 0);
          // vertical half-barrels of the drill holes every 3.5 m, the full face height
          const hu = u / 3.5 + n2 * 0.05, hx = hu - Math.floor(hu), barrel = hx < 0.06 ? 0.22 * Math.sin(hx / 0.06 * Math.PI) - 0.1 : 0;
          // foliation: thin tilted stripes
          const fol = Math.sin((v * 1.6 + u * 0.35 + n1 * 6)) * 0.05;
          let l = 1 + facet + joint + barrel + fol + (n2 - 0.5) * 0.3 - fv * 0.12;
          r = rc[0] * l; gg = rc[1] * l; b = rc[2] * l;
          // rust and seepage: streaks running down from the crest
          const sx = Math.floor(u / 1.7), sh = N.h(sx * 13 + k, 77);
          if (sh > 0.86) { const a = clamp((1 - fv) * 0.9 * (sh - 0.86) / 0.14, 0, 1) * (0.6 + 0.4 * N.n2(u * 3, v * 0.3)); r = r * (1 - a) + 128 * a; gg = gg * (1 - a) + 82 * a; b = b * (1 - a) + 48 * a; }
          else if (sh < 0.06 || wet && sh < 0.14) { const a = clamp(fv * 0.6 + 0.2, 0, 0.7) * (0.5 + 0.5 * N.n2(u * 4, v * 0.2)); r *= 1 - a * 0.45; gg *= 1 - a * 0.42; b *= 1 - a * 0.38; }
          // scree apron at the toe of the face: a heap of blasted rubble, lighter and granular
          const apron = (1.5 + 2.6 * N.fbm(u * 0.05, k * 5.5, 3)) / (t1 - t0);
          if (fv > 1 - apron) { const q = N.h(px * 7 + 3, py * 11), lr = 1.02 + (q - 0.5) * 0.55 + (fv - 1 + apron) / apron * 0.08; r = rc[0] * lr * 1.05; gg = rc[1] * lr * 1.04; b = rc[2] * lr; }
          if (winter && (joint < 0 || fv > 1 - apron * 0.4) && N.h(px, py * 3) > 0.55) { r = 228; gg = 232; b = 236; }
        }
        // aerial haze increases with height (further away and higher)
        const hz = 0.08 + (1 - v / FACE.Hm) * 0.14; const o = (py * FW + px) * 4;
        d[o] = r * (1 - hz) + 200 * hz; d[o + 1] = gg * (1 - hz) + 204 * hz; d[o + 2] = b * (1 - hz) + 206 * hz; d[o + 3] = 255;
      }
    }
    g.putImageData(id, 0, 40 * 0);
    // shading under each crest (the face leans back a little; the overhang casts a soft shadow)
    for (const [t0] of B) { const gr = g.createLinearGradient(0, t0 * ppm, 0, (t0 + 3) * ppm); gr.addColorStop(0, 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, t0 * ppm, FW, 3 * ppm); }
    // haul road ramp climbing diagonally across the lowest two benches
    { g.save(); g.globalAlpha = 0.85; const x0 = FW * 0.62; g.fillStyle = rgb(mixc(rc, [210, 200, 180], 0.35)); g.beginPath(); g.moveTo(x0, FH); g.lineTo(x0 + 80 * ppm, FH); g.lineTo(x0 + 140 * ppm, B[1][0] * ppm); g.lineTo(x0 + 128 * ppm, B[1][0] * ppm); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.moveTo(x0 + 80 * ppm, FH); g.lineTo(x0 + 140 * ppm, B[1][0] * ppm); g.lineTo(x0 + 141 * ppm, B[1][0] * ppm + 4); g.lineTo(x0 + 82 * ppm, FH); g.fill(); g.restore(); }
    // trees and bushes along the rim
    for (let x = 0; x < FW; x += 2 + N.r() * 5) {
      const y = (B[0][0] + edge(x / ppm, 0)) * ppm, h = (3 + N.r() * 9) * ppm * 0.6, birch = N.r() < 0.25;
      if (N.fbm(x * 0.004, 3.3, 2) < 0.38) continue;
      if (birch) { g.fillStyle = winter ? 'rgba(220,224,226,.9)' : rgb(mixc([92, 112, 58], [140, 150, 80], N.r())); g.beginPath(); g.ellipse(x, y - h * 0.6, h * 0.28, h * 0.45, 0, 0, TAU); g.fill(); g.fillStyle = '#d8d6cc'; g.fillRect(x - 0.6, y - h * 0.35, 1.2, h * 0.35); }
      else { g.fillStyle = rgb(winter ? mixc([40, 54, 50], [210, 216, 220], N.r() * 0.4) : mixc([28, 46, 36], [50, 70, 48], N.r())); g.beginPath(); g.moveTo(x - h * 0.2, y); g.lineTo(x, y - h); g.lineTo(x + h * 0.2, y); g.closePath(); g.fill(); }
    }
    // distant life on the upper bench: a drill rig and an excavator, yellow, at true size (5–6 m)
    const mach = (x, y, kind) => {
      const m = ppm; g.fillStyle = '#d9a425';
      if (kind === 'drill') { g.fillRect(x, y - 2.2 * m, 6 * m, 1.6 * m); g.fillStyle = '#2b2b2b'; g.fillRect(x, y - 0.7 * m, 6 * m, 0.7 * m); g.fillStyle = '#c99620'; g.fillRect(x + 4.6 * m, y - 11 * m, 0.45 * m, 9 * m); g.fillStyle = '#7da6bf'; g.fillRect(x + 0.5 * m, y - 3.4 * m, 1.6 * m, 1.2 * m); }
      else { g.fillRect(x, y - 2.8 * m, 4.2 * m, 1.9 * m); g.fillStyle = '#2b2b2b'; g.fillRect(x - 0.6 * m, y - 0.9 * m, 5.4 * m, 0.9 * m); g.strokeStyle = '#d9a425'; g.lineWidth = 0.6 * m; g.beginPath(); g.moveTo(x + 3.6 * m, y - 2.6 * m); g.lineTo(x + 7.5 * m, y - 5.5 * m); g.lineTo(x + 9.5 * m, y - 1.2 * m); g.stroke(); }
    };
    void mach;
    return c;
  }
  // tile of the yard surface: compacted crusher dust and gravel, pebbles seen at a low angle (3 m square)
  function buildGravel(weather) {
    const n = 512, c = off(n, n), g = c.getContext('2d'), N = makeNoise(99);
    const winter = weather && (weather.kind === 'snø'), wet = weather && weather.wet > 0.5;
    const base = winter ? [206, 210, 214] : wet ? [104, 98, 88] : [140, 132, 118];
    const id = g.createImageData(n, n), d = id.data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const f = N.fbm(x / 64, y / 64, 4), h = N.h(x * 3, y * 7), l = 0.86 + f * 0.26 + (h - 0.5) * 0.1, o = (y * n + x) * 4; d[o] = base[0] * l; d[o + 1] = base[1] * l; d[o + 2] = base[2] * l; d[o + 3] = 255; }
    g.putImageData(id, 0, 0);
    for (let i = 0; i < 2600; i++) { const x = N.r() * n, y = N.r() * n, r = 0.8 + Math.pow(N.r(), 3) * 7, t = N.r(); g.fillStyle = rgb(mixc(base, t < 0.5 ? [60, 56, 50] : [230, 226, 216], 0.2 + N.r() * 0.3)); g.beginPath(); g.ellipse(x, y, r, r * 0.55, 0, 0, TAU); g.fill(); if (r > 2.5) { g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x + r * 0.2, y + r * 0.45, r * 0.9, r * 0.25, 0, 0, TAU); g.fill(); } }
    if (winter) { g.fillStyle = 'rgba(250,252,253,.5)'; for (let i = 0; i < 160; i++) { g.beginPath(); g.ellipse(N.r() * n, N.r() * n, 6 + N.r() * 30, 2 + N.r() * 6, 0, 0, TAU); g.fill(); } }
    return c;
  }
  // draws sky, range and face for a camera; returns the screen y of the face's top (for the caller)
  function drawFar(g, sim, weather, C, L) {
    const mm = sim.mmpx, Z = C.Z, gy = C.oy + Z * 1130, kp = 0.3;
    const sf = Z * kp / mm;                                   // screen px per mm on the face
    const camMm = C.cx * mm;                                  // camera centre in mm
    const faceH = FACE.Hm * 1000 * sf, faceTop = gy - faceH - 4;
    // the mountains: they barely move, and they sit on the quarry rim
    const RW = 1600, RH = 460, rs = clamp(0.7 + Z * 0.6, 0.72, 1.2), rx = 360 - RW * rs / 2 - (camMm * 0.00001) % 200;
    if (faceTop > -10) g.drawImage(layers.range, rx, faceTop + 12 - RH * rs, RW * rs, RH * rs);
    if (faceTop < 1290) {
      const x0 = 360 + (-150000 - camMm) * sf;   // the face spans −150 m … +150 m around the plant, seen with parallax
      const fw = FACE.Wm * 1000 * sf, fh = faceH;
      // the face is 300 m wide; repeat it if the view is wider
      for (let rep = -1; rep <= 1; rep++) { const xx = x0 + rep * fw; if (xx > 720 || xx + fw < 0) continue; g.drawImage(layers.face, 0, 0, layers.face.width, FACE.Hm * FACE.ppm, xx, faceTop, fw, fh); }
      // close up the face is mostly blur: lay a fine rock grain over it so it reads as stone
      if (false && sf > 0.012) { g.save(); g.globalAlpha = clamp((sf - 0.012) * 8, 0, 0.18); const pt = g.createPattern(tex.rockgrain, 'repeat'), k = 2000 * sf / 256; pt.setTransform(new DOMMatrix([k, 0, 0, k, x0, faceTop])); g.fillStyle = pt; g.globalCompositeOperation = 'overlay'; g.fillRect(0, Math.max(0, faceTop), 720, Math.min(1280, gy) - Math.max(0, faceTop)); g.restore(); }
      // seen close, the face is far behind the plant: haze it back (and it hides the blur)
      if (sf > 0.008) { const S = skyCols(weather, L); g.fillStyle = rgb(mixc(S.hor, [190, 190, 186], 0.4), clamp((sf - 0.008) * 6, 0, 0.42)); g.fillRect(0, Math.max(0, faceTop), 720, Math.max(0, gy - Math.max(0, faceTop))); }
      // the sun on the face: a warm wash from its side, darker under the berms
      const lg = g.createLinearGradient(0, 0, 720, 0), a = 0.12 * L.contrast;
      if (L.lx < 0) { lg.addColorStop(0, rgb(L.col, a)); lg.addColorStop(1, 'rgba(20,24,30,' + a + ')'); } else { lg.addColorStop(0, 'rgba(20,24,30,' + a + ')'); lg.addColorStop(1, rgb(L.col, a)); }
      g.fillStyle = lg; g.fillRect(0, Math.max(0, faceTop), 720, Math.max(0, gy - Math.max(0, faceTop)));
    }
    return { faceTop, gy };
  }
  // the yard: the gravel tile at true size, hazier towards the face, tyre tracks to the ramp
  function drawYard(g, sim, weather, C) {
    const mm = sim.mmpx, Z = C.Z, gy = C.oy + Z * 1130;
    if (gy >= 1280) return;
    const pt = g.createPattern(layers.gravel, 'repeat'), k = 2000 / mm * Z / 512;
    pt.setTransform(new DOMMatrix([k, 0, 0, k * 0.8, C.ox, gy]));
    g.fillStyle = pt; g.fillRect(0, gy, 720, 1280 - gy);
    const dg = g.createLinearGradient(0, gy, 0, Math.min(1280, gy + 9000 / mm * Z)); dg.addColorStop(0, 'rgba(196,196,190,.35)'); dg.addColorStop(0.15, 'rgba(0,0,0,0)'); dg.addColorStop(1, 'rgba(30,24,18,.28)');
    g.fillStyle = dg; g.fillRect(0, gy, 720, 1280 - gy);
    // tyre tracks: two darker ruts across the yard
    const tw = 600 / mm * Z;
    if (tw > 0.6) { g.fillStyle = weather && weather.wet > 0.5 ? 'rgba(40,34,28,.28)' : 'rgba(60,52,44,.16)'; for (const o of [1400, 3300]) { const y = gy + o / mm * Z * 0.8; if (y < 1280) g.fillRect(0, y, 720, tw * 0.5); } }
    if (weather && weather.wet > 0.5) { g.fillStyle = 'rgba(150,168,180,.35)'; for (let i = 0; i < 6; i++) { const x = C.ox + ((i * 4300 + 900) / mm) * Z, y = gy + ((700 + (i % 3) * 1500) / mm) * Z * 0.8, rx = 1400 / mm * Z, ry = 120 / mm * Z; if (x > -rx && x < 720 + rx) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); } } }
  }

  // ---------- static machine art ----------
  function steelFill(g, base, x0, y0, x1, y1, light) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, rgb(mixc(base, [255, 255, 255], 0.12 * light))); gr.addColorStop(1, rgb(mixc(base, [0, 0, 0], 0.25)));
    return gr;
  }
  function bolt(g, x, y, r) {
    g.fillStyle = '#1d1e20'; g.beginPath(); g.arc(x, y, r * 1.25, 0, TAU); g.fill();
    g.fillStyle = '#5b5f63'; g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU); g.fill();
  }
  function painted(g, poly, paint, light, rust) {
    const tracePath = () => { g.beginPath(); poly.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };
    tracePath();
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
    g.fillStyle = steelFill(g, paint, x0, y0, x1, y1, light); g.fill();
    g.save(); g.clip();
    g.fillStyle = g.createPattern(tex.noise, 'repeat'); g.fill();
    // weathering: a dusty band at the bottom, faded paint at the top, oil and rust run-off streaks
    const gg = g.createLinearGradient(0, y0, 0, y1); gg.addColorStop(0, 'rgba(255,255,255,.07)'); gg.addColorStop(0.65, 'rgba(0,0,0,0)'); gg.addColorStop(1, 'rgba(120,104,84,.32)'); g.fillStyle = gg; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    let sd = (x0 * 13 + y0 * 7) | 0; const r = () => { sd = (sd * 16807 + 11) % 2147483647; return (sd & 0xffff) / 0x10000; };
    for (let i = 0; i < (x1 - x0) / 60; i++) { const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0) * 0.6, len = 30 + r() * 160, rr = r() < 0.5; const sg = g.createLinearGradient(0, y, 0, y + len); sg.addColorStop(0, rr ? `rgba(120,58,24,${0.25 * (rust + 0.3)})` : 'rgba(20,16,12,.22)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; g.fillRect(x, y, 2 + r() * 4, len); }
    if (rust > 0) { g.globalAlpha = Math.min(1, rust * 1.6); g.fillStyle = g.createPattern(tex.rust, 'repeat'); g.fill(); g.globalAlpha = 1; }
    g.restore();
    // bevelled edges: light on the upper-left, dark on the lower-right; chipped paint along the edges
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length], nx = by - ay, ny = -(bx - ax), l = Math.hypot(nx, ny) || 1, lit = -(nx / l) * 0.6 - (ny / l) * 0.8;
      g.strokeStyle = lit > 0 ? `rgba(255,255,255,${0.22 * lit})` : `rgba(0,0,0,${-0.35 * lit})`; g.lineWidth = 3; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      const n = Math.floor(l / 40);
      for (let k = 0; k < n; k++) { if (r() > 0.45) continue; const t = r(), px = ax + (bx - ax) * t + (nx / l) * -3, py = ay + (by - ay) * t + (ny / l) * -3, cw = 2 + r() * 6; g.fillStyle = r() < 0.6 ? 'rgba(150,152,150,.65)' : `rgba(110,56,26,${0.4 + rust * 0.4})`; g.beginPath(); g.ellipse(px, py, cw, cw * 0.5, Math.atan2(by - ay, bx - ax), 0, TAU); g.fill(); }
    }
    tracePath(); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1.5; g.stroke();
  }
  function buildMachineBack(sim, k = RS) {
    const c = off(W * k, H * k), g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0);
    const G = Machine.G, T = sim.tier, M = sim.m;
    // ground and foundation
    // (the yard and the concrete pad are drawn with the surroundings)
    // concrete foundation and the drive motor on its slide rails, left of the crusher
    const fg = g.createLinearGradient(0, 690, 0, 1130); fg.addColorStop(0, '#77736b'); fg.addColorStop(1, '#4d4a44');
    g.fillStyle = fg; g.beginPath(); g.moveTo(-10, 690); g.lineTo(120, 690); g.lineTo(270, G.BOT + 40); g.lineTo(270, 1130); g.lineTo(-10, 1130); g.closePath(); g.fill();
    g.fillStyle = g.createPattern(tex.noise, 'repeat'); g.fill();
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-10, 690, 130, 6); for (const y of [880, 1010]) g.fillRect(-10, y, 200, 2);
    g.fillStyle = '#2c2d2f'; g.fillRect(-10, 950, 130, 10);
    const mg = g.createLinearGradient(0, 860, 0, 950); mg.addColorStop(0, '#46698c'); mg.addColorStop(0.5, '#5d84a8'); mg.addColorStop(1, '#2d4a66');
    g.fillStyle = mg; g.fillRect(-10, 862, 104, 88);
    g.fillStyle = 'rgba(0,0,0,.28)'; for (let x = -4; x < 90; x += 9) g.fillRect(x, 866, 3, 80);
    g.fillStyle = '#3a3c3f'; g.beginPath(); g.arc(28, 905, 24, 0, TAU); g.fill(); g.fillStyle = '#1a1b1c'; g.beginPath(); g.arc(28, 905, 8, 0, TAU); g.fill();
    g.fillStyle = '#c9c4b6'; g.fillRect(64, 872, 22, 14);
    // cheek plate behind the chamber (the near one is cut away)
    const cp = [[60, 270], [G.FX + 60, 270], [G.FX + 60, G.BOT + 40], [250, G.BOT + 40]];
    painted(g, cp, [52, 56, 60], 0.6, 0.15);
    // liners on the cheek plate
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 330; y < G.BOT; y += 120) g.fillRect(120, y, G.FX - 60, 3);
    for (let y = 350; y < G.BOT; y += 120) for (let x = 170; x < G.FX; x += 110) bolt(g, x, y, 5);
    // inside of the chamber gets darker with depth
    const ao = g.createLinearGradient(0, G.TOP, 0, G.BOT); ao.addColorStop(0, 'rgba(0,0,0,0.05)'); ao.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = ao; g.fillRect(60, G.TOP, G.FX, G.BOT - G.TOP + 40);
    // under-crusher pit
    g.fillStyle = '#1e1c1a'; g.fillRect(G.BELT_X0 - 60, G.BOT + 40, G.BELT_X1 - G.BELT_X0 + 140, G.BELT_Y - G.BOT + 70);
    // the belt runs in a concrete pit below the yard: walls and the lip at ground level
    g.fillStyle = '#5c5850'; g.fillRect(G.BELT_X0 - 80, 1130, 20, G.BELT_Y - 1130 + 70); g.fillRect(G.BELT_X1 + 80, 1130, 20, G.BELT_Y - 1130 + 70);
    g.fillStyle = '#7c776d'; g.fillRect(G.BELT_X0 - 90, 1126, G.BELT_X1 - G.BELT_X0 + 200, 8);
    // belt frame and idlers (the belt itself is drawn live)
    g.fillStyle = '#3d3f42'; g.fillRect(G.BELT_X0 - 30, G.BELT_Y + 30, G.BELT_X1 - G.BELT_X0 + 70, 18);
    for (let x = G.BELT_X0 + 30; x < G.BELT_X1 + 30; x += 92) { g.fillStyle = '#2a2b2d'; g.fillRect(x, G.BELT_Y + 40, 12, 90); }
    return c;
  }
  function buildMachineFront(sim, k = RS) {
    const c = off(W * k, H * k), g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0);
    const G = Machine.G, T = sim.tier, paint = T.paint[0], rust = T.rust;
    // fixed jaw frame (cut-away casting) to the right of the plate
    painted(g, [[G.FX + 34, 262], [W + 10, 262], [W + 10, G.BOT + 50], [G.FX + 34, G.BOT + 50]], paint, 1, rust);
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 420; y < G.BOT; y += 150) { g.fillRect(G.FX + 40, y, W - G.FX, 14); g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(G.FX + 40, y - 2, W - G.FX, 2); g.fillStyle = 'rgba(0,0,0,.25)'; }
    // cut face hatching where the casting is sectioned
    g.save(); g.beginPath(); g.rect(G.FX + 34, 262, 26, G.BOT - 212); g.clip(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; for (let y = 200; y < G.BOT + 100; y += 12) { g.beginPath(); g.moveTo(G.FX + 30, y); g.lineTo(G.FX + 70, y - 40); g.stroke(); } g.restore();
    for (let y = 330; y < G.BOT; y += 110) bolt(g, G.FX + 72, y, 9);
    // type plate
    g.fillStyle = '#d6cfbe'; g.fillRect(552, 640, 150, 92); g.strokeStyle = '#3a372f'; g.lineWidth = 2; g.strokeRect(555, 643, 144, 86);
    g.fillStyle = '#2a2721'; g.font = '700 21px "Barlow Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'left'; g.fillText(T.name, 564, 668);
    g.font = '600 15px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillText(`${T.kw} kW · ${T.rpm} rpm`, 564, 688); g.fillText(`Feed ${T.gape}×${Math.round(T.gape * 1.5)} mm`, 564, 706); g.fillText(`${T.weight} t · built ${T.year}`, 564, 723);
    bolt(g, 560, 648, 3); bolt(g, 694, 648, 3); bolt(g, 560, 724, 3); bolt(g, 694, 724, 3);
    // hopper side plates
    const hopL = [[-40, 150], [0, 150], [124, 288], [96, 312], [-40, 312]];
    const hopR = [[720, 170], [760, 170], [760, 330], [G.FX + 30, 330], [G.FX - 4, 296]];
    painted(g, hopL, [88, 86, 82], 0.7, 0.4); void hopR;
    // wear liners (bolted plates) on the hopper
    for (const [x, y] of [[30, 205], [70, 250], [610, 214], [560, 260]]) bolt(g, x, y, 5);
    // hazard stripes on the lips
    const stripe = (x, y, w, h) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); for (let i = -4; i < w / 10 + 4; i++) { g.fillStyle = (i & 1) ? '#1b1b1b' : '#e9b11c'; g.beginPath(); g.moveTo(x + i * 10, y); g.lineTo(x + i * 10 + 10, y); g.lineTo(x + i * 10, y + h); g.lineTo(x + i * 10 - 10, y + h); g.fill(); } g.restore(); };
    stripe(-40, 142, 44, 10);
    // skirt boards at the loading point of the belt
    g.fillStyle = '#2b2b2b'; g.fillRect(G.BELT_X1, G.BELT_Y - 64, 16, 66);
    // control box with emergency stop
    g.fillStyle = '#c9c4b6'; g.fillRect(612, 820, 84, 110); g.strokeStyle = '#4b483f'; g.strokeRect(612, 820, 84, 110);
    g.fillStyle = '#d4211a'; g.beginPath(); g.arc(654, 900, 14, 0, TAU); g.fill(); g.fillStyle = '#f2c919'; g.beginPath(); g.arc(654, 900, 20, 0, TAU); g.arc(654, 900, 14, 0, TAU, true); g.fill();
    g.fillStyle = '#2a2721'; g.font = '700 12px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.fillText('EMERGENCY STOP', 654, 934);
    return c;
  }

  // ---------- camera: the small first crusher is seen from further away, so its true size reads ----------
  // the base zoom shows the small first crusher from further away so its true size reads;
  // the player can pinch / scroll to zoom and drag with two fingers to look around
  const cam = { uz: 1, cx: null, cy: null, zT: 0, zSettled: 1, tier: -1 };
  function baseZ(sim) { return [0.62, 0.74, 0.87, 1][sim.save.tier ?? 0] ?? 1; }
  // while the sledge is swung the view eases out around the aim point (the stone stays under the
  // finger) so the whole swing is in sight; it eases back afterwards
  const act = { k: 0, box: null };
  function setAction(a) { act.k = a.k; if (a.box) act.box = a.box; }
  // camera that shows a world box (the sledge arc) in the free part of the screen
  function fitBox(c, b) {
    const w = b.x1 - b.x0, h = b.y1 - b.y0, Z = Math.min(c.Z, 700 / w, 975 / h);
    const inView = c.ox + b.x0 * c.Z >= 0 && c.ox + b.x1 * c.Z <= 720 && c.oy + b.y0 * c.Z >= 135 && c.oy + b.y1 * c.Z <= 1115;
    if (inView) return c;
    return { Z, Z0: c.Z0, ox: (720 - w * Z) / 2 - b.x0 * Z, oy: 135 + (975 - h * Z) / 2 - b.y0 * Z };
  }
  function camFor(sim) {
    const c = camBase(sim);
    if (act.k <= 0.001 || !act.box) return c;
    const f = fitBox(c, act.box), k = act.k * act.k * (3 - 2 * act.k);
    const Z = c.Z + (f.Z - c.Z) * k, ox = c.ox + (f.ox - c.ox) * k, oy = c.oy + (f.oy - c.oy) * k;
    return { Z, Z0: c.Z0, ox, oy, cx: (360 - ox) / Z, cy: (640 - oy) / Z };
  }
  function camBase(sim) {
    const Z0 = baseZ(sim), Z = Z0 * cam.uz;
    const dcx = 360 - 40 * (1 - Z0) / Z0 * 1 + 120 * (1 - Z0) / 0.38, dcy = Math.max(640 + 60 * (1 - Z0) / Z0, Machine.G.BELT_Y + 40 - 480 / Z0);
    let cx = cam.cx ?? dcx, cy = cam.cy ?? dcy;
    // the view centre stays over the plant: you can look around, but not off into the empty sky or yard
    const E = plantBox(sim); cx = clamp(cx, E.x0, E.x1); cy = clamp(cy, Math.min(E.y0 + 300, 700), 1150);
    return { Z, Z0, ox: 360 - cx * Z, oy: 640 - cy * Z, cx, cy };
  }
  function leftMm(sim) { const P = sim.pileShape(), st = sim.stacker(); return P.stock && P.stock.R > 0 ? Math.max(13500, (st.head.x - (P.stock.cx - P.stock.R)) * sim.mmpx + 7500) : 13500; }
  function plantBox(sim) {
    const st = sim.stacker(), F = Machine.G.FEED, mm = sim.mmpx, g = sim.trGeom();
    return { x0: st.head.x - (sim.up.vsi ? 21000 : sim.up.kjegle || sim.up.hsi ? 17500 : sim.up.sikt ? 16000 : leftMm(sim)) / mm, x1: Math.max(F.x1, g.hinge.x + g.Lb) + 600 / mm,
      y0: Math.min(st.head.y, g.rampY - (g.spec.H + g.spec.axle + 1600) / mm) - 150 };
  }
  function zoomAt(sim, sx, sy, f) {
    const c = camBase(sim), wx = (sx - c.ox) / c.Z, wy = (sy - c.oy) / c.Z;
    cam.uz = clamp(cam.uz * f, 0.035 / c.Z0, 3.2 / c.Z0);
    const Z = c.Z0 * cam.uz, ox = sx - wx * Z, oy = sy - wy * Z;
    cam.cx = (360 - ox) / Z; cam.cy = (640 - oy) / Z; cam.zT = 0.35;
  }
  function panBy(sim, dx, dy) { const c = camBase(sim); cam.cx = c.cx - dx / c.Z; cam.cy = c.cy - dy / c.Z; }
  function resetView() { cam.uz = 1; cam.cx = cam.cy = null; cam.zT = 0.35; }
  // overview: the whole plant from the stockpile to the tipping ramp
  function showAll(sim) {
    const st = sim.stacker(), F = Machine.G.FEED, mm = sim.mmpx, g = sim.trGeom();
    // from the stockpile to the truck standing on the ramp (not the empty road behind it)
    const x0 = st.head.x - (sim.up.vsi ? 21000 : sim.up.kjegle || sim.up.hsi ? 17500 : sim.up.sikt ? 16000 : leftMm(sim)) / mm, x1 = Math.max(F.x1, g.hinge.x + g.Lb) + 600 / mm;
    const y0 = Math.min(st.head.y, g.rampY - (g.spec.H + g.spec.axle + 1600) / mm) - 150, y1 = 1260;
    const Z0 = baseZ(sim), Z = Math.min(710 / (x1 - x0), 900 / (y1 - y0));
    cam.uz = clamp(Z / Z0, 0.035 / Z0, 3.2 / Z0); const Zr = Z0 * cam.uz;
    // the plant in the middle of the free area between the gauges and the tool bar
    const oy = (300 + 1250) / 2 - (y0 + y1) / 2 * Zr;
    cam.cx = (x0 + x1) / 2; cam.cy = (640 - oy) / Zr; cam.zT = 0.35;
  }
  function lookAt(sim, wx, wy, Z) { cam.uz = Z / baseZ(sim); cam.cx = wx; cam.cy = wy; cam.zT = 0.35; }
  function isZoomed() { return cam.uz !== 1 || cam.cx !== null; }
  // the surroundings only change when the camera moves: cache them as one screen-sized image
  let sceneC = null, farC = null, sceneKey = '';
  function drawSceneCached(sim, weather, C, sx, sy, L) {
    const u = Math.round(clamp((view.hour - 7.5) / 7, 0, 1) * 40) / 40;
    const key = [C.Z.toFixed(4), C.ox.toFixed(1), C.oy.toFixed(1), RS, weather.kind, sim.tier.id, sim.up.loader, u, lastKey].join('|');
    if (key !== sceneKey || !sceneC) {
      if (!sceneC || sceneC.width !== cv.width || sceneC.height !== cv.height) sceneC = off(cv.width, cv.height);
      // the far scene (sky, mountains, quarry face, yard) is soft anyway: paint it at half resolution
      const hw = Math.ceil(cv.width / 2), hh = Math.ceil(cv.height / 2);
      if (!farC || farC.width !== hw || farC.height !== hh) farC = off(hw, hh);
      const f = farC.getContext('2d'); f.setTransform(1, 0, 0, 1, 0, 0); f.imageSmoothingQuality = 'low';
      f.drawImage(layers.bgA, 0, 0, hw, hh);
      if (u > 0.01) { f.globalAlpha = u; f.drawImage(layers.bgB, 0, 0, hw, hh); f.globalAlpha = 1; }
      f.setTransform(RS / 2, 0, 0, RS / 2, 0, 0);
      const DB = window.RC_DBG || {};
      if (!DB.far) drawFar(f, sim, weather, C, L);
      if (!DB.yard) drawYard(f, sim, weather, C);
      // light grade baked in (cheap at half size)
      f.setTransform(1, 0, 0, 1, 0, 0); f.globalCompositeOperation = 'soft-light'; f.fillStyle = rgb(L.col, 0.22); f.fillRect(0, 0, hw, hh); f.globalCompositeOperation = 'source-over';
      const g = sceneC.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(farC, 0, 0, sceneC.width, sceneC.height);
      if (!DB.sc) drawScene(g, sim, weather, C, 0, 0);
      sceneKey = key;
    }
    ctx.setTransform(1, 0, 0, 1, sx * 0.5, sy * 0.5); ctx.drawImage(sceneC, 0, 0);
  }
  // everyday things at true size on the yard, so the size of the machine reads:
  // a 200 litre oil drum, an IBC tank and a pickup truck
  function drawRefs(g, sim) {
    const mm = sim.mmpx, P = (v) => v / mm, gy = 1130, F = Machine.G.FEED;
    // under the feeder, right of the crusher
    let x = (sim.up.scalper ? 1240 + Math.max(P(2600), sim.fillShape().R * 1.2) : 1180) + P(400);
    // IBC: 1.2 m long, 1.16 m high, white tank in a galvanised cage on a pallet
    { const w = P(1200), h = P(1160), pal = P(150);
      g.fillStyle = '#6b5a44'; g.fillRect(x, gy - pal, w, pal);
      g.fillStyle = 'rgba(236,236,228,.92)'; g.fillRect(x + P(40), gy - h + P(30), w - P(80), h - pal - P(30));
      g.fillStyle = 'rgba(120,110,90,.35)'; g.fillRect(x + P(40), gy - pal - P(380), w - P(80), P(380));   // what is left in it
      g.strokeStyle = '#9aa0a4'; g.lineWidth = Math.max(1.5, P(30));
      g.strokeRect(x + P(20), gy - h, w - P(40), h - pal);
      for (let k = 1; k < 4; k++) { const xx = x + P(20) + (w - P(40)) * k / 4; g.beginPath(); g.moveTo(xx, gy - h); g.lineTo(xx, gy - pal); g.stroke(); }
      g.beginPath(); g.moveTo(x + P(20), gy - h + (h - pal) / 2); g.lineTo(x + w - P(20), gy - h + (h - pal) / 2); g.stroke();
      x += w + P(350); }
    // 200 l oil drum: 0.88 m high, 0.58 m across
    for (const c of ['#2f5d8a', '#8a2f24']) {
      const w = P(580), h = P(880);
      if (x + w > F.x1 - P(300)) break;
      const dg = g.createLinearGradient(x, 0, x + w, 0); dg.addColorStop(0, 'rgba(0,0,0,.35)'); dg.addColorStop(0.35, 'rgba(255,255,255,.12)'); dg.addColorStop(1, 'rgba(0,0,0,.4)');
      g.fillStyle = c; g.fillRect(x, gy - h, w, h); g.fillStyle = dg; g.fillRect(x, gy - h, w, h);
      g.fillStyle = 'rgba(0,0,0,.35)'; for (const f of [0.33, 0.66]) g.fillRect(x, gy - h * f - P(12), w, P(24));
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x - P(10), gy - h - P(15), w + P(20), P(30));
      x += w + P(120);
    }
    // pickup truck parked left of the plant: 5.3 m long, 1.85 m high
    { const L = P(5300), Hh = P(1850), PS = sim.pileShape(), x0 = Math.min(sim.stacker().head.x - P(sim.up.vsi ? 14000 : sim.up.kjegle || sim.up.hsi ? 10600 : sim.up.sikt ? 9000 : 6500), PS.stock && PS.stock.R > 0 ? PS.stock.cx - PS.stock.R - P(1500) : Infinity) - L, wr = P(380), cab = P(2300), bedH = P(1050);
      const body = '#d9d6cf', dark = '#2a2c2f';
      g.fillStyle = body;
      g.beginPath();
      g.moveTo(x0 + P(100), gy - P(420)); g.lineTo(x0 + P(100), gy - P(950)); g.lineTo(x0 + P(700), gy - P(1000));   // nose and bonnet
      g.lineTo(x0 + P(1500), gy - P(1080)); g.lineTo(x0 + P(2000), gy - Hh); g.lineTo(x0 + P(2000) + cab - P(400), gy - Hh); // windscreen and roof
      g.lineTo(x0 + P(2000) + cab - P(300), gy - bedH); g.lineTo(x0 + L, gy - bedH); g.lineTo(x0 + L, gy - P(420)); g.closePath(); g.fill();
      g.fillStyle = 'rgba(60,80,100,.75)';
      g.beginPath(); g.moveTo(x0 + P(1620), gy - P(1100)); g.lineTo(x0 + P(2060), gy - Hh + P(80)); g.lineTo(x0 + P(2000) + cab - P(480), gy - Hh + P(80)); g.lineTo(x0 + P(2000) + cab - P(440), gy - P(1100)); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x0 + P(100), gy - P(620), L - P(100), P(60));
      g.fillStyle = '#f2a51e'; g.fillRect(x0 + P(2000), gy - Hh - P(90), P(500), P(90));   // beacon bar
      for (const wx of [x0 + P(1100), x0 + L - P(1100)]) { g.fillStyle = dark; g.beginPath(); g.arc(wx, gy - wr, wr, 0, TAU); g.fill(); g.fillStyle = '#8e9296'; g.beginPath(); g.arc(wx, gy - wr, wr * 0.5, 0, TAU); g.fill(); }
    }
  }
  function drawScene(g, sim, weather, C, sx, sy) {
    const cam = C, mm = sim.mmpx, G = Machine.G, Z = cam.Z;
    const pat = (n) => g.createPattern(tex[n], 'repeat');
    const wet = weather && weather.wet > 0.5, winter = weather && (weather.kind === 'snø' || weather.kind === 'frost');
    const gy = cam.oy + Z * 1130; void gy; void pat; void wet; void winter;
    // world space at the camera
    g.setTransform(RS * Z, 0, 0, RS * Z, cam.ox * RS + sx, cam.oy * RS + sy);
    const T = sim.tier, paint = T.paint[0];
    // hopper side walls above the frame
    // supports of the operator platform on the left
    for (const x of [-700, -380, -90]) { g.fillStyle = '#3a3c3f'; g.fillRect(x, G.PLAT_L + 18, 16, 690 - G.PLAT_L - 18); }
    // motor plinth and foundation continue to the left
    g.fillStyle = '#6c6860'; g.fillRect(-700, 690, 690, 440); g.fillStyle = pat('noise'); g.fillRect(-700, 690, 690, 440);
    g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(-700, 690, 690, 6);
    // the crusher's own frame continues right of the view
    g.drawImage(layers.ext, 690, 252, 420, G.BOT + 50 - 242);
    const rh = 1000 / mm;
    drawRefs(g, sim);
    if (sim.up.lights) for (let i = 0; i < LAMPS.length; i++) {
      const l = lampPos(sim, i), base = i === 0 ? G.PLAT_L : 1130;
      g.fillStyle = '#4b4f54'; g.fillRect(l.x - 9, l.y, 18, base - l.y);
      g.fillStyle = '#2f3236'; g.fillRect(l.x - 40, l.y - 26, 80, 30);
      g.fillStyle = '#e9e3d2'; g.fillRect(l.x - 34, l.y - 20, 30, 18); g.fillRect(l.x + 4, l.y - 20, 30, 18);
      g.fillStyle = '#4b4f54'; g.fillRect(l.x - 60, base - 14, 120, 14);
    }
    // earth ramp behind the feeder: the tipper backs up it to the hopper
    { const F = G.FEED, rY = sim.trGeom().rampY, xA = F.x1 + 30, xB = F.x1 + 12000 / mm, xC = xB + 9000 / mm;
      const rg = g.createLinearGradient(0, rY, 0, 1130); rg.addColorStop(0, '#8a7d68'); rg.addColorStop(1, '#5f5546');
      g.fillStyle = rg; g.beginPath(); g.moveTo(xA, 1130); g.lineTo(xA, rY); g.lineTo(xB, rY); g.lineTo(xC, 1130); g.closePath(); g.fill();
      g.fillStyle = pat('noise'); g.fill();
      g.fillStyle = '#5c5850'; g.fillRect(xA - 10, rY - 8, 40, 1130 - rY + 8);   // retaining wall at the hopper
      g.fillStyle = '#e9b11c'; g.fillRect(xA + 40, rY - 30, 160, 30); g.fillStyle = '#1b1b1b'; for (let i = 0; i < 4; i++) g.fillRect(xA + 52 + i * 40, rY - 30, 18, 30);   // wheel stop
    }
    // stacker conveyor: from the head of the crusher belt up to the left, over the stockpile
    { const st = stackerGeom(sim), ux = Math.cos(st.a), uy = Math.sin(st.a);
      const P0 = st.p0, P1 = st.head, along = (k) => ({ x: P0.x + (P1.x - P0.x) * k, y: P0.y + (P1.y - P0.y) * k });
      for (let k = 0.12; k < 0.95; k += 0.16) { const q = along(k); g.fillStyle = '#34373a'; g.fillRect(q.x - 8, q.y + 30, 16, 1130 - q.y - 30); g.fillRect(q.x - 60, 1120, 120, 12); }
      g.lineCap = 'round';
      g.strokeStyle = '#3d3f42'; g.lineWidth = 34; g.beginPath(); g.moveTo(P0.x, P0.y + 26); g.lineTo(P1.x, P1.y + 26); g.stroke();
      g.strokeStyle = '#1c1c1c'; g.lineWidth = 14; g.beginPath(); g.moveTo(P0.x, P0.y); g.lineTo(P1.x, P1.y); g.stroke();
      g.fillStyle = '#2a2b2d'; for (let k = 0.02; k < 1; k += 1200 / mm / st.L) { const q = along(k); g.beginPath(); g.arc(q.x, q.y + 12, 10, 0, TAU); g.fill(); }
      g.fillStyle = '#4a4d50'; g.beginPath(); g.arc(P1.x, P1.y + 6, 26, 0, TAU); g.fill(); g.beginPath(); g.arc(P0.x, P0.y + 6, 22, 0, TAU); g.fill();
      void ux; void uy; }
    // things that give the scale: a 20 l jerrycan, a shovel against the plinth, a cone, hard hat on a hook
    const P = (v) => v / mm;
    const ground = 1130;
    const can = (x) => { const w = P(345), h = P(470); g.fillStyle = '#b8261c'; g.fillRect(x, ground - h, w, h); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + w * 0.1, ground - h * 0.92, w * 0.8, P(18)); g.fillStyle = '#8a1c14'; g.fillRect(x + w * 0.55, ground - h - P(60), P(110), P(60)); g.fillRect(x + w * 0.1, ground - h - P(40), P(130), P(40)); };
    const shovel = (x) => { g.save(); g.translate(x, ground); g.rotate(-0.1); g.fillStyle = '#7a4f24'; g.fillRect(-P(18), -P(1250), P(36), P(1000)); g.fillStyle = '#1d1d1d'; g.fillRect(-P(70), -P(1300), P(140), P(60)); g.fillStyle = '#4b5258'; g.beginPath(); g.moveTo(-P(130), -P(250)); g.lineTo(P(130), -P(250)); g.lineTo(P(110), 0); g.lineTo(0, P(40)); g.lineTo(-P(110), 0); g.closePath(); g.fill(); g.restore(); };
    const cone = (x) => { const h = P(750), w = P(380); g.fillStyle = '#ef6b16'; g.beginPath(); g.moveTo(x - w * 0.18, ground - h); g.lineTo(x + w * 0.18, ground - h); g.lineTo(x + w * 0.42, ground - P(40)); g.lineTo(x - w * 0.42, ground - P(40)); g.closePath(); g.fill(); g.fillStyle = '#f2f2ee'; g.fillRect(x - w * 0.3, ground - h * 0.55, w * 0.6, P(90)); g.fillStyle = '#2b2b2b'; g.fillRect(x - w / 2, ground - P(40), w, P(40)); };
    g.fillStyle = '#8a8680'; g.fillRect(-900, 1130, 2600, 34); g.fillStyle = pat('noise'); g.fillRect(-900, 1130, 2600, 34);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-900, 1162, 2600, 4);
    void can; void shovel; void cone;   // the operator himself is the size reference now
    void rh;
  }
  // ---------- vibrating feeder: pan with side plate, grizzly bars at the mouth end, springs and exciter ----------
  function drawFeeder(sim, time, front) {
    const G = Machine.G, F = G.FEED, mm = sim.mmpx, v = sim.m.feedV || 0, P = (x) => x / mm;
    const amp = v > 0 ? 1.6 : 0, j = Math.sin(time * TAU * 16) * amp, jx = Math.cos(time * TAU * 16) * amp * 0.6;   // ~16 Hz throw
    const at = (k) => ({ x: F.x0 + (F.x1 - F.x0) * k + jx, y: F.y0 + (F.y1 - F.y0) * k + j });
    const A = at(0), B = at(1);
    if (!front) {
      // far side plate and the deck (liner plate)
      ctx.fillStyle = '#4a4f54'; ctx.beginPath(); ctx.moveTo(A.x, A.y - P(260)); ctx.lineTo(B.x, B.y - P(260)); ctx.lineTo(B.x, B.y + 26); ctx.lineTo(A.x, A.y + 26); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.18)'; for (let k = 0.08; k < 1; k += 0.12) { const q = at(k); ctx.fillRect(q.x, q.y - P(260), 3, P(260)); }
      ctx.fillStyle = '#6b6e70'; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(B.x, B.y + 10); ctx.lineTo(A.x, A.y + 10); ctx.closePath(); ctx.fill();
      // grizzly: bars with gaps at the discharge end
      ctx.fillStyle = '#26282a'; for (let k = 0.015; k < 0.26; k += 0.035) { const q = at(k); ctx.fillRect(q.x, q.y, 10, 26); }
      return;
    }
    // near side: low side skirt so the stones stay in view, springs on the supports, the exciter motor
    ctx.fillStyle = '#d29a1d'; ctx.beginPath(); ctx.moveTo(A.x, A.y + 6); ctx.lineTo(B.x, B.y + 6); ctx.lineTo(B.x, B.y + 34); ctx.lineTo(A.x, A.y + 34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(A.x, A.y + 30, B.x - A.x, 4);
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(B.x - 10, B.y - P(300), 40, P(300) + 34);
    // coil springs between the pan and its brackets on the crusher frame
    for (const k of [0.12, 0.42]) {
      const q = at(k), y0 = q.y + 34, y1 = 262 - 2;
      if (y1 > y0 + 6) { ctx.strokeStyle = '#2b2c2e'; ctx.lineWidth = 5; ctx.beginPath(); for (let i = 0; i <= 6; i++) { const yy = y0 + (y1 - y0) * i / 6; ctx.lineTo(q.x + (i % 2 ? 10 : -10), yy); } ctx.stroke(); }
    }
    // exciter: two unbalanced-motor drums on the side of the pan
    const m = at(0.7); ctx.fillStyle = '#4b6e8f'; ctx.beginPath(); ctx.ellipse(m.x, m.y + 18, P(150), P(110), 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#2b4157'; ctx.beginPath(); ctx.arc(m.x, m.y + 18, P(55), 0, TAU); ctx.fill();
  }
  // ---------- stacker conveyor and the stockpile it builds through the day ----------
  function stackerGeom(sim) { return sim.stacker(); }
  // screening plant at the head of the stacker: a 3-deck vibrating screen sorts the stream into
  // three piles (0/32, 32/63, 63/120); with a cone crusher the coarse goes round through the cone
  function drawScreenPlant(sim, L, P) {
    const st = sim.stacker(), mm = sim.mmpx, Pm = (v) => v / mm, ground = 1130, h = st.head;
    const t = performance.now() / 1000, vib = Math.sin(t * 60) * Pm(4);
    const W = Pm(3000), H = Pm(1100), a = 0.21;
    const x1 = h.x + Pm(300), y1 = h.y + Pm(500) + vib;      // feed end (right, under the head)
    const ca = Math.cos(a), sa = Math.sin(a);
    const pt = (u, v) => ({ x: x1 - u * ca + v * sa * 0, y: y1 + u * sa + v });
    // legs
    ctx.strokeStyle = '#3c3e41'; ctx.lineWidth = Math.max(3, Pm(120));
    for (const u of [0.1, 0.9]) { const p = pt(W * u, H); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, ground); ctx.stroke(); }
    // box
    const A = pt(0, 0), B = pt(W, 0), C = pt(W, H), D = pt(0, H);
    ctx.fillStyle = '#c9a227'; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 2; ctx.stroke();
    // three decks
    ctx.strokeStyle = '#2a2b2d'; ctx.lineWidth = Math.max(2, Pm(40));
    for (const f of [0.28, 0.55, 0.82]) { const p = pt(0, H * f), q = pt(W, H * f); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
    // exciter motor
    ctx.fillStyle = '#3b4f63'; const m = pt(W * 0.5, -Pm(250)); ctx.fillRect(m.x - Pm(300), m.y, Pm(600), Pm(260));
    // three piles under the discharge points (sizes from today's grading)
    const D0 = sim.D, tot = Math.max(1e-6, Array.from(D0.hist).reduce((x, y) => x + y, 0));
    const fr = [D0.hist[0] + D0.hist[1] + D0.hist[2] + D0.hist[3], D0.hist[4], Array.from(D0.hist).slice(5).reduce((x, y) => x + y, 0)].map(v => v / tot);
    const tons = sim.pileT || 0, names = sim.up.kjegle || sim.up.hsi ? ['0/4–16/32', '32/63', '63/120'] : ['0/32', '32/63', '63/120'];
    const spots = [pt(W * 0.2, H), pt(W * 0.55, H), pt(W + Pm(300), H)];
    const side = (k) => { const V = tons * fr[k] / 1.6, hh = Math.min(Pm(3500), Math.cbrt(Math.max(0, V) * 3 * 0.53 / Math.PI) * 1000 / mm), r = hh / 0.73; return { r, hh }; };
    for (let k = 0; k < 2; k++) {
      const c = spots[k].x - Pm(1500) - k * Pm(2600), sz = side(k);
      // chute down to the pile
      ctx.strokeStyle = '#55585c'; ctx.lineWidth = Math.max(2, Pm(180)); ctx.beginPath(); ctx.moveTo(spots[k].x, spots[k].y); ctx.lineTo(c, ground - Math.max(sz.hh, Pm(600)) - Pm(200)); ctx.stroke();
      if (sz.r > 2) drawPile(sim, 'side' + k, c, sz.r, sz.hh, sz.r * 0.03, k ? [32, 45, 63] : (sim.up.kjegle || sim.up.hsi ? [2, 6, 16] : [2, 12, 32]), L, sim.weather && sim.weather.wet > 0.5);
      sign(c, ground, names[k]);
    }
    sign(P.cx, ground, names[2]);
    if (sim.up.kjegle) {
      // cone crusher beside the screen; the coarse stream goes through it and back to the screen
      const cx = spots[0].x - Pm(5200), gy = ground;
      ctx.fillStyle = '#6a7378'; ctx.beginPath(); ctx.moveTo(cx - Pm(900), gy); ctx.lineTo(cx - Pm(700), gy - Pm(1900)); ctx.lineTo(cx + Pm(700), gy - Pm(1900)); ctx.lineTo(cx + Pm(900), gy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4c5458'; ctx.beginPath(); ctx.moveTo(cx - Pm(500), gy - Pm(1900)); ctx.lineTo(cx, gy - Pm(2500)); ctx.lineTo(cx + Pm(500), gy - Pm(1900)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2b2c2e'; ctx.lineWidth = Math.max(2, Pm(200)); ctx.beginPath(); ctx.moveTo(cx + Pm(400), gy - Pm(2400)); ctx.lineTo(spots[1].x, spots[1].y); ctx.stroke();
      sign(cx, gy - Pm(2700), 'CONE');
    }
    if (sim.up.hsi && !sim.up.kjegle) {
      // horizontal shaft impactor: a boxy housing with the rotor and blow bars behind an inspection door
      const cx = spots[0].x - Pm(5200), gy = ground, w = Pm(2600), hh = Pm(2300);
      ctx.fillStyle = '#3a3e42'; ctx.fillRect(cx - w / 2 - Pm(200), gy - Pm(700), w + Pm(400), Pm(700));
      const hg = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0); hg.addColorStop(0, '#d9a62a'); hg.addColorStop(0.5, '#e9b83c'); hg.addColorStop(1, '#a87a12');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(cx - w / 2, gy - Pm(700)); ctx.lineTo(cx - w / 2, gy - hh); ctx.lineTo(cx + w * 0.2, gy - hh - Pm(500)); ctx.lineTo(cx + w / 2, gy - hh); ctx.lineTo(cx + w / 2, gy - Pm(700)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a2b2d'; ctx.beginPath(); ctx.arc(cx, gy - Pm(1450), Pm(600), 0, TAU); ctx.fill();
      const t = performance.now() / 1000; ctx.strokeStyle = '#8d9196'; ctx.lineWidth = Math.max(1.5, Pm(90));
      for (let k = 0; k < 4; k++) { const a = t * 9 + k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * Pm(200), gy - Pm(1450) + Math.sin(a) * Pm(200)); ctx.lineTo(cx + Math.cos(a) * Pm(560), gy - Pm(1450) + Math.sin(a) * Pm(560)); ctx.stroke(); }
      ctx.strokeStyle = '#2b2c2e'; ctx.lineWidth = Math.max(2, Pm(200)); ctx.beginPath(); ctx.moveTo(cx + w * 0.2, gy - hh - Pm(400)); ctx.lineTo(spots[1].x, spots[1].y); ctx.stroke();
      sign(cx, gy - hh - Pm(700), 'IMPACTOR');
    }
    if (sim.up.vsi) {
      // vertical shaft impactor: a drum on a stand with the motor beside it, making sand from the fines
      const cx = spots[0].x - Pm(8600), gy = ground;
      ctx.fillStyle = '#3a3e42'; ctx.fillRect(cx - Pm(900), gy - Pm(1600), Pm(120), Pm(1600)); ctx.fillRect(cx + Pm(780), gy - Pm(1600), Pm(120), Pm(1600));
      const dg = ctx.createLinearGradient(cx - Pm(800), 0, cx + Pm(800), 0); dg.addColorStop(0, '#5b6670'); dg.addColorStop(0.4, '#8a96a0'); dg.addColorStop(1, '#3e474f');
      ctx.fillStyle = dg; ctx.fillRect(cx - Pm(800), gy - Pm(3300), Pm(1600), Pm(1700));
      ctx.beginPath(); ctx.moveTo(cx - Pm(800), gy - Pm(3300)); ctx.lineTo(cx - Pm(250), gy - Pm(3800)); ctx.lineTo(cx + Pm(250), gy - Pm(3800)); ctx.lineTo(cx + Pm(800), gy - Pm(3300)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a2b2d'; ctx.fillRect(cx - Pm(120), gy - Pm(4400), Pm(240), Pm(650));
      ctx.fillStyle = '#4b6e8f'; ctx.fillRect(cx + Pm(900), gy - Pm(2600), Pm(900), Pm(700));
      sign(cx, gy - Pm(4600), 'VSI SAND');
    }
    // the stream off the head now falls into the screen, not onto the pile
    void L;
  }
  function sign(x, gy, txt) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const m = ctx.getTransform ? null : null; void m;
    ctx.restore();
    // a small board on a post, drawn in world units but kept readable
    const s = 1 / Math.max(0.05, view.camZ || 0.2);
    const w = Math.max(46, txt.length * 9) * s * 0.5, hgt = 20 * s * 0.5;
    ctx.fillStyle = '#3a3c3f'; ctx.fillRect(x - 2 * s * 0.5, gy - hgt * 3.2, 4 * s * 0.5, hgt * 3.2);
    ctx.fillStyle = '#f1ece2'; ctx.fillRect(x - w / 2, gy - hgt * 3.2 - hgt, w, hgt);
    ctx.fillStyle = '#1b1c1e'; ctx.font = `700 ${14 * s * 0.5}px "Barlow Condensed", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, gy - hgt * 3.7);
  }
  // ---------- stockpiles ----------
  // A heap of crushed rock: a seamless tile of packed stones at true size (prefiltered for distance),
  // clipped to a profile at the angle of repose with a flared toe and a soft crest; lit from the sun's
  // side, damp and dark at the base, with avalanche streaks, the big stones rolled down to the toe,
  // a contact shadow and a few strays on the ground.
  const aggTiles = {};
  function aggTile(sz, col, soil) {
    const ck = sz.join(',') + '|' + col.map(v => (v / 6 | 0) * 6).join(',') + (soil ? 's' : '');
    if (aggTiles[ck]) return aggTiles[ck];
    const n = 512, T = Math.max(sz[1] * 12, soil ? 500 : 700), c = off(n, n), g = c.getContext('2d'), N = makeNoise(sz[1] * 31 + 7);
    const base = soil ? col : mixc(col, [0, 0, 0], 0.18);
    g.fillStyle = rgb(mixc(base, [0, 0, 0], 0.35)); g.fillRect(0, 0, n, n);
    if (!soil) { const id = g.createImageData(n, n), bc = mixc(base, [0, 0, 0], 0.25); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const f = N.fbm(x / 23, y / 23, 3), h = N.h(x * 7, y * 3), l = 0.7 + f * 0.45 + (h - 0.5) * 0.35, o = (y * n + x) * 4; id.data[o] = bc[0] * l; id.data[o + 1] = bc[1] * l; id.data[o + 2] = bc[2] * l; id.data[o + 3] = 255; } g.putImageData(id, 0, 0); }
    if (soil) { const id = g.createImageData(n, n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const f = N.fbm(x / 40, y / 40, 4), h = N.h(x * 5, y * 3), l = 0.75 + f * 0.4 + (h - 0.5) * 0.18, o = (y * n + x) * 4; id.data[o] = col[0] * l; id.data[o + 1] = col[1] * l; id.data[o + 2] = col[2] * l; id.data[o + 3] = 255; } g.putImageData(id, 0, 0); }
    // stones: packed until the tile is covered about twice over; drawn with wrap-around so it tiles
    const count = Math.min(5000, Math.round((soil ? 0.6 : 1.3) * Math.pow(n / (sz[1] / T * n), 2)));
    for (let i = 0; i < count; i++) {
      let d = sz[0] + (sz[1] - sz[0]) * Math.pow(N.r(), 0.9); if (N.r() < 0.06) d = sz[1] + (sz[2] - sz[1]) * Math.pow(N.r(), 2);
      if (soil && N.r() < 0.7) d *= 0.4;
      const r = Math.min(n * 0.3, d / T * n / 2); if (r < 0.7) continue;
      const x = N.r() * n, y = N.r() * n, tone = mixc(soil ? mixc(col, [150, 140, 128], 0.5) : col, N.r() < 0.5 ? [255, 255, 255] : [0, 0, 0], N.r() * 0.22);
      const nv = 5 + (N.r() * 4 | 0), a0 = N.r() * TAU, pts = []; for (let j = 0; j < nv; j++) { const a = a0 + j / nv * TAU, rr = r * (0.68 + N.r() * 0.5); pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.85]); }
      for (const ox of [0, -n, n]) for (const oy of [0, -n, n]) {
        const X = x + ox, Y = y + oy; if (X < -r * 2 || X > n + r * 2 || Y < -r * 2 || Y > n + r * 2) continue;
        // shadow under the stone, the stone, then a sky-lit top
        g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); pts.forEach(([px, py], j) => j ? g.lineTo(X + px * 1.05 + r * 0.12, Y + py + r * 0.22) : g.moveTo(X + px * 1.05 + r * 0.12, Y + py + r * 0.22)); g.closePath(); g.fill();
        const la = -1.9 + (N.r() - 0.5) * 1.6, gr = g.createLinearGradient(X + Math.cos(la) * r, Y + Math.sin(la) * r, X - Math.cos(la) * r, Y - Math.sin(la) * r), li = 0.12 + N.r() * 0.25; gr.addColorStop(0, rgb(mixc(tone, [255, 255, 255], li))); gr.addColorStop(0.5, rgb(tone)); gr.addColorStop(1, rgb(mixc(tone, [0, 0, 0], 0.15 + N.r() * 0.25)));
        g.fillStyle = gr; g.beginPath(); pts.forEach(([px, py], j) => j ? g.lineTo(X + px, Y + py) : g.moveTo(X + px, Y + py)); g.closePath(); g.fill();
        if (r > 3) { g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = Math.max(0.6, r * 0.08); g.beginPath(); g.moveTo(X + pts[0][0] * 0.6, Y - r * 0.55); g.lineTo(X + pts[1][0] * 0.6, Y - r * 0.6); g.stroke(); }
      }
    }
    // prefiltered copies for distance (a pattern does not mipmap)
    const mips = [c]; let prev = c; for (const m of [128, 32]) { const q = off(m, m), qg = q.getContext('2d'); qg.imageSmoothingQuality = 'high'; qg.drawImage(prev, 0, 0, m, m); mips.push(q); prev = q; }
    return (aggTiles[ck] = { mips, T });
  }
  function pileColor(sim) {
    let t = 0, c = [0, 0, 0]; const bm = sim.D.byMat || {};
    for (const k in bm) { const m = MATS[k]; if (!m || m.steel || m.soil) continue; const w = bm[k]; const col = mixc(m.base, m.fresh, 0.55); c = [c[0] + col[0] * w, c[1] + col[1] * w, c[2] + col[2] * w]; t += w; }
    return t > 0 ? c.map(v => v / t) : [160, 156, 148];
  }
  const pileEdge = {};
  // sz: [smallest, typical, biggest] stone in mm
  function drawPile(sim, id, cx, R, Hh, top, sz, L, wet, colIn) {
    if (R < 2 || Hh < 1) return;
    const ground = 1130, mm = sim.mmpx, Z = view.camZ || 0.3, soil = !!colIn;
    let col = colIn || pileColor(sim); if (wet) col = mixc(col, [38, 36, 34], 0.3);
    const toe = R * 0.1;
    const prof = (d) => { d = Math.abs(d); if (d >= R) return 0; if (d <= top) return Hh; const u = (R - d) / Math.max(1, R - top); let h = Hh * u; const tz = toe * 2.2; if (R - d < tz) h *= 0.78 + 0.22 * (R - d) / tz; if (u > 0.9) h -= Hh * 0.035 * (u - 0.9) / 0.1; return h; };
    // a ragged outline at the scale of the stones (fixed per pile so it does not crawl)
    let E = pileEdge[id]; if (!E) { E = pileEdge[id] = []; const N = makeNoise(id.length * 131 + 5); for (let i = 0; i <= 160; i++) E.push(N.fbm(i * 0.22, 3, 3) - 0.5); }
    const jit = Math.min(sz[1] * 1.4 / mm, Hh * 0.025);
    const path = () => { ctx.beginPath(); ctx.moveTo(cx - R - toe * 0.4, ground); for (let i = 0; i <= 160; i++) { const x = -R + 2 * R * i / 160, h = prof(x); ctx.lineTo(cx + x, ground - Math.max(0, h + (h > 0 ? E[i] * jit * 2 : 0))); } ctx.lineTo(cx + R + toe * 0.4, ground); ctx.closePath(); };
    // contact shadow
    ctx.save(); ctx.translate(cx, ground); ctx.scale(1, 0.1); const sg = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.25); sg.addColorStop(0, 'rgba(14,12,10,.38)'); sg.addColorStop(1, 'rgba(14,12,10,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, R * 1.25, 0, TAU); ctx.fill(); ctx.restore();
    path(); ctx.save(); ctx.clip();
    // aggregate texture at true size
    const A = aggTile(sz, col, soil), tileW = A.T / mm, scr = tileW * Z * RS;   // world px per tile, screen px per tile
    const mip = scr > 300 ? 0 : scr > 70 ? 1 : 2, img = A.mips[mip], k = tileW / img.width;
    const pt = ctx.createPattern(img, 'repeat'); pt.setTransform(new DOMMatrix([k, 0, 0, k, cx, ground]));
    ctx.fillStyle = pt; ctx.fillRect(cx - R - toe, ground - Hh - jit * 3, 2 * (R + toe), Hh + jit * 3 + 2);
    // large-scale tone variation so the tile does not read as a repeat
    { const q = ctx.createPattern(tex.rockgrain, 'repeat'), kk = tileW * 3.7 / 256; q.setTransform(new DOMMatrix([kk, 0, 0, kk * 0.8, cx + tileW * 0.37, ground])); ctx.globalAlpha = 0.16; ctx.fillStyle = q; ctx.fillRect(cx - R - toe, ground - Hh - jit * 3, 2 * (R + toe), Hh + jit * 3 + 2); ctx.globalAlpha = 1; }
    // light: the face towards the sun bright, the far face in shadow; damp dark base; sky light on top
    const lit = L.lx < 0 ? -1 : 1, c = L.contrast;
    const hor = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    const B = `rgba(255,248,236,${0.22 * c})`, D = `rgba(16,18,26,${0.5 * c + 0.12})`, M = 'rgba(0,0,0,0)';
    if (lit < 0) { hor.addColorStop(0, B); hor.addColorStop(0.42, M); hor.addColorStop(0.56, `rgba(16,18,26,${0.2 * c})`); hor.addColorStop(1, D); }
    else { hor.addColorStop(0, D); hor.addColorStop(0.44, `rgba(16,18,26,${0.2 * c})`); hor.addColorStop(0.58, M); hor.addColorStop(1, B); }
    ctx.fillStyle = hor; ctx.fillRect(cx - R - toe, ground - Hh - jit * 3, 2 * (R + toe), Hh + jit * 3 + 2);
    const ver = ctx.createLinearGradient(0, ground - Hh, 0, ground); ver.addColorStop(0, 'rgba(255,255,255,.1)'); ver.addColorStop(0.25, 'rgba(0,0,0,0)'); ver.addColorStop(0.8, 'rgba(0,0,0,0)'); ver.addColorStop(1, wet ? 'rgba(18,14,10,.45)' : 'rgba(30,24,18,.3)');
    ctx.fillStyle = ver; ctx.fillRect(cx - R - toe, ground - Hh - jit * 3, 2 * (R + toe), Hh + jit * 3 + 2);
    // avalanche streaks down the flanks (fixed per pile)
    const Nn = makeNoise(id.length * 17 + 3);
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1, d0 = top + (R - top) * Nn.r() * 0.8, x0 = cx + side * d0, y0 = ground - prof(d0), len = (R - d0) * (0.35 + Nn.r() * 0.6);
      ctx.strokeStyle = Nn.r() < 0.55 ? `rgba(0,0,0,${0.07 + Nn.r() * 0.08})` : `rgba(255,255,255,${0.05 + Nn.r() * 0.06})`;
      ctx.lineWidth = Math.max(1 / Z, (1 + Nn.r() * 4) * sz[1] / mm); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + side * len, y0 + len * Hh / Math.max(1, R - top)); ctx.stroke();
    }
    ctx.restore();
    // the big stones that rolled to the toe, and strays on the ground
    const big = sz[2] / mm; if (big * Z * RS > 1.2) {
      for (let i = 0; i < 46; i++) {
        const side = i % 2 ? 1 : -1, u = Nn.r(), d = R - toe * (u * 3.2 - 0.8), x = cx + side * d, r = big * (0.35 + Nn.r() * 0.55) / 2, y = ground - Math.max(0, prof(d)) * (0.2 + Nn.r() * 0.6) - r * 0.7;
        const tone = mixc(col, Nn.r() < 0.5 ? [255, 255, 255] : [0, 0, 0], Nn.r() * 0.2), gr = ctx.createLinearGradient(x, y - r, x, y + r); gr.addColorStop(0, rgb(mixc(tone, [255, 255, 255], 0.25))); gr.addColorStop(1, rgb(mixc(tone, [0, 0, 0], 0.35)));
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x + r * 0.15, y + r * 0.55, r * 1.05, r * 0.35, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = gr; ctx.beginPath(); const nv = 6, a0 = Nn.r() * 6; for (let j = 0; j < nv; j++) { const a = a0 + j / nv * TAU, rr = r * (0.75 + Nn.r() * 0.35); ctx[j ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8); } ctx.closePath(); ctx.fill();
      }
    }
    path(); ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = Math.max(0.8 / Z, 1); ctx.stroke();
  }
  function drawStacker(sim, L) {
    const P = sim.pileShape(), css = sim.save.css || 80;
    const wet = sim.weather && sim.weather.wet > 0.5;
    // without a screen it is an all-in crusher run: fines with stones up to the top size; with one, this pile is the 63/120
    if (P.stock && P.stock.R > 2) {
      // the stock heap is the loader's work: a row of tipped heaps, each a cone at the angle of repose
      const S = P.stock, rc = S.H / Math.tan(36 * Math.PI / 180), n = clamp(Math.round(S.R / (rc * 0.7)), 1, 4);
      for (let i = n - 1; i >= 0; i--) { const x = S.cx + S.R - rc - (n > 1 ? i * (2 * S.R - 2 * rc) / (n - 1) : S.R - rc), hh = S.H * (0.82 + 0.18 * ((i * 7 + 3) % 5) / 4); drawPile(sim, 'stock' + i, x, hh / Math.tan(36 * Math.PI / 180), hh, hh * 0.05, sim.up.sikt ? [63, 90, 120] : [4, 22, Math.round(css * 1.45)], L, wet); }
    }
    drawPile(sim, 'main', P.cx, P.R, P.H, Math.max(P.top, P.R * 0.03), sim.up.sikt ? [63, 90, 120] : [4, 22, Math.round(css * 1.45)], L, wet);
    if (sim.up.sikt) drawScreenPlant(sim, L, P);
    if (sim.up.scalper) drawScalper(sim, L);
  }
  // scalper: a chute out of the side of the frame, and the heap of soil and fines under it
  function drawScalper(sim, L) {
    const F = sim.fillShape(), ground = 1130;
    const tg = ctx.createLinearGradient(0, 820, 0, 900); tg.addColorStop(0, '#6a6e72'); tg.addColorStop(1, '#34373a');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(1090, 820); ctx.lineTo(1190, 870); ctx.lineTo(1190, 900); ctx.lineTo(1090, 862); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e9b11c'; ctx.fillRect(1090, 812, 8, 52);
    ctx.fillStyle = '#2c2e31'; ctx.fillRect(1150, 880, 10, ground - 880);
    if (F.R > 2) drawPile(sim, 'fill', F.cx, F.R, F.H, Math.max(F.top, F.R * 0.04), [1, 6, 50], L, sim.weather && sim.weather.wet > 0.5, [118, 98, 74]);
    sign(F.cx + Math.max(F.R, 120) + 40, ground, 'FILL 0/63');
  }
  // tracked chassis under a mobile crusher: two crawler tracks (the near one shows) with rollers
  function drawTracks(sim) {
    if (!sim.up.mobile) return;
    const mm = sim.mmpx, P = (v) => v / mm, gy = 1130, x0 = -700, x1 = 1100, h = P(1050), r = h / 2;
    ctx.fillStyle = '#1c1c1c'; ctx.beginPath(); ctx.moveTo(x0 + r, gy); ctx.lineTo(x1 - r, gy); ctx.arc(x1 - r, gy - r, r, Math.PI / 2, -Math.PI / 2, true); ctx.lineTo(x0 + r, gy - h); ctx.arc(x0 + r, gy - r, r, -Math.PI / 2, Math.PI / 2, true); ctx.closePath(); ctx.fill();
    const t = performance.now() / 1000 * 0;
    ctx.fillStyle = '#2e2e2e'; for (let x = x0 + r * 0.4 + (t % 1) * P(220); x < x1 - r * 0.4; x += P(220)) { ctx.fillRect(x, gy - P(90), P(150), P(90)); ctx.fillRect(x, gy - h, P(150), P(80)); }
    const fg = ctx.createLinearGradient(0, gy - h * 0.85, 0, gy - h * 0.15); fg.addColorStop(0, '#d9a62a'); fg.addColorStop(1, '#8a6410');
    ctx.fillStyle = fg; ctx.fillRect(x0 + r * 0.7, gy - h * 0.82, x1 - x0 - r * 1.4, h * 0.64);
    for (let i = 0; i < 7; i++) { const x = x0 + r + (x1 - x0 - 2 * r) * i / 6; ctx.fillStyle = '#3b3e42'; ctx.beginPath(); ctx.arc(x, gy - P(260), P(170), 0, TAU); ctx.fill(); ctx.fillStyle = '#6b6f73'; ctx.beginPath(); ctx.arc(x, gy - P(260), P(70), 0, TAU); ctx.fill(); }
    for (const x of [x0 + r, x1 - r]) { ctx.fillStyle = '#3b3e42'; ctx.beginPath(); ctx.arc(x, gy - r, r * 0.78, 0, TAU); ctx.fill(); ctx.fillStyle = '#6b6f73'; ctx.beginPath(); ctx.arc(x, gy - r, r * 0.3, 0, TAU); ctx.fill(); }
    const md = ctx.createLinearGradient(0, gy - h, 0, gy); md.addColorStop(0, 'rgba(120,104,84,0)'); md.addColorStop(1, 'rgba(120,104,84,.55)'); ctx.fillStyle = md; ctx.fillRect(x0, gy - h, x1 - x0, h);
  }
  // operator platform on the left side of the mouth (over the flywheel side), with railing and the scrap skip
  function drawPlatform(sim) {
    const G = Machine.G, mm = sim.mmpx, y = G.PLAT_L, rh = 1000 / mm;
    // guard plate on the rim over the flywheel and eccentric shaft (dented by blows, or torn off)
    const hp = sim.save.guard ?? 1;
    if (sim.m.guard) {
      const gr = ctx.createLinearGradient(-62, 0, -18, 0); gr.addColorStop(0, '#5d6266'); gr.addColorStop(0.5, '#8a8f93'); gr.addColorStop(1, '#4b5054');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(-62, -170); ctx.lineTo(-18, -150); ctx.lineTo(-18, 160); ctx.lineTo(-62, 160); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.clip();
      for (let i = -2; i < 34; i++) { ctx.fillStyle = (i & 1) ? '#1b1b1b' : '#e9b11c'; ctx.beginPath(); ctx.moveTo(-70, -170 + i * 10); ctx.lineTo(-10, -190 + i * 10); ctx.lineTo(-10, -180 + i * 10); ctx.lineTo(-70, -160 + i * 10); ctx.closePath(); if (i < 3) ctx.fill(); }
      // dents and scrapes grow as the plate takes blows
      const n = Math.round((1 - hp) * 14);
      for (let i = 0; i < n; i++) { const yy = -150 + ((i * 97) % 290), r = 6 + (i * 7) % 9; ctx.fillStyle = 'rgba(20,18,16,.45)'; ctx.beginPath(); ctx.ellipse(-36 + ((i * 13) % 14) - 7, yy, r * 0.6, r, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-46, yy - r, 12, 2); }
      if (hp < 0.35) { ctx.strokeStyle = 'rgba(15,12,10,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-60, -120); ctx.lineTo(-38, -60); ctx.lineTo(-50, 10); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2; ctx.strokeRect(-62, -170, 44, 330);
      for (const by of [-120, 0, 120]) bolt(ctx, -40, by, 4);
    } else {
      // torn stump
      ctx.fillStyle = '#55595d'; ctx.beginPath(); ctx.moveTo(-60, 160); ctx.lineTo(-60, 125); ctx.lineTo(-50, 132); ctx.lineTo(-42, 118); ctx.lineTo(-32, 130); ctx.lineTo(-20, 121); ctx.lineTo(-20, 160); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = pat('grate'); ctx.fillRect(-760, y, 720, 14);
    ctx.fillStyle = '#2b2c2e'; ctx.fillRect(-760, y + 14, 720, 7);
    ctx.fillStyle = '#e9b11c'; ctx.fillRect(-60, y - 4, 22, 22);
    ctx.strokeStyle = '#e1a31c'; ctx.lineWidth = Math.max(4, 40 / mm); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-755, y); ctx.lineTo(-755, y - rh); ctx.lineTo(-610, y - rh); ctx.moveTo(-755, y - rh * 0.5); ctx.lineTo(-610, y - rh * 0.5); ctx.stroke();
    // scrap skip: steel levered out over the lip goes in here
    const sx0 = -740, sw = 120, sh = Math.min(380 / mm, 160);
    ctx.fillStyle = '#8e2f1f'; ctx.beginPath(); ctx.moveTo(sx0, y - sh); ctx.lineTo(sx0 + sw, y - sh); ctx.lineTo(sx0 + sw - 10, y); ctx.lineTo(sx0 + 10, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(sx0, y - sh, sw, 8);
    ctx.fillStyle = '#e8dccb'; ctx.font = `700 ${Math.max(12, 90 / mm)}px "Barlow Condensed", "Arial Narrow", sans-serif`; ctx.textAlign = 'center'; ctx.fillText('SCRAP', sx0 + sw / 2, y - sh * 0.4);
  }
  // ---------- the operator, at true size, side view facing the mouth (right) ----------
  // On the small crusher you see his boots and legs, as in the films; on the big ones the whole man.
  function workerX(sim, opt) { return opt.sledge && opt.sledge.tg ? sim.workerPos(opt.sledge.x).x : (opt.workerX ?? -260); }
  const mmP = (sim) => (v) => v / sim.mmpx;
  // body pose: hip and shoulder for a forward lean α (rad) about the hips and a hip drop (knees bending)
  function bodyPose(sim, wx, lean, drop) {
    const P = mmP(sim), fy = Machine.G.PLAT_L;
    const hip = { x: wx + P(30), y: fy - P(930) + P(drop) };
    const tl = P(500), a = lean;   // hip → shoulder length and lean (positive = forward/right)
    const S = { x: hip.x + Math.sin(a) * tl + P(40), y: hip.y - Math.cos(a) * tl };
    return { hip, S, lean: a };
  }
  // a real sledge swing: the head rests on the stone, is lifted back over the shoulder (charge),
  // comes down accelerating along an arc with the top hand sliding to the knob, bites, and recovers.
  function sledgeGeom(sim, sl) {
    // no operator is drawn: the sledge swings around a grip point up and to the left of the stone
    const P = mmP(sim), tg = sl.tg, hl = P(900);
    const u = { x: -0.42, y: -0.91 };
    const Ki = { x: tg.x + u.x * hl, y: tg.y + u.y * hl };                 // grip at impact
    const thI = Math.atan2(tg.y - Ki.y, tg.x - Ki.x);                      // grip → head
    const Kr = { x: Ki.x - P(160), y: Ki.y - P(260) };                     // grip lifted at the top of the swing
    let thR = -Math.PI / 2 - 0.75;                                          // head up and back over the grip
    while (thR > thI - Math.PI * 0.6) thR -= TAU;
    const ease = (k) => k * k * (3 - 2 * k);
    const mix = (A, B, t, bulge) => ({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t - Math.sin(t * Math.PI) * bulge });
    let K, th;
    if (sl.state === 'charge') { const k = ease(clamp(sl.charge, 0, 1)); K = mix(Ki, Kr, k, P(120)); th = thI + (thR - thI) * k; }
    else if (sl.state === 'swing') { const t = clamp(sl.t / 0.32, 0, 1), q = t * t * t; K = mix(Kr, Ki, q, P(90)); th = thR + (thI - thR) * q; }
    else { const t = clamp(sl.t / 0.55, 0, 1), bounce = Math.sin(Math.min(1, t * 2.2) * Math.PI) * 0.16 * (1 - t); K = { x: Ki.x, y: Ki.y - Math.sin(t * Math.PI) * P(30) }; th = thI - bounce; }
    const head = { x: K.x + Math.cos(th) * hl, y: K.y + Math.sin(th) * hl };
    return { K, grip2: K, th, head, lean: 0, drop: 0, ex: head.x, ey: head.y, hx: K.x, hy: K.y, a: th + Math.PI };
  }
  // two-bone IK: the joint bends towards side sgn
  function ik(ax, ay, bx, by, l1, l2, sgn) {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), dd = clamp(d, 1, l1 + l2 - 0.01);
    const a = Math.atan2(dy, dx), c = clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1), t = a + sgn * Math.acos(c);
    return { x: ax + Math.cos(t) * l1, y: ay + Math.sin(t) * l1 };
  }
  // tapered limb: joint discs plus a hull, no gaps at the joints
  function limb(a, b, wa, wb, col) {
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(a.x + nx * wa / 2, a.y + ny * wa / 2); ctx.lineTo(b.x + nx * wb / 2, b.y + ny * wb / 2); ctx.lineTo(b.x - nx * wb / 2, b.y - ny * wb / 2); ctx.lineTo(a.x - nx * wa / 2, a.y - ny * wa / 2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(a.x, a.y, wa / 2, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(b.x, b.y, wb / 2, 0, TAU); ctx.fill();
  }
  function band(a, b, t, w, len, col) {
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(x - dy / l * len / 2, y + dx / l * len / 2); ctx.lineTo(x + dy / l * len / 2, y - dx / l * len / 2); ctx.stroke();
  }
  function drawWorker(sim, opt) {
    const P = mmP(sim), fy = Machine.G.PLAT_L, time = opt.time || 0;
    const wx = workerX(sim, opt), sl = opt.sledge && opt.sledge.tg ? opt.sledge : null;
    const sg = sl ? sledgeGeom(sim, sl) : null;
    const breathe = Math.sin(time * 1.7) * 6, sway = Math.sin(time * 0.6) * 0.02;
    const bp = bodyPose(sim, wx, sg ? sg.lean : 0.04 + sway, sg ? sg.drop : 40 + breathe * 0.4);
    const hip = bp.hip, S = bp.S; S.y += P(breathe);
    const trous = '#e9671a', trousD = '#b9500f', boot = '#1e1b18', tape = 'rgba(236,236,224,.95)', jack = '#e2d020', jackD = '#b5a412', skin = '#d1a07a';
    // legs (back leg darker), knees bend forward, both feet flat on the grating
    const feet = [{ x: wx - P(200), back: true }, { x: wx + P(180), back: false }];
    for (const f of feet) {
      const ank = { x: f.x, y: fy - P(105) };
      const knee = ik(hip.x + (f.back ? -P(40) : P(40)), hip.y, ank.x, ank.y, P(455), P(445), -1);
      const H2 = { x: hip.x + (f.back ? -P(40) : P(40)), y: hip.y };
      const col = f.back ? trousD : trous;
      limb(H2, knee, P(175), P(135), col); limb(knee, ank, P(130), P(105), col);
      band(knee, ank, 0.42, P(40), P(150), tape); band(knee, ank, 0.66, P(40), P(140), tape);
      // boot: heel, sole, toe cap
      ctx.fillStyle = boot; ctx.beginPath(); ctx.moveTo(f.x - P(100), fy - P(10)); ctx.lineTo(f.x - P(95), fy - P(170)); ctx.lineTo(f.x + P(70), fy - P(185)); ctx.quadraticCurveTo(f.x + P(120), fy - P(110), f.x + P(200), fy - P(95)); ctx.quadraticCurveTo(f.x + P(265), fy - P(80), f.x + P(255), fy - P(10)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3d362c'; ctx.fillRect(f.x - P(105), fy - P(28), P(365), P(28));
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(f.x + P(120), fy - P(110), P(90), P(20));
    }
    // back arm first (behind the torso)
    const grips = sg ? [sg.K, sg.grip2] : [{ x: S.x + P(60), y: S.y + P(610) }, { x: S.x + P(110), y: S.y + P(590) }];
    const arm = (Sh, Hd, back) => {
      const el = ik(Sh.x, Sh.y, Hd.x, Hd.y, P(300), P(290), 1);
      const col = back ? jackD : jack;
      limb(Sh, el, P(125), P(105), col); limb(el, Hd, P(100), P(88), col);
      band(el, Hd, 0.85, P(30), P(95), tape);
      ctx.fillStyle = back ? '#a98a45' : '#d6af58'; ctx.beginPath(); ctx.ellipse(Hd.x, Hd.y, P(58), P(48), 0, 0, TAU); ctx.fill();
    };
    arm({ x: S.x - P(50), y: S.y + P(30) }, grips[0], true);
    // torso: jacket, tapering from shoulders to hips, reflective bands, collar
    const dxT = S.x - hip.x, dyT = S.y - hip.y, lT = Math.hypot(dxT, dyT) || 1, nx = -dyT / lT, ny = dxT / lT;
    const wS = P(200), wH = P(170);
    ctx.fillStyle = jack; ctx.beginPath();
    ctx.moveTo(hip.x + nx * wH, hip.y + ny * wH + P(90)); ctx.lineTo(S.x + nx * wS, S.y + ny * wS);
    ctx.quadraticCurveTo(S.x - dyT / lT * -P(60), S.y - P(90), S.x - nx * wS, S.y - ny * wS);
    ctx.lineTo(hip.x - nx * wH, hip.y - ny * wH + P(90)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.beginPath(); ctx.moveTo(hip.x - nx * wH, hip.y - ny * wH + P(90)); ctx.lineTo(S.x - nx * wS, S.y - ny * wS); ctx.lineTo(S.x - nx * wS * 0.3, S.y - ny * wS * 0.3); ctx.lineTo(hip.x - nx * wH * 0.3, hip.y - ny * wH * 0.3 + P(90)); ctx.closePath(); ctx.fill();
    for (const t of [0.34, 0.52]) band({ x: hip.x, y: hip.y + P(90) }, S, t, P(42), P(390), tape);
    ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.ellipse(hip.x, hip.y + P(70), P(170), P(40), Math.atan2(dyT, dxT) + Math.PI / 2, 0, TAU); ctx.fill();
    // head: neck, face turned to the stone, ear defender, helmet with brim
    const hd = { x: S.x + Math.sin(bp.lean) * P(200) + P(30), y: S.y - Math.cos(bp.lean) * P(200) };
    limb(S, hd, P(110), P(100), skin);
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(hd.x + P(15), hd.y, P(100), P(118), bp.lean * 0.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a5a3c'; ctx.beginPath(); ctx.ellipse(hd.x + P(95), hd.y + P(10), P(16), P(10), 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e04a1f'; ctx.beginPath(); ctx.ellipse(hd.x - P(15), hd.y + P(5), P(48), P(62), bp.lean, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(hd.x, hd.y - P(55)); ctx.rotate(bp.lean * 0.8);
    ctx.fillStyle = '#f5f2ea'; ctx.beginPath(); ctx.ellipse(0, 0, P(138), P(110), 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(-P(150), -P(8), P(330), P(28)); ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(-P(150), P(12), P(330), P(8));
    ctx.restore();
    // front arm over the body
    arm({ x: S.x + P(40), y: S.y + P(20) }, grips[1], false);
  }

  // ---------- tipper: tractor with tipping trailer (small plant) or a rigid dump truck ----------
  // ---------- the haul vehicles, drawn in millimetres at true size ----------
  // 0: farm tractor with a heavy dump trailer · 1: articulated dump truck (25 t) · 2: rigid haul truck (40 t)
  function drawTruck(sim, weather) {
    const Lo = sim.loader, pose = sim.trPose(Lo.busy ? Lo.t : 99), g = pose.g, sp = g.spec, mm = sim.mmpx;
    if (!Lo.busy) return;                                     // it drives off between loads
    const H = pose.H, gy = g.rampY, tl = pose.tilt, wet = weather && weather.wet > 0.5;
    const Lb = sp.L, Hb = sp.H, hy = (H.y - gy) * mm;         // hinge height above the ramp (mm, negative = up)
    const lv = sim.up.loader || 0, roll = -pose.off * mm;      // wheels turn as it drives
    const rev = Lo.t < g.T1 ? 0.7 : Lo.t < g.T2 ? 1.2 : Lo.t > g.T3 ? 0.6 : 0.15;
    const dirt = wet ? 'rgba(70,56,40,' : 'rgba(120,104,84,';
    ctx.save(); ctx.translate(H.x, gy); ctx.scale(1 / mm, 1 / mm);
    const lw = (v) => ctx.lineWidth = v;
    const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    const poly = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); };
    const lin = (x0, y0, x1, y1, stops) => { const gr = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([t, c]) => gr.addColorStop(t, c)); return gr; };
    // a tyre with lugs, a dished steel rim and wheel nuts; mud on the lower half
    const tyre = (x, r, rimCol, lug = 'chevron') => {
      const cy = -r;
      ctx.fillStyle = '#121212'; ctx.beginPath(); ctx.arc(x, cy, r, 0, TAU); ctx.fill();
      const sw = ctx.createRadialGradient(x - r * 0.25, cy - r * 0.3, r * 0.2, x, cy, r); sw.addColorStop(0, '#3a3a3a'); sw.addColorStop(0.75, '#1c1c1c'); sw.addColorStop(1, '#0c0c0c');
      ctx.fillStyle = sw; ctx.beginPath(); ctx.arc(x, cy, r * 0.94, 0, TAU); ctx.fill();
      // tread lugs round the rim
      const n = lug === 'chevron' ? 22 : 30, a0 = roll / r;
      ctx.fillStyle = '#0a0a0a'; ctx.beginPath();
      for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU, w = (lug === 'chevron' ? 0.13 : 0.08) * TAU / 6, r0 = r * 0.9, r1 = r * 1.02, sk = lug === 'chevron' ? 0.09 : 0;
        ctx.moveTo(x + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a + sk) * r1, cy + Math.sin(a + sk) * r1); ctx.lineTo(x + Math.cos(a + sk + w) * r1, cy + Math.sin(a + sk + w) * r1); ctx.lineTo(x + Math.cos(a + w) * r0, cy + Math.sin(a + w) * r0); ctx.closePath(); }
      ctx.fill();
      // rim
      const rr = r * (lug === 'chevron' ? 0.52 : 0.58);
      const rg = ctx.createRadialGradient(x - rr * 0.3, cy - rr * 0.35, rr * 0.1, x, cy, rr); rg.addColorStop(0, rgb(mixc(rimCol, [255, 255, 255], 0.35))); rg.addColorStop(0.7, rgb(rimCol)); rg.addColorStop(1, rgb(mixc(rimCol, [0, 0, 0], 0.45)));
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, cy, rr, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; lw(rr * 0.05); ctx.beginPath(); ctx.arc(x, cy, rr * 0.78, 0, TAU); ctx.stroke();
      ctx.fillStyle = rgb(mixc(rimCol, [0, 0, 0], 0.35)); ctx.beginPath(); ctx.arc(x, cy, rr * 0.36, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c9c9c4'; for (let i = 0; i < 8; i++) { const a = a0 + i / 8 * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr * 0.5, cy + Math.sin(a) * rr * 0.5, rr * 0.05, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(x, cy, rr * 0.16, 0, TAU); ctx.fill();
      // mud and dust caked on the bottom half
      const md = ctx.createLinearGradient(0, cy, 0, 0); md.addColorStop(0, dirt + '0)'); md.addColorStop(1, dirt + '.55)');
      ctx.fillStyle = md; ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI); ctx.fill();
    };
    // grime: a dusty wash rising from the bottom of a box
    const grime = (x, y0, w, y1, a = 0.45) => { const gr = ctx.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, dirt + '0)'); gr.addColorStop(1, dirt + a + ')'); ctx.fillStyle = gr; ctx.fillRect(x, y0, w, y1 - y0); };
    const glass = (pts) => { const ys = pts.map(p => p[1]), xs = pts.map(p => p[0]); const gr = ctx.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)); gr.addColorStop(0, 'rgba(176,206,222,.92)'); gr.addColorStop(0.45, 'rgba(92,124,146,.9)'); gr.addColorStop(0.5, 'rgba(210,228,236,.9)'); gr.addColorStop(0.56, 'rgba(84,112,132,.92)'); gr.addColorStop(1, 'rgba(48,64,78,.95)'); poly(pts, gr); };
    const beacon = (x, y) => { const on = (performance.now() / 300 | 0) % 2; rect(x - 90, y - 140, 180, 140, on ? '#ffb020' : '#c77a10'); if (on) { const bg = ctx.createRadialGradient(x, y - 70, 0, x, y - 70, 700); bg.addColorStop(0, 'rgba(255,170,40,.35)'); bg.addColorStop(1, 'rgba(255,170,40,0)'); ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y - 70, 700, 0, TAU); ctx.fill(); } };
    let exX = 0, exY = 0;
    const frameY = hy + 120;
    if (lv === 0) {
      // ---- dump trailer: box-section chassis, tandem bogie on flotation tyres, drawbar to the tractor hitch
      const R = sp.wheel;
      poly([[-150, frameY], [Lb + 200, frameY], [Lb + 200, frameY + 200], [-150, frameY + 200]], lin(0, frameY, 0, frameY + 200, [[0, '#3a3a38'], [1, '#1c1c1b']]));
      poly([[Lb + 150, frameY + 40], [Lb + 1150, frameY + 120], [Lb + 1150, frameY + 190], [Lb + 150, frameY + 170]], '#252524');
      rect(700, frameY + 180, 1700, 160, '#2a2a29');   // bogie beam
      rect(650, frameY + 140, 240, 260, '#333'); // spring hanger
      tyre(900, R, [176, 40, 30]); tyre(900 + R * 2.2, R, [176, 40, 30]);
      // mudguards
      for (const x of [900, 900 + R * 2.2]) { ctx.strokeStyle = '#222'; lw(60); ctx.beginPath(); ctx.arc(x, -R, R * 1.08, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); }
      // ---- tractor
      const tx = Lb + 1050, Rr = 780, Rf = 500, body = [44, 82, 60], bodyL = [70, 118, 88], bodyD = [28, 52, 38];
      // chassis, engine block, fuel tank, steps
      rect(tx - 300, -1450, 3200, 420, '#1f1f1f');
      poly([[tx - 250, -1500], [tx + 2950, -1500], [tx + 2950, -1050], [tx - 250, -1050]], '#262626');
      // bonnet: long, sloping to a grille at the front
      poly([[tx + 700, -2050], [tx + 2650, -1980], [tx + 2950, -1850], [tx + 2980, -1200], [tx + 700, -1200]], lin(0, -2050, 0, -1200, [[0, rgb(bodyL)], [0.3, rgb(body)], [1, rgb(bodyD)]]));
      rect(tx + 2850, -1820, 120, 560, '#1a1a1a'); for (let y = -1800; y < -1290; y += 70) rect(tx + 2860, y, 100, 30, '#3c3c3c');   // grille
      rect(tx + 900, -1700, 1600, 30, 'rgba(0,0,0,.35)'); for (let x = tx + 1100; x < tx + 2500; x += 180) rect(x, -1640, 90, 260, 'rgba(0,0,0,.28)');   // vents
      rect(tx + 2700, -1950, 220, 90, '#e8e4d0');   // headlight
      // cab: four pillars, big glass, roof with a beacon
      const cb0 = tx - 350, cb1 = tx + 800, roofY = -2950;
      poly([[cb0, -1200], [cb1 + 80, -1200], [cb1 + 80, -2050], [cb1 - 20, roofY + 120], [cb0 + 60, roofY + 120], [cb0, -2100]], rgb(bodyD));
      glass([[cb0 + 90, -2080], [cb1 - 20, -2080], [cb1 - 80, roofY + 190], [cb0 + 140, roofY + 190]]);
      rect(cb0 + 520, roofY + 160, 70, 1590, '#141414');   // door post
      poly([[cb0 - 80, roofY + 140], [cb1 + 160, roofY + 140], [cb1 + 120, roofY], [cb0 - 40, roofY]], lin(0, roofY, 0, roofY + 140, [[0, rgb(bodyL)], [1, rgb(bodyD)]]));
      beacon(cb0 + 500, roofY);
      rect(cb1 + 120, roofY + 220, 40, 600, '#1a1a1a'); rect(cb1 + 160, roofY + 260, 160, 220, '#222');   // mirror
      // exhaust stack beside the cab
      rect(cb1 + 260, -2500, 110, 1300, '#2b2b2b'); rect(cb1 + 240, -2560, 150, 80, '#3a3a3a'); exX = cb1 + 315; exY = -2560;
      // rear fender over the big wheel
      tyre(tx + 200, Rr, [196, 160, 40]); tyre(tx + 2350, Rf, [196, 160, 40]);
      ctx.strokeStyle = rgb(body); lw(150); ctx.beginPath(); ctx.arc(tx + 200, -Rr, Rr * 1.07, Math.PI * 1.05, Math.PI * 1.85); ctx.stroke();
      ctx.strokeStyle = rgb(bodyD); lw(110); ctx.beginPath(); ctx.arc(tx + 2350, -Rf, Rf * 1.15, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      rect(cb0 + 100, -1250, 300, 60, '#1a1a1a'); rect(cb0 + 100, -1000, 300, 50, '#1a1a1a');   // steps
      grime(tx - 400, -1500, 3400, -1050, 0.5);
    } else if (lv === 1) {
      // ---- articulated dump truck: rear unit with a tandem bogie, front unit with the cab and engine
      const R = sp.wheel, Y = [222, 168, 36], YL = [246, 200, 80], YD = [168, 120, 18];
      poly([[-200, frameY], [Lb + 400, frameY], [Lb + 400, frameY + 260], [-200, frameY + 260]], lin(0, frameY, 0, frameY + 260, [[0, '#3a3a38'], [1, '#1a1a1a']]));
      rect(600, frameY + 220, R * 2.2 + 600, 200, '#262626');
      tyre(900, R, [210, 160, 34], 'block'); tyre(900 + R * 2.25, R, [210, 160, 34], 'block');
      // articulation hitch and the front frame
      const fx = Lb + 400; rect(fx, frameY + 40, 600, 300, '#2c2c2c'); ctx.fillStyle = '#4a4d50'; ctx.beginPath(); ctx.arc(fx + 300, frameY + 190, 180, 0, TAU); ctx.fill();
      const c0 = fx + 600, c1 = c0 + 2900, roofY = -3450;
      // engine hood sloping down to the front, radiator grille
      poly([[c0 + 1300, -1150], [c1 + 200, -1150], [c1 + 300, -2150], [c1 - 200, -2450], [c0 + 1300, -2450]], lin(0, -2450, 0, -1150, [[0, rgb(YL)], [0.35, rgb(Y)], [1, rgb(YD)]]));
      rect(c1 + 120, -2100, 160, 850, '#1e1e1e'); for (let y = -2050; y < -1300; y += 90) rect(c1 + 135, y, 130, 40, '#3a3a3a');
      for (let x = c0 + 1500; x < c1 - 100; x += 220) rect(x, -2300, 110, 700, 'rgba(0,0,0,.2)');
      rect(c1 - 300, -2150, 260, 110, '#efe9d4');
      // cab on the front frame: tall glass, rops roof
      poly([[c0, -1150], [c0 + 1350, -1150], [c0 + 1350, -2450], [c0 + 1250, roofY + 150], [c0 + 120, roofY + 150], [c0, -2600]], rgb(YD));
      glass([[c0 + 130, -2500], [c0 + 1260, -2500], [c0 + 1180, roofY + 230], [c0 + 200, roofY + 230]]);
      rect(c0 + 640, roofY + 220, 70, 1000, '#141414');
      poly([[c0 - 100, roofY + 160], [c0 + 1450, roofY + 160], [c0 + 1400, roofY], [c0 - 50, roofY]], lin(0, roofY, 0, roofY + 160, [[0, rgb(YL)], [1, rgb(YD)]]));
      beacon(c0 + 650, roofY);
      rect(c0 + 1320, roofY + 300, 50, 700, '#161616'); rect(c0 + 1360, roofY + 340, 180, 260, '#222');
      rect(c0 + 1250, -2950, 130, 1800, '#2b2b2b'); exX = c0 + 1315; exY = -2980;   // exhaust
      // front axle with its fender
      tyre(c1 - 600, R, [210, 160, 34], 'block');
      ctx.strokeStyle = rgb(YD); lw(160); ctx.beginPath(); ctx.arc(c1 - 600, -R, R * 1.12, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      rect(c0 + 150, -1200, 500, 70, '#1a1a1a'); rect(c0 + 150, -900, 500, 60, '#1a1a1a');
      grime(c0 - 50, -1800, c1 - c0 + 400, -1150, 0.5); grime(-200, frameY, Lb + 1000, frameY + 420, 0.6);
    } else {
      // ---- rigid haul truck: giant tyres, a canopy over the cab, deck with a ladder, radiator at the front
      const R = sp.wheel, Y = [232, 176, 32], YL = [250, 210, 90], YD = [170, 124, 14];
      poly([[-250, frameY], [Lb + 2200, frameY], [Lb + 2200, frameY + 360], [-250, frameY + 360]], lin(0, frameY, 0, frameY + 360, [[0, '#3a3a38'], [1, '#191919']]));
      tyre(1100, R, [220, 170, 30], 'block'); tyre(1100 + R * 0.24, R * 0.98, [220, 170, 30], 'block');   // dual rear tyres (the inner one peeks out)
      const fx = Lb + 300;
      // radiator housing and the front bumper
      poly([[fx + 900, frameY + 360], [fx + 2100, frameY + 360], [fx + 2100, -3350], [fx + 900, -3350]], lin(0, -3350, 0, 0, [[0, rgb(YL)], [0.3, rgb(Y)], [1, rgb(YD)]]));
      rect(fx + 1980, -3150, 140, 1500, '#1c1c1c'); for (let y = -3100; y < -1700; y += 100) rect(fx + 1995, y, 110, 45, '#3b3b3b');
      rect(fx + 1700, -1450, 520, 360, '#262626');   // bumper
      // the deck and the cab on its left (near) side
      rect(fx - 200, -3450, 2350, 140, rgb(YD));
      const c0 = fx - 100, roofY = -4900;
      poly([[c0, -3450], [c0 + 1600, -3450], [c0 + 1600, -4100], [c0 + 1450, roofY + 140], [c0 + 120, roofY + 140], [c0, -4250]], rgb(YD));
      glass([[c0 + 130, -3600], [c0 + 1480, -3600], [c0 + 1380, roofY + 220], [c0 + 200, roofY + 220]]);
      rect(c0 + 700, roofY + 200, 70, 1300, '#141414');
      rect(c0 - 60, roofY, 1720, 150, rgb(YL));
      beacon(c0 + 800, roofY);
      // ladder from the ground up to the deck, handrails
      ctx.strokeStyle = '#1a1a1a'; lw(50); ctx.beginPath(); ctx.moveTo(fx + 1400, -300); ctx.lineTo(fx + 2050, -3450); ctx.moveTo(fx + 1650, -300); ctx.lineTo(fx + 2300, -3450); ctx.stroke();
      for (let k = 0; k < 9; k++) { const t = k / 8; ctx.beginPath(); ctx.moveTo(fx + 1400 + 650 * t, -300 - 3150 * t); ctx.lineTo(fx + 1650 + 650 * t, -300 - 3150 * t); ctx.stroke(); }
      ctx.strokeStyle = '#d8d2c0'; lw(40); ctx.beginPath(); ctx.moveTo(fx - 200, -4300); ctx.lineTo(fx + 2150, -4300); ctx.moveTo(fx + 2150, -4300); ctx.lineTo(fx + 2150, -3450); ctx.stroke();
      rect(fx + 600, -3300, 150, 2600, '#262626');   // front strut
      tyre(fx + 1100, R, [220, 170, 30], 'block');
      ctx.strokeStyle = rgb(YD); lw(200); ctx.beginPath(); ctx.arc(fx + 1100, -R, R * 1.1, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      rect(fx + 150, -4600, 140, 1200, '#2b2b2b'); exX = fx + 220; exY = -4620;
      grime(-250, frameY, Lb + 2500, frameY + 360, 0.6); grime(fx + 900, -2000, 1200, frameY + 360, 0.45);
    }
    // exhaust: black smoke when the engine works (backing up the ramp, revving for the tip)
    if (Math.random() < rev * 0.5) puff(H.x + exX / mm, gy + exY / mm, 1, 30 + rev * 40, 8 + rev * 8, rev > 1 ? [40, 38, 36] : [90, 90, 92]);
    // tipping ram from the chassis to the front of the bed
    const c = Math.cos(-tl), sn = Math.sin(-tl), bw = (x, y) => ({ x: x * c - y * sn, y: hy + x * sn + y * c });
    const ramA = { x: Lb * 0.78, y: frameY + 60 }, ramB = bw(Lb * 0.8, 40), ramM = { x: (ramA.x + ramB.x) / 2, y: (ramA.y + ramB.y) / 2 };
    ctx.lineCap = 'round'; ctx.strokeStyle = '#3d4044'; lw(220); ctx.beginPath(); ctx.moveTo(ramA.x, ramA.y); ctx.lineTo(ramM.x, ramM.y); ctx.stroke();
    ctx.strokeStyle = lin(ramM.x, ramM.y, ramM.x + 80, ramM.y + 80, [[0, '#e6e8ea'], [1, '#8c9094']]); lw(110); ctx.beginPath(); ctx.moveTo(ramM.x, ramM.y); ctx.lineTo(ramB.x, ramB.y); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.restore();
    // load (world units)
    { const c2 = Math.cos(-tl), s2 = Math.sin(-tl); for (const it of Lo.items) if (!it.out) { const lx = it.lx - (it.sl || 0); drawLoadRock(it, H.x + lx * c2 - it.ly * s2, H.y + lx * s2 + it.ly * c2, it.a - tl, wet); } }
    // the body (side plate in front of the load), in its own tilted frame, millimetres
    ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(-tl); ctx.scale(1 / mm, 1 / mm);
    if (lv === 0) {
      const Rc = [168, 44, 32], RcL = [204, 74, 56], RcD = [112, 26, 18];
      poly([[-80, 60], [Lb, 60], [Lb + 40, -Hb], [-80, -Hb * 0.9]], lin(0, -Hb, 0, 60, [[0, rgb(RcL)], [0.2, rgb(Rc)], [1, rgb(RcD)]]));
      rect(-120, -Hb - 70, Lb + 200, 110, rgb(RcD));   // top rail
      for (let i = 1; i < 7; i++) rect(Lb * i / 7 - 40, -Hb + 40, 80, Hb + 20, 'rgba(0,0,0,.22)');   // vertical stiffeners
      rect(-80, -80, Lb + 80, 140, rgb(RcD));
      grime(-80, -Hb * 0.4, Lb + 120, 60, 0.55);
      // scratches and dents from the rock
      ctx.strokeStyle = 'rgba(230,220,200,.25)'; lw(14); for (let i = 0; i < 9; i++) { const x = (i * 0.618 % 1) * Lb, y = -Hb * (0.2 + (i * 0.37 % 1) * 0.6); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 160 + i * 20, y + 40); ctx.stroke(); }
    } else {
      const Y = lv === 1 ? [222, 168, 36] : [232, 176, 32], YL = [250, 206, 86], YD = [160, 112, 14];
      // dump body: floor rising to a spoon tail at the hinge, a canopy over the cab for the haul truck
      const can = lv === 2 ? 2200 : 700;
      poly([[-200, 60], [Lb * 0.3, 140], [Lb, 140], [Lb + 120, -Hb], [Lb + can, -Hb - 160], [Lb + can, -Hb - 340], [Lb * 0.25, -Hb - 60], [-260, -Hb * 0.55]], lin(0, -Hb, 0, 140, [[0, rgb(YL)], [0.25, rgb(Y)], [1, rgb(YD)]]));
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; lw(70); for (let i = 1; i < 6; i++) { const x = Lb * i / 6; ctx.beginPath(); ctx.moveTo(x, 120); ctx.lineTo(x + 40, -Hb - 40); ctx.stroke(); }
      rect(-260, -Hb * 0.55 - 20, Lb + can + 260, 100, 'rgba(0,0,0,.12)');
      ctx.strokeStyle = rgb(YD); lw(90); ctx.beginPath(); ctx.moveTo(-260, -Hb * 0.55); ctx.lineTo(Lb * 0.25, -Hb - 60); ctx.lineTo(Lb + can, -Hb - 340); ctx.stroke();
      grime(-200, -Hb * 0.3, Lb + can + 200, 160, 0.6);
      ctx.strokeStyle = 'rgba(240,232,210,.28)'; lw(18); for (let i = 0; i < 12; i++) { const x = (i * 0.618 % 1) * Lb, y = -Hb * (0.1 + (i * 0.41 % 1) * 0.7); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 200 + i * 15, y + 30); ctx.stroke(); }
    }
    ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(0, 60, 90, 0, TAU); ctx.fill(); ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(0, 60, 40, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ---------- excavator feeding the hopper (true size; tracks and cab stand behind the crusher) ----------
  function drawLoadRock(it, x, y, a, wet) {
    if (!it.cv || it.cvk !== QK) { if (spriteBudget <= 0 && it.cv) { /* keep old */ } else { it.cracks = it.cracks || []; it.fresh = 0; it.tox = it.toy = 0; spriteBudget--; Rocks.renderSprite(it, QK, wet); } }
    if (!it.cv) return;
    const sz = it.cv.width / (it.cvk || QK);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.drawImage(it.cv, -sz / 2, -sz / 2, sz, sz);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); it.poly.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.fill('evenodd');
    ctx.restore();
  }
  function drawExcavator(sim, weather) {
    const Lo = sim.loader, pose = sim.exPose(Lo.busy ? Lo.t : 0), g = pose.g, f = g.f, mm = sim.mmpx, P = (v) => v * f / mm;
    const H = pose.H, Pb = g.Pb, ground = 1130, Bx = Pb.x + P(800);
    // elbow: two-bone IK, the joint above the line
    const dx = H.x - Pb.x, dy = H.y - Pb.y, d = clamp(Math.hypot(dx, dy), 1, g.Lb + g.Ls - 1);
    const base = Math.atan2(dy, dx), cA = clamp((g.Lb * g.Lb + d * d - g.Ls * g.Ls) / (2 * g.Lb * d), -1, 1);
    const e1 = { x: Pb.x + Math.cos(base + Math.acos(cA)) * g.Lb, y: Pb.y + Math.sin(base + Math.acos(cA)) * g.Lb };
    const e2 = { x: Pb.x + Math.cos(base - Math.acos(cA)) * g.Lb, y: Pb.y + Math.sin(base - Math.acos(cA)) * g.Lb };
    const E = e1.y < e2.y ? e1 : e2;
    const Y = '#e3a620', YD = '#b7840f', YL = '#f4c24a', K = '#1f1f1f', GR = '#4a4d50';
    const poly = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(Bx + P(x), ground - P(y)) : ctx.moveTo(Bx + P(x), ground - P(y))); ctx.closePath(); ctx.fill(); };
    // undercarriage: track frame, rollers, sprocket and idler
    ctx.fillStyle = K; ctx.beginPath(); ctx.moveTo(Bx - P(1350), ground - P(180)); ctx.arc(Bx - P(1180), ground - P(380), P(380), Math.PI * 0.5, Math.PI * 1.5); ctx.lineTo(Bx + P(1180), ground - P(760)); ctx.arc(Bx + P(1180), ground - P(380), P(380), -Math.PI * 0.5, Math.PI * 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = GR; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(Bx - P(800) + i * P(400), ground - P(170), P(110), 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#5a5d60'; ctx.beginPath(); ctx.arc(Bx - P(1180), ground - P(380), P(250), 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(Bx + P(1180), ground - P(380), P(270), 0, TAU); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = P(40); for (let i = 0; i < 16; i++) { const x = Bx - P(1200) + i * P(160); ctx.beginPath(); ctx.moveTo(x, ground - P(20)); ctx.lineTo(x, ground - P(70)); ctx.stroke(); }
    // upper structure: turntable, house with counterweight, cab on the front left
    poly([[-600, 760], [700, 760], [700, 860], [-600, 860]], '#2b2b2b');
    poly([[-850, 860], [1700, 860], [1800, 1250], [1750, 1850], [300, 1900], [-850, 1850]], Y);
    poly([[1250, 880], [1820, 920], [1850, 1500], [1250, 1500]], YD);
    poly([[300, 1850], [1700, 1830], [1720, 1880], [300, 1900]], YL);
    for (let i = 0; i < 5; i++) poly([[500 + i * 160, 1700], [600 + i * 160, 1700], [600 + i * 160, 1350], [500 + i * 160, 1350]], 'rgba(0,0,0,.22)');
    poly([[-1050, 1100], [-150, 1100], [-150, 2750], [-850, 2750], [-1050, 2500]], YD);
    poly([[-980, 1700], [-230, 1700], [-230, 2650], [-820, 2650], [-980, 2450]], 'rgba(120,150,170,.85)');
    poly([[-950, 1750], [-700, 1750], [-560, 2600], [-800, 2600], [-950, 2420]], 'rgba(255,255,255,.22)');
    poly([[-600, 2750], [-460, 2750], [-460, 2860], [-600, 2860]], '#ff9a1a');
    // boom: a bent box section, hydraulic cylinders
    const thick = (a, b, w0, w1, col, bend) => {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ddx = b.x - a.x, ddy = b.y - a.y, l = Math.hypot(ddx, ddy) || 1, nx = -ddy / l, ny = ddx / l;
      const cx = mx + nx * bend, cy = my + ny * bend;
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(a.x + nx * w0, a.y + ny * w0); ctx.quadraticCurveTo(cx + nx * (w0 + w1) / 2, cy + ny * (w0 + w1) / 2, b.x + nx * w1, b.y + ny * w1);
      ctx.lineTo(b.x - nx * w1, b.y - ny * w1); ctx.quadraticCurveTo(cx - nx * (w0 + w1) / 2, cy - ny * (w0 + w1) / 2, a.x - nx * w0, a.y - ny * w0); ctx.closePath(); ctx.fill();
    };
    const side = Math.sign((E.x - Pb.x) * (H.y - Pb.y) - (E.y - Pb.y) * (H.x - Pb.x)) || 1;
    const cyl = (a, b, w, col) => { ctx.lineCap = 'round'; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
    const along = (a, b, k, o) => { const ddx = b.x - a.x, ddy = b.y - a.y, l = Math.hypot(ddx, ddy) || 1; return { x: a.x + ddx * k - ddy / l * o, y: a.y + ddy * k + ddx / l * o }; };
    const bc0 = { x: Bx - P(700), y: ground - P(1150) }, bc1 = along(Pb, E, 0.45, -side * P(260));
    cyl(bc0, { x: (bc0.x + bc1.x) / 2, y: (bc0.y + bc1.y) / 2 }, P(190), GR); cyl({ x: (bc0.x + bc1.x) / 2, y: (bc0.y + bc1.y) / 2 }, bc1, P(95), '#c9ccce');
    thick(Pb, E, P(230), P(170), Y, -side * P(420));
    thick(Pb, E, P(60), P(40), 'rgba(255,255,255,.18)', -side * P(420));
    const sc0 = along(Pb, E, 0.62, -side * P(330)), sc1 = along(E, H, -0.18, -side * P(150));
    cyl(sc0, { x: (sc0.x + sc1.x) / 2, y: (sc0.y + sc1.y) / 2 }, P(160), GR); cyl({ x: (sc0.x + sc1.x) / 2, y: (sc0.y + sc1.y) / 2 }, sc1, P(80), '#c9ccce');
    thick(along(E, H, -0.2, 0), H, P(150), P(110), YD, 0);
    // load in the bucket, then the bucket in front of it
    const c = Math.cos(pose.phi), sn = Math.sin(pose.phi), wet = weather && weather.wet > 0.5;
    if (Lo.busy) for (const it of Lo.items) if (!it.out) drawLoadRock(it, H.x + it.lx * c - it.ly * sn, H.y + it.lx * sn + it.ly * c, it.a + pose.phi, wet);
    ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(pose.phi); ctx.scale(f / mm, f / mm);
    // bucket side plate (mm, hinge at origin, mouth up): a solid plate, the load heaps above the rim
    ctx.beginPath(); ctx.moveTo(80, -60); ctx.lineTo(100, 230); ctx.quadraticCurveTo(50, 570, -330, 590); ctx.quadraticCurveTo(-650, 570, -710, 320); ctx.lineTo(-730, 30); ctx.quadraticCurveTo(-330, -40, 80, -60); ctx.closePath();
    const bg = ctx.createLinearGradient(-700, -40, 100, 590); bg.addColorStop(0, '#f2bd38'); bg.addColorStop(0.6, '#d29a17'); bg.addColorStop(1, '#9c6f08');
    ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = 'rgba(40,28,4,.55)'; ctx.lineWidth = 24; ctx.stroke();
    // wear strips and the rim
    ctx.strokeStyle = 'rgba(60,44,8,.45)'; ctx.lineWidth = 30; ctx.beginPath(); ctx.moveTo(-690, 300); ctx.quadraticCurveTo(-620, 520, -330, 545); ctx.quadraticCurveTo(10, 530, 60, 240); ctx.stroke();
    ctx.strokeStyle = '#7d5a08'; ctx.lineWidth = 40; ctx.beginPath(); ctx.moveTo(-730, 30); ctx.quadraticCurveTo(-330, -40, 80, -60); ctx.stroke();
    ctx.fillStyle = '#3b3a37'; for (let i = 0; i < 3; i++) { const yy = 20 + i * 18; ctx.beginPath(); ctx.moveTo(-720, yy); ctx.lineTo(-800, yy - 60); ctx.lineTo(-700, yy - 10); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(0, 0, 55, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(-180, -60, 45, 0, TAU); ctx.fill();
    ctx.restore();
    // bucket link and its cylinder along the stick
    const lk = { x: H.x + (-180 * c + 60 * sn) * f / mm, y: H.y + (-180 * sn - 60 * c) * f / mm };
    const bk0 = along(E, H, 0.25, side * P(160));
    cyl(bk0, { x: (bk0.x + lk.x) / 2, y: (bk0.y + lk.y) / 2 }, P(130), GR); cyl({ x: (bk0.x + lk.x) / 2, y: (bk0.y + lk.y) / 2 }, lk, P(65), '#c9ccce');
    ctx.fillStyle = '#2a2a2a'; for (const q of [Pb, E]) { ctx.beginPath(); ctx.arc(q.x, q.y, P(90), 0, TAU); ctx.fill(); }
  }

  // ---------- frame ----------
  function ensureLayers(sim, save, weather, dt) {
    // detail follows the zoom once the pinch has settled
    if (cam.zT > 0) cam.zT -= dt; else cam.zSettled = camFor(sim).Z;
    const zq = clamp(Math.ceil(cam.zSettled * 4) / 4, 0.75, 1.5);
    QK = RS * zq;
    const key = [RS, zq, save ? save.day : 0, sim.tier.id, weather.kind, save ? Object.keys(save.stock || {}).length : 0, save && save.up ? JSON.stringify(save.up) : ''].join('|');
    if (key === lastKey) return;
    lastKey = key;
    layers.bgA = buildBg(save, weather, 7.5); layers.bgB = buildBg(save, weather, 14.5);
    { const fk = [save ? save.day : 0, weather.kind, save ? Career.depositName(save) : ''].join('|'); if (layers.faceKey !== fk) { layers.face = buildFace(save, weather); layers.gravel = buildGravel(weather); layers.faceKey = fk; } layers.range = buildRange(save, weather, lightAt(10, weather)); }
    layers.k = QK; layers.back = buildMachineBack(sim, QK); layers.front = buildMachineFront(sim, QK);
    { const G = Machine.G, k = QK, c = off(420 * k, (G.BOT + 50 - 242) * k), g = c.getContext('2d'); g.setTransform(k, 0, 0, k, -690 * k, -252 * k); painted(g, [[700, 262], [1100, 262], [1100, G.BOT + 50], [700, G.BOT + 50]], sim.tier.paint[0], 0.85, sim.tier.rust); layers.ext = c; }
    for (const b of sim.rocks) b.rock.dirty = true;
  }

  function frame(sim, save, weather, opt) {
    const dt = opt.dt || 0.016;
    view.hour = opt.hour ?? 9; view.month = save && save.day ? Career.month(save.day) : null;
    ensureLayers(sim, save, weather, dt);
    spriteBudget = 4;
    const L = lightAt(view.hour, weather);
    consumeFx(sim, L);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const shake = opt.shake || 0;
    // background crossfade through the day
    // (sky, quarry and yard are one cached image, refreshed as the light changes and the camera moves)
    const sx = (Math.random() - .5) * shake * RS, sy = (Math.random() - .5) * shake * RS;
    const cam = camFor(sim); view.camZ = cam.Z;
    const WT = () => ctx.setTransform(RS * cam.Z, 0, 0, RS * cam.Z, cam.ox * RS + sx, cam.oy * RS + sy);   // world units
    const lk = RS * cam.Z / layers.k;
    const LT = () => ctx.setTransform(lk, 0, 0, lk, cam.ox * RS + sx, cam.oy * RS + sy);             // cached world layers
    // surroundings at true scale (quarry floor, conveyor, catwalk, people's things) behind the machine
    const DB = window.RC_DBG || {};
    if (!DB.scene) drawSceneCached(sim, weather, cam, sx, sy, L);
    WT();
    drawTracks(sim);
    if (!DB.pile) drawStacker(sim, L);
    drawFlywheel(sim);
    drawPlatform(sim);
    LT();
    ctx.drawImage(layers.back, 0, 0);
    WT();
    drawFeeder(sim, opt.time || 0, false);
    drawBelt(sim, opt.time || 0);
    drawToggle(sim);
    // rocks below the jaw first, then the chamber
    drawRockShadows(sim, L);
    for (const b of sim.rocks) if (b.y > Machine.G.BOT) drawRock(b, L, weather);
    if (!DB.jaw) drawPitman(sim, L);
    for (const b of sim.rocks) if (b.y <= Machine.G.BOT) drawRock(b, L, weather);
    drawParts(sim, L);
    drawFixedJaw(sim, L);
    LT();
    ctx.drawImage(layers.front, 0, 0);
    WT();
    drawFeeder(sim, opt.time || 0, true);
    drawMagnet(sim, opt.time || 0);
    drawFxBack(L);
    drawTools(sim, opt);
    void drawWorker;   // the operator is not drawn: only his tools
    if (!DB.truck) drawTruck(sim, weather);
    drawFxFront(L, dt);
    ctx.setTransform(RS, 0, 0, RS, 0, 0);
    drawWeather(weather, dt);
    // grade: warm/cool tint and a soft vignette
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = rgb(L.col, 0.05); ctx.fillRect(0, 0, cv.width, cv.height);
    if (L.dark > 0.01) drawDark(sim, cam, L.dark);
    if (!layers.vig || layers.vig.width !== cv.width) { const v = off(cv.width, cv.height), g = v.getContext('2d'); const rg = g.createRadialGradient(cv.width / 2, cv.height * 0.45, cv.height * 0.3, cv.width / 2, cv.height * 0.5, cv.height * 0.78); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.42)'); g.fillStyle = rg; g.fillRect(0, 0, v.width, v.height); layers.vig = v; }
    ctx.drawImage(layers.vig, 0, 0);
    drawScaleBar(sim, cam);
  }
  // night: a blue-black veil over everything; with floodlight masts the hopper and the belt stay lit
  const LAMPS = [{ x: -560, y: -620, ax: 230, ay: 320 }, { x: 1080, y: -520, ax: 620, ay: 380 }];
  function lampPos(sim, i) { const l = LAMPS[i]; return i === 1 ? { x: Machine.G.FEED.x0 + 560, y: l.y, ax: l.ax, ay: l.ay } : l; }
  let darkC = null;
  function drawDark(sim, cam, dk) {
    if (!darkC || darkC.width !== cv.width || darkC.height !== cv.height) darkC = off(cv.width, cv.height);
    const g = darkC.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, cv.width, cv.height);
    const lit = sim.up && sim.up.lights;
    g.fillStyle = `rgba(8,12,28,${(lit ? 0.62 : 0.7) * dk})`; g.fillRect(0, 0, cv.width, cv.height);
    const toS = (x, y) => ({ x: (cam.ox + x * cam.Z) * RS, y: (cam.oy + y * cam.Z) * RS });
    if (lit) {
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < LAMPS.length; i++) {
        const l = lampPos(sim, i), a = toS(l.ax, l.ay), R = 1050 * cam.Z * RS;
        const rg = g.createRadialGradient(a.x, a.y, 0, a.x, a.y, R); rg.addColorStop(0, 'rgba(0,0,0,0.98)'); rg.addColorStop(0.55, 'rgba(0,0,0,0.75)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg; g.fillRect(a.x - R, a.y - R, R * 2, R * 2);
      }
    } else {
      // the crusher's own work lights: a weak pool over the mouth, so you can still see what you do
      g.globalCompositeOperation = 'destination-out';
      const a = toS(380, 330), R = 520 * cam.Z * RS;
      const rg = g.createRadialGradient(a.x, a.y, 0, a.x, a.y, R); rg.addColorStop(0, 'rgba(0,0,0,0.55)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(a.x - R, a.y - R, R * 2, R * 2);
    }
    ctx.drawImage(darkC, 0, 0);
    // the lamps themselves: warm glow and a beam cone
    if (lit) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < LAMPS.length; i++) {
        const l = lampPos(sim, i), h = toS(l.x, l.y), a = toS(l.ax, l.ay);
        const beam = ctx.createLinearGradient(h.x, h.y, a.x, a.y); beam.addColorStop(0, `rgba(255,236,190,${0.16 * dk})`); beam.addColorStop(1, 'rgba(255,236,190,0)');
        const dx = a.x - h.x, dy = a.y - h.y, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len, w = len * 0.55;
        ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(a.x + nx * w, a.y + ny * w); ctx.lineTo(a.x - nx * w, a.y - ny * w); ctx.closePath(); ctx.fill();
        const gl = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 26 * RS * cam.Z); gl.addColorStop(0, `rgba(255,250,230,${0.9 * dk})`); gl.addColorStop(1, 'rgba(255,250,230,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(h.x, h.y, 26 * RS * cam.Z, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }
  // a scale bar in the corner that follows the zoom
  function drawScaleBar(sim, cam) {
    const perM = 1000 / sim.mmpx * cam.Z;              // screen units per metre
    let m = 0.5; for (const c of [0.5, 1, 2, 5, 10, 20, 50]) { m = c; if (c * perM >= 70) break; }
    const len = m * perM, x = 22, y = 1112;
    ctx.setTransform(RS, 0, 0, RS, 0, 0);
    ctx.fillStyle = 'rgba(14,15,17,.55)'; ctx.fillRect(x - 8, y - 26, len + 16, 36);
    ctx.fillStyle = '#f1ece2'; ctx.fillRect(x, y, len, 4);
    const half = len / 2; ctx.fillStyle = '#14161a'; ctx.fillRect(x + half, y, half, 4);
    ctx.fillStyle = '#f1ece2'; ctx.fillRect(x, y - 6, 2, 14); ctx.fillRect(x + len - 2, y - 6, 2, 14);
    ctx.font = '700 17px "Barlow Condensed", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(m < 1 ? (m * 100) + ' cm' : m + ' m', x, y - 9);
  }

  // ---------- moving machine parts ----------
  function drawFlywheel(sim) {
    const M = sim.m, G = Machine.G, R = clamp(500 / sim.mmpx, 260, 470);
    const cx = G.E0.x, cy = G.E0.y;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(M.theta);
    const paint = sim.tier.paint[0];
    ctx.fillStyle = rgb(mixc(paint, [0, 0, 0], 0.15)); ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.arc(0, 0, R * 0.84, 0, TAU, true); ctx.fill();
    // V-belt grooves on the rim
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 3; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(0, 0, R * (0.9 + k * 0.025), 0, TAU); ctx.stroke(); }
    ctx.fillStyle = rgb(mixc(paint, [0, 0, 0], 0.3));
    for (let i = 0; i < 6; i++) { ctx.save(); ctx.rotate(i * TAU / 6); ctx.beginPath(); ctx.moveTo(R * 0.12, -14); ctx.lineTo(R * 0.86, -26); ctx.lineTo(R * 0.86, 26); ctx.lineTo(R * 0.12, 14); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = '#26282b'; ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8b13a'; ctx.fillRect(R * 0.7, -6, R * 0.14, 12);   // paint mark to see it turn
    ctx.restore();
    // belts running down-left to the motor
    ctx.strokeStyle = '#121212'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(cx - R * 0.98, cy + 40); ctx.lineTo(28, 905); ctx.stroke();
    ctx.setLineDash([14, 18]); ctx.lineDashOffset = -M.theta * R * 0.95; ctx.strokeStyle = '#2c2c2c'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx - R * 0.98, cy + 40); ctx.lineTo(28, 905); ctx.stroke(); ctx.setLineDash([]);
    // dimming so the machine in front reads
    ctx.fillStyle = 'rgba(30,26,22,0.18)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
  }
  // The jaws are drawn once into sprites (rebuilt only when the teeth wear to a new shape or the
  // zoom detail changes) and then just placed each frame: the gradients, clips and patterns of
  // every tooth are far too costly to redo 60 times a second on a phone.
  const jawSpr = {};
  function sprite(id, key, x0, y0, x1, y1, draw) {
    let S = jawSpr[id];
    if (!S || S.key !== key) {
      const k = QK, c = off((x1 - x0) * k, (y1 - y0) * k), g = c.getContext('2d');
      g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      const keep = ctx; ctx = g; try { draw(); } finally { ctx = keep; }
      S = jawSpr[id] = { key, c, x0, y0, w: x1 - x0, h: y1 - y0 }; window.__sprN = (window.__sprN || 0) + 1;
    }
    ctx.drawImage(S.c, S.x0, S.y0, S.w, S.h);
  }
  function drawPitman(sim, L) {
    const M = sim.m, p = M.pit;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of p.shapes) for (const q of s.lv) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    x0 = Math.min(x0, -50) - 12; y0 = Math.min(y0, -50) - 12; x1 = Math.max(x1, 50) + 12; y1 = Math.max(y1, 50) + 12;
    const key = QK + '|' + sim.tier.id + '|' + M.teethM.map(t => t._k).join(',');
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
    sprite('pit', key, x0, y0, x1, y1, () => drawPitmanArt(sim, L));
    ctx.restore();
  }
  function drawPitmanArt(sim, L) {
    const M = sim.m, p = M.pit, T = sim.tier;
    // casting body
    for (const s of p.shapes) {
      if (!s.user || !s.user.body) continue;
      ctx.beginPath(); s.lv.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
      ctx.fillStyle = steelFill(ctx, T.paint[0], -60, -60, 300, 800, 1); ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = pat('noise'); ctx.fill(); if (T.rust > 0.05) { ctx.globalAlpha = T.rust * 1.5; ctx.fillStyle = pat('rust'); ctx.fill(); ctx.globalAlpha = 1; }
      // ribs
      ctx.strokeStyle = rgb(T.paint[1], 0.9); ctx.lineWidth = 8;
      for (let k = 1; k <= 4; k++) { const f = k / 5; ctx.beginPath(); ctx.moveTo(M.Ft.x + (M.Fb.x - M.Ft.x) * f - 30, M.Ft.y + (M.Fb.y - M.Ft.y) * f); ctx.lineTo(-70 + 150 * f, 40 + 300 * f); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2; ctx.stroke();
    }
    // eccentric bearing housing
    ctx.fillStyle = '#2a2c2f'; ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4c5055'; ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; bolt(ctx, Math.cos(a) * 40, Math.sin(a) * 40, 3.5); }
    // manganese plate base and teeth
    const base = p.shapes.find(s => s.user && s.user.base);
    if (base) {
      ctx.beginPath(); base.lv.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
      ctx.fillStyle = steelFill(ctx, [74, 74, 72], 0, 0, 40, 800, 1); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      for (let k = 1; k < 5; k++) { const f = k / 5; bolt(ctx, M.Ft.x + (M.Fb.x - M.Ft.x) * f - M.fn.x * 18, M.Ft.y + (M.Fb.y - M.Ft.y) * f - M.fn.y * 18, 4); }
    }
    drawTeeth(M.teethM, sim.save.wearM, L);
  }
  // Manganese teeth: dark cast steel when new; the crushing faces polish to bright, scored metal as they
  // wear and the corners round off; rock dust packs into the valleys between the teeth
  function drawTeeth(teeth, wear, L) {
    const lerpP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    // packed dust first, behind the teeth
    ctx.fillStyle = 'rgba(158,152,140,.55)';
    for (let i = 0; i + 1 < teeth.length; i++) {
      const A = teeth[i].lv, B = teeth[i + 1].lv;
      const p1 = lerpP(A[3], A[2], 0.45), p2 = lerpP(B[0], B[1], 0.45);
      ctx.beginPath(); ctx.moveTo(A[3].x, A[3].y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(B[0].x, B[0].y); ctx.closePath(); ctx.fill();
    }
    for (let i = 0; i < teeth.length; i++) {
      const s = teeth[i], w = clamp(wear ? wear[i] : 0, 0, 1.4), v = s.lv;
      // rounded corners grow with wear
      const rc = 0.12 + 0.55 * Math.min(1, w);
      const c1a = lerpP(v[1], v[0], rc * 0.6), c1b = lerpP(v[1], v[2], rc * 0.5), c2a = lerpP(v[2], v[1], rc * 0.5), c2b = lerpP(v[2], v[3], rc * 0.6);
      const path = () => { ctx.beginPath(); ctx.moveTo(v[0].x, v[0].y); ctx.lineTo(c1a.x, c1a.y); ctx.quadraticCurveTo(v[1].x, v[1].y, c1b.x, c1b.y); ctx.lineTo(c2a.x, c2a.y); ctx.quadraticCurveTo(v[2].x, v[2].y, c2b.x, c2b.y); ctx.lineTo(v[3].x, v[3].y); ctx.closePath(); };
      path();
      const mb = lerpP(v[0], v[3], 0.5), mt = lerpP(v[1], v[2], 0.5);
      const gr = ctx.createLinearGradient(mb.x, mb.y, mt.x, mt.y);
      gr.addColorStop(0, '#2e2c29'); gr.addColorStop(0.6, '#4a4741'); gr.addColorStop(1, w > 0.05 ? '#6e6b64' : '#55524b');
      ctx.fillStyle = gr; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = pat('noise'); ctx.fill();
      if (w > 0.04) {
        // polished crushing face: bright at the tip, fading towards the root
        const pg = ctx.createLinearGradient(mt.x, mt.y, mb.x, mb.y), a = Math.min(0.85, w * 1.2);
        pg.addColorStop(0, `rgba(214,212,204,${a})`); pg.addColorStop(0.18 + w * 0.3, `rgba(170,168,160,${a * 0.5})`); pg.addColorStop(1, 'rgba(150,148,140,0)');
        ctx.fillStyle = pg; ctx.fill();
        // scoring along the stroke
        ctx.strokeStyle = `rgba(250,248,240,${0.12 + w * 0.25})`; ctx.lineWidth = 0.8;
        for (let k = 0; k < 4; k++) { const t = 0.15 + ((i * 7 + k * 3) % 10) / 12, q0 = lerpP(lerpP(v[0], v[1], 0.4 + 0.6 * w), lerpP(v[3], v[2], 0.4 + 0.6 * w), t), q1 = lerpP(v[1], v[2], t); ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke(); }
      } else {
        // new casting: a little rust bloom and the dark mill scale
        ctx.fillStyle = 'rgba(120,64,30,.18)'; ctx.fill();
      }
      ctx.restore();
      path(); ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1; ctx.stroke();
      // sharp highlight on the leading edge of a fresh tooth
      if (w < 0.3) { ctx.strokeStyle = `rgba(255,255,255,${0.18 * (1 - w / 0.3)})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(c1b.x, c1b.y); ctx.lineTo(c2a.x, c2a.y); ctx.stroke(); }
    }
  }
  function drawFixedJaw(sim, L) {
    const M = sim.m; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of M.fix.shapes) for (const q of s.lv) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    sprite('fix', QK + '|' + sim.tier.id + '|' + M.teethF.map(t => t._k).join(','), x0 - 12, y0 - 12, x1 + 12, y1 + 12, () => drawFixedArt(sim, L));
  }
  function drawFixedArt(sim, L) {
    const M = sim.m, G = Machine.G;
    const base = M.fix.shapes[0];
    ctx.beginPath(); base.lv.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
    ctx.fillStyle = steelFill(ctx, [74, 74, 72], G.FX, 0, G.FX + 40, 0, 1); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    for (let y = 360; y < G.BOT; y += 140) bolt(ctx, G.FX + 20, y, 4);
    drawTeeth(M.teethF, sim.save.wearF, L);
  }
  function drawToggle(sim) {
    const M = sim.m, p = M.pit, c = Math.cos(p.a), s = Math.sin(p.a);
    const a = { x: p.x + M.Lt.x * c - M.Lt.y * s, y: p.y + M.Lt.x * s + M.Lt.y * c }, b = M.S;
    // frame seat block and shims (more shims = smaller CSS)
    ctx.fillStyle = rgb(sim.tier.paint[1]); ctx.fillRect(b.x - 90, b.y - 46, 70, 92);
    if (sim.up.hydro) {
      ctx.fillStyle = '#c9a227'; ctx.fillRect(b.x - 88, b.y - 14, 70, 28); ctx.fillStyle = '#d9d9d6'; ctx.fillRect(b.x - 20, b.y - 7, Math.max(4, b.x - (b.x - 20)), 14);
    } else {
      const n = clamp(Math.round((M.Sset - M.S0.x + 200) / 18), 1, 20);
      for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#8c8e90' : '#a7a9ab'; ctx.fillRect(b.x - 22 - i * 3.2 + (M.S.x - M.Sset), b.y - 30, 3, 60); }
    }
    if (M.toggleBroken) {
      ctx.strokeStyle = '#2f2f2e'; ctx.lineWidth = 16; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - 30, a.y + 34); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + 26, b.y + 40); ctx.stroke(); ctx.lineCap = 'butt';
    } else {
      ctx.strokeStyle = '#2f2f2e'; ctx.lineWidth = 18; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.x, a.y - 6); ctx.lineTo(b.x, b.y - 6); ctx.stroke(); ctx.lineCap = 'butt';
    }
    // tension rod with spring pulls the pitman onto the toggle
    const r0 = { x: a.x - 30, y: a.y + 30 }, r1 = { x: b.x - 70, y: b.y + 70 };
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(r0.x, r0.y); ctx.lineTo(r1.x, r1.y); ctx.stroke();
    ctx.strokeStyle = '#b13b1c'; ctx.lineWidth = 4; ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const t = 0.55 + i / 12 * 0.4, x = r0.x + (r1.x - r0.x) * t, y = r0.y + (r1.y - r0.y) * t, o = (i % 2 ? 9 : -9); ctx.lineTo(x + o * 0.7, y - o * 0.7); } ctx.stroke();
  }
  function drawBelt(sim, time) {
    const G = Machine.G, y = G.BELT_Y;
    const x0 = G.BELT_X0 - 20, x1 = G.BELT_X1 + 24;
    ctx.fillStyle = '#161616'; ctx.fillRect(x0, y, x1 - x0, 22);
    ctx.fillStyle = '#262626'; const off = 46 - (time * sim.beltV) % 46;
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y, x1 - x0, 22); ctx.clip();
    for (let x = x0 + off - 46; x < x1; x += 46) ctx.fillRect(x, y + 3, 22, 2);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(x0, y, x1 - x0, 2);
    // idlers turning under the belt
    for (let x = G.BELT_X0 + 30; x < G.BELT_X1 + 30; x += 92) { ctx.fillStyle = '#4a4c4f'; ctx.beginPath(); ctx.arc(x + 6, y + 30, 10, 0, TAU); ctx.fill(); ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2; const a = -time * sim.beltV / 10; ctx.beginPath(); ctx.moveTo(x + 6, y + 30); ctx.lineTo(x + 6 + Math.cos(a) * 9, y + 30 + Math.sin(a) * 9); ctx.stroke(); }
  }
  function drawMagnet(sim, time) {
    if (!sim.up.magnet) return;
    const G = Machine.G, x0 = G.BELT_X0 - 20, y0 = G.BELT_Y - 92;
    ctx.fillStyle = '#d8a520'; ctx.fillRect(x0, y0, 170, 40); ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x0 - 6, y0 + 40, 182, 10);
    ctx.fillStyle = '#1b1b1b'; ctx.font = '700 16px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('OVERBAND MAGNET', x0 + 85, y0 + 26);
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x0 + 20, y0); ctx.lineTo(x0 + 30, y0 - 40); ctx.moveTo(x0 + 150, y0); ctx.lineTo(x0 + 140, y0 - 40); ctx.stroke();
    void time;
  }

  // ---------- rocks ----------
  function drawRockShadows(sim, L) {
    ctx.fillStyle = `rgba(10,8,6,${L.shadow})`;
    for (const b of sim.rocks) {
      const r = b.rock, p = r.poly, c = Math.cos(b.a), s = Math.sin(b.a), ox = L.sx * 0.6 + 3, oy = 5;
      ctx.beginPath(); for (let i = 0; i < p.length; i++) { const x = b.x + ox + p[i].x * c - p[i].y * s, y = b.y + oy + p[i].x * s + p[i].y * c; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.fill();
    }
  }
  function drawRock(b, L, weather) {
    const r = b.rock;
    const wet = weather && weather.wet > 0.5;
    // sprites are costly to paint: a few per frame, the rest wait a frame (flat fill meanwhile)
    if ((r.dirty || !r.cv || r.cvk !== QK || r.cvWet !== wet) && spriteBudget > 0) { spriteBudget--; Rocks.renderSprite(r, QK, wet); r.cvWet = wet; }
    if (!r.cv && r.pcv) {
      const ps = r.pcv.width / (r.pcvk || QK);
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.beginPath(); r.poly.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.clip();
      ctx.drawImage(r.pcv, -r.pox - ps / 2, -r.poy - ps / 2, ps, ps); ctx.restore(); return;
    }
    if (r.cv && r.pcv) r.pcv = null;   // own sprite ready: let the parent's go
    if (!r.cv) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.beginPath(); r.poly.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
      ctx.fillStyle = `rgb(${r.mat.base[0]},${r.mat.base[1]},${r.mat.base[2]})`; ctx.fill(); ctx.restore(); return;
    }
    const sz = r.cv.width / (r.cvk || QK);
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
    ctx.drawImage(r.cv, -sz / 2, -sz / 2, sz, sz);
    // facet lighting in world space (rotates correctly with the stone)
    const p = r.poly, ca = Math.cos(-b.a), sa = Math.sin(-b.a);
    const lx = L.lx * ca - L.ly * sa, ly = L.lx * sa + L.ly * ca;   // towards the light
    const k = L.contrast * (r.steel ? 1.2 : r.mat.soil ? 0.45 : 1), R = r.rad;
    const vp = r.vpoly || p;
    // body: soft rounded light across the whole stone (no hard facet triangles)
    ctx.beginPath(); vp.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
    const gb = ctx.createLinearGradient(lx * R, ly * R, -lx * R, -ly * R);
    gb.addColorStop(0, rgb(L.col, 0.16 * k)); gb.addColorStop(0.45, 'rgba(0,0,0,0)'); gb.addColorStop(1, `rgba(14,10,6,${0.26 * k})`);
    ctx.fillStyle = gb; ctx.fill();
    // narrow bevels along the edges: lit edges catch light, edges facing away fall into shade
    const bw = clamp(R * 0.07, 1.2, 6);
    for (let i = 0; i < p.length; i++) {
      const a = p[i], q = p[(i + 1) % p.length];
      let nx = q.y - a.y, ny = -(q.x - a.x); const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      if (nx * a.x + ny * a.y < 0) { nx = -nx; ny = -ny; }          // outward
      const d = nx * lx + ny * ly;
      if (Math.abs(d) < 0.12) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(q.x, q.y); ctx.lineTo(q.x - nx * bw, q.y - ny * bw); ctx.lineTo(a.x - nx * bw, a.y - ny * bw); ctx.closePath();
      ctx.fillStyle = d > 0 ? rgb(L.col, 0.22 * d * k) : `rgba(14,10,6,${-0.3 * d * k})`;
      ctx.fill();
    }
    // mica glints sparkle as the stone turns
    const t = r.tex;
    if (t && t.glints) {
      const g = t.glints, n = g.length / 3;
      for (let i = 0; i < n; i++) {
        const gx = g[i * 3] - r.tox, gy = g[i * 3 + 1] - r.toy; if (Math.abs(gx) > r.rad * 0.9 || Math.abs(gy) > r.rad * 0.9) continue;
        const ph = Math.cos(g[i * 3 + 2] + b.a * 3);
        if (ph > 0.93 && Poly.contains(p, gx, gy)) { ctx.fillStyle = `rgba(255,252,236,${(ph - 0.93) * 12})`; ctx.fillRect(gx - 1, gy - 1, 2.2, 2.2); }
      }
    }
    // a nipped stone glows dust at its contact
    ctx.restore();
  }
  function drawParts(sim, L) {
    for (const p of sim.parts) {
      ctx.fillStyle = p.c;
      const r = p.r;
      if (p.chunk && p.poly) {   // a whole stone riding the stacker
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); p.poly.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fill(); ctx.fillStyle = p.c; ctx.save(); ctx.clip(); ctx.translate(-r * 0.25, -r * 0.25); ctx.beginPath(); p.poly.forEach((q, i) => i ? ctx.lineTo(q.x * 0.8, q.y * 0.8) : ctx.moveTo(q.x * 0.8, q.y * 0.8)); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.restore(); continue;
      }
      if (p.fine) {   // a clod of soil: a soft lumpy shape, lit from above, with a few grains of gravel in it
        const sh = p.sh || [1, 1, 1, 1, 1, 1, 1];
        ctx.beginPath(); for (let k = 0; k < 7; k++) { const a = p.rot + k / 7 * TAU, rr = r * sh[k]; k ? ctx.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr) : ctx.moveTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(p.x + r * 0.15, p.y + r * 0.35, r * 0.75, r * 0.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = rgb(L.col, 0.12); ctx.beginPath(); ctx.ellipse(p.x - r * 0.2, p.y - r * 0.35, r * 0.55, r * 0.3, 0, 0, TAU); ctx.fill();
        if (r > 6) { ctx.fillStyle = 'rgba(150,145,135,.8)'; for (let k = 0; k < 3; k++) { const a = p.rot * 3 + k * 2.1; ctx.fillRect(p.x + Math.cos(a) * r * 0.5, p.y + Math.sin(a) * r * 0.45, r * 0.18, r * 0.14); } }
        continue;
      }
      if (p.soil) { ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.1, r * 0.85, p.rot, 0, TAU); ctx.fill(); if (r > 2) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(p.x + r * 0.25, p.y + r * 0.3, r * 0.7, r * 0.45, 0, 0, TAU); ctx.fill(); } continue; }   // crumbs of soil
      if (r < 1.6) { ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2); continue; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.beginPath(); ctx.moveTo(-r, -r * 0.6); ctx.lineTo(r * 0.7, -r); ctx.lineTo(r, r * 0.5); ctx.lineTo(-r * 0.4, r); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgb(L.col, 0.2); ctx.fillRect(-r * 0.5, -r * 0.7, r, r * 0.4);
      ctx.restore();
    }
  }

  // ---------- loader bucket (close-up: only the bucket fits in view) ----------
  // ---------- tools (real sizes) ----------
  function drawTools(sim, opt) {
    const mm = sim.mmpx;
    const sl = opt.sledge;
    if (sl && sl.tg) {
      // 5 kg sledge: head 175 × 65 mm, handle 900 mm, coming down from the operator above
      const hw = 175 / mm, hf = 65 / mm, sg = sledgeGeom(sim, sl), K = sg.K, ex = sg.head.x, ey = sg.head.y, th = sg.th;
      ctx.save(); ctx.lineCap = 'round';
      // motion blur on the down swing
      if (sl.state === 'swing') { ctx.globalAlpha = 0.25; ctx.strokeStyle = '#6b6f73'; ctx.lineWidth = hw * 0.8; ctx.beginPath(); ctx.moveTo(ex - Math.cos(th - 0.5) * 60, ey - Math.sin(th - 0.5) * 60); ctx.lineTo(ex, ey); ctx.stroke(); ctx.globalAlpha = 1; }
      // hickory handle: tapered, thicker at the head, black rubber grip at the end
      const s0 = { x: K.x - Math.cos(th) * 60 / mm, y: K.y - Math.sin(th) * 60 / mm };
      const nx = -Math.sin(th), ny = Math.cos(th), w0 = Math.max(2.2, 15 / mm), w1 = Math.max(3, 21 / mm);
      ctx.fillStyle = '#b07a3e';
      ctx.beginPath(); ctx.moveTo(s0.x + nx * w0, s0.y + ny * w0); ctx.lineTo(ex + nx * w1, ey + ny * w1); ctx.lineTo(ex - nx * w1, ey - ny * w1); ctx.lineTo(s0.x - nx * w0, s0.y - ny * w0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(70,40,15,.55)'; ctx.lineWidth = Math.max(1, 4 / mm); ctx.beginPath(); ctx.moveTo(s0.x - nx * w0 * 0.5, s0.y - ny * w0 * 0.5); ctx.lineTo(ex - nx * w1 * 0.5, ey - ny * w1 * 0.5); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,190,.35)'; ctx.beginPath(); ctx.moveTo(s0.x + nx * w0 * 0.45, s0.y + ny * w0 * 0.45); ctx.lineTo(ex + nx * w1 * 0.45, ey + ny * w1 * 0.45); ctx.stroke();
      const gL = 220 / mm; ctx.strokeStyle = '#1b1c1e'; ctx.lineWidth = w0 * 2.3; ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s0.x + Math.cos(th) * gL, s0.y + Math.sin(th) * gL); ctx.stroke();
      ctx.translate(ex, ey); ctx.rotate(th + Math.PI / 2);
      // steel head with chamfered striking faces and a painted middle
      const c = Math.min(hf * 0.28, 14 / mm), x0 = -hw / 2, x1 = hw / 2, y0 = -hf / 2, y1 = hf / 2;
      const hg = ctx.createLinearGradient(0, y0, 0, y1); hg.addColorStop(0, '#9aa1a7'); hg.addColorStop(0.45, '#5d6369'); hg.addColorStop(1, '#2a2d31');
      ctx.fillStyle = hg; ctx.beginPath();
      ctx.moveTo(x0 + c, y0); ctx.lineTo(x1 - c, y0); ctx.lineTo(x1, y0 + c); ctx.lineTo(x1, y1 - c); ctx.lineTo(x1 - c, y1); ctx.lineTo(x0 + c, y1); ctx.lineTo(x0, y1 - c); ctx.lineTo(x0, y0 + c); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b8352a'; ctx.fillRect(-hw * 0.22, y0, hw * 0.44, hf);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-hw * 0.22, y0, hw * 0.44, hf * 0.25);
      ctx.fillStyle = '#c9cdd0'; ctx.fillRect(x0, y0 + c, Math.max(1.5, 5 / mm), hf - 2 * c); ctx.fillRect(x1 - Math.max(1.5, 5 / mm), y0 + c, Math.max(1.5, 5 / mm), hf - 2 * c);
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }
    if (opt.aim) {
      const a = opt.aim;
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(a.x, a.y, 26, 0, TAU); ctx.stroke();
      ctx.strokeStyle = a.ok ? (a.charge > 0.97 ? '#fff1c9' : '#f59b23') : '#e2452c'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(a.x, a.y, 26, -Math.PI / 2, -Math.PI / 2 + TAU * (a.ok ? a.charge : 1)); ctx.stroke();
      ctx.fillStyle = a.ok ? '#f59b23' : '#e2452c'; ctx.beginPath(); ctx.arc(a.x, a.y, 4, 0, TAU); ctx.fill();
    }
    if (sim.pry) {
      // 1.6 m hexagonal steel bar (Ø32 mm) with a chisel tip; the handle is on the far side of the push
      const p = sim.pry, L = 1600 / mm, d = Math.max(3.5, 32 / mm);
      const st = clamp(Math.hypot(p.tx - p.x0, p.ty - p.y0) / (150 / mm), 0, 1);
      const ang = -Math.PI / 2 - p.side * (0.55 + 0.4 * st);
      const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
      const tip = { x: p.ax, y: p.ay }, hx = tip.x + ux * L, hy = tip.y + uy * L;
      ctx.save();
      // bar body
      const bg = ctx.createLinearGradient(tip.x + nx * d, tip.y + ny * d, tip.x - nx * d, tip.y - ny * d);
      bg.addColorStop(0, '#5e666d'); bg.addColorStop(0.35, '#9aa3aa'); bg.addColorStop(0.5, '#3a4045'); bg.addColorStop(1, '#1c2023');
      const cl = 90 / mm;   // chisel length
      ctx.fillStyle = bg; ctx.beginPath();
      ctx.moveTo(tip.x + ux * cl + nx * d / 2, tip.y + uy * cl + ny * d / 2); ctx.lineTo(hx + nx * d / 2, hy + ny * d / 2);
      ctx.lineTo(hx - nx * d / 2, hy - ny * d / 2); ctx.lineTo(tip.x + ux * cl - nx * d / 2, tip.y + uy * cl - ny * d / 2); ctx.closePath(); ctx.fill();
      // chisel point, flattened and bright where it is worn
      ctx.fillStyle = '#7d868d'; ctx.beginPath(); ctx.moveTo(tip.x + ux * cl + nx * d / 2, tip.y + uy * cl + ny * d / 2); ctx.lineTo(tip.x + nx * d * 0.12, tip.y + ny * d * 0.12); ctx.lineTo(tip.x - nx * d * 0.12, tip.y - ny * d * 0.12); ctx.lineTo(tip.x + ux * cl - nx * d / 2, tip.y + uy * cl - ny * d / 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d7dbde'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(tip.x + nx * d * 0.12, tip.y + ny * d * 0.12); ctx.lineTo(tip.x - nx * d * 0.12, tip.y - ny * d * 0.12); ctx.stroke();
      // mushroomed top end and a worn grip band
      ctx.fillStyle = '#4a5156'; ctx.beginPath(); ctx.ellipse(hx, hy, d * 0.75, d * 0.6, ang, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(210,190,150,.35)'; ctx.lineWidth = d; ctx.beginPath(); ctx.moveTo(hx - ux * 120 / mm, hy - uy * 120 / mm); ctx.lineTo(hx - ux * 380 / mm, hy - uy * 380 / mm); ctx.stroke();
      // how hard you are leaning on it
      const k = clamp(p.F / 6000, 0, 1);
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(tip.x, tip.y, 20, 0, TAU); ctx.stroke();
      ctx.strokeStyle = k > 0.95 ? '#e2452c' : '#f59b23'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(tip.x, tip.y, 20, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.04, k)); ctx.stroke();
      ctx.restore();
    }
    if (sim.lift) {
      const l = sim.lift, link = Math.max(6, 28 / mm);
      ctx.save();
      for (let y = -10; y < l.ay - 10; y += link) { ctx.strokeStyle = '#4a4d50'; ctx.lineWidth = Math.max(2, 8 / mm); ctx.beginPath(); ctx.ellipse(l.hx + (l.ax - l.hx) * (y / l.ay), y, link * 0.28, link * 0.5, (y / link) % 2 ? 0 : Math.PI / 2, 0, TAU); ctx.stroke(); }
      ctx.strokeStyle = '#8a8f94'; ctx.lineWidth = Math.max(3, 14 / mm); ctx.beginPath(); ctx.arc(l.ax, l.ay - 12, Math.max(8, 40 / mm), 0.3, Math.PI * 1.35); ctx.stroke();
      ctx.restore();
    }
    const br = opt.breaker;
    if (br && sim.up.breaker) {
      // pedestal boom from the right catwalk; hammer scaled to a real 1.4 m tool, kept readable
      const B = { x: 690, y: 150 }, s = clamp(1.0 / mm, 0.3, 0.7);
      const tx = br.x, ty = br.y + (br.on ? (Math.random() - .5) * 3 : 0);
      const l1 = 360, l2 = 330, dx = tx - B.x, dy = ty - B.y, d = clamp(Math.hypot(dx, dy), 60, l1 + l2 - 1);
      const base = Math.atan2(dy, dx), cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), a1 = base + Math.acos(clamp(cosA, -1, 1));
      const ex = B.x + Math.cos(a1) * l1, ey = B.y + Math.sin(a1) * l1, a2 = Math.atan2(ty - ey, tx - ex);
      ctx.save(); ctx.lineCap = 'round';
      ctx.fillStyle = '#3a3936'; ctx.fillRect(B.x - 26, B.y - 12, 52, 34);
      ctx.strokeStyle = '#d99f18'; ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.lineWidth = 20; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(tx - Math.cos(a2) * 260 * s, ty - Math.sin(a2) * 260 * s); ctx.stroke();
      ctx.strokeStyle = '#1d1d1d'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(B.x + 8, B.y + 10); ctx.lineTo((B.x + ex) / 2, (B.y + ey) / 2 + 14); ctx.stroke();
      ctx.translate(tx, ty); ctx.rotate(a2);
      ctx.fillStyle = '#2b2f33'; ctx.fillRect(-260 * s, -40 * s, 200 * s, 80 * s);
      ctx.fillStyle = '#c9c9c4'; ctx.fillRect(-60 * s, -14 * s, 60 * s, 28 * s);
      ctx.restore();
    }
  }

  // ---------- effects ----------
  function consumeFx(sim, L) {
    for (const e of sim.fx) {
      if (e._r) continue; e._r = 1;
      const mat = e.mat ? MATS[e.mat] : null;
      const col = mat ? mixc(mat.fresh, [214, 206, 190], 0.5) : [214, 206, 190];
      if (e.t === 'dust') { const k = sim.up.dust ? 0.3 : 1; puff(e.x, e.y, Math.min(14, 2 + e.amount * 5 * k), 60 + e.amount * 30 * k, 14 + e.amount * 10 * k, col); }   // water spray keeps most of it down
      else if (e.t === 'crush') { puff(e.x, e.y, 3 + Math.min(10, e.mass * 0.6), 80, 20, col); fxp.flashes.push({ x: e.x, y: e.y, life: 0, max: 0.12, r: 20 + Math.min(80, e.size / sim.mmpx * 0.3) }); }
      else if (e.t === 'sledge') { for (let i = 0; i < 8; i++) chip(e.x, e.y, col); if (e.onSteel) spark(e.x, e.y, 16); }
      else if (e.t === 'breaker') { if (e.hit) chip(e.x, e.y, col); }
      else if (e.t === 'sparks') spark(e.x, e.y, 10);
      else if (e.t === 'guardHit') { spark(e.x, e.y, 4 + Math.min(10, e.E / 300)); }
      else if (e.t === 'guardBroken' || e.t === 'overspill') { spark(e.x || -40, e.y || 0, 14); puff(e.x || -40, e.y || 0, 8, 90, 26, col); }
      else if (e.t === 'chip') { for (let i = 0; i < 4; i++) chip(e.x, e.y, col); puff(e.x, e.y, 2 + Math.min(5, e.mass * 2), 60, 14, col); }
      else if (e.t === 'spall' || e.t === 'split') { for (let i = 0; i < 6; i++) chip(e.x, e.y, col); puff(e.x, e.y, 6, 70, 18, col); }
      else if (e.t === 'toggle') { puff(e.x, e.y, 14, 140, 40, [120, 116, 110]); }
      else if (e.t === 'impact' && e.v > 2.2 && e.m > 1 && !e.belt) puff(e.x, e.y, 1, 30, 10, col);
      else if (e.t === 'magnet') spark(e.x, e.y, 6);
    }
  }
  function puff(x, y, n, spd, size, col) {
    for (let i = 0; i < n; i++) { if (fxp.dust.length > 260) fxp.dust.shift(); const a = Math.random() * TAU, s = spd * (0.3 + Math.random()); fxp.dust.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 25, r: size * (0.5 + Math.random()), life: 0, max: 1.2 + Math.random() * 2, col }); }
  }
  function chip(x, y, col) { if (fxp.chips.length > 140) fxp.chips.shift(); const a = -Math.PI / 2 + (Math.random() - .5) * 2.4, s = 200 + Math.random() * 600; fxp.chips.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1 + Math.random() * 2.5, rot: Math.random() * 6, vr: (Math.random() - .5) * 30, life: 0, max: 0.5 + Math.random() * 0.6, col }); }
  function spark(x, y, n) { for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - .5) * 2.8, s = 300 + Math.random() * 700; fxp.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.2 + Math.random() * 0.35 }); } }
  function drawFxBack(L) {
    for (const f of fxp.flashes) { const k = f.life / f.max; ctx.fillStyle = `rgba(255,240,210,${0.25 * (1 - k)})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.6 + k), 0, TAU); ctx.fill(); }
  }
  function drawFxFront(L, dt) {
    const g = 2400;
    for (let i = fxp.dust.length - 1; i >= 0; i--) {
      const d = fxp.dust[i]; d.life += dt; if (d.life > d.max) { fxp.dust.splice(i, 1); continue; }
      d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 0.97; d.vy = d.vy * 0.97 - 8 * dt;
      const k = d.life / d.max, r = d.r * (1 + k * 2.4);
      ctx.globalAlpha = 0.34 * (1 - k) * (k < 0.1 ? k * 10 : 1);
      ctx.drawImage(tintedPuff(d.col, L), d.x - r, d.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    for (let i = fxp.chips.length - 1; i >= 0; i--) {
      const c = fxp.chips[i]; c.life += dt; if (c.life > c.max) { fxp.chips.splice(i, 1); continue; }
      c.vy += g * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.fillStyle = rgb(c.col); ctx.fillRect(-c.r, -c.r * 0.6, c.r * 2, c.r * 1.2); ctx.restore();
    }
    ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 2;
    for (let i = fxp.sparks.length - 1; i >= 0; i--) {
      const s = fxp.sparks[i]; s.life += dt; if (s.life > s.max) { fxp.sparks.splice(i, 1); continue; }
      s.vy += g * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      ctx.globalAlpha = 1 - s.life / s.max; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.018, s.y - s.vy * 0.018); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = fxp.flashes.length - 1; i >= 0; i--) { const f = fxp.flashes[i]; f.life += dt; if (f.life > f.max) fxp.flashes.splice(i, 1); }
  }
  const puffCache = new Map();
  function tintedPuff(col, L) {
    const lc = mixc(col, L.col, 0.35), key = (lc[0] | 0) + ',' + (lc[1] | 0) + ',' + (lc[2] | 0);
    let c = puffCache.get(key);
    if (!c) { c = off(64, 64); const g = c.getContext('2d'); g.drawImage(tex.puff, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = rgb(lc); g.fillRect(0, 0, 64, 64); puffCache.set(key, c); if (puffCache.size > 60) puffCache.delete(puffCache.keys().next().value); }
    return c;
  }
  function drawWeather(w, dt) {
    if (w.kind === 'regn' || w.kind === 'snø') {
      const snow = w.kind === 'snø';
      while (fxp.drops.length < (snow ? 90 : 140)) fxp.drops.push({ x: Math.random() * W, y: Math.random() * H, v: snow ? 60 + Math.random() * 60 : 900 + Math.random() * 500, s: Math.random() });
      ctx.strokeStyle = snow ? 'rgba(255,255,255,.85)' : 'rgba(210,220,230,.35)'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.2;
      for (const d of fxp.drops) {
        d.y += d.v * dt; d.x += (snow ? Math.sin(d.y * 0.02 + d.s * 6) * 30 : -60) * dt;
        if (d.y > H) { d.y = -10; d.x = Math.random() * W; }
        if (snow) { ctx.beginPath(); ctx.arc(d.x, d.y, 1.4 + d.s * 1.8, 0, TAU); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 4, d.y + 18); ctx.stroke(); }
      }
    } else fxp.drops.length = 0;
  }
  function viewInfo() { return view; }
  return { init, resize, frame, viewInfo, camFor, camBase, setAction, zoomAt, panBy, resetView, showAll, lookAt, isZoomed, darkness, sunset: (m) => SUNSET[m], sunrise: (m) => SUNRISE[m], get RS() { return RS; } };
})();
