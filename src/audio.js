'use strict';
/* ============================================================
   audio.js — all sound is synthesised, no samples.
   Impacts use modal synthesis (damped resonators + contact click,
   van den Doel & Pai): stone has fast-decaying inharmonic modes,
   steel plate rings long and low. Crushing is granular (hundreds of
   micro-fractures). Machine loops are live: mains hum, flywheel,
   jaw thump per stroke, V-belt squeal, conveyor, diesel loader with
   reversing alarm. Everything goes through a generated quarry
   reverb (rock-wall reflections) and a compressor.
   ============================================================ */
const Sound = (() => {
  let ac = null, out, master = null, comp, rev, revIn, buses = {}, banks = {}, live = {}, on = true, ready = false, voices = 0;
  let SR = 44100;   // set to the context's own rate: phones run at 48 kHz, and a reverb buffer at another rate is refused
  const rnd = Math.random;

  // ---------- offline synthesis helpers ----------
  function buf(sec, fill, ch = 1) {
    const n = Math.max(1, Math.floor(sec * SR)), b = ac.createBuffer(ch, n, SR);
    for (let c = 0; c < ch; c++) fill(b.getChannelData(c), n, c);
    return b;
  }
  // modes: [freq, decay seconds, amp]; click: noise burst length (s) and brightness
  function modal(sec, modes, click = 0.002, bright = 0.6, body = null) {
    return buf(sec, (d, n) => {
      const ph = modes.map(() => rnd() * 6.283);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        let s = 0;
        for (let k = 0; k < modes.length; k++) { const m = modes[k]; s += m[2] * Math.exp(-t / m[1]) * Math.sin(6.283 * m[0] * t + ph[k]); }
        // contact: raised-cosine force pulse shapes the attack
        const att = t < 0.0015 ? 0.5 - 0.5 * Math.cos(Math.PI * t / 0.0015) : 1;
        s *= att;
        if (t < click * 6) { const w = rnd() * 2 - 1; lp += (w - lp) * bright; s += lp * Math.exp(-t / click) * 0.9; }
        if (body) s += body[1] * Math.exp(-t / body[2]) * Math.sin(6.283 * body[0] * t) * att;
        d[i] = s;
      }
      norm(d, 0.9);
    });
  }
  function norm(d, peak) { let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); if (m > 0) { const k = peak / m; for (let i = 0; i < d.length; i++) d[i] *= k; } }
  const RATIOS_STONE = [1, 1.58, 2.21, 2.97, 3.82, 4.71, 5.93];
  const RATIOS_PLATE = [1, 1.62, 2.43, 3.31, 4.68, 6.07, 7.9];
  function stoneModes(f0, tau, n = 6) { return RATIOS_STONE.slice(0, n).map((r, i) => [f0 * r * (1 + (rnd() - .5) * 0.06), tau / (1 + i * 0.5), 1 / (1 + i * 0.7) * (0.6 + rnd() * 0.6)]); }
  function plateModes(f0, tau, n = 7) { return RATIOS_PLATE.slice(0, n).map((r, i) => [f0 * r * (1 + (rnd() - .5) * 0.03), tau / (1 + i * 0.25), 1 / (1 + i * 0.45) * (0.5 + rnd() * 0.7)]); }
  // granular crunch: many tiny fractures plus a low rumble
  function crunch(sec, density, low) {
    return buf(sec, (d, n) => {
      const events = Math.floor(density * sec);
      for (let e = 0; e < events; e++) {
        const t0 = Math.pow(rnd(), 1.8) * sec * 0.85, i0 = Math.floor(t0 * SR);
        const f = 220 + rnd() * 1600, tau = 0.0015 + rnd() * 0.005, a = (0.25 + rnd()) * Math.exp(-t0 / (sec * 0.45));
        const len = Math.min(n - i0, Math.floor(tau * 6 * SR)), ph = rnd() * 6.28;
        for (let i = 0; i < len; i++) { const t = i / SR; d[i0 + i] += a * 0.6 * Math.exp(-t / tau) * Math.sin(6.283 * f * t + ph) + a * 0.7 * (rnd() * 2 - 1) * Math.exp(-t / 0.002); }
      }
      let lp = 0, lp2 = 0;
      for (let i = 0; i < n; i++) { const t = i / SR; lp += ((rnd() * 2 - 1) - lp) * 0.03; lp2 += (lp - lp2) * 0.05; d[i] += lp2 * low * 12 * Math.exp(-t / (sec * 0.5)) * Math.min(1, t / 0.01); }
      norm(d, 0.9);
    });
  }
  function noiseBuf(sec, k = 1) { return buf(sec, (d, n) => { let lp = 0; for (let i = 0; i < n; i++) { lp += ((rnd() * 2 - 1) - lp) * k; d[i] = lp; } norm(d, 0.9); }); }
  // seagull: a swooping, slightly rough cry ("kjau")
  function gull() {
    return buf(0.9, (d, n) => {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR, u = t / 0.9;
        const f = u < 0.25 ? 1050 + u * 2200 : 1600 - (u - 0.25) * 1300;
        ph += 6.283 * f * (1 + 0.012 * Math.sin(6.283 * 31 * t)) / SR;
        const env = Math.sin(Math.PI * Math.min(1, u * 1.05)) ** 1.5;
        d[i] = env * (Math.sin(ph) * 0.6 + Math.sin(2 * ph) * 0.3 + Math.sin(3 * ph) * 0.15 + (rnd() - .5) * 0.15);
      }
      norm(d, 0.7);
    });
  }
  function chirp() {
    return buf(0.35, (d, n) => {
      let ph = 0; const f0 = 3000 + rnd() * 2500, k = (rnd() - .5) * 6000;
      for (let i = 0; i < n; i++) { const t = i / SR; const seg = (t * 14) % 1; const f = f0 + k * seg; ph += 6.283 * f / SR; d[i] = Math.sin(ph) * Math.sin(Math.PI * seg) * (t < 0.3 ? 1 : 0) * (Math.floor(t * 14) % 2 ? 0.2 : 1); }
      norm(d, 0.5);
    });
  }
  // ---- loops tuned to be heard on a phone speaker (little below 150 Hz) ----
  // electric motor: 100 Hz magnetostriction buzz with its harmonics and a slot whine
  function motorLoop() {
    return buf(1, (d, n) => {
      const H = [[100, 1], [200, .7], [300, .45], [400, .32], [500, .2], [600, .26], [700, .1], [900, .08], [1200, .06]];
      const ph = H.map(() => rnd() * 6.283);
      let lp = 0;
      for (let i = 0; i < n; i++) { const t = i / SR; let v = 0; for (let k = 0; k < H.length; k++) v += H[k][1] * Math.sin(6.283 * H[k][0] * t + ph[k]); lp += ((rnd() * 2 - 1) - lp) * 0.2; d[i] = v + lp * 0.25; }
      norm(d, 0.8);
    });
  }
  // vibrating feeder: an unbalanced-mass motor shakes the steel pan ~16 times a second;
  // every stroke rings the pan and rattles the stones on it
  function feederLoop() {
    return buf(1, (d, n) => {
      const strokes = 16, modes = plateModes(240, 0.035, 6), modes2 = stoneModes(1500, 0.006, 4);
      for (let k = 0; k < strokes; k++) {
        const i0 = Math.floor((k / strokes + (rnd() - .5) * 0.004) * n), a = 0.8 + rnd() * 0.4;
        const ph = modes.map(() => rnd() * 6.283);
        for (let i = 0; i < Math.min(n - i0, SR * 0.06); i++) {
          const t = i / SR; let v = 0;
          for (let m = 0; m < modes.length; m++) v += modes[m][2] * Math.exp(-t / modes[m][1]) * Math.sin(6.283 * modes[m][0] * t + ph[m]);
          v += 0.35 * (rnd() * 2 - 1) * Math.exp(-t / 0.004);
          d[i0 + i] += a * v;
        }
        // a few small rattles between strokes
        for (let r = 0; r < 3; r++) {
          const j0 = i0 + Math.floor(rnd() * n / strokes * 0.8);
          for (let i = 0; i < Math.min(n - j0, SR * 0.02); i++) { const t = i / SR; let v = 0; for (const m of modes2) v += m[2] * Math.exp(-t / m[1]) * Math.sin(6.283 * m[0] * t); d[j0 + i] += 0.25 * v; }
        }
      }
      // motor hum underneath
      for (let i = 0; i < n; i++) d[i] += 0.12 * Math.sin(6.283 * 16 * 9 * i / SR);
      norm(d, 0.8);
    });
  }
  // diesel engine: firing pulses (6 cylinders at ~800 rpm idle = 40 Hz) through an exhaust/body resonance
  function dieselLoop() {
    return buf(1, (d, n) => {
      const fire = 40;
      let lp = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR, ph = (t * fire) % 1, cyl = Math.floor(t * fire) % 6;
        const pulse = Math.exp(-ph * 9) * (0.75 + 0.25 * Math.sin(cyl * 1.7));
        lp += ((rnd() * 2 - 1) - lp) * 0.3;
        const x = pulse * (0.7 + 0.6 * lp);
        // two-pole resonance around 160 Hz and a rasp around 700 Hz
        b1 += (x - b1) * 0.12; b2 += (b1 - b2) * 0.12;
        d[i] = b2 * 2.2 + x * 0.35 + 0.12 * Math.sin(6.283 * 700 * t) * pulse;
      }
      norm(d, 0.8);
    });
  }
  // rock grinding against the plate: a gritty scrape
  function scrape(sec) {
    return buf(sec, (d, n) => {
      let lp = 0, hp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR, env = Math.sin(Math.PI * Math.min(1, t / sec)) * (0.6 + 0.4 * Math.sin(6.283 * 23 * t));
        const w = rnd() * 2 - 1; lp += (w - lp) * 0.25; hp = lp - hp * 0.0;
        d[i] = env * lp * (rnd() < 0.02 ? 3 : 1);
      }
      norm(d, 0.7);
    });
  }
  // toggle/pitman knock: a short dull steel clunk you hear every stroke
  function knock() { return modal(0.16, [[180 + rnd() * 30, 0.03, 1], [410 + rnd() * 40, 0.018, 0.6], [930 + rnd() * 80, 0.009, 0.35], [70, 0.06, 0.5]], 0.002, 0.35); }

  // ---- signals and UI ----
  // air horn: two slightly detuned reeds, rich in harmonics, through a body resonance
  function horn(sec) {
    return buf(sec, (d, n) => {
      const f1 = 311, f2 = 316 * 1.003; let b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR, env = Math.min(1, t / 0.04) * Math.min(1, (sec - t) / 0.12);
        let v = 0; for (let h = 1; h <= 9; h++) v += (Math.sin(6.283 * f1 * h * t) + Math.sin(6.283 * f2 * h * t)) / (h * 0.9);
        b1 += (v - b1) * 0.35; b2 += (b1 - b2) * 0.35;
        d[i] = env * (b2 * 0.7 + v * 0.1);
      }
      norm(d, 0.85);
    });
  }
  // a short bright chime of three notes
  function chime() {
    return buf(1.1, (d, n) => {
      const notes = [[523, 0], [659, 0.11], [784, 0.22]];
      for (let i = 0; i < n; i++) {
        const t = i / SR; let v = 0;
        for (const [f, t0] of notes) if (t >= t0) { const u = t - t0; v += Math.exp(-u * 4.5) * (Math.sin(6.283 * f * u) + 0.3 * Math.sin(6.283 * f * 2 * u) + 0.12 * Math.sin(6.283 * f * 3 * u)); }
        d[i] = v * Math.min(1, t / 0.004);
      }
      norm(d, 0.7);
    });
  }
  // till: a mechanical click and a bell
  function cash() {
    return buf(0.7, (d, n) => {
      const bell = plateModes(2350, 0.3, 5);
      for (let i = 0; i < n; i++) {
        const t = i / SR; let v = 0;
        if (t < 0.03) v += (rnd() * 2 - 1) * Math.exp(-t / 0.006) * 0.8;
        if (t > 0.06) { const u = t - 0.06; for (const m of bell) v += m[2] * Math.exp(-u / m[1]) * Math.sin(6.283 * m[0] * u) * 0.5; }
        d[i] = v;
      }
      norm(d, 0.6);
    });
  }
  // overload buzzer: a rough 420 Hz square with a slow tremolo
  function buzz() {
    return buf(0.6, (d, n) => {
      for (let i = 0; i < n; i++) { const t = i / SR, env = Math.min(1, t / 0.01) * Math.min(1, (0.6 - t) / 0.03), tr = 0.6 + 0.4 * Math.sin(6.283 * 9 * t); d[i] = env * tr * (Math.sign(Math.sin(6.283 * 420 * t)) * 0.6 + 0.3 * Math.sin(6.283 * 630 * t)); }
      norm(d, 0.5);
    });
  }
  function click() { return buf(0.04, (d, n) => { let lp = 0; for (let i = 0; i < n; i++) { const t = i / SR; lp += ((rnd() * 2 - 1) - lp) * 0.3; d[i] = lp * Math.exp(-t / 0.006) + 0.4 * Math.sin(6.283 * 1800 * t) * Math.exp(-t / 0.004); } norm(d, 0.7); }); }

  function impulseResponse() {
    // quarry: a few discrete reflections from rock faces, then a dark diffuse tail
    return buf(2.4, (d, n, c) => {
      const taps = [[0.031, .5], [0.047, .35], [0.068, .42], [0.093, .3], [0.121, .26], [0.166, .2], [0.214, .14]];
      for (const [t, a] of taps) { const i = Math.floor((t + (c ? 0.004 : 0)) * SR); d[i] += a * (c ? 0.9 : 1); }
      let lp = 0;
      for (let i = 0; i < n; i++) { const t = i / SR; const k = 0.5 * Math.exp(-t * 1.4); lp += ((rnd() * 2 - 1) - lp) * (0.35 * Math.exp(-t * 1.2) + 0.05); d[i] += lp * k * (t > 0.02 ? 1 : 0); }
      norm(d, 0.7);
    }, 2);
  }

  // ---------- setup ----------
  // Mobile browsers and in-app web views only let audio start inside a touch. Every touch tries to
  // wake the context and plays one silent sample, which is what unlocks some web views.
  function unlock() {
    if (!ac) return;
    try {
      if (ac.state !== 'running') ac.resume();
      const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, ac.sampleRate); s.connect(ac.destination); s.start(0);
    } catch (e) { /* ignore */ }
  }
  let hooked = false;
  function hook() {
    if (hooked) return; hooked = true;
    for (const ev of ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click']) document.addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) unlock(); });
  }
  function init() {
    if (ac) { unlock(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); } catch (e) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e2) { ac = null; return; } }
    SR = ac.sampleRate || 44100;
    hook(); unlock();
    try { build(); } catch (e) { console.error('sound init failed', e); }
  }
  function build() {
    // phone speakers give little below ~150 Hz: trim the deep sub so it does not eat the headroom,
    // compress, lift the level and catch the peaks with a limiter
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 45; hp.Q.value = 0.7;
    const lows = ac.createBiquadFilter(); lows.type = 'lowshelf'; lows.frequency.value = 130; lows.gain.value = -5;
    const pres = ac.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 1800; pres.Q.value = 0.8; pres.gain.value = 1;
    comp = ac.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    const lim = ac.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    out = ac.createGain(); out.gain.value = on ? GAIN : 0;
    hp.connect(lows).connect(pres).connect(comp); comp.connect(out).connect(lim).connect(ac.destination);
    master = lim; comp = hp;
    rev = ac.createConvolver(); rev.buffer = impulseResponse();
    const revG = ac.createGain(); revG.gain.value = 0.32; rev.connect(revG).connect(comp);
    revIn = rev;
    for (const k of ['sfx', 'mach', 'amb']) { const g = ac.createGain(); g.gain.value = k === 'amb' ? 0.55 : 1; if (k === 'sfx') { const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.5; g.connect(lp).connect(comp); } else g.connect(comp); const s = ac.createGain(); s.gain.value = k === 'amb' ? 0.1 : k === 'mach' ? 0.18 : 0.28; g.connect(s).connect(revIn); buses[k] = g; }
    // banks are synthesised a few at a time so the screen does not freeze on a slow phone
    const steps = [];
    const B = (fn) => steps.push(fn);
    B(() => banks.rock = [1250, 780, 470, 270, 150].map((f0, si) => Array.from({ length: 4 }, () => modal(0.1 + si * 0.07, stoneModes(f0, 0.006 + si * 0.006, 4), 0.004 + si * 0.002, 0.35 - si * 0.05, si >= 3 ? [70 + rnd() * 30, 0.8, 0.05 + si * 0.02] : null))));
    B(() => { banks.plate = [520, 330, 220, 150, 110].map((f0, si) => Array.from({ length: 3 }, () => modal(0.6 + si * 0.25, plateModes(f0, 0.18 + si * 0.12), 0.0015, 0.7, [55 + rnd() * 20, 0.9, 0.08]))); });
    B(() => { banks.belt = Array.from({ length: 3 }, () => modal(0.12, stoneModes(200, 0.012, 3), 0.004, 0.25, [80, 1, 0.04])); });
    B(() => { banks.crunch = [0.22, 0.35, 0.55].map((s, i) => Array.from({ length: 3 }, () => crunch(s, 260 + i * 160, 0.4 + i * 0.3))).flat(); });
    B(() => { banks.crack = Array.from({ length: 4 }, () => modal(0.16, stoneModes(650 + rnd() * 350, 0.01, 4), 0.006, 0.45)); });
    B(() => { banks.sledge = Array.from({ length: 4 }, () => modal(0.4, plateModes(1250 + rnd() * 200, 0.035, 4).concat(stoneModes(330, 0.025, 3)), 0.004, 0.45, [95, 1.1, 0.06])); });
    B(() => { banks.sledgeSteel = Array.from({ length: 2 }, () => modal(1.3, plateModes(1180 + rnd() * 200, 0.55, 7), 0.001, 0.9)); });
    B(() => { banks.breaker = Array.from({ length: 3 }, () => modal(0.28, plateModes(820 + rnd() * 100, 0.05, 5), 0.002, 0.5, [62, 1.2, 0.07])); });
    B(() => { banks.chip = Array.from({ length: 5 }, () => modal(0.05, stoneModes(1500 + rnd() * 700, 0.003, 3), 0.003, 0.5)); });
    B(() => { banks.thump = Array.from({ length: 3 }, () => modal(0.4, [[48 + rnd() * 8, 0.18, 1], [96, 0.08, 0.35], [190, 0.04, 0.2]], 0.004, 0.15)); });
    B(() => { banks.clank = Array.from({ length: 3 }, () => modal(0.9, plateModes(640 + rnd() * 300, 0.35, 6), 0.001, 0.9)); });
    B(() => { banks.snap = [modal(1.4, plateModes(380, 0.6, 7).concat(stoneModes(1200, 0.05, 4)), 0.006, 0.95, [42, 1.6, 0.25])]; });
    B(() => { banks.contactor = [modal(0.12, [[1900, 0.012, 1], [3300, 0.008, .6], [180, 0.03, .5]], 0.0015, 0.9)]; });
    B(() => { banks.avalanche = [crunch(1.2, 140, 1.1), crunch(1.0, 120, 1.0)]; });
    B(() => { banks.gull = [gull(), gull()]; });
    B(() => { banks.chirp = Array.from({ length: 4 }, chirp); });
    B(() => { banks.knock = Array.from({ length: 4 }, knock); });
    B(() => { banks.hornS = horn(0.35); banks.hornL = horn(1.4); banks.chime = chime(); banks.cash = cash(); banks.buzz = buzz(); banks.click = click(); });
    B(() => { banks.scrape = [scrape(0.22), scrape(0.3), scrape(0.4)]; });
    B(() => { banks.motorLoop = motorLoop(); banks.feederLoop = feederLoop(); banks.dieselLoop = dieselLoop(); });
    B(() => { banks.chain = Array.from({ length: 3 }, () => modal(0.3, plateModes(2600 + rnd() * 800, 0.05, 5), 0.001, 0.9)); });
    let i = 0;
    const run = () => {
      const t0 = performance.now();
      while (i < steps.length && performance.now() - t0 < 30) { try { steps[i](); } catch (e) { console.error('sound bank', i, e); } i++; }
      if (i < steps.length) { setTimeout(run, 0); return; }
      try { startLoops(); ready = true; } catch (e) { console.error('sound loops', e); }
    };
    run();
  }
  // a short two-note chime straight to the speakers (bypasses the mix), to check that sound works
  function test() {
    init(); unlock();
    if (!ac) return 'none';
    try {
      const t = ac.currentTime + 0.05;
      for (const [f, d] of [[660, 0], [880, 0.18]]) {
        const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.type = 'triangle';
        g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.35, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.35);
        o.connect(g).connect(ac.destination); o.start(t + d); o.stop(t + d + 0.4);
      }
    } catch (e) { return 'error'; }
    return ac.state;
  }
  // sounds the screens ask for directly (not from the simulation)
  function ui(name) {
    if (!ac || !ready) return;
    switch (name) {
      case 'shiftStart': play(banks.hornS, { gain: 0.5, bus: 'amb', pan: -0.3, force: true }); play(banks.hornS, { gain: 0.5, bus: 'amb', pan: -0.3, delay: 0.5, force: true }); break;
      case 'shiftEnd': play(banks.hornL, { gain: 0.55, bus: 'amb', pan: -0.3, force: true }); break;
      case 'goal': play(banks.chime, { gain: 0.6, force: true }); break;
      case 'cash': play(banks.cash, { gain: 0.5, force: true }); break;
      case 'click': play(banks.click, { gain: 0.35, force: true }); break;
      case 'deny': play(banks.contactor[0], { gain: 0.25, rate: 0.6, force: true }); break;
    }
  }
  const GAIN = 2.2;
  function setOn(v) { on = v; if (out) out.gain.setTargetAtTime(v ? GAIN : 0, ac.currentTime, 0.05); }

  function play(b, o = {}) {
    if (!ac || !ready || !b) return;
    if (voices > 30 && !o.force) return;
    const src = ac.createBufferSource(); src.buffer = b; src.playbackRate.value = o.rate || 1;
    const g = ac.createGain(); g.gain.value = o.gain ?? 1;
    let node = src.connect(g);
    if (o.pan !== undefined && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); node = node.connect(p); }
    if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node = node.connect(f); }
    node.connect(buses[o.bus || 'sfx']);
    voices++; src.onended = () => { voices--; };
    src.start(ac.currentTime + (o.delay || 0));
  }
  const pick = (a) => a[(rnd() * a.length) | 0];
  const panX = (x) => (x - 360) / 420;

  // ---------- live loops ----------
  function osc(type, f, g, dest) { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; const gg = ac.createGain(); gg.gain.value = g; o.connect(gg).connect(dest); o.start(); return { o, g: gg }; }
  function noiseLoop(k, dest, gain, filt) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf(2, k); s.loop = true;
    const f = ac.createBiquadFilter(); f.type = filt[0]; f.frequency.value = filt[1]; f.Q.value = filt[2] || 0.7;
    const g = ac.createGain(); g.gain.value = gain; s.connect(f).connect(g).connect(dest); s.start(); return { s, f, g };
  }
  function bufLoop(b, dest, gain, filt) {
    const s = ac.createBufferSource(); s.buffer = b; s.loop = true;
    const g = ac.createGain(); g.gain.value = gain;
    let node = s;
    if (filt) { const f = ac.createBiquadFilter(); f.type = filt[0]; f.frequency.value = filt[1]; f.Q.value = filt[2] || 0.7; node.connect(f); node = f; }
    node.connect(g).connect(dest); s.start(); return { s, g };
  }
  function startLoops() {
    const m = ac.createGain(); m.gain.value = 0; m.connect(buses.mach); live.motorBus = m;
    live.hum50 = osc('sine', 50, 0.1, m); live.hum100 = osc('sine', 100, 0.35, m); live.hum150 = osc('triangle', 150, 0.05, m);
    live.whine = osc('sine', 740, 0.015, m);
    live.motor = bufLoop(banks.motorLoop, m, 0.35, ['lowpass', 1500]);
    live.feeder = bufLoop(banks.feederLoop, buses.mach, 0, ['highpass', 140]);
    live.engine = bufLoop(banks.dieselLoop, buses.mach, 0, ['lowpass', 1800]);
    live.hyd = osc('sawtooth', 190, 0, buses.mach);
    { const hf = ac.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 950; hf.Q.value = 2.5; live.hyd.g.disconnect(); live.hyd.g.connect(hf); hf.connect(buses.mach); }
    live.slide = noiseLoop(0.25, buses.sfx, 0, ['bandpass', 900, 0.6]);
    live.pile = noiseLoop(0.6, buses.amb, 0, ['bandpass', 2600, 0.9]);
    live.fly = noiseLoop(0.05, m, 0.0, ['bandpass', 140, 1.2]);
    live.squeal = osc('sawtooth', 1650, 0, buses.mach); live.squeal2 = osc('sawtooth', 2310, 0, buses.mach);
    const sf = ac.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 2000; sf.Q.value = 3;
    live.squeal.g.disconnect(); live.squeal2.g.disconnect(); live.squeal.g.connect(sf); live.squeal2.g.connect(sf); sf.connect(buses.mach);
    live.beltHum = noiseLoop(0.08, buses.mach, 0, ['bandpass', 420, 0.8]);
    live.diesel = osc('sawtooth', 42, 0, buses.mach);   // kept as sub-bass for headphones
    const df = ac.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 380; live.diesel.g.disconnect(); live.diesel.g.connect(df); df.connect(buses.mach); live.dieselF = df;
    live.beep = osc('square', 1180, 0, buses.mach);
    live.wind = noiseLoop(0.02, buses.amb, 0.25, ['bandpass', 420, 0.6]);
    live.rain = noiseLoop(0.9, buses.amb, 0, ['highpass', 2500]);
    live.hiss = noiseLoop(0.9, buses.mach, 0, ['highpass', 3500]);
    live.crushBed = noiseLoop(0.12, buses.mach, 0, ['bandpass', 380, 0.8]);
  }

  // ---------- per-frame update: machine state + sim events ----------
  let lastTheta = 0, ambT = 3, beepT = 0, chainT = 0, feedT = 1, pileR = 0, slideG = 0, ovT = 0, ovNext = 0;
  function update(sim, view, dt) {
    if (!ac || !ready || !sim) return;
    const t = ac.currentTime, M = sim.m, T = sim.tier;
    // the office and title screens are quiet: no machine running in the background
    if (view.active === false) {
      for (const k of ['motorBus', 'feeder', 'engine', 'crushBed', 'beltHum', 'slide', 'pile', 'squeal', 'squeal2', 'hyd', 'diesel', 'beep', 'hiss']) { const n = live[k]; if (n) (n.g || n).gain.setTargetAtTime(0, t, 0.3); }
      for (const e of sim.fx) e._a = 1;
      return;
    }
    const run = M.state === 'run' || M.state === 'relief';
    const w01 = M.w / M.w0;
    const loadF = clamp(M.power / M.Prated, 0, 2.5);
    live.motorBus.gain.setTargetAtTime(run ? 0.16 + 0.08 * loadF : 0, t, run ? 0.08 : 0.35);
    live.whine.o.frequency.setTargetAtTime(380 + 360 * w01, t, 0.1);
    live.hum100.g.gain.setTargetAtTime(0.15 + 0.12 * loadF, t, 0.05);
    live.fly.g.gain.setTargetAtTime(0.25 * w01 * (0.6 + 0.4 * Math.sin(M.theta)), t, 0.02);
    live.fly.f.frequency.setTargetAtTime(80 + 90 * w01, t, 0.1);
    // overload buzzer on the panel after the needle has sat in the red for a moment
    if (run && (M.block > 0.6 || M.amps > T.kw * 1.72 * 1.6)) { ovT += dt; if (ovT > 0.8 && t > ovNext) { ovNext = t + 0.9; play(banks.buzz, { gain: 0.35, bus: 'mach', pan: 0.6, force: true }); } } else ovT = 0;
    // jaw thump once per shaft revolution, harder under load
    const rev = Math.floor(M.theta / TAU);
    if (rev !== Math.floor(lastTheta / TAU) && w01 > 0.15) {
      play(pick(banks.thump), { gain: 0.12 + 0.45 * Math.min(1, loadF * 0.7) + (M.block > 0.5 ? 0.3 : 0), bus: 'mach', rate: 0.8 + 0.25 * w01 * (275 / T.rpm), pan: -0.4 });
      // the toggle seats and pitman knock once a stroke; it is the "dunk-dunk" you hear on site
      play(pick(banks.knock), { gain: (0.1 + 0.3 * Math.min(1, loadF)) * w01, bus: 'mach', rate: (0.85 + 0.15 * w01) * (1 + (rnd() - .5) * 0.06), pan: -0.25, lp: 1800 });
    }
    lastTheta = M.theta;
    const sq = clamp(M.beltSlip * 1.5, 0, 1) * (run ? 1 : 0);
    live.squeal.g.gain.setTargetAtTime(sq * 0.05 * (0.7 + rnd() * 0.6), t, 0.02); live.squeal2.g.gain.setTargetAtTime(sq * 0.035, t, 0.02);
    live.squeal.o.frequency.setTargetAtTime(1550 + rnd() * 250, t, 0.01);
    // the bed of stone grinds on the closing stroke
    const close = Math.max(0, Math.sin(M.theta));
    live.crushBed.g.gain.setTargetAtTime(run ? clamp((M.block > 0 ? 0.25 : 0) + loadF * 0.12, 0, 0.5) * (0.35 + 0.65 * close) : 0, t, 0.03);
    live.motor.g.gain.setTargetAtTime(0.28 + 0.2 * loadF, t, 0.05);
    live.motor.s.playbackRate.setTargetAtTime(0.97 + 0.03 * Math.min(1, w01), t, 0.1);
    // vibrating feeder: runs with the crusher at the set level; louder with stones on the pan
    const lv = Sim.feedMm(sim.save) / 84, fOn = (M.feedV || 0) > 0;
    let onPan = 0; const deck = M.feedDeck;
    if (deck) for (const b of sim.rocks) { for (const a of b.touch) if (a.A === deck || a.B === deck) { onPan++; break; } }
    live.feeder.g.gain.setTargetAtTime(fOn ? 0.05 + 0.025 * lv + Math.min(0.12, onPan * 0.012) : 0, t, 0.12);
    live.feeder.s.playbackRate.setTargetAtTime(0.85 + lv * 0.05, t, 0.2);
    if (fOn && onPan) { feedT -= dt * Math.min(14, onPan * (0.6 + lv * 0.5)); if (feedT <= 0) { feedT = 1; const F = Machine.G.FEED; play(pick(rnd() < 0.7 ? banks.chip : banks.rock[1]), { gain: 0.05 + rnd() * 0.07, pan: panX((F.x0 + F.x1) / 2), rate: 0.7 + rnd() * 0.5 }); } }
    // stones landing on the stockpile
    const ph = sim.pileHits || 0; sim.pileHits = 0;
    pileR += (ph / Math.max(dt, 0.008) - pileR) * Math.min(1, dt * 3);
    live.pile.g.gain.setTargetAtTime(Math.min(0.08, pileR * 0.0012), t, 0.15);
    if (ph && rnd() < 0.25) play(pick(banks.rock[0]), { gain: 0.04 + rnd() * 0.04, pan: -0.95, rate: 0.8 + rnd() * 0.4, bus: 'amb' });
    // conveyor
    live.beltHum.g.gain.setTargetAtTime(0.12 + Math.min(0.3, view.beltLoad * 0.02), t, 0.2);
    // loader
    const L = sim.loader;
    let dl = 0, rpm = 1, hyd = 0, reversing = false, slide = 0;
    if (L.busy && sim.trGeom) {
      const g = sim.trGeom(), tt = L.t;
      dl = 1;
      if (tt < g.T1) { rpm = 1.35; reversing = g.spec.kind === 'dumper'; dl = 1; }                 // backing up the ramp
      else if (tt < g.T2) { rpm = 1.7; hyd = 1; }                                                      // revving the PTO, bed going up
      else if (tt < g.T3) { rpm = 1.05; hyd = 0.25; }                                                  // bed coming down
      else { rpm = 1.45; dl = Math.max(0, 1 - (tt - g.T3) / (g.T4 - g.T3) * 0.85); }               // driving off
      const out = L.items ? L.items.reduce((a, it) => a + (it.out ? 1 : 0), 0) : 0;
      if (out > (L._out || 0)) slide = Math.min(1, (out - (L._out || 0)) * 0.35);
      L._out = out;
    }
    live.engine.g.gain.setTargetAtTime(dl * 0.11, t, 0.25);
    live.engine.s.playbackRate.setTargetAtTime(rpm * (sim.up.loader ? 0.9 : 1.15), t, 0.35);
    live.diesel.g.gain.setTargetAtTime(dl * 0.05, t, 0.2);
    live.diesel.o.frequency.setTargetAtTime(40 * rpm, t, 0.3);
    live.hyd.g.gain.setTargetAtTime(hyd * 0.03, t, 0.2);
    live.hyd.o.frequency.setTargetAtTime(170 + 50 * hyd, t, 0.3);
    slideG = Math.max(slideG * Math.exp(-dt * 1.5), slide);
    live.slide.g.gain.setTargetAtTime(slideG * 0.3, t, 0.05);
    beepT += dt;
    live.beep.g.gain.setTargetAtTime(reversing && (beepT % 1.0) < 0.5 ? 0.018 : 0, t, 0.004);
    live.hiss.g.gain.setTargetAtTime(M.state === 'relief' || (M.state === 'clearing' && sim.up.hydro) ? 0.07 : 0, t, 0.05);
    // weather
    const wet = sim.weather.wet || 0;
    live.rain.g.gain.setTargetAtTime(sim.weather.kind === 'regn' ? 0.09 : 0, t, 0.5);
    live.wind.g.gain.setTargetAtTime(0.06 + 0.12 * (sim.weather.wind || 0.3), t, 1);
    live.wind.f.frequency.setTargetAtTime(440 + 220 * Math.sin(t * 0.13) + 110 * Math.sin(t * 0.41), t, 0.5);
    void wet;
    // ambience: gulls over the fjord, small birds in the morning
    ambT -= dt;
    if (ambT <= 0) { ambT = 6 + rnd() * 14; if (rnd() < 0.55) play(pick(banks.gull), { gain: 0.05 + rnd() * 0.05, bus: 'amb', pan: rnd() * 2 - 1, rate: 0.9 + rnd() * 0.2 }); else if (view.hour < 11) play(pick(banks.chirp), { gain: 0.04, bus: 'amb', pan: rnd() * 2 - 1 }); }
    // events
    let budget = 7;
    for (const e of sim.fx) {
      if (e._a) continue; e._a = 1;
      const pan = e.x !== undefined ? panX(e.x) : 0;
      switch (e.t) {
        case 'impact': {
          if (budget <= 0) break;
          const E = 0.5 * Math.min(e.m, 400) * e.v * e.v;
          if (E < 0.05) break; budget--;
          const g = clamp(0.08 + Math.log10(1 + E) * 0.16, 0.05, 1);
          const sc = e.m < 0.15 ? 0 : e.m < 1 ? 1 : e.m < 6 ? 2 : e.m < 40 ? 3 : 4;
          if (e.belt) play(pick(banks.belt), { gain: g * 0.6, pan, rate: 0.9 + rnd() * 0.3 });
          else if (e.steel) play(pick(banks.plate[clamp(sc, 0, 4)]), { gain: g * 0.75, pan, rate: 0.92 + rnd() * 0.16 });
          else play(pick(banks.rock[sc]), { gain: g, pan, rate: 0.85 + rnd() * 0.3 });
          break;
        }
        case 'crush': {
          const k = clamp(Math.log10(1 + e.mass * 10) / 2.4, 0.1, 1);
          play(banks.crunch[Math.min(8, Math.floor(k * 3) * 3 + ((rnd() * 3) | 0))], { gain: 0.25 + k * 0.6, pan, rate: 0.85 + rnd() * 0.25 });
          if (k > 0.4) play(pick(banks.crack), { gain: 0.2 + k * 0.4, pan, rate: 0.7 + rnd() * 0.4, delay: 0.01 });
          break;
        }
        case 'chip': {   // teeth biting the edges off: a short grinding crunch and a patter of chips
          const k = clamp(Math.log10(1 + e.mass * 30) / 2.4, 0.08, 0.7);
          play(banks.crunch[Math.min(8, Math.floor(k * 3) * 3 + ((rnd() * 3) | 0))], { gain: 0.16 + k * 0.4, pan, rate: 1.05 + rnd() * 0.3 });
          for (let i = 0; i < 2; i++) play(pick(banks.chip), { gain: 0.1 + k * 0.1, pan, delay: 0.03 + rnd() * 0.18 });
          break;
        }
        case 'grind': if (budget > 0) { budget--; play(pick(banks.scrape), { gain: clamp(0.06 + e.mass * 0.5, 0.06, 0.22), pan, rate: 0.8 + rnd() * 0.5 }); } break;
        case 'crackle': play(pick(banks.crack), { gain: 0.25, pan, rate: 1.1 + rnd() * 0.3 }); break;
        case 'spall': play(pick(banks.crack), { gain: 0.35, pan, rate: 1.3 + rnd() * 0.4 }); for (let i = 0; i < 3; i++) play(pick(banks.chip), { gain: 0.15, pan, delay: 0.05 + rnd() * 0.25 }); break;
        case 'split': play(pick(banks.crack), { gain: 0.8, pan, rate: 0.7 + rnd() * 0.2 }); play(pick(banks.rock[4]), { gain: 0.6, pan, delay: 0.03 }); break;
        case 'sledge': {
          const g = clamp(0.35 + e.E / 600, 0.3, 1);
          if (e.onSteel) play(pick(banks.sledgeSteel), { gain: g, pan }); else play(pick(banks.sledge), { gain: g, pan, rate: 0.95 + rnd() * 0.1 });
          for (let i = 0; i < 2; i++) play(pick(banks.chip), { gain: 0.12, pan, delay: 0.04 + rnd() * 0.2 });
          break;
        }
        case 'breaker': play(pick(banks.breaker), { gain: e.hit ? 0.7 : 0.45, pan, rate: 0.95 + rnd() * 0.1 }); break;
        case 'sparks': play(pick(banks.clank), { gain: 0.35, pan, rate: 1.4 }); break;
        case 'guardHit': play(pick(banks.clank), { gain: clamp(0.25 + e.E / 3000, 0.25, 0.9), pan, rate: 0.75 + rnd() * 0.2 }); break;
        case 'guardBroken': case 'overspill': play(pick(banks.clank), { gain: 0.9, pan, rate: 0.55 }); play(pick(banks.avalanche), { gain: 0.5, pan, delay: 0.1 }); break;
        case 'toggle': play(banks.snap[0], { gain: 1, force: true }); play(pick(banks.clank), { gain: 0.6, delay: 0.25, rate: 0.6 }); break;
        case 'trip': case 'stop': play(banks.contactor[0], { gain: 0.6, force: true, pan: -0.6 }); break;
        case 'start': play(banks.contactor[0], { gain: 0.6, force: true, pan: -0.6 }); break;
        case 'relief': play(pick(banks.clank), { gain: 0.45, rate: 0.7 }); break;
        case 'clearing': for (let i = 0; i < (e.hydro ? 1 : 5); i++) play(pick(banks.clank), { gain: 0.35, rate: 1.1 + rnd() * 0.4, delay: i * 0.6 + rnd() * 0.3 }); break;
        case 'magnet': case 'scrap': play(pick(banks.clank), { gain: 0.55, pan, rate: 0.9 + rnd() * 0.3 }); break;
        case 'dump': play(pick(banks.avalanche), { gain: clamp(0.3 + e.mass / 150, 0.3, 0.95), pan: 0.3 }); play(pick(banks.plate[4]), { gain: 0.5, pan: 0.4, delay: 0.12 }); break;
        case 'chain': for (let i = 0; i < 4; i++) play(pick(banks.chain), { gain: 0.2, delay: i * 0.07, pan }); break;
        case 'deny': play(banks.contactor[0], { gain: 0.25, rate: 0.6 }); break;
        case 'setAside': play(pick(banks.rock[4]), { gain: 0.5, pan, rate: 0.7 }); break;
        case 'repaired': case 'cleared': play(pick(banks.clank), { gain: 0.3, rate: 1.3 }); break;
      }
    }
    void chainT;
  }
  return { init, update, setOn, unlock, test, ui, get state() { return ac ? ac.state : 'none'; }, get ready() { return ready; }, get ctx() { return ac; }, get out() { return master || out; } };
})();
