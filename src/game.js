'use strict';
/* ============================================================
   game.js — screens, operator controls, the shift loop.
   ============================================================ */
(() => {
  const $ = (id) => document.getElementById(id);
  const wrap = $('wrap'), cv = $('cv');
  const W = 720, H = 1280, STEP = 1 / 120;
  let save = Career.load();
  let sim = null, weather = { kind: 'sol', wet: 0, wind: 0.3, temp: 12 }, mode = 'intro';
  let lastLoadT = 0, sndWarn = false, shiftT = 0, otAsked = false, otOn = false, paused = false, autoFeed = false, tool = null, shake = 0, panP = null, simTime = 0;
  let sl = null, br = null, hudT = 0, cssCache = null, cssT = 0, toastT = 0, lastReport = null;
  let tab = 'oversikt';

  Render.init(cv);
  function resize() {
    const vw = document.documentElement.clientWidth, vh = document.body.clientHeight || innerHeight;
    const w = Math.min(vw, vh * 9 / 16), h = w * 16 / 9;
    wrap.style.width = w + 'px'; wrap.style.height = h + 'px'; wrap.style.setProperty('--u', (w / W) + 'px');
    Render.resize(w, h, Math.min(qRatio, window.devicePixelRatio || 1));
  }
  // adaptive resolution: if the phone cannot keep up, draw fewer pixels (the canvas is scaled up)
  let qRatio = 2, qAcc = 0, qN = 0, qT = 0, qFast = 0;
  function qualityTick(ms) {
    if (ms <= 0 || ms > 100) return;
    qAcc += ms; qN++; qT += ms;
    if (qT < 2000) return;
    const avg = qAcc / qN; qAcc = qN = qT = 0;
    const dpr = window.devicePixelRatio || 1, cur = Math.min(qRatio, dpr);
    if (avg > 21 && cur > 1) { qRatio = Math.max(1, cur - 0.25); qFast = 0; resize(); }
    else if (avg < 12.5 && qRatio < Math.min(2, dpr)) { if (++qFast >= 4) { qRatio = Math.min(2, qRatio + 0.25); qFast = 0; resize(); } }
    else qFast = 0;
  }
  addEventListener('resize', resize); resize();
  // the game is a fixed board: no page zoom in the menus (pinch, double tap, ctrl + wheel)
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

  // ---------- helpers ----------
  // toasts queue up instead of overwriting each other; the same message is never shown twice in a row
  const tq = []; let tCur = null;
  function toast(msg, ms = 3200, kind = '') {
    if ((tCur && tCur.msg === msg) || tq.some(t => t.msg === msg)) return;
    tq.push({ msg, ms, kind }); if (tq.length > 3) tq.shift();
    if (!tCur) nextToast();
  }
  function nextToast() {
    const el = $('toast'); tCur = tq.shift() || null;
    if (!tCur) { el.classList.remove('show'); return; }
    el.textContent = tCur.msg; el.className = 'toast show ' + tCur.kind;
    clearTimeout(toastT); toastT = setTimeout(() => { el.classList.remove('show'); setTimeout(nextToast, 220); }, Math.min(tCur.ms, tq.length ? 2600 : tCur.ms));
  }
  $('toast').onclick = () => { clearTimeout(toastT); $('toast').classList.remove('show'); setTimeout(nextToast, 120); };
  const buzz = (pat) => { try { if (save && save.haptics !== false && navigator.vibrate) navigator.vibrate(pat); } catch (e) { /* ignore */ } };
  const hint = (key, msg, ms = 5200) => { if (!save || save.tut[key] || mode !== 'shift' || paused) return; save.tut[key] = 1; toast(msg, ms); };
  const kr = (v) => fmt.kr(v), pt = (v) => fmt.pt(v), tt = (v) => fmt.t(v);
  function pickMat() {
    const d = Career.deposit(save); let t = 0; for (const k in d) t += d[k];
    let r = sim.rng() * t; for (const k in d) { r -= d[k]; if (r <= 0) return MATS[k]; } return MATS.marmor;
  }
  function show(id, on) { $(id).classList.toggle('hidden', !on); }

  // ---------- sims ----------
  function newSim(s, seed) {
    const sm = new Sim(s, { seed, weather });
    if (!s.company || s.company !== 'demo') sm.haul = Sim.haulTime(s);
    sm.on((type, o) => onEvent(type, o));
    cssCache = null; cssT = 0;
    return sm;
  }
  function demoSim() {
    const s = Career.newGame('demo'); s.plates0 = 0.2;
    weather = Career.weather(s, 3);
    const sm = newSim(s, 4242); sm.demo = true;
    return sm;
  }
  function onEvent(type, o) {
    if (!sim || sim.demo) return;
    if (type === 'trip') { buzz(160); toast('The motor overload relay tripped. The crusher is stopped and locked out. Lift or pry the block free, or open the jaw setting (Clear).', 6500, 'bad'); shake = 6; }
    else if (type === 'toggle') { buzz([120, 60, 220]); toast(sim.m.timer * TL < 3600 ? 'Steel in the jaw snapped the toggle plate! Fitting the spare and taking the steel out: about 40 minutes.' : 'Steel in the jaw snapped the toggle plate! No spare in stock: someone has to drive to town for a new one, about three hours. Buy a spare in the Workshop.', 6500, 'bad'); shake = 14; }
    else if (type === 'guardBroken') { toast('The guard plate over the flywheel is smashed! Rock can now roll over behind the swing jaw. Slow the feeder down.', 6000, 'bad'); shake = 8; }
    else if (type === 'overspill') { toast('Rock went over the edge behind the swing jaw! It hit the eccentric shaft and dropped onto the belt.', 5000, 'bad'); shake = 6; }
    else if (type === 'relief') toast(o && o.steel ? 'The hydraulics opened the jaws and let the steel through.' : 'Overload: the hydraulics opened the jaws for a moment.', 2800);
    else if (type === 'cleared') toast(sim.up.hydro ? 'The setting is back at the set CSS. Start the crusher.' : 'Shims are back in and the tension rod is tightened. Start the crusher.', 3600, 'good');
  }

  // ---------- goals (milestones) ----------
  function goalCard() {
    const el = $('goal'); if (!save || mode !== 'shift') { el.classList.add('hidden'); return; }
    const g = Career.nextGoal(save);
    if (!g || otOn || !g.live) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden'); el.classList.remove('done');
    $('goalLab').textContent = `Goal ${Career.goalsDone(save) + 1}/${Career.GOALS.length}`;
    $('goalName').textContent = g.name; $('goalHow').textContent = g.how;
  }
  $('goal').onclick = () => { const g = save && Career.nextGoal(save); if (g) toast(g.name + ': ' + g.how, 6000); };
  let goalT = 0;
  function goalsTick(D) {
    const got = Career.checkGoals(save, D);
    if (!got.length) return;
    Career.store(save);
    for (const g of got) {
      Sound.ui('goal'); buzz([40, 40, 40]);
      toast(`Milestone: ${g.name}${g.rep ? ' · +' + g.rep + ' reputation' : ''}${g.grant ? ' · ' + kr(g.grant) + ' start-up grant paid out' : ''}`, 4200, 'good');
      if (g.final) save.finalSeen = save.finalSeen || 0;
    }
    if (mode === 'shift') { const el = $('goal'); el.classList.add('done'); $('goalLab').textContent = 'Done'; $('goalName').textContent = got[got.length - 1].name; $('goalHow').textContent = 'Nice work.'; setTimeout(goalCard, 2600); }
  }
  // coach marks: a spotlight on one control and a short line, for the first office visit and the first shift
  function coach(steps, done) {
    const ov = $('coach'), hole = $('coachHole'), bub = $('coachBub'); let i = -1, cur = null;
    const place = () => {
      const st = steps[i], el = st.el ? $(st.el) : null, wr = wrap.getBoundingClientRect();
      if (el && !el.classList.contains('hidden')) {
        const r = el.getBoundingClientRect(), pad = 8;
        hole.style.display = 'block'; hole.style.left = (r.left - wr.left - pad) + 'px'; hole.style.top = (r.top - wr.top - pad) + 'px'; hole.style.width = (r.width + pad * 2) + 'px'; hole.style.height = (r.height + pad * 2) + 'px';
        cur = { el, r: { x0: r.left - wr.left - pad, y0: r.top - wr.top - pad, x1: r.right - wr.left + pad, y1: r.bottom - wr.top + pad } };
        const below = (r.top - wr.top) < wr.height * 0.5;
        bub.style.top = below ? (r.bottom - wr.top + 18) + 'px' : ''; bub.style.bottom = below ? '' : (wr.height - (r.top - wr.top) + 18) + 'px';
      } else { hole.style.display = 'none'; cur = null; bub.style.top = ''; bub.style.bottom = '12%'; }
      $('coachTxt').textContent = st.text; $('coachNext').textContent = i === steps.length - 1 ? 'Got it' : 'Next';
    };
    const next = () => { i++; if (i >= steps.length) { ov.classList.add('hidden'); ov.onclick = null; done && done(); return; } ov.classList.remove('hidden'); place(); };
    ov.onclick = (e) => {
      if (e.target.id === 'coachSkip') { i = steps.length; next(); return; }
      if (e.target.id === 'coachNext') { next(); return; }
      if (cur) { const wr = wrap.getBoundingClientRect(), x = e.clientX - wr.left, y = e.clientY - wr.top; if (x >= cur.r.x0 && x <= cur.r.x1 && y >= cur.r.y0 && y <= cur.r.y1) { const el = cur.el; next(); el.click(); return; } }
      next();
    };
    next();
  }
  function officeCoach() {
    if (!save || save.tut.coachOffice || save.day > 2 || window.RC_NOTOUR) return;
    save.tut.coachOffice = 1; Career.store(save);
    coach([
      { el: null, text: `Welcome to ${save.company}. This is your office: between shifts you plan, maintain and invest here.` },
      { el: 'tabsBar', text: 'Overview shows how it is going. Orders is where customers ask for material. Workshop is daily maintenance and the jaw setting. Equipment is where you invest.' },
      { el: 'bShift', text: 'Start the shift when you are ready. The first shift is a training shift: a goal card in the top left corner tells you what to do next.' }
    ]);
  }
  function shiftCoach() {
    if (!save || save.tut.coachShift || window.RC_NOTOUR) return;
    save.tut.coachShift = 1; Career.store(save);
    coach([
      { el: 'tFeed', text: 'Tip load calls the tractor with a load of shot rock. Tap it to start. AUTO keeps the loads coming by itself.' },
      { el: 'gauges', text: 'The ammeter shows how hard the motor works. Green is fine, red is overload: slow the feeder with −. Below it: the jaw plates and the feeder speed.' },
      { el: 'tHammer', text: 'Tools. The sledgehammer breaks blocks that are too big for the opening: pick it, hold your finger on top of the block, let go. Pry bar and chain are for a stopped machine.' },
      { el: 'goal', text: 'The goal card. Follow it through the first shifts; tap it to read the whole tip. Drag with one finger to look around, pinch to zoom.' }
    ]);
  }

  // ---------- intro & title ----------
  function intro() {
    mode = 'intro'; show('intro', true);
    const el = $('intro');
    requestAnimationFrame(() => el.classList.add('go'));
    const done = () => { if (mode !== 'intro') return; el.classList.add('out'); setTimeout(() => show('intro', false), 500); title(); };
    el.onclick = done; setTimeout(done, 2600);
  }
  function title() {
    mode = 'title'; Render.resetView();
    if (!sim || !sim.demo) sim = demoSim();
    show('hud', false); show('gauges', false); show('tools', false); show('bView', false);
    const ov = $('ovMain'); ov.className = 'ov clear'; ov.classList.remove('hidden');
    const cont = save && !save.over;
    ov.innerHTML = `<div class="pad" style="margin-top:auto">
      <div class="credit">studio.grane</div>
      <h1 class="title">Crusher<br>Run</h1>
      <div class="subtitle">Quarry Simulator</div>
      <p class="lead">Your own aggregate quarry. A used jaw crusher with a vibrating feeder, a tractor with a tipping trailer and a quarry in the mountains. Crush shot rock, keep the machine alive, deliver orders and grow the plant.</p>
      <div class="row">
        ${cont ? `<button class="btn pri" id="bCont">Continue · ${save.company}, day ${save.day}</button>` : ''}
        <button class="btn ${cont ? '' : 'pri'}" id="bNew">New company</button>
        <button class="btn" id="bBook">Handbook</button>
        <button class="btn" id="bSet">Settings</button>
        <button class="btn sm" id="bSnd">${(save ? save.sound : true) ? 'Sound on' : 'Sound off'}</button>
      </div></div>`;
    if (cont) $('bCont').onclick = () => { Sound.init(); Sound.setOn(save.sound); office(); };
    $('bNew').onclick = () => { Sound.init(); newCompany(); };
    $('bBook').onclick = () => { Sound.init(); handbook(() => title()); };
    $('bSet').onclick = () => { Sound.init(); settings(() => title()); };
    $('bSnd').onclick = () => { const v = !(save ? save.sound : true); if (save) { save.sound = v; Career.store(save); } Sound.init(); Sound.setOn(v); $('bSnd').textContent = v ? 'Sound on' : 'Sound off'; };
  }
  function newCompany() {
    const ov = $('ovMain'); ov.className = 'ov'; ov.classList.remove('hidden');
    ov.innerHTML = `<div class="pad">
      <h2>New company</h2>
      <p class="lead">You have bought a used 1998 PE-400×600, hired a tractor with a tipping trailer and a driver, and got permission to take rock from a bench in the quarry. The plates are half worn. There is ${kr(140000)} in the account.</p>
      <label for="iName" class="lab">Company name</label>
      <input type="text" id="iName" maxlength="28" value="Rockside Ltd" autocomplete="off">
      <h3>How a day works</h3>
      <ul style="padding-left:1.1em;display:grid;gap:calc(var(--u)*8)">
        <li>A shift is 07–15. The tractor tips shot rock onto the feeder, the feeder shakes it forward to the jaw, and the jaw crushes whatever fits.</li>
        <li>Blocks that are too big get stuck in the feed opening. Hit the top of them with the sledgehammer, never down in the jaw.</li>
        <li>Watch the ammeter. Overload trips the motor overload relay, steel snaps the toggle plate.</li>
        <li>After the shift: deliver orders, pay the bills, maintain and invest.</li>
      </ul>
      ${save && !save.over ? '<p class="muted">A new company deletes the one you have now.</p>' : ''}
      <div class="row"><button class="btn pri" id="bGo">Start company</button><button class="btn" id="bBack">Back</button></div></div>`;
    let armed = !(save && !save.over);
    $('bGo').onclick = () => {
      if (!armed) { armed = true; $('bGo').textContent = 'Yes, delete the old company and start over'; $('bGo').classList.remove('pri'); $('bGo').style.borderColor = 'var(--red)'; return; }
      const n = ($('iName').value || 'Rockside Ltd').trim().slice(0, 28) || 'Rockside Ltd';
      save = Career.newGame(n); Career.genOffers(save); Career.store(save); tab = 'oversikt'; office();
    };
    $('bBack').onclick = title;
  }

  // ---------- office ----------
  function office() {
    mode = 'office'; paused = false; Render.resetView();
    if (!sim || !sim.demo) sim = demoSim();
    show('hud', false); show('gauges', false); show('tools', false); show('bView', false);
    if (save.offersDay !== save.day && save.offers.length < 2) Career.genOffers(save);
    goalsTick(null);
    renderOffice();
    setTimeout(officeCoach, 350);
  }
  function renderOffice() {
    const ov = $('ovMain'); ov.className = 'ov'; ov.classList.remove('hidden');
    const w = Career.weather(save, save.day);
    const wIcon = { sol: 'Sunny', klart: 'Clear', overskyet: 'Overcast', regn: 'Rain', snø: 'Snow', frost: 'Frost', tåke: 'Fog' }[w.kind];
    const tabs = [['oversikt', 'Overview'], ['ordre', 'Orders' + (save.offers.length ? ` (${save.offers.length})` : '')], ['verksted', 'Workshop'], ['utstyr', 'Equipment'], ['bank', 'Bank'], ['hb', 'Handbook'], ['set', 'Settings']];
    ov.innerHTML = `
      <div class="ofhead">
        <div class="row" style="justify-content:space-between"><span class="lab">${esc(save.company)} · day ${save.day}</span><span class="lab">${wIcon}, ${w.temp} °C${(() => { const m = Career.month(save.day); if (Render.sunrise(m) > 7.2 || Render.sunset(m) < 17) { const hm = (h) => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.round((h % 1) * 60)).padStart(2, '0'); return ' · daylight ' + hm(Render.sunrise(m)) + '–' + hm(Render.sunset(m)); } return ''; })()}</span></div>
        <h2 style="font-size:calc(var(--u)*44)">${cap(Career.dateStr(save.day))}</h2>
        <div class="kpis">
          <div class="kpi"><span class="lab">Balance</span><b class="${save.money < 0 ? 'neg' : ''}">${kr(save.money)}</b></div>
          <div class="kpi"><span class="lab">Loan</span><b>${kr(save.loan)}</b></div>
          <div class="kpi"><span class="lab">Reputation</span><b>${Math.round(save.rep)}</b></div>
        </div>
      </div>
      <div class="tabs" role="tablist" id="tabsBar">${tabs.map(([k, n]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-t="${k}">${n}</button>`).join('')}</div>
      <div class="pad" id="tabBody"></div>
      <div class="foot"><button class="btn pri" id="bShift">Start shift · 07:00</button></div>`;
    ov.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; renderOffice(); });
    $('bShift').onclick = startShift;
    const body = $('tabBody');
    ({ oversikt: tabOverview, ordre: tabOrders, verksted: tabWorkshop, utstyr: tabUpgrades, bank: tabBank, hb: tabBook, set: (el) => { el.innerHTML = settingsHTML(); wireSettings(() => renderOffice()); } })[tab](body);
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function meter(v, label) { const c = v > 0.5 ? '' : v > 0.25 ? 'w' : 'b'; return `<div class="row" style="justify-content:space-between"><span>${label}</span><b>${Math.round(v * 100)} %</b></div><div class="meter"><i class="${c}" style="width:${clamp(v, 0, 1) * 100}%"></i></div>`; }
  function tabOverview(el) {
    const h = save.hist.slice(-14);
    let chart = '<p class="muted">No shifts yet. Day one starts when you press Start shift.</p>';
    if (h.length) {
      const mx = Math.max(1, ...h.map(d => d.t)), W2 = 640, H2 = 160, bw = W2 / 14;
      const mn = Math.min(0, ...h.map(d => d.net)), mxn = Math.max(1, ...h.map(d => d.net));
      chart = `<svg class="chart" viewBox="0 0 ${W2} ${H2 + 20}" role="img" aria-label="Output and result for recent days">
        ${h.map((d, i) => `<rect x="${i * bw + 4}" y="${H2 - d.t / mx * (H2 - 20)}" width="${bw - 8}" height="${d.t / mx * (H2 - 20)}" fill="#6b6457"/><text x="${i * bw + bw / 2}" y="${H2 + 16}" fill="#a59f92" font-size="13" text-anchor="middle">${d.day}</text>`).join('')}
        <polyline fill="none" stroke="#f2a51e" stroke-width="3" points="${h.map((d, i) => `${i * bw + bw / 2},${H2 - (d.net - mn) / (mxn - mn) * (H2 - 30) - 10}`).join(' ')}"/>
      </svg><div class="row muted" style="font-size:calc(var(--u)*18)"><span>Bars: tonnes delivered</span><span style="color:#f2a51e">Line: result per day</span></div>`;
    }
    const stock = Object.entries(save.stock).filter(([, t]) => t > 0.5);
    const g = Career.nextGoal(save), nd = Career.goalsDone(save);
    el.innerHTML = `
      ${g ? `<div class="card goalbox"><div class="hd"><div><span class="lab">Next goal · ${nd}/${Career.GOALS.length} done</span><div class="t">${g.name}</div><div class="d">${g.how}</div></div></div></div>` : `<div class="card goalbox"><span class="lab">All ${Career.GOALS.length} milestones done</span><div class="t">A real quarry</div></div>`}
      <h3>Recent days</h3>${chart}
      <h3>Stockpile</h3>
      ${stock.length ? `<table class="st"><tbody>${stock.map(([k, t]) => `<tr><td>${PRODUCTS[k].name}</td><td>${tt(t)} t</td><td>${pt(Career.spotPrice(save, k, save.day))}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing in stock. What you produce is sold or goes to orders after the shift.</p>'}
      ${(() => { const tot = stock.reduce((a, [, t]) => a + t, 0); return tot > Math.max(300, (save.prodAvg || 0) * 2) ? '<p class="card" style="border-color:var(--amber)">The stockpile is growing: the market cannot take everything you crush. Take more orders, or invest in a screen and cone crusher so you can sell more products. Blasting and wear are paid per tonne, sold or not.</p>' : ''; })()}
      <h3>The quarry</h3>
      <p>The bench now yields mostly ${Career.depositName(save)}. The deeper you go, the harder and more abrasive the rock gets.</p>
      <h3>The machine</h3>
      <div class="card">
        <div class="t">${TIERS[save.tier].name}</div>
        ${meter(Career.plateLife(save), 'Jaw plates (worst tooth)')}
        ${meter(save.bearing, 'Bearings')}
        ${meter(save.vbelt, 'V-belts')}
        <div class="spec">Spare toggle plates in stock: ${save.spareToggle} · CSS ${save.css} mm</div>
      </div>`;
  }
  function tabOrders(el) {
    const prodName = (k) => PRODUCTS[k].name;
    el.innerHTML = `
      <h3>Active orders (${save.contracts.length}/4)</h3>
      ${save.contracts.length ? save.contracts.map(c => `<div class="card tap" data-od="${c.id}" role="button" tabindex="0"><div class="hd"><div><div class="t">${esc(c.cust)}</div><div class="d">${esc(c.job)}</div></div><div class="spec">due day ${c.due}</div></div>
        <div class="row" style="justify-content:space-between"><span>${prodName(c.key)}</span><b>${tt(c.made)} / ${tt(c.t)} t</b></div>
        <div class="meter"><i style="width:${Math.min(100, c.made / c.t * 100)}%"></i></div><div class="spec">${pt(c.price)} · ${c.due - save.day <= 0 ? 'due today' : (c.due - save.day) + ' working days left'}</div><div class="more">Tap for details and settings ›</div></div>`).join('') : '<p class="muted">No active orders. Without orders you sell at spot price, and demand is limited.</p>'}
      <h3>Requests</h3>
      ${save.offers.length ? save.offers.map(o => `<div class="card tap" data-od="${o.id}" role="button" tabindex="0"><div class="hd"><div><div class="t">${esc(o.cust)}</div><div class="d">${esc(o.job)}</div></div>
        <div class="row" style="flex-wrap:nowrap;flex-shrink:0"><button class="btn sm pri" data-acc="${o.id}" ${save.contracts.length >= 4 ? 'disabled' : ''}>Accept</button><button class="btn sm" data-dec="${o.id}">Decline</button></div></div>
        <div class="row" style="justify-content:space-between"><span>${prodName(o.key)}${o.need ? ' <span class="chip warn">needs new equipment</span>' : save.lastMain && !save.up.sikt ? (Career.fits(save.lastMain, o.key) ? ' <span class="chip run">matches your output</span>' : ' <span class="chip warn">needs finer CSS</span>') : ''}</span><b>${tt(o.t)} t</b></div>
        <div class="spec">${pt(o.price)} (spot ${pt(Career.spotPrice(save, o.key, save.day))}) · deliver within ${o.days} working days · late delivery costs 4% per day</div><div class="more">Tap for details and settings ›</div></div>`).join('') : '<p class="muted">No new requests today.</p>'}
      ${save.lastMain ? `<p>Last shift you made mostly <b>${prodName(save.lastMain)}</b>. Finer material can be delivered where the customer asks for coarser (0/63 is fine as 0/90), but not the other way round. Set the CSS in the Workshop.</p>` : ''}
      <p class="muted">After each shift, output goes first to orders that need the same product. The product is set by the grading curve: with only a jaw crusher everything is sold as one mix, and the top size (D95) decides what it's called.</p>`;
    el.querySelectorAll('[data-od]').forEach(c => c.onclick = (e) => { if (e.target.closest('button')) return; orderDetail(el, +c.dataset.od); });
    el.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => { if (Career.acceptOffer(save, +b.dataset.acc) === 'ok') { save.goals.flags.order = 1; Sound.ui('click'); } Career.store(save); goalsTick(null); renderOffice(); });
    el.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => { Career.declineOffer(save, +b.dataset.dec); Career.store(save); renderOffice(); });
  }
  // one order in full: what it is, what to set the crusher to, and whether you can make it in time
  function orderDetail(el, id) {
    const c = save.contracts.find(x => x.id === id), o = c || save.offers.find(x => x.id === id);
    if (!o) { tabOrders(el); return; }
    const P = PRODUCTS[o.key], T = TIERS[save.tier], a = Career.advise(save, o.key);
    const left = Math.max(0, o.t - (o.made || 0)), days = c ? Math.max(1, c.due - save.day + 1) : o.days;
    const perDay = left / days, avg = save.prodAvg || [120, 380, 1100, 2200][save.tier] * 0.5;
    const mine = avg * a.share + (save.up.lines ? avg * 0.6 * save.up.lines * a.share : 0);
    const spot = Career.spotPrice(save, o.key, save.day), val = o.t * o.price;
    const ok = a.needs.length ? 'no' : mine >= perDay * 1.15 ? 'ok' : mine >= perDay * 0.8 ? 'tight' : 'no';
    const verdict = a.needs.length ? `You need: ${a.needs.join(' and ')}. Buy it under Equipment.` : ok === 'ok' ? 'You can make this in time if you run the crusher at the advised setting.' : ok === 'tight' ? 'Tight. Full shifts at the advised setting, or a little overtime.' : 'Probably not in time at your current output. Take it only if you can produce much more per day.';
    const pct = (v) => Math.round(v * 100) + '%';
    const range = P.top ? `0–${P.top} mm, unscreened (top size D95 ≤ ${P.top} mm)` : P.spec;
    el.innerHTML = `
      <button class="btn sm" id="bOdBack">‹ Orders</button>
      <div class="card"><div class="t">${esc(o.cust)}</div><div class="d">${esc(o.job)}</div>
        <div class="ledger"><span>Product</span><span>${P.name}</span><span>Grading</span><span>${range}</span><span>Amount</span><span>${tt(o.t)} t${c ? ` (delivered ${tt(c.made)} t)` : ''}</span>
        <span>Price</span><span>${pt(o.price)} · spot today ${pt(spot)}</span><span>Order value</span><span>${kr(val)}</span>
        <span>Deadline</span><span>${c ? 'day ' + c.due + ' (' + Math.max(0, c.due - save.day) + ' working days left)' : 'within ' + o.days + ' working days of accepting'}</span>
        <span>If late</span><span>${kr(val * 0.04)} per day; cancelled after 3 days late, and your reputation drops</span></div></div>
      <h3>How to make it</h3>
      <div class="card">
        <div class="ledger"><span>Advised CSS</span><span><b>${a.css} mm</b> (${T.name}: ${T.css[0]}–${T.css[1]} mm, now ${save.css} mm)</span>
        <span>Share of your output</span><span>about ${pct(a.share)}</span>
        <span>Needs</span><span>${a.needs.length ? a.needs.join(', ') : 'nothing new, you have what it takes'}</span></div>
        <div class="d">${a.note}</div>
        ${a.css !== save.css && !a.needs.length ? `<div class="row"><button class="btn sm pri" id="bOdCss">Set CSS to ${a.css} mm</button></div>` : ''}
      </div>
      <h3>Can you make it in time?</h3>
      <div class="card ${ok === 'ok' ? '' : 'warnc'}">
        <div class="ledger"><span>Needed per day</span><span>${tt(perDay)} t of ${P.name}</span><span>You make per day</span><span>about ${tt(mine)} t of it (from ~${tt(avg)} t in total)</span></div>
        <div class="d">${verdict}</div>
      </div>
      ${!c ? `<div class="row"><button class="btn pri" id="bOdAcc" ${save.contracts.length >= 4 ? 'disabled' : ''}>Accept order</button><button class="btn" id="bOdDec">Decline</button></div>` : ''}
      <p class="muted">Estimates come from your last shift's grading, scaled to the new setting. Rock type, worn plates and how full you keep the chamber all change it a little.</p>`;
    $('bOdBack').onclick = () => tabOrders(el);
    if ($('bOdCss')) $('bOdCss').onclick = () => { save.css = a.css; Career.store(save); toast(save.up.hydro ? `CSS set to ${a.css} mm.` : `Shims changed: CSS ${a.css} mm.`, 2400, 'good'); orderDetail(el, id); };
    if ($('bOdAcc')) $('bOdAcc').onclick = () => { if (Career.acceptOffer(save, id) === 'ok') { save.goals.flags.order = 1; Sound.ui('click'); } Career.store(save); goalsTick(null); renderOffice(); };
    if ($('bOdDec')) $('bOdDec').onclick = () => { Career.declineOffer(save, id); Career.store(save); renderOffice(); };
    el.scrollIntoView && el.parentElement && (el.parentElement.scrollTop = 0);
  }
  function wearBars(arr) { if (!arr) return '<p class="muted">Unknown until the first shift.</p>'; return `<div class="wear" aria-label="Wear per tooth, top on the left">${arr.map(w => `<i style="height:${clamp(1 - w, 0.02, 1) * 100}%;background:${w > 0.75 ? '#e1412a' : w > 0.45 ? '#f2a51e' : '#8fc46a'}"></i>`).join('')}</div>`; }
  function tabWorkshop(el) {
    const T = TIERS[save.tier];
    const predTop = save.css * 1.45;
    const predName = save.up.sikt ? 'screened product' : PRODUCTS[predTop <= 63 ? 'k063' : predTop <= 90 ? 'k090' : predTop <= 120 ? 'k0120' : 'k0250'].name;
    el.innerHTML = `
      <h3>Before the shift</h3>
      <div class="card"><div class="hd"><div><div class="t">Grease the bearings</div><div class="d">${save.up.autogrease ? 'The automatic lubrication system does this for you every day.' : 'The eccentric bearings need grease every day. Without it, the temperature rises and the bearings wear.'}</div></div>
        ${save.up.autogrease ? '<span class="chip run">Automatic</span>' : `<button class="btn sm ${save.greased ? '' : 'pri'}" id="bGrease" ${save.greased ? 'disabled' : ''}>${save.greased ? 'Greased' : 'Grease'}</button>`}</div></div>
      <h3>Quarry</h3>
      ${quarryCard()}
      <h3>Closed side setting (CSS)</h3>
      <div class="card">
        <div class="d">The gap between the jaws at the bottom when closed. ${save.up.hydro ? 'Set hydraulically from the panel.' : 'Set with shims behind the toggle plate while the machine is stopped.'} A smaller setting gives a finer product, lower capacity and more load on the motor. Worn plates open the setting by themselves.</div>
        <input type="range" id="iCss" min="${T.css[0]}" max="${T.css[1]}" step="5" value="${save.css}" aria-label="CSS in millimetres">
        <div class="row" style="justify-content:space-between"><b id="cssV">${save.css} mm</b><span class="spec" id="cssP">expected top size approx. ${Math.round(predTop)} mm · ${predName}</span></div>
      </div>
      <h3>Jaw plates (manganese steel)</h3>
      <div class="card">
        <div class="d">Teeth wear most where the crushing happens, usually at the bottom. Turn a plate upside down when the bottom is about 30–50% worn, and you get fresh teeth where they're needed. Each plate can be turned once.</div>
        <div class="row" style="justify-content:space-between"><span>Swing jaw</span><span class="spec">top → bottom</span></div>${wearBars(save.wearM)}
        <div class="row" style="justify-content:space-between"><span>Fixed jaw</span><span class="spec">top → bottom</span></div>${wearBars(save.wearF)}
        <div class="row"><button class="btn sm" id="bTurnM" ${save.turnedM || !save.wearM ? 'disabled' : ''}>${save.turnedM ? 'Swing jaw turned' : 'Turn swing jaw'}</button>
        <button class="btn sm" id="bTurnF" ${save.turnedF || !save.wearF ? 'disabled' : ''}>${save.turnedF ? 'Fixed jaw turned' : 'Turn fixed jaw'}</button>
        <button class="btn sm pri" id="bPlates">New plates · ${kr(T.plates)}</button>
        <button class="btn sm" id="bPlatesMn">22% Mn plates · ${kr(Math.round(T.plates * 1.6))}</button></div>
        <div class="spec">${save.hiMn ? 'Fitted now: high-manganese (22% Mn) plates, about 40% longer life.' : 'Fitted now: standard 14% Mn plates. The 22% Mn plates cost 60% more and last about 40% longer: worth it in hard, abrasive rock.'}</div>
      </div>
      <h3>Guard plate</h3>
      <div class="card">${meter(save.guard ?? 1, 'Plate over flywheel and eccentric shaft')}<div class="d">Stops rock tipping over behind the swing jaw. It takes the blows when the hopper is overfilled. If it's smashed, rock can fall onto the shaft and the belt.</div><div class="row"><button class="btn sm ${(save.guard ?? 1) < 0.5 ? 'pri' : ''}" id="bGuard" ${(save.guard ?? 1) >= 1 ? 'disabled' : ''}>New plate · ${kr([9000, 16000, 30000, 52000][save.tier])}</button></div></div>
      <h3>Drive</h3>
      <div class="card">${meter(save.vbelt, 'V-belts')}<div class="d">Worn belts slip and squeal when the jaw is full, and the crusher loses power.</div><div class="row"><button class="btn sm" id="bBelts">New V-belts · ${kr([3200, 5400, 11800, 19600][save.tier])}</button></div></div>
      <div class="card">${meter(save.bearing, 'Eccentric bearings')}<div class="d">The bearings carry the full crushing force. Bad bearings mean heat, friction and in the end a breakdown.</div><div class="row"><button class="btn sm" id="bBear">Bearing service · ${kr([18000, 34000, 72000, 140000][save.tier])}</button></div></div>
      <div class="card"><div class="hd"><div><div class="t">Spare toggle plate</div><div class="d">The toggle plate is the crusher's fuse and breaks when steel gets into the jaw. With one in stock, a swap takes about 40 minutes. Without, someone has to fetch one and the plant stands for about three hours.</div></div><b>${save.spareToggle} pcs</b></div>
        <div class="row"><button class="btn sm" id="bTog">Buy one · ${kr(T.toggle)}</button></div></div>`;
    const sld = $('iCss');
    sld.oninput = () => { save.css = +sld.value; const top = save.css * 1.45; $('cssV').textContent = save.css + ' mm'; $('cssP').textContent = `expected top size approx. ${Math.round(top)} mm · ${save.up.sikt ? 'screened product' : PRODUCTS[top <= 63 ? 'k063' : top <= 90 ? 'k090' : top <= 120 ? 'k0120' : 'k0250'].name}`; Career.store(save); };
    const act = (id, fn) => { const b = $(id); if (b) b.onclick = () => { const r = fn(); if (r === 'money') toast('Not enough money in the account.', 2400, 'bad'); else Sound.ui('click'); Career.store(save); goalsTick(null); renderOffice(); }; };
    act('bGrease', () => { save.goals.flags.grease = 1; return Career.grease(save); }); act('bTurnM', () => { const r = Career.turnPlates(save, 'M'); if (r === 'ok') save.goals.flags.plates = 1; return r; }); act('bTurnF', () => { const r = Career.turnPlates(save, 'F'); if (r === 'ok') save.goals.flags.plates = 1; return r; });
    for (const k in Sim.BLAST) act('bBl_' + k, () => { save.blastPlan = k; return 'ok'; });
    act('bStrip', () => { save.strip = !save.strip; return 'ok'; });
    for (const k of ['soft', 'mixed', 'hard']) act('bBench_' + k, () => { save.bench = k; return 'ok'; });
    act('bPlates', () => { const r = Career.newPlates(save, false); if (r === 'ok') save.goals.flags.plates = 1; return r; }); act('bPlatesMn', () => { const r = Career.newPlates(save, true); if (r === 'ok') save.goals.flags.plates = 1; return r; }); act('bBelts', () => Career.newBelts(save)); act('bBear', () => Career.bearingService(save)); act('bTog', () => Career.buySpareToggle(save)); act('bGuard', () => Career.newGuard(save));
  }
  // blast plan, overburden and bench: the rock the truck brings
  function quarryCard() {
    const T = TIERS[save.tier], bl = Sim.blastSpec(save), x50 = 0.3 * Sim.QUARRY * bl.f, xc = x50 / Math.pow(Math.LN2, 1 / bl.n);
    const over = Math.exp(-Math.pow(T.feed / xc, bl.n)), big = save.tier >= 2;
    const btn = (k) => { const P = Sim.BLAST[k], dis = k === 'xcoarse' && !big; return `<button class="btn sm ${(save.blastPlan || 'normal') === k ? 'pri' : ''}" id="bBl_${k}" ${dis ? 'disabled title="Needs a PE-900 or bigger"' : ''}>${P.name}</button>`; };
    const P = Sim.BLAST[save.blastPlan || 'normal'];
    let h = `<div class="card"><div class="t">Blast plan</div><div class="d">The drill pattern and the explosive set how big the shot rock is, whatever crusher stands below. A small jaw wants fine rock; a big jaw eats coarse rock, which is cheaper to blast but brings blocks for the breaker. The truck sets the biggest block: it never carries more than its load.</div>
      <div class="row">${Object.keys(Sim.BLAST).map(btn).join('')}</div>
      <div class="spec">${P.desc} Typical block ${Math.round(x50 / 10) * 10} mm · about ${Math.round(over * 100)}% too big for your feed opening (${T.feed} mm) · ${bl.kr >= 0 ? '+' : '−'}${pt(Math.abs(bl.kr))} drilling and blasting${save.up.blast ? ' · electronic detonators: even sizes' : ''}</div></div>`;
    h += `<div class="card"><div class="hd"><div><div class="t">Strip the overburden</div><div class="d">An excavator scrapes the soil and loose gravel off the top of the bench before it is drilled. Far fewer dirty loads. Costs ${pt(4)}.</div></div>
      <button class="btn sm ${save.strip ? 'pri' : ''}" id="bStrip">${save.strip ? 'On' : 'Off'}</button></div></div>`;
    if (save.up.mobile) h += `<div class="card"><div class="t">Bench</div><div class="d">The tracked crusher walks to the face you choose. The upper bench is soft marble and schist: easy on the plates, ideal for an impact crusher. The deep bench is hard gneiss, granite and gabbro: better paid, hard wearing.</div>
      <div class="row">${[['soft', 'Upper (soft)'], ['mixed', 'Mixed'], ['hard', 'Deep (hard)']].map(([k, n]) => `<button class="btn sm ${(save.bench || 'mixed') === k ? 'pri' : ''}" id="bBench_${k}">${n}</button>`).join('')}</div></div>`;
    return h;
  }
  // all four crushers side by side at true scale, with a 1.8 m person, so the sizes can be compared
  const DIMS = [{ L: 1.7, H: 1.55, fw: 0.95, t: 6.5 }, { L: 2.3, H: 2.25, fw: 1.25, t: 16 }, { L: 3.4, H: 3.05, fw: 1.75, t: 50 }, { L: 4.2, H: 3.55, fw: 2.25, t: 100 }];
  function sizeSVG(cur) {
    const S = 41, gap = 0.55, base = 205, x0 = 14;
    let x = x0 + 0.9 * S, g = '';
    // person (scale figure, 1.8 m)
    const px = x0 + 0.35 * S, ph = 1.8 * S;
    g += `<g fill="#cfc8b9"><circle cx="${px}" cy="${base - ph + 0.12 * S}" r="${0.12 * S}"/><rect x="${px - 0.2 * S}" y="${base - ph + 0.27 * S}" width="${0.4 * S}" height="${0.75 * S}" rx="${0.08 * S}"/><rect x="${px - 0.18 * S}" y="${base - ph + 1.0 * S}" width="${0.15 * S}" height="${0.8 * S}"/><rect x="${px + 0.03 * S}" y="${base - ph + 1.0 * S}" width="${0.15 * S}" height="${0.8 * S}"/></g>`;
    g += `<text x="${px}" y="${base + 18}" text-anchor="middle" fill="#a59f92" font-size="13">1.8 m</text>`;
    DIMS.forEach((d, i) => {
      const w = d.L * S, h = d.H * S, on = i === cur, nxt = i === cur + 1;
      const col = on ? '#3d6d9a' : nxt ? '#5b5f66' : '#3a3d42', st = on ? '#f2a51e' : nxt ? '#a59f92' : '#55585e';
      const fr = d.fw * S / 2, fx = x + fr * 0.9, fy = base - h * 0.62;
      // frame with the feed opening cut in at the top, flywheel on the near side
      g += `<path d="M${x + w * 0.12} ${base} L${x + w * 0.12} ${base - h * 0.78} L${x + w * 0.42} ${base - h} L${x + w * 0.5} ${base - h * 0.86} L${x + w * 0.58} ${base - h} L${x + w} ${base - h} L${x + w} ${base} Z" fill="${col}" stroke="${st}" stroke-width="${on ? 3 : 1.5}"/>`;
      g += `<circle cx="${fx}" cy="${fy}" r="${fr}" fill="none" stroke="${st}" stroke-width="${on ? 3 : 2}"/><circle cx="${fx}" cy="${fy}" r="${Math.max(2, fr * 0.14)}" fill="${st}"/>`;
      g += `<text x="${x + w / 2}" y="${base + 18}" text-anchor="middle" fill="${on ? '#f2a51e' : '#d8d2c4'}" font-size="13" font-weight="${on ? 700 : 400}">${TIERS[i].name.replace('PE-', '')}</text>`;
      g += `<text x="${x + w / 2}" y="${base + 34}" text-anchor="middle" fill="#a59f92" font-size="12">${d.H.toFixed(1)} m · ${d.t} t</text>`;
      if (on) g += `<text x="${x + w / 2}" y="${base - h - 8}" text-anchor="middle" fill="#f2a51e" font-size="12" font-weight="700">YOURS</text>`;
      x += w + gap * S;
    });
    g += `<line x1="4" y1="${base}" x2="636" y2="${base}" stroke="#6b6457" stroke-width="2"/>`;
    return `<svg viewBox="0 0 640 250" role="img" aria-label="The four crushers drawn to the same scale next to a 1.8 m person" style="width:100%;height:auto;font-family:Barlow Condensed, Arial Narrow, sans-serif">${g}</svg>`;
  }
  function tabUpgrades(el) {
    const to = Career.tierOffer(save);
    let html = `<h3>Crusher sizes</h3><div class="card">${sizeSVG(save.tier)}<div class="spec">All four drawn to the same scale. Height and weight under each. The figure is a 1.8 m person.</div></div>`;
    if (to) html += `<h3>New crusher</h3><div class="card"><div class="hd"><div><div class="t">${to.next.name}</div><div class="d">${to.next.note}</div></div><button class="btn sm ${save.money >= to.price ? 'pri' : ''}" id="bTier" ${save.money >= to.price ? '' : 'disabled'}>${kr(to.price)}</button></div>
      <div class="spec">Feed opening ${to.next.gape} mm · max block ${to.next.feed} mm · CSS ${to.next.css[0]}–${to.next.css[1]} mm · ${to.next.cap[0]}–${to.next.cap[1]} t/h · ${to.next.kw} kW · ${to.next.rpm} rpm · ${to.next.weight} t · trade-in −${kr(to.trade)}</div></div>`;
    const groups = {};
    for (const u of UPGRADES) { if (!u.req(save) && !Career.owned(save, u.id)) continue; (groups[u.group] = groups[u.group] || []).push(u); }
    for (const g in groups) {
      html += `<h3>${g}</h3>`;
      for (const u of groups[g]) {
        const own = Career.owned(save, u.id), p = Career.priceOf(save, u);
        html += `<div class="card ${own ? 'owned' : ''}"><div class="hd"><div><div class="t">${u.name}${u.id === 'line' && save.up.lines ? ` (own ${save.up.lines})` : ''}</div><div class="d">${u.desc}</div></div>
          ${own ? '<span class="chip run">Owned</span>' : `<button class="btn sm ${save.money >= p ? 'pri' : ''}" data-buy="${u.id}" ${save.money >= p ? '' : 'disabled'}>${kr(p)}</button>`}</div></div>`;
      }
    }
    html += `<p class="muted">Short of money? Borrow from the bank with the machines as security.</p>`;
    el.innerHTML = html;
    if ($('bTier')) $('bTier').onclick = () => { if (Career.buyTier(save) === 'ok') { Sound.ui('cash'); toast(`${TIERS[save.tier].name} delivered and installed. The plates are new. It swallows the rock the old one choked on, and eats it faster: a bigger truck or a second one keeps it fed, and a coarser blast plan (Workshop → Quarry) makes the rock cheaper.`, 7000, 'good'); Career.store(save); goalsTick(null); renderOffice(); } };
    el.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => { const r = Career.buyUpgrade(save, b.dataset.buy); if (r === 'ok') { Sound.ui('cash'); toast('Delivered and installed.', 2200, 'good'); } Career.store(save); goalsTick(null); renderOffice(); });
  }
  function tabBank(el) {
    const lim = Career.loanLimit(save);
    el.innerHTML = `
      <div class="card"><div class="t">Investment loan</div>
        <div class="d">The bank lends against the machines as security. Interest 7.5% a year, charged daily. The account can go down to ${kr(-100000)} on overdraft (12%), but five days below that means bankruptcy.</div>
        <div class="ledger"><span>Current loan</span><span>${kr(save.loan)}</span><span>Loan limit</span><span>${kr(lim)}</span><span>Interest per day</span><span>${kr(save.loan * 0.075 / 250)}</span></div>
        <div class="row"><button class="btn sm" id="bL1">Borrow ${kr(100000)}</button><button class="btn sm" id="bL5">Borrow ${kr(500000)}</button><button class="btn sm" id="bR1" ${save.loan > 0 ? '' : 'disabled'}>Repay ${kr(100000)}</button><button class="btn sm" id="bRA" ${save.loan > 0 ? '' : 'disabled'}>Repay all</button></div>
      </div>
      <h3>Statistics</h3>
      <div class="ledger"><span>Days worked</span><span>${save.stats.days}</span><span>Total tonnes delivered</span><span>${tt(save.stats.totalT)} t</span><span>Total revenue</span><span>${kr(save.stats.totalKr)}</span><span>Best day</span><span>${tt(save.stats.bestDay)} t</span><span>Orders delivered</span><span>${save.stats.ordersDone || 0}${save.stats.ordersLate ? ` (${save.stats.ordersLate} lost)` : ''}</span><span>Rocks crushed in the jaw</span><span>${save.stats.crushes.toLocaleString('en-GB')}</span><span>Sledgehammer blows</span><span>${save.stats.blows.toLocaleString('en-GB')}</span><span>Blocks split by hand</span><span>${(save.stats.splits || 0).toLocaleString('en-GB')}</span></div>
      <h3>Milestones · ${Career.goalsDone(save)}/${Career.GOALS.length}</h3>
      <div class="ms">${Career.GOALS.map(g => { const d = save.goals && save.goals.done[g.id]; return `<div class="msi ${d ? 'ok' : ''}"><span class="tick">${d ? '✓' : '○'}</span><div><b>${g.name}</b>${d ? `<span class="spec">day ${d}</span>` : `<span class="spec">${g.how}</span>`}</div></div>`; }).join('')}</div>`;
    const a = (id, fn) => $(id).onclick = () => { const r = fn(); if (r === 'limit') toast('The bank says no: loan limit reached.', 2600, 'bad'); Career.store(save); renderOffice(); };
    a('bL1', () => Career.takeLoan(save, 100000)); a('bL5', () => Career.takeLoan(save, 500000)); a('bR1', () => Career.repay(save, 100000)); a('bRA', () => Career.repay(save, save.loan));
  }
  function bookHTML() {
    return `<div class="hb" style="display:flex;flex-direction:column;gap:calc(var(--u)*16)">
      <svg viewBox="0 0 640 520" role="img" aria-label="Cross-section of a single-toggle jaw crusher with the parts named">
        <circle cx="120" cy="90" r="78" fill="none" stroke="#5a7fa0" stroke-width="10"/>
        <circle cx="120" cy="90" r="16" fill="#2a2c2f" stroke="#888" stroke-width="2"/>
        <polygon points="110,100 160,110 300,440 230,450 120,140" fill="#3d6d9a" stroke="#1a2a3a" stroke-width="2"/>
        <polygon points="160,110 300,440 312,436 172,106" fill="#7a7a76"/>
        <polygon points="420,90 440,90 440,450 420,450" fill="#7a7a76"/>
        <polygon points="440,70 600,70 600,470 440,470" fill="#3d6d9a" stroke="#1a2a3a" stroke-width="2"/>
        <line x1="250" y1="445" x2="170" y2="475" stroke="#ccc" stroke-width="10" stroke-linecap="round"/>
        <rect x="120" y="455" width="40" height="40" fill="#2c4e70"/>
        <line x1="230" y1="460" x2="80" y2="500" stroke="#b13b1c" stroke-width="4"/>
        <path d="M172 110 L420 110" stroke="#f2a51e" stroke-dasharray="6 6"/>
        <path d="M305 438 L420 438" stroke="#8fc46a" stroke-width="3"/>
        <g fill="#f1ece2" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-size="17">
          <text x="18" y="190">Flywheel + eccentric shaft</text>
          <text x="180" y="300" transform="rotate(-67 180 300)">Swing jaw (pitman)</text>
          <text x="452" y="250">Fixed jaw</text>
          <text x="250" y="102">Feed opening (gape)</text>
          <text x="318" y="430">CSS</text>
          <text x="96" y="515">Toggle plate · shims · tension rod</text>
          <text x="300" y="190">Chamber</text>
          <text x="300" y="210">nip angle ≈ 20°</text>
        </g>
      </svg>
      <dl>
        <dt>Jaw crusher</dt><dd>The swing jaw hangs from an eccentric shaft. The bottom is held by the toggle plate. Each revolution, the jaw squeezes the rock against the fixed jaw and lets it drop a little further.</dd>
        <dt>Nip angle</dt><dd>The angle between the jaws, about 19–23°. Too steep and the rock “boils”: it bounces up instead of being crushed.</dd>
        <dt>CSS / OSS</dt><dd>Closed and open side setting at the bottom. CSS sets the top size of the product. Stroke = OSS − CSS.</dd>
        <dt>Choke feeding</dt><dd>Keep the crushing chamber full. Rock then crushes against rock, shape improves and capacity peaks. Overfilled means overload.</dd>
        <dt>Toggle plate</dt><dd>The fuse. If steel gets into the jaw, it breaks instead of the frame. Keep a spare in stock.</dd>
        <dt>Hydraulics</dt><dd>Cylinders instead of toggle and shims: opens the setting on steel and overload, and empties the chamber in seconds.</dd>
        <dt>Jaw plates</dt><dd>Manganese steel that work-hardens in use. Wears most at the bottom. Turned once, then replaced.</dd>
        <dt>Oversize blocks</dt><dd>Bigger than about 85% of the feed opening. They bridge over the opening. Break them with a sledgehammer on top of the block, or with a boom-mounted hydraulic breaker.</dd>
        <dt>Time-lapse</dt><dd>An 8-hour shift runs in about 2½ minutes, so you see a sample of the rock: every stone on screen stands for about 190 real stones. The tonnes are real: a PE-400×600 makes 130–500 t a day, a PE-600×900 400–1,400 t. The figure under Tip load shows what one tip counts as.</dd>
        <dt>Safety</dt><dd>Never a sledgehammer or hands down in the jaw while it runs. Lock out before you work with the pry bar. Lift jammed blocks out with a chain and machine.</dd>
        <dt>Point load</dt><dd>The force needed to break a rock, F ≈ Is50 · D². Granite and gabbro are tough; marble and mica schist give way more easily.</dd>
        <dt>Energy</dt><dd>Bond's law: work index Wi in kWh/t. Every crush takes energy from the flywheel, and the speed dips.</dd>
        <dt>Products</dt><dd>Unscreened 0/63, 0/90, 0/120 and 0/250 by top size (D95). With a screen: 0/32, 32/63, 63/120. With a cone crusher: 0/4, 4/8, 8/16, 16/32.</dd>
        <dt>Blast plan</dt><dd>The rock size comes from the bench, not from the crusher. Fine blasting costs more explosive but gives rock a small jaw can take; coarse blasting is cheaper but makes blocks a small jaw chokes on. A big jaw pays for itself on cheap, coarse rock.</dd>
        <dt>Haulage</dt><dd>The truck sets the load: a tractor trailer, a 25 t articulated hauler or a 40 t rigid truck. A bigger crusher eats a load faster, so a bigger truck or a second one keeps it fed.</dd>
        <dt>Soil and fill</dt><dd>The top of the bench brings soil and gravel. Stripping the overburden keeps it out of the loads; a scalper under the grizzly takes what still comes and makes cheap fill of it, so it does not spoil your product.</dd>
        <dt>Secondary crushers</dt><dd>Cone crusher: compressive, little wear in hard rock. Impact crusher (HSI): cubical chippings that pay more, but the blow bars wear fast in hard, abrasive rock. VSI: rock-on-rock, makes manufactured sand.</dd>
        <dt>Mobile crusher</dt><dd>On crawler tracks the jaw walks to the face: a short haul, less diesel, and you choose the bench: soft rock on top, hard rock deep down.</dd>
        <dt>Seasons</dt><dd>Short days in winter: without floodlight masts the plant is dark in the morning and overtime ends at sunset. Rain makes the rock slippery, frost and snow slow the market down.</dd>
        <dt>Keyboard</dt><dd>1 sledge · 2 pry bar · 3 chain · Space tip load · A auto feed · S start/stop · P pause.</dd>
      </dl></div>`;
  }
  function tabBook(el) { el.innerHTML = bookHTML(); }
  // ---------- settings ----------
  function settingsHTML() {
    const snd = save ? save.sound : true, two = save && save.speed === 2;
    return `<h3>Currency</h3>
      <div class="row">${Object.entries(CURRENCIES).map(([k, c]) => `<button class="btn sm ${fmt.cur === k ? 'pri' : ''}" data-cur="${k}">${c.sym} ${c.name}</button>`).join('')}</div>
      <p class="muted">Prices are converted at a fixed rate. Example: ${kr(100000)} · ${pt(150)}</p>
      <h3>Sound</h3>
      <div class="row"><button class="btn sm ${snd ? 'pri' : ''}" id="sSnd">${snd ? 'Sound on' : 'Sound off'}</button><button class="btn sm" id="sTest">Test sound</button></div>
      <p class="muted" id="sndSt2"></p>
      ${save ? `<h3>Game speed</h3><div class="row"><button class="btn sm ${two ? '' : 'pri'}" data-sp="1">Normal</button><button class="btn sm ${two ? 'pri' : ''}" data-sp="2">2× speed</button></div><p class="muted">You can also switch with the 1×/2× button at the top during a shift.</p>` : ''}
      <h3>Phone</h3>
      <div class="row">${document.fullscreenEnabled ? `<button class="btn sm" id="sFull">${document.fullscreenElement ? 'Leave full screen' : 'Full screen'}</button>` : ''}<button class="btn sm ${save && save.haptics === false ? '' : 'pri'}" id="sHap">${save && save.haptics === false ? 'Vibration off' : 'Vibration on'}</button></div>
      ${save ? `<h3>Help</h3><div class="row"><button class="btn sm" id="sTut">Show the tips again</button></div><p class="muted">Resets the one-time tips and the guided tour. Your milestones stay.</p>
      <h3>Save</h3><div class="row"><button class="btn sm" id="sDel" style="border-color:var(--red)">Delete company</button></div><p class="muted" id="sDelTxt">Removes ${esc(save.company)} and everything it owns. Cannot be undone.</p>` : ''}`;
  }
  function wireSettings(redraw) {
    document.querySelectorAll('[data-cur]').forEach(b => b.onclick = () => { fmt.setCur(b.dataset.cur); redraw(); });
    $('sSnd').onclick = () => { const v = !(save ? save.sound : true); if (save) { save.sound = v; Career.store(save); } Sound.init(); Sound.setOn(v); redraw(); };
    $('sTest').onclick = () => { Sound.test(); setTimeout(() => { const el = $('sndSt2'); if (el) el.textContent = Sound.state === 'running' ? 'You should hear two short notes. If not, turn up the media volume.' : 'Sound is blocked (' + Sound.state + '). Tap the screen once more, or open the game in your web browser.'; }, 400); };
    document.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => { save.speed = +b.dataset.sp; Career.store(save); spdUi(); redraw(); });
    if ($('sFull')) $('sFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); setTimeout(redraw, 400); };
    $('sHap').onclick = () => { if (save) { save.haptics = save.haptics === false; Career.store(save); buzz(30); } redraw(); };
    if ($('sTut')) $('sTut').onclick = () => { save.tut = {}; Career.store(save); toast('The tips and the guided tour will show again.', 2600, 'good'); };
    if ($('sDel')) { let armed = false; $('sDel').onclick = () => { if (!armed) { armed = true; $('sDel').textContent = 'Really delete?'; $('sDelTxt').textContent = 'Tap again to delete the company for good.'; return; } Career.wipe(); save = null; title(); }; }
  }
  function settings(back) {
    const ov = $('ovMain'); ov.className = 'ov'; ov.classList.remove('hidden');
    const draw = () => { ov.innerHTML = `<div class="pad"><h2>Settings</h2>${settingsHTML()}<div class="row"><button class="btn pri" id="bSetBk">Back</button></div></div>`; wireSettings(draw); $('bSetBk').onclick = back; };
    draw();
  }
  function handbook(back) {
    const ov = $('ovMain'); ov.className = 'ov'; ov.classList.remove('hidden');
    ov.innerHTML = `<div class="pad"><h2>Handbook</h2>${bookHTML()}<div class="row"><button class="btn pri" id="bBk">Back</button></div></div>`;
    $('bBk').onclick = back;
  }

  // ---------- shift ----------
  function startShift() {
    Sound.init(); Sound.setOn(save.sound);
    weather = Career.weather(save, save.day);
    sim = newSim(save, save.seed + save.day * 101);
    shiftT = 0; lastLoadT = 0; otAsked = false; otOn = false; otEnd = OT_MAX; $('bOT').classList.add('hidden'); paused = false; sl = null; br = null; autoFeed = !!save.autoFeed && !!save.tut.coachShift; tool = null;
    mode = 'shift';
    $('ovMain').classList.add('hidden');
    show('hud', true); show('gauges', true); show('tools', true); show('bView', true);
    setTool(null); updateTools(); feedUi(); spdUi(); goalCard();
    Sound.ui('shiftStart');
    if (!save.tut.coachShift) setTimeout(shiftCoach, 1200);
    cssNow = cssWant = save.css; $('cssCtl').classList.toggle('hidden', !sim.up.hydro); $('gHyd').classList.toggle('hidden', !sim.up.hydro);
    { // rock left on the feeder yesterday is still there; with an early start the driver has added a load
      const items = [], carry = save.carryT || 0, x50 = Sim.blastSpec(save);
      if (carry > 1) { let est = 0; const kg = (it) => Math.pow(it.mm / 1000, 3) * 0.55 * 2700 * sim.TLm / 1000; for (let i = 0; i < 40 && est < Math.min(carry, 160); i++) for (const it of sim.makeLoad(pickMat, x50)) { items.push(it); est += kg(it); } }
      if (save.up.early) for (let i = 0; i < Sim.truckBuckets(save.up.loader) * (save.up.truck2 ? 2 : 1); i++) items.push(...sim.makeLoad(pickMat, x50));
      if (items.length) sim.preload(items);
      if (save.up.early) setTimeout(() => toast('The driver started early: the feeder is loaded and ready.', 3000, 'good'), 1200);
      else if (carry > 1) setTimeout(() => toast(`Yesterday's rock is still on the feeder (${Math.round(carry)} t). Start crushing.`, 3000), 1200);
      save.carryT = 0;
    }
    if (sim.up.hydro) setTimeout(() => hint('hyd', 'Hydraulic setting: the CSS can be changed with − and + under Jaw plates while you run. On steel or overload the cylinders open the jaw (RELIEF) instead of breaking the toggle plate.', 6500), 4000);
    $('hDate').textContent = Career.dateStr(save.day).split(' ').slice(0, 3).map((w, i) => i === 1 ? w : w.slice(0, 3)).join(' ') + ' · ' + ({ sol: 'sunny', klart: 'clear', overskyet: 'overcast', regn: 'rain', snø: 'snow', frost: 'frost', tåke: 'fog' }[weather.kind] || '') + ' ' + weather.temp + ' °C';
    setTimeout(() => hint('tSpd', 'Pinch with two fingers (or use the mouse wheel) to zoom in and out and look around. Use the 1×/2× button at the top for double speed.'), 12000);
    { const m = Career.month(save.day), dk = Render.darkness(7, m); if (dk > 0.3 && !save.up.lights) setTimeout(() => hint('dark', 'Dark mornings this time of year. The crusher\'s own work light is weak: floodlight masts (Equipment) light up the hopper and the belt.', 6000), 3000); }
    if (weather.kind === 'regn') setTimeout(() => toast('Rain today: wet rock slides more easily, and the fines clump.', 3600), 2600);
  }
  // 15:00 — the shift is over, but you may stay on overtime (e.g. to get a stuck block out)
  const OT_MAX = 1.5;   // until 19:00
  let otEnd = OT_MAX;   // today's limit (sunset without floodlights), as a fraction of the shift
  function otRate() { return Math.round((3400 / 8 + [4400, 6900, 11200][save.up.loader] / 8) * 1.5); }
  function askOvertime() {
    otAsked = true; paused = true;
    const stuck = sim.m.state !== 'run' || sim.m.block > 0.5;
    Sound.ui('shiftEnd');
    // without floodlights the day ends when it gets dark
    const sunset = Render.sunset(Career.month(save.day)), lastH = save.up.lights ? 19 : Math.min(19, sunset + 0.4);
    otEnd = clamp((lastH - 7) / 8, 1, OT_MAX);
    const hm = (h) => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.round((h % 1) * 60)).padStart(2, '0');
    const canOT = otEnd > 1.02;
    const ov = $('ovMain'); ov.className = 'ov clear'; ov.classList.remove('hidden');
    ov.innerHTML = `<div class="pad" style="margin-top:auto"><span class="lab">It's 15:00</span><h2>Shift over</h2>
      <p class="lead">${stuck ? 'There is still rock in the crusher. ' : ''}${canOT ? `Want to work overtime? The clock runs on until you finish, ${hm(lastH)} at the latest${lastH < 19 ? ' (it gets dark then; floodlight masts would let you work until 19:00)' : ''}.` : 'It is already getting dark. Without floodlight masts there is no overtime this time of year.'}</p>
      ${canOT ? `<p class="muted">Overtime costs ${kr(otRate())} per hour (50% extra for you and the driver). What you crush on overtime counts towards today's delivery.</p>` : ''}
      <div class="row">${canOT ? '<button class="btn pri" id="bOtYes">Work overtime</button>' : ''}<button class="btn ${canOT ? '' : 'pri'}" id="bOtNo">End shift</button></div></div>`;
    if ($('bOtYes')) $('bOtYes').onclick = () => { otOn = true; paused = false; ov.classList.add('hidden'); $('bOT').classList.remove('hidden'); goalCard(); toast('Overtime. Tap “End shift” when you\'re done.', 3200); };
    $('bOtNo').onclick = () => { paused = false; endShift(false); };
  }
  $('bOT').onclick = () => { if (mode === 'shift') endShift(false); };
  function endShift(early) {
    if (mode !== 'shift') return;
    mode = 'report';
    tq.length = 0; clearTimeout(toastT); $('toast').classList.remove('show'); tCur = null;
    $('bOT').classList.add('hidden');
    sim.D.otHours = otOn ? Math.max(0, (shiftT - DAY_LEN) / DAY_LEN * 8) : 0;
    sim.pry = null; sim.lift = null;
    sim.flushTransit();
    const rep = Career.endDay(save, sim.D, sim);
    save.carryT = sim.D.leftT || 0;
    lastReport = rep;
    const got = Career.checkGoals(save, null);
    for (const g of got) rep.events.push({ good: true, text: `Milestone reached: ${g.name}.${g.rep ? ' Reputation +' + g.rep + '.' : ''}${g.grant ? ' The regional business fund pays out a ' + kr(g.grant) + ' start-up grant.' : ''}` });
    if (got.length) Sound.ui('goal');
    if (rep.income > 0) setTimeout(() => Sound.ui('cash'), 500);
    Career.store(save);
    show('hud', false); show('gauges', false); show('tools', false); show('bView', false); $('goal').classList.add('hidden');
    showReport(rep, early);
    if (got.some(g => g.final) && !save.finalShown) { save.finalShown = 1; Career.store(save); $('bOff').onclick = () => credits(); }
  }
  function credits() {
    const ov = $('ovMain'); ov.className = 'ov'; ov.classList.remove('hidden');
    ov.innerHTML = `<div class="pad" style="margin-top:auto;margin-bottom:auto;text-align:center;align-items:center">
      <div class="credit">studio.grane presents</div>
      <h1 class="title" style="font-size:calc(var(--u)*80)">A real<br>quarry</h1>
      <p class="lead">${esc(save.company)} started with a used PE-400×600, a tractor and ${kr(140000)}. ${save.stats.days} working days later it has delivered ${tt(save.stats.totalT)} tonnes of crushed rock, filled ${save.stats.ordersDone || 0} orders and swung the sledgehammer ${save.stats.blows.toLocaleString('en-GB')} times.</p>
      <p class="lead">Every milestone is done. The quarry keeps running for as long as you want.</p>
      <p class="muted">Crusher Run: Quarry Simulator · design, physics and sound by studio.grane · thank you for playing</p>
      <div class="row" style="justify-content:center"><button class="btn pri" id="bCred">Keep going</button></div></div>`;
    $('bCred').onclick = () => { tab = 'oversikt'; office(); };
  }
  function showReport(rep, early) {
    const ov = $('ovMain'); ov.className = 'ov'; ov.classList.remove('hidden');
    const prod = Object.entries(rep.prod).filter(([, t]) => t > 0.05);
    const row = (a, b, cls = '') => `<span>${a}</span><span class="${cls}">${b}</span>`;
    ov.innerHTML = `<div class="pad">
      <span class="lab">${cap(rep.date)}${early ? ' · ended early' : ''}${rep.otHours > 0.05 ? ' · overtime ' + rep.otHours.toFixed(1) + ' h' : ''}</span>
      <h2>Shift over${rep.newBest ? ' · best day so far' : ''}</h2>
      <div class="kpis"><div class="kpi"><span class="lab">Delivered</span><b>${tt(rep.tonnes)} t${rep.prevT != null ? `<small style="font-size:.5em;color:${rep.tonnes >= rep.prevT ? 'var(--green)' : '#ff9c88'}"> ${rep.tonnes >= rep.prevT ? '▲' : '▼'} ${tt(Math.abs(rep.tonnes - rep.prevT))}</small>` : ''}</b></div><div class="kpi"><span class="lab">Top size</span><b>${rep.d95 && rep.d95 < 9999 ? rep.d95 + ' mm' : '—'}</b></div><div class="kpi"><span class="lab">Result</span><b class="${rep.netDay < 0 ? 'neg' : ''}">${kr(rep.netDay)}</b></div></div>
      <h3>Produced</h3>
      <div class="ledger">${prod.length ? prod.map(([k, t]) => row(PRODUCTS[k].name, tt(t) + ' t')).join('') : row('Nothing came out of the crusher', '')}${rep.linesT ? row('From extra lines', tt(rep.linesT) + ' t') : ''}</div>
      ${rep.deliveries.length ? `<h3>Delivered on orders</h3><div class="ledger">${rep.deliveries.map(d => row(`${esc(d.c.cust)}: ${tt(d.take)} t`, kr(d.kr), 'pos')).join('')}</div>` : ''}
      ${rep.sales.length ? `<h3>Sold at spot price</h3><div class="ledger">${rep.sales.map(s => row(`${PRODUCTS[s.k].name}: ${tt(s.t)} t @ ${pt(s.price)}`, kr(s.t * s.price), 'pos')).join('')}</div>` : ''}
      <h3>Costs</h3>
      <div class="ledger">${rep.lines.map(l => row(l[0], kr(l[1]), 'pos')).join('')}${rep.costs.map(c => row(c[0], kr(c[1]), 'neg')).join('')}
        <span class="tot">Result</span><span class="tot ${rep.netDay < 0 ? 'neg' : 'pos'}">${kr(rep.netDay)}</span><span>In the account</span><span>${kr(rep.money)}</span></div>
      ${rep.events.length ? `<h3>Events</h3>${rep.events.map(e => `<p style="color:${e.good ? 'var(--green)' : '#ffb3a3'}">${esc(e.text)}</p>`).join('')}` : ''}
      ${(() => { const w = Career.weather(save, save.day), m = Career.month(save.day), hm = (h) => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.round((h % 1) * 60)).padStart(2, '0'); const dl = Render.sunrise(m) > 7.2 || Render.sunset(m) < 17 ? ` · daylight ${hm(Render.sunrise(m))}–${hm(Render.sunset(m))}` : ''; return `<h3>Tomorrow</h3><p class="muted">${cap(Career.dateStr(save.day))}: ${{ sol: 'sunny', klart: 'clear', overskyet: 'overcast', regn: 'rain', snø: 'snow', frost: 'frost', tåke: 'fog' }[w.kind]}, ${w.temp} °C${w.wet ? ' · wet rock slides more easily' : ''}${w.wind > 0.72 && !w.wet && !save.up.dust ? ' · windy: dust complaints likely without water spray' : ''}${dl}</p>`; })()}
      <div class="row"><button class="btn pri" id="bOff">To the office</button></div></div>`;
    $('bOff').onclick = () => { if (save.over) gameOver(); else { tab = 'oversikt'; office(); } };
  }
  function gameOver() {
    const ov = $('ovMain'); ov.className = 'ov'; ov.classList.remove('hidden');
    ov.innerHTML = `<div class="pad"><h2>Bankrupt</h2><p class="lead">The bank has closed the overdraft. ${esc(save.company)} ran for ${save.stats.days} days and delivered ${tt(save.stats.totalT)} tonnes.</p>
      <div class="row"><button class="btn pri" id="bNew2">Start a new company</button></div></div>`;
    $('bNew2').onclick = newCompany;
  }
  function pauseMenu() {
    if (mode !== 'shift') return;
    paused = true;
    const ov = $('ovMain'); ov.className = 'ov clear'; ov.classList.remove('hidden');
    ov.innerHTML = `<div class="pad" style="margin-top:auto"><h2>Pause</h2>
      <div class="row"><button class="btn pri" id="bRes">Continue</button><button class="btn" id="bEnd">End shift now</button><button class="btn" id="bHB">Handbook</button><button class="btn" id="bSetP">Settings</button><button class="btn sm" id="bSnd2">${save.sound ? 'Sound on' : 'Sound off'}</button><button class="btn sm" id="bSndT">Test sound</button></div><p class="muted" id="sndSt"></p>
      <span class="lab">Speed</span>
      <div class="row">${SPEEDS.map(([v, n]) => `<button class="btn sm ${(save.speed === 2 ? 2 : 1) === v ? 'pri' : ''}" data-spd="${v}">${n}</button>`).join('')}</div>
      <p class="muted">If you end the shift early, what you've delivered so far counts, but fixed costs run for the whole day.</p></div>`;
    $('bRes').onclick = () => { paused = false; ov.classList.add('hidden'); };
    $('bEnd').onclick = () => { paused = false; endShift(true); };
    $('bHB').onclick = () => handbook(() => pauseMenu());
    $('bSetP').onclick = () => settings(() => pauseMenu());
    ov.querySelectorAll('[data-spd]').forEach(x => x.onclick = () => { save.speed = +x.dataset.spd; Career.store(save); spdUi(); pauseMenu(); });
    $('bSndT').onclick = () => { Sound.test(); setTimeout(() => { const st = Sound.state; const el = $('sndSt'); if (el) el.textContent = st === 'running' ? 'You should hear two short notes. If not, turn up the media volume on your phone.' : 'Sound is blocked by the browser (' + st + '). Tap the screen once more, or open the game in your web browser.'; }, 400); };
    $('bSnd2').onclick = () => { save.sound = !save.sound; Sound.setOn(save.sound); $('bSnd2').textContent = save.sound ? 'Sound on' : 'Sound off'; };
  }
  const SPEEDS = [[1, 'Normal'], [2, '2× speed']];
  function spdUi() { const two = save && save.speed === 2; $('bSpd').textContent = two ? '2×' : '1×'; $('bSpd').classList.toggle('on', two); }
  $('bSpd').onclick = () => { if (!save) return; save.speed = save.speed === 2 ? 1 : 2; Career.store(save); spdUi(); };
  $('bPause').onclick = pauseMenu;
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'shift' && !paused) pauseMenu(); });

  // ---------- tools & controls ----------
  // tools are picked from the bar; tap the active one again to put it down (then a finger pans the view)
  function setTool(t) {
    tool = (t && tool === t) ? null : t;
    const tt = tool;
    if (tt === 'pry') hint('pry', 'Put the tip of the bar between two stones (or between a stone and the steel) and drag the way you want to push. A bar is a lever: it moves a stone a hand\'s width at a time. Let go and take a new bite.', 6500);
    $('tHammer').classList.toggle('on', tt === 'hammer'); $('tPry').classList.toggle('on', tt === 'pry'); $('tLift').classList.toggle('on', tt === 'lift');
  }
  $('tHammer').onclick = () => { Sound.ui('click'); setTool('hammer'); };
  $('tPry').onclick = () => { Sound.ui('click'); setTool('pry'); };
  $('tLift').onclick = () => { Sound.ui('click'); setTool('lift'); };
  $('tAuto').onclick = (e) => { e.stopPropagation(); autoFeed = !autoFeed; if (save) { save.autoFeed = autoFeed; Career.store(save); } Sound.ui('click'); updateTools(); };
  $('tFeed').onclick = () => {
    if (mode !== 'shift') return;
    const st = sim.m.state;
    if (st === 'stop' || st === 'trip') { if (sim.clearChamber()) toast(sim.up.hydro ? 'The hydraulics pull the jaw back.' : 'Slackening the tension rod and knocking out the shims. The jaw drops back and the chamber empties.', 4200); return; }
    feed();
  };
  function feed() {
    if (sim.loader.busy) return false;
    if (sim.loader.cd > 0) { if (!autoFeed) toast(`The truck is on its way back from the bench (${plantMin(sim.loader.cd)}).` + (save.up.truck2 ? '' : ' A second truck keeps the loads coming.'), 1800); return false; }
    if (!sim.feederRoom()) { toast('The back of the feeder is full. Wait until the rock has moved forward.', 2200); return false; }
    // a full tipper: the tractor trailer carries ~6 bucket loads, the dump trucks 10 and 16; the blast plan sets the rock size
    const bl = Sim.blastSpec(save), items = [];
    for (let i = 0; i < Sim.truckBuckets(save.up.loader); i++) items.push(...sim.makeLoad(pickMat, bl));
    const steel = sim.rng() < 0.016;   // tramp metal: a broken bucket tooth now and then
    sim.callLoader(items, steel);
    return true;
  }
  $('tMotor').onclick = () => {
    if (mode !== 'shift') return;
    const st = sim.m.state;
    if (st === 'run' || st === 'relief') { sim.stop(); toast('Crusher stopped and locked out. You can now go in with the pry bar and chain.', 3200); }
    else if (st === 'trip' && sim.m.timer > 0) toast('The overload relay needs to cool down. Wait a moment.', 1800);
    else sim.start();
    updateTools();
  };
  addEventListener('keydown', (e) => {
    if (mode !== 'shift') return;
    if (e.key === '1') setTool('hammer'); else if (e.key === '2') setTool('pry'); else if (e.key === '3') setTool('lift');
    else if (e.key === ' ') { e.preventDefault(); $('tFeed').click(); } else if (e.key === 'a' || e.key === 'A') { autoFeed = !autoFeed; updateTools(); }
    else if (e.key === 's' || e.key === 'S') $('tMotor').click(); else if (e.key === 'p' || e.key === 'Escape') { if (paused) $('bRes') && $('bRes').click(); else pauseMenu(); }
  });
  // remaining time shown on the shift clock's scale (plant time), not in game seconds
  function plantMin(t) { const m = Math.ceil(t * TL / 60); return m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min' : m + ' min'; }
  function updateTools() {
    if (!sim) return;
    const st = sim.m.state;
    $('tHamName').textContent = sim.up.breaker ? 'Breaker' : 'Sledge';
    $('tHamSub').textContent = sim.up.breaker ? 'hydraulic' : 'hold & release';
    $('tAuto').classList.toggle('on', autoFeed);
    const stopped = st === 'stop' || st === 'trip';
    $('tFeedName').textContent = stopped ? 'Clear' : 'Tip load';
    $('tFeedSub').textContent = stopped ? (sim.up.hydro ? 'open setting' : 'remove shims') : sim.loader.busy ? 'tipping …' : sim.loader.cd > 0 ? 'hauling …' : lastLoadT ? Math.round(lastLoadT) + ' t / load' : 'tipper';
    const m = $('tMotor');
    m.classList.toggle('green', st === 'run' || st === 'relief'); m.classList.toggle('red', st === 'trip' || st === 'broken');
    $('tMotorName').textContent = st === 'run' || st === 'relief' ? 'Stop' : st === 'broken' ? 'Replacing' : st === 'clearing' ? 'Clearing' : 'Start';
    $('tMotorSub').textContent = st === 'run' ? 'running' : st === 'relief' ? 'hydraulics' : st === 'stop' ? 'locked out' : st === 'trip' ? (sim.m.timer > 0 ? 'wait ' + plantMin(sim.m.timer) : 'overload relay') : st === 'broken' ? 'toggle · ' + plantMin(sim.m.timer) : st === 'clearing' ? plantMin(sim.m.timer) : '';
  }
  function toWorld(e) { const r = cv.getBoundingClientRect(), c = Render.camFor(sim); const sx = (e.clientX - r.left) / r.width * W, sy = (e.clientY - r.top) / r.height * H; return { x: (sx - c.ox) / c.Z, y: (sy - c.oy) / c.Z }; }
  // two fingers (or the mouse wheel) zoom and move the view; a tool action in progress is cancelled
  const touches = new Map(); let pinching = false, pinch = null;
  const scr = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
  // the two most recent fingers make the pinch (a stale entry can never join it)
  const pinchState = () => { const v = [...touches.values()].slice(-2), a = v[0], b = v[1]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
  cv.addEventListener('pointerdown', (e) => {
    // a new gesture starts with no fingers down: forget any finger whose lift we never saw
    if (e.isPrimary) { touches.clear(); pinching = false; pinch = null; }
    touches.set(e.pointerId, scr(e));
    try { cv.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    if (touches.size >= 2 && sim && mode === 'shift') {
      pinching = true; pinch = pinchState();
      if (sl && sl.state === 'charge') sl = null;
      br = null; sim.pry = null;
      pid = null; panP = null;
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, scr(e));
    if (pinching && touches.size >= 2 && sim && mode === 'shift') {
      const n = pinchState();
      if (!pinch) { pinch = n; return; }
      // one move event never zooms or pans by much: a glitchy touch cannot throw the camera away
      const f = clamp(n.d / pinch.d, 0.85, 1.18), dx = clamp(n.mx - pinch.mx, -90, 90), dy = clamp(n.my - pinch.my, -90, 90);
      Render.zoomAt(sim, n.mx, n.my, f); Render.panBy(sim, dx, dy);
      pinch = n;
    }
  });
  const tEnd = (e) => { if (!touches.has(e.pointerId)) return; touches.delete(e.pointerId); if (touches.size < 2) pinch = null; if (touches.size === 0) pinching = false; };
  cv.addEventListener('pointerup', tEnd); cv.addEventListener('pointercancel', tEnd); cv.addEventListener('lostpointercapture', tEnd);
  addEventListener('pointerup', tEnd); addEventListener('pointercancel', tEnd);
  cv.addEventListener('wheel', (e) => { if (!sim || mode !== 'shift') { e.preventDefault(); return; } e.preventDefault(); const p = scr(e); Render.zoomAt(sim, p.x, p.y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  $('bView').onclick = () => { if (!sim) return; if (Render.isZoomed()) Render.resetView(); else Render.showAll(sim); };
  // feeder speed (vibrating feeder in front of the mouth): 0 = off … 5 = full
  const FEEDV = [0, 100, 170, 250, 330, 420];
  const vfd = () => save && save.up && save.up.vfd;
  function feedUi() {
    if (!save) return;
    const lv = save.feedLv ?? 3;
    if (vfd() && save.feedMm == null) save.feedMm = FEEDV[lv];
    const v = Sim.feedMm(save);
    $('fSlW').classList.toggle('hidden', !vfd());
    if (vfd()) { $('fSl').value = v; $('fLv').textContent = Math.round(v / 4.2) + '%'; }
    else $('fLv').textContent = lv;
    $('fSpd').textContent = v ? v + ' mm/s' : 'off';
  }
  $('fSl').oninput = () => { if (!save) return; feedFlag(); save.feedMm = +$('fSl').value; feedUi(); };
  $('fSl').onchange = () => { if (save) Career.store(save); };
  // the whole slider box takes the finger: touch anywhere on it (or slide in from beside the knob)
  // and the knob jumps to the finger and follows it
  {
    const box = $('fSlW'), sl = $('fSl');
    let drag = null;
    const setFrom = (e) => {
      const r = sl.getBoundingClientRect(), pad = r.width * 0.11;   // the rotated input: its height on screen is the track
      const t = clamp((r.bottom - pad - e.clientY) / Math.max(1, r.height - 2 * pad), 0, 1);
      const v = Math.round(t * 420 / 5) * 5;
      if (+sl.value !== v || drag.first) { drag.first = false; sl.value = v; sl.oninput(); }
    };
    box.addEventListener('pointerdown', (e) => { if (!save || !vfd()) return; e.preventDefault(); e.stopPropagation(); drag = { id: e.pointerId, first: true }; try { box.setPointerCapture(e.pointerId); } catch (_) {} setFrom(e); });
    box.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; e.preventDefault(); setFrom(e); });
    const end = (e) => { if (!drag || e.pointerId !== drag.id) return; drag = null; sl.onchange(); };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  }
  const feedFlag = () => { if (save && mode === 'shift' && save.goals) save.goals.flags.feed = 1; };
  $('fMinus').onclick = () => { if (!save) return; feedFlag(); if (vfd()) { save.feedMm = Math.max(0, Sim.feedMm(save) - 10); feedUi(); return; } save.feedLv = Math.max(0, (save.feedLv ?? 3) - 1); feedUi(); hint('feed', 'The feeder sets how fast rock goes into the jaw. Keep the chamber full without the ammeter going into the red.'); };
  $('fPlus').onclick = () => { if (!save) return; feedFlag(); if (vfd()) { save.feedMm = Math.min(420, Sim.feedMm(save) + 10); feedUi(); return; } save.feedLv = Math.min(5, (save.feedLv ?? 3) + 1); feedUi(); hint('feed', 'The feeder sets how fast rock goes into the jaw. Keep the chamber full without the ammeter going into the red.'); };
  // hydraulic setting: change the CSS from the panel while the crusher runs (a few mm per second)
  let cssNow = 0, cssWant = 0, cssStepT = 0;
  const cssStep = (d) => { if (!sim || !sim.up.hydro) return; const T = sim.tier; cssWant = clamp(cssWant + d, T.css[0], T.css[1]); save.css = cssWant; Career.store(save); hint('hyd2', 'The cylinders move the jaw a few millimetres a second. The CSS reading follows.', 3000); };
  $('cMinus').onclick = () => cssStep(-5); $('cPlus').onclick = () => cssStep(5);
  function cssTick(dt) {
    if (!sim || !sim.up.hydro || cssNow === cssWant) return;
    cssStepT -= dt; if (cssStepT > 0) return; cssStepT = 0.12;
    cssNow += Math.sign(cssWant - cssNow) * Math.min(1, Math.abs(cssWant - cssNow));
    Machine.setCSS(sim, cssNow); cssCache = null; cssT = 0;
  }
  let pid = null;
  cv.addEventListener('pointerdown', (e) => {
    Sound.init();
    if (mode !== 'shift' || paused || pid !== null || pinching) return;
    if (!tool) { panP = scr(e); pid = e.pointerId; cv.setPointerCapture(e.pointerId); return; }
    const p = toWorld(e);
    if (tool === 'hammer') {
      if (sim.up.breaker) {
        if (!sim.breakerReach(p.x, p.y)) { toast('The hydraulic breaker can\'t reach there.', 1600); return; }
        br = { x: p.x, y: p.y, on: true, t: 0 };
      } else {
        if (sl) return;
        sl = { state: 'charge', x: p.x, t: 0, charge: 0, sx0: scr(e).x, wx0: p.x };
      }
    } else if (tool === 'pry') {
      const r = sim.pryStart(p.x, p.y);
      if (!r.ok) { if (r.why === 'running') { toast('Stop and lock out the crusher before going into the jaw with the pry bar.', 3400, 'bad'); sim.emit('deny'); } return; }
    } else if (tool === 'lift') {
      const r = sim.liftStart(p.x, p.y);
      if (!r.ok) {
        if (r.why === 'running') { toast('Never lift out of a running jaw. Stop the crusher first.', 3400, 'bad'); sim.emit('deny'); }
        else if (r.why === 'deep') { toast('Too deep for a chain: there is no room to get it round a block down between the plates. Break it' + (sim.up.breaker ? ' with the breaker' : ' with the sledge') + ', lever it with the pry bar, or stop and ' + (sim.up.hydro ? 'open the setting' : 'take out the shims') + ' so the chamber drops.', 4800, 'bad'); sim.emit('deny'); }
        else if (r.why === 'covered') { toast('Another stone lies on top of it. Lift the top one first.', 2600); sim.emit('deny'); }
      }
      else hint('lift', 'The chain hooks the block onto the hoist. Take the top ones first so the rest don\'t lock up.');
      return;
    }
    pid = e.pointerId; cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid || pinching) return;
    if (panP) { if (pinching) { panP = null; return; } const q = scr(e); Render.panBy(sim, clamp(q.x - panP.x, -120, 120), clamp(q.y - panP.y, -120, 120)); panP = q; return; }
    const p = toWorld(e);
    if (sl && sl.state === 'charge') sl.x = p.x;
    if (br) { if (sim.breakerReach(p.x, p.y)) { br.x = p.x; br.y = p.y; } }
    if (sim && sim.pry) { sim.pry.tx = p.x; sim.pry.ty = p.y; }
  });
  const up = (e) => {
    if (e.pointerId !== pid) return; pid = null;
    if (panP) { panP = null; return; }
    if (sl && sl.state === 'charge') {
      const c = sim.sledgeCheck(sl.x);
      if (c.ok) { sl.state = 'swing'; sl.t = 0; }
      else {
        if (c.why === 'running') { toast('Deadly! Never swing a sledgehammer down in the jaw while it runs. Only on top of blocks sticking up in the feed opening.', 4200, 'bad'); sim.emit('deny'); }
        else if (c.why === 'deep') toast('You can\'t reach down there with the sledgehammer. Use the pry bar or chain.', 2800);
        else if (c.why === 'reach') toast('You can\'t reach that from the walkway.', 2200);
        sl = null;
      }
    }
    br = null;
    if (sim) sim.pry = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

  // ---------- HUD ----------
  function updateHud() {
    const M = sim.m, T = sim.tier;
    if (sim.up.hydro) { const rel = M.state === 'relief'; const el = $('gHyd'); el.textContent = rel ? 'RELIEF · OPEN' : cssNow !== cssWant ? 'SETTING → ' + cssWant + ' mm' : 'HYDRAULIC'; el.classList.toggle('hot', rel); }
    const hour = 7 + 8 * shiftT / DAY_LEN, hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
    $('hClock').textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    $('hTon').innerHTML = `${tt(sim.D.tonnes)} <small>t</small>`;
    const prod = Career.classify(save, sim.D.hist, sim.D.tonnes), d95 = Career.d95(Array.from(sim.D.hist));
    const main = Object.entries(prod).sort((a, b) => b[1] - a[1])[0];
    $('hProd').textContent = main ? `${PRODUCTS[main[0]].name}${d95 && d95 < 9999 ? ' · D95 ' + d95 + ' mm' : ''}` : 'waiting for rock …';
    let val = 0; const qm = Career.quality(sim.D.byMat); for (const k in prod) val += prod[k] * Career.spotPrice(save, k, save.day) * qm;
    $('hKr').textContent = kr(val);
    const st = M.state, chip = $('hState');
    const map = { run: ['Running', 'run'], relief: ['Hydraulics', 'warn'], stop: ['Locked out', 'stop'], trip: ['Overload relay', 'bad'], broken: ['Toggle broken', 'bad'], clearing: ['Clearing', 'warn'] };
    let [txt, cls] = map[st] || ['', ''];
    if (st === 'run' && M.block > 0.6) { txt = 'Overload'; cls = 'bad'; } else if (st === 'run' && M.amps > T.kw * 1.72 * 1.05) { txt = 'High load'; cls = 'warn'; }
    if (st === 'broken' || st === 'clearing' || (st === 'trip' && M.timer > 0)) txt += ' ⏩';
    chip.textContent = txt; chip.className = 'chip ' + cls;
    // ammeter: full scale 2.5 × rated current
    const rated = T.kw * 1.72, f = clamp(M.amps / (rated * 2.5), 0, 1), th = Math.PI + f * Math.PI;
    const n = $('gNeedle'); n.setAttribute('x2', 46 + Math.cos(th) * 34); n.setAttribute('y2', 62 + Math.sin(th) * 34);
    $('gMotor').classList.toggle('hot', st === 'run' && f > 0.72);
    $('gAmp').textContent = Math.round(M.amps) + ' A';
    $('gRpm').textContent = Math.round(M.w * 60 / TAU) + ' rpm';
    $('gPlate').textContent = Math.round(Career.plateLife(save) * 100) + ' %';
    cssT -= 0.1; if (cssT <= 0 || !cssCache) { cssCache = Machine.measure(sim); cssT = 8; }
    $('gCss').textContent = 'CSS ' + Math.round(cssCache.css * sim.mmpx) + ' mm';
    $('bView').textContent = Render.isZoomed() ? '⤡ Close-up' : '⤢ Show all';
    updateTools();
    $('tFeedBar').style.width = (sim.loader.busy ? Math.min(1, sim.loader.t / (sim.loader.exT3 || 3.5)) * 100 : sim.loader.cd > 0 ? (1 - sim.loader.cd / (sim.loader.cd0 || 1)) * 100 : 0) + '%';
  }

  // ---------- loop ----------
  let last = performance.now(), acc = 0, sdt = 0, actK = 0;
  // the breaker boom swings out over the mouth when it is picked, and folds up out of the way when not
  let brVis = null;
  function brPose(dt) {
    if (!sim || !sim.up.breaker) return null;
    if (br) { brVis = { x: br.x, y: br.y }; return br; }
    const T = tool === 'hammer' ? { x: 560, y: 330 } : { x: 900, y: -260 };
    if (!brVis) brVis = { x: T.x, y: T.y };
    const k = 1 - Math.pow(0.002, dt); brVis.x += (T.x - brVis.x) * k; brVis.y += (T.y - brVis.y) * k;
    return { x: brVis.x, y: brVis.y, on: false };
  }
  function frame(now) {
    qualityTick(now - last);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (sim && !(mode === 'shift' && paused)) {
      // real time (1×) or 2×; while the plant stands waiting for a repair, time is spooled forward
      const waiting = mode === 'shift' && (sim.m.state === 'broken' || sim.m.state === 'clearing' || (sim.m.state === 'trip' && sim.m.timer > 0));
      // the view is a close-up of a small machine; at true clock speed it reads like a miniature film
      // (everything looks too fast). Like miniature filming, time is slowed by √(true size / perceived size).
      const timeK = clamp(Math.sqrt(720 * sim.mmpx / 3000), 0.45, 1);
      const spd = timeK * (mode === 'shift' ? (save.speed === 2 ? 2 : 1) : 1);
      sim.skip = waiting ? 14 : 1;   // the clock and the repair run ahead, everything you see moves at its own pace
      sdt = dt * spd;
      acc += sdt; let n = 0;
      const maxN = Math.ceil(spd * 0.05 / STEP) + 1;
      while (acc >= STEP && n < maxN) { sim.step(STEP); acc -= STEP; n++; simTime += STEP; }
      if (n === maxN) acc = 0;
      // demo: keep the hopper fed on the title and office screens
      if (sim.demo) { if (sim.feederRoom() && sim.loader.cd <= 0) { save0Feed(); } if (sim.m.state !== 'run') { if (sim.m.state === 'stop' || (sim.m.state === 'trip' && sim.m.timer <= 0)) sim.start(); } }
      if (mode === 'shift') {
        shiftT += sdt * (sim.skip || 1);
        if (autoFeed && sim.m.state === 'run' && !sim.loader.busy && sim.loader.cd <= 0 && sim.feederRoom()) feed();
        // sledge timing
        if (sl) {
          sl.t += dt;
          if (sl.state === 'charge') { sl.charge = Math.min(1, sl.t / 1.0); const c = sim.sledgeCheck(sl.x); sl.tg = c.tg; sl.ok = c.ok; }
          else if (sl.state === 'swing' && sl.t >= 0.32) { const r = sim.sledgeHit(sl.x, sl.charge); buzz(18 + Math.round(sl.charge * 22)); shake = Math.max(shake, 2 + 3 * sl.charge); sl.state = 'recover'; sl.t = 0; if (r && r.tg) sl.tg = r.tg; hint('t3', 'Blows on corners and edges knock off flakes. The block only splits once the cracks have grown. Strike along the crack.'); }
          else if (sl.state === 'recover' && sl.t > 0.55) sl = null;
        }
        if (br) { br.t -= sdt; if (br.t <= 0) { br.t = 0.125; sim.breakerBlow(br.x, br.y); shake = Math.max(shake, 1.5); } }
        // contextual hints
        if (sim.D.oversizeIn > 0) hint('t2', sim.up.breaker ? 'A block is bigger than the feed opening. Pick Breaker: the boom swings out. Hold your finger on the block and the hammer works on it.' : 'A block is bigger than the feed opening. Pick Sledge, hold your finger on top of the block and release to strike.');
        if (sim.m.block > 0.5) hint('t4', 'The ammeter is spiking: the jaw is getting more than it can handle. Slow the feeder (−), or the overload relay will trip.');
        for (const e of sim.fx) { if (e.t === 'dump') lastLoadT = e.mass * sim.TLm / 1000 * 1.1; if (e.t === 'dirty') toast(sim.up.scalper ? 'Dirty load: the scalper sends the soil and fines to the fill heap.' : e.share > 0.27 ? 'Dirty load: a lot of soil and gravel from the top of the bench. It lowers the quality of the product. A scalper (Equipment) or stripping the overburden (Workshop) helps.' : 'This load has more soil and gravel than usual.', 3600); if (e.t === 'steelIn') hint('t5', 'Steel in the load! A broken bucket tooth. Pry it over the left edge with the pry bar, into the scrap skip on the platform, before it reaches the jaw.', 6000); if (e.t === 'steelOut') toast('Steel went out with the aggregate. The customer complains.', 3200, 'bad'); if (e.t === 'repaired') toast('New toggle plate fitted and the steel removed. Start the crusher.', 3600, 'good'); }
        cssTick(sdt);
        hudT -= dt; if (hudT <= 0) { updateHud(); hudT = 0.1; }
        if (save.sound && !sndWarn && shiftT > 3 && Sound.state !== 'running') { sndWarn = true; Sound.unlock(); toast('No sound? Tap the screen, and check that your phone\'s media volume is turned up.', 4200); }
        if (shiftT >= DAY_LEN && !otAsked) askOvertime();
        else if (otAsked && shiftT >= DAY_LEN * otEnd) { toast(otEnd < OT_MAX - 0.01 ? 'It\'s dark. Time to go home.' : 'It\'s 19:00. Time to go home.', 3000); endShift(false); }
        { const dk = Render.darkness(7 + 8 * shiftT / DAY_LEN, Career.month(save.day)); if (dk > 0.3) sim.D.darkT = (sim.D.darkT || 0) + sdt * (sim.skip || 1) * 8 / DAY_LEN; }
        goalT -= dt; if (goalT <= 0) { goalT = 0.5; goalsTick(sim.D); }
      }
    }
    if (sim) Render.setAction({ k: 0, box: null });   // the camera never moves by itself
    if (sim) {
      const hour = mode === 'shift' ? 7 + 8 * shiftT / DAY_LEN : 10.5;
      const aim = sl && sl.state === 'charge' && sl.tg ? { x: sl.tg.x, y: sl.tg.y, ok: sl.ok, charge: sl.charge } : null;
      Render.frame(sim, mode === 'shift' || mode === 'report' ? save : (save || null), weather, { dt: sdt || dt * 0.5, hour, time: simTime, shake, sledge: sl && sl.tg ? sl : null, aim, breaker: brPose(dt) });
      const beltLoad = sim.parts.reduce((a, p) => a + (p.st === 1 ? 1 : 0), 0);
      Sound.update(sim, { hour, beltLoad, active: mode === 'shift' }, dt);
      sim.fx.length = 0;
    }
    shake *= Math.pow(0.001, dt);
    requestAnimationFrame(frame);
  }
  function save0Feed() {
    const mats = () => [MATS.marmor, MATS.gneis, MATS.skifer][(sim.rng() * 3) | 0];
    sim.callLoader(sim.makeLoad(mats, 0.22), false);
  }
  window.__rcSim = () => sim;   // for automated tests
  requestAnimationFrame(frame);
  sim = demoSim();
  intro();
})();
