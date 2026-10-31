(() => {
  "use strict";

  const API = "/api/admin";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const DAY = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const DAY_S = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const MONTH = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const MONTH_S = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
  const STATUS = { pending: "Gebucht", confirmed: "Gebucht", done: "Erledigt", cancelled: "Storniert", noshow: "Nicht erschienen" };
  const SOURCE = { online: "Website", telefon: "Telefon", vorort: "Vor Ort", whatsapp: "WhatsApp", instagram: "Instagram" };

  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const monday = d => addDays(d, -((d.getDay() + 6) % 7));
  const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const toHM = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const nice = t => t.replace(":", ".");
  const endTime = b => toHM(toMin(b.time) + b.duration);
  const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  const longDate = d => `${DAY[d.getDay()]}, ${d.getDate()}. ${MONTH[d.getMonth()]} ${d.getFullYear()}`;
  const relDay = s => {
    const diff = Math.round((parse(s) - today()) / 864e5);
    return diff === 0 ? "Heute" : diff === 1 ? "Morgen" : diff === -1 ? "Gestern" : null;
  };
  const dur = m => m < 60 ? `${m} Min.` : `${Math.floor(m / 60)} Std.${m % 60 ? ` ${m % 60} Min.` : ""}`;

  let SALON = null;
  const items = {}, extras = {};

  /* ---------------- API ---------------- */
  async function api(action, data = {}) {
    const res = await fetch(API, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-VN": "1" },
      body: JSON.stringify({ action, ...data })
    });
    let json = {};
    try { json = await res.json(); } catch (_) { /* leer */ }
    if (res.status === 401 && action !== "login" && action !== "password") { showAuth(false); throw new Error("auth"); }
    if (!res.ok || !json.ok) { const e = new Error(json.error || "Fehler beim Speichern."); e.code = json.code; e.status = res.status; throw e; }
    return json;
  }

  const toast = (msg, ms = 2600) => {
    const t = $("[data-toast]");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("is-on"), ms);
  };

  /* ---------------- Telefon & WhatsApp ---------------- */
  const waNumber = p => {
    let d = String(p || "").replace(/[^\d+]/g, "");
    if (d.startsWith("+")) d = d.slice(1);
    else if (d.startsWith("00")) d = d.slice(2);
    else if (d.startsWith("0")) d = "49" + d.slice(1);
    return d.replace(/\D/g, "");
  };
  const firstName = n => String(n || "").trim().split(/\s+/)[0];
  const waText = (b, kind) => {
    const when = `${longDate(parse(b.date))} um ${nice(b.time)} Uhr`;
    if (kind === "decline") {
      return `Hallo ${firstName(b.name)}, leider müssen wir Ihren Termin bei Vietnam Nails am ${when} absagen. Dürfen wir Ihnen einen anderen Termin vorschlagen?`;
    }
    return `Hallo ${firstName(b.name)}, wir freuen uns auf Ihren Termin bei Vietnam Nails:\n\n${b.title}\n${when}\n\nRannische Str. 6, 06108 Halle (Saale)`;
  };
  const waLink = (b, kind) => b.phone ? `https://wa.me/${waNumber(b.phone)}?text=${encodeURIComponent(waText(b, kind))}` : null;

  /* ---------------- Anmeldung ---------------- */
  const authEl = $("[data-auth]"), appEl = $("[data-app]"), authForm = $("[data-auth-form]");
  let setupMode = false;

  function showAuth(setup) {
    setupMode = setup;
    appEl.hidden = true;
    authEl.hidden = false;
    $("[data-auth-title]").textContent = setup ? "Willkommen" : "Anmelden";
    $("[data-auth-text]").textContent = setup ? "Legen Sie jetzt ein Passwort für den Admin-Bereich fest. Bitte gut merken." : "Bitte geben Sie Ihr Passwort ein.";
    $("[data-auth-repeat]").hidden = !setup;
    $("[data-auth-btn]").textContent = setup ? "Passwort festlegen" : "Anmelden";
    authForm.password.autocomplete = setup ? "new-password" : "current-password";
    authForm.password.value = "";
    setTimeout(() => authForm.password.focus(), 50);
  }

  authForm.addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("[data-auth-err]");
    err.textContent = "";
    const pw = authForm.password.value;
    if (setupMode) {
      if (pw.length < 10) { err.textContent = "Mindestens 10 Zeichen."; return; }
      if (pw !== authForm.password2.value) { err.textContent = "Die Passwörter stimmen nicht überein."; return; }
    }
    try {
      await api(setupMode ? "setup" : "login", { password: pw });
      startApp();
    } catch (x) { err.textContent = x.message; }
  });

  $("[data-logout]").addEventListener("click", async () => { try { await api("logout"); } catch (_) {} showAuth(false); });

  /* ---------------- Navigation ---------------- */
  const VIEWS = ["uebersicht", "kalender", "termine", "einstellungen"];
  let view = null;

  function route() {
    const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "uebersicht";
    view = v;
    $$("[data-view]").forEach(s => { s.hidden = s.dataset.view !== v; });
    $$("[data-nav]").forEach(a => a.classList.toggle("is-on", a.dataset.nav === v));
    if (v === "uebersicht") loadOverview();
    if (v === "kalender") loadCal();
    if (v === "termine") loadList();
    if (v === "einstellungen") { renderSettings(); loadClosed(); }
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", () => { if (!appEl.hidden) route(); });

  $$("[data-go]").forEach(b => b.addEventListener("click", () => { location.hash = b.dataset.go; }));

  /* ---------------- Übersicht ---------------- */
  async function loadOverview() {
    const h = new Date().getHours();
    $("[data-greeting]").textContent = h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
    $("[data-today-label]").textContent = longDate(today());
    try {
      const [stats, pend, todayB] = await Promise.all([
        api("stats"), api("recent"), api("bookings", { from: ymd(today()), to: ymd(today()) })
      ]);
      ["online7", "today", "week", "visitorsToday", "visitors7", "visitors30", "online30"].forEach(k => {
        $$(`[data-stat="${k}"]`).forEach(el => { el.textContent = stats[k]; });
      });
      renderRecent(pend.bookings);
      renderToday(todayB.bookings);
      lastStats = stats;
      drawChart(stats.series);
      renderSources(stats);
    } catch (e) { if (e.message !== "auth") toast(e.message); }
  }

  // „Neu“-Markierung: online gebuchte Termine seit dem letzten Öffnen der Übersicht
  const SEEN_KEY = "vn_admin_seen";
  const lastSeen = () => { try { return localStorage.getItem(SEEN_KEY) || ""; } catch (_) { return ""; } };
  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch (_) {} };
  const unseen = list => { const t = lastSeen(); return list.filter(b => !t || new Date(b.created_at) > new Date(t)); };

  function setBadge(n) {
    $$("[data-badge]").forEach(b => { b.hidden = !n; b.textContent = n; });
    document.title = `${n ? `(${n}) ` : ""}Admin · Vietnam Nails`;
  }
  // Neue Online-Buchungen sofort melden (Hinweis + kurzer Ton), auch wenn eine andere Ansicht offen ist
  let knownIds = null;
  let audio = null;
  const chime = () => {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      [[880, 0], [1320, .16]].forEach(([f, t]) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = f; o.type = "sine";
        g.gain.setValueAtTime(0, audio.currentTime + t);
        g.gain.linearRampToValueAtTime(.18, audio.currentTime + t + .02);
        g.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + t + .6);
        o.connect(g).connect(audio.destination);
        o.start(audio.currentTime + t); o.stop(audio.currentTime + t + .65);
      });
    } catch (_) { /* Ton ist optional */ }
  };
  const checkNew = () => api("recent").then(r => {
    cache(r.bookings);
    if (view !== "uebersicht") setBadge(unseen(r.bookings).length);
    const ids = r.bookings.map(b => b.id);
    if (knownIds) {
      const fresh = r.bookings.filter(b => !knownIds.has(b.id));
      if (fresh.length) {
        const b = fresh[0], d = parse(b.date);
        toast(`Neue Online-Buchung: ${b.name} · ${relDay(b.date) || `${DAY_S[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.`} ${nice(b.time)} Uhr${fresh.length > 1 ? ` (+${fresh.length - 1})` : ""}`, 9000);
        chime();
        if (view === "uebersicht") loadOverview();
        if (view === "kalender") loadCal();
      }
    }
    knownIds = new Set([...(knownIds || []), ...ids]);
    return r;
  }).catch(() => {});

  function renderRecent(list) {
    const el = $("[data-recent-list]");
    const fresh = new Set(unseen(list).map(b => b.id));
    if (!list.length) { el.innerHTML = `<p class="empty">Noch keine Online-Buchungen.</p>`; setBadge(0); return; }
    el.innerHTML = list.map(b => {
      const d = parse(b.date);
      return `<button class="drow" data-open="${b.id}">
        <span class="drow-time">${nice(b.time)}<small>${relDay(b.date) || `${DAY_S[d.getDay()]}, ${d.getDate()}. ${MONTH_S[d.getMonth()]}`}</small></span>
        <span><span class="drow-name">${esc(b.name)}</span><span class="drow-meta">${esc(b.title)}</span></span>
        ${fresh.has(b.id) ? `<span class="pill pill-new">Neu</span>` : `<span></span>`}
      </button>`;
    }).join("");
    cache(list);
    setBadge(0);
    markSeen();
  }

  function renderToday(list) {
    const el = $("[data-today-list]");
    const act = list.filter(b => b.status !== "cancelled");
    if (!act.length) { el.innerHTML = `<p class="empty">Heute sind keine Termine eingetragen.</p>`; return; }
    const nowM = new Date().getHours() * 60 + new Date().getMinutes();
    el.innerHTML = act.map(b => `
      <button class="drow${toMin(b.time) + b.duration < nowM ? " is-past" : ""}" data-open="${b.id}">
        <span class="drow-time">${nice(b.time)}<small>bis ${nice(endTime(b))}</small></span>
        <span><span class="drow-name">${esc(b.name)}</span><span class="drow-meta">${esc(b.title)}</span></span>
        <span class="pill pill-${b.status}">${STATUS[b.status]}</span>
      </button>`).join("");
    cache(list);
  }

  /* Diagramm: Besucher je Tag (eine Reihe, Balken) */
  let lastStats = null;
  function drawChart(series) {
    const host = $("[data-chart]");
    const W = Math.max(280, host.clientWidth), H = host.clientHeight || 230;
    const pad = { l: 34, r: 6, t: 10, b: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const max = Math.max(4, ...series.map(s => s.visitors));
    const step = max <= 8 ? 2 : max <= 20 ? 5 : max <= 50 ? 10 : max <= 200 ? 50 : Math.ceil(max / 4 / 100) * 100;
    const top = Math.ceil(max / step) * step;
    const y = v => pad.t + ih - (v / top) * ih;
    const bw = iw / series.length;
    const gap = Math.max(2, bw * .28);
    const r = Math.min(4, (bw - gap) / 2);
    const ticks = [];
    for (let v = 0; v <= top; v += step) ticks.push(v);
    const t0 = ymd(today());
    const bars = series.map((s, i) => {
      const x = pad.l + i * bw + gap / 2, w = bw - gap, yy = y(s.visitors), h = pad.t + ih - yy;
      const d = parse(s.day);
      const path = h <= 0 ? "" : h <= r
        ? `<rect class="bar${s.day === t0 ? " is-today" : ""}" x="${x}" y="${yy}" width="${w}" height="${h}" data-i="${i}"/>`
        : `<path class="bar${s.day === t0 ? " is-today" : ""}" data-i="${i}" d="M${x},${pad.t + ih} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + w - r} Q${x + w},${yy} ${x + w},${yy + r} V${pad.t + ih} Z"/>`;
      const label = (i % 7 === (series.length - 1) % 7) ? `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${d.getDate()}.${d.getMonth() + 1}.</text>` : "";
      return `<rect class="hit" x="${pad.l + i * bw}" y="${pad.t}" width="${bw}" height="${ih}" data-i="${i}"/>${path}${label}`;
    }).join("");
    const total = series.reduce((a, s) => a + s.visitors, 0);
    host.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Besucher pro Tag in den letzten 30 Tagen, insgesamt ${total}">
        <g class="grid">${ticks.map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>
        <g class="axis">${ticks.map(v => `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}</g>
        <g class="axis">${bars}</g>
      </svg>
      <div class="chart-tip" data-tip></div>
      ${total ? "" : `<div class="chart-empty">Noch keine Besucher gezählt – die Statistik füllt sich ab dem ersten Besuch.</div>`}`;
    const tip = $("[data-tip]", host);
    const svg = $("svg", host);
    svg.addEventListener("mousemove", e => {
      const t = e.target.closest("[data-i]");
      $$(".bar.is-hover", svg).forEach(b => b.classList.remove("is-hover"));
      if (!t) { tip.classList.remove("is-on"); return; }
      const i = Number(t.dataset.i), s = series[i], d = parse(s.day);
      const bar = $(`.bar[data-i="${i}"]`, svg);
      if (bar) bar.classList.add("is-hover");
      tip.innerHTML = `${DAY_S[d.getDay()]}, ${d.getDate()}. ${MONTH_S[d.getMonth()]}<b>${s.visitors} ${s.visitors === 1 ? "Besucher" : "Besucher"}</b>${s.views} Seitenaufrufe`;
      const rect = host.getBoundingClientRect();
      const px = (pad.l + i * bw + bw / 2) * rect.width / W;
      tip.style.left = `${Math.min(rect.width - 70, Math.max(70, px))}px`;
      tip.style.top = `${y(s.visitors) * rect.height / H}px`;
      tip.classList.add("is-on");
    });
    svg.addEventListener("mouseleave", () => { tip.classList.remove("is-on"); $$(".bar.is-hover", svg).forEach(b => b.classList.remove("is-hover")); });
  }
  let rz;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (view === "uebersicht" && lastStats) drawChart(lastStats.series); if (view === "kalender") renderCal(); }, 150); });

  function renderSources(stats) {
    const list = (rows, key) => {
      const total = rows.reduce((a, r) => a + Number(r.n), 0) || 1;
      return rows.length ? rows.map(r => `<li><span>${esc(r[key] === "mobil" ? "Smartphone" : r[key] === "desktop" ? "Computer" : r[key])}</span><span class="sbar"><i style="width:${Math.round(Number(r.n) / total * 100)}%"></i></span><b>${Math.round(Number(r.n) / total * 100)}%</b></li>`).join("")
        : `<li class="muted">Noch keine Daten</li>`;
    };
    $("[data-sources]").innerHTML = list(stats.sources, "source");
    $("[data-devices]").innerHTML = list(stats.devices, "device");
  }

  /* ---------------- Cache & Status ---------------- */
  const byId = {};
  const cache = list => list.forEach(b => { byId[b.id] = b; });

  async function setStatus(b, status) {
    try {
      await api("status", { id: b.id, status });
      b.status = status;
      toast(`Status: ${STATUS[status]}`);
      refresh();
    } catch (e) { toast(e.message); }
  }

  function refresh() {
    if (view === "uebersicht") loadOverview();
    if (view === "kalender") loadCal();
    if (view === "termine") loadList();
    if (view !== "uebersicht") checkNew();
  }

  /* ---------------- Kalender ---------------- */
  const cal = { mode: window.innerWidth < 900 ? "day" : "week", anchor: today(), list: [] };
  const calEl = $("[data-cal]");

  function calRange() {
    if (cal.mode === "day") return [cal.anchor, cal.anchor];
    const s = monday(cal.anchor);
    return [s, addDays(s, 6)];
  }

  async function loadCal() {
    syncCalMode();
    const [a, b] = calRange();
    const stripStart = monday(cal.anchor);
    const from = cal.mode === "day" ? stripStart : a, to = cal.mode === "day" ? addDays(stripStart, 6) : b;
    try {
      const r = await api("bookings", { from: ymd(from), to: ymd(to) });
      cal.list = r.bookings;
      cache(cal.list);
      renderCal();
    } catch (e) { if (e.message !== "auth") toast(e.message); }
  }

  function syncCalMode() {
    $$("[data-cal-mode]").forEach(b => b.classList.toggle("is-on", b.dataset.calMode === cal.mode));
    $('[data-view="kalender"]').dataset.mode = cal.mode;
  }

  function renderCal() {
    const [a, b] = calRange();
    let days = [];
    for (let d = a; d <= b; d = addDays(d, 1)) days.push(d);
    // Sonntag nur zeigen, wenn geöffnet oder Termine vorhanden
    if (cal.mode === "week") {
      days = days.filter(d => d.getDay() !== 0 || SALON.hours["0"] || cal.list.some(x => x.date === ymd(d)));
    }
    // Zeitraum: früheste Öffnung bis späteste Schließung, ggf. erweitert
    let start = 24 * 60, end = 0;
    Object.values(SALON.hours).forEach(h => { if (h) { start = Math.min(start, toMin(h[0])); end = Math.max(end, toMin(h[1])); } });
    cal.list.forEach(x => { start = Math.min(start, toMin(x.time)); end = Math.max(end, toMin(x.time) + x.duration); });
    start = Math.floor((start - 30) / 60) * 60;
    end = Math.ceil((end + 30) / 60) * 60;
    const ppm = window.innerWidth < 900 ? 1.25 : 1.3;
    const height = (end - start) * ppm;

    // Titel
    const title = $("[data-cal-title]");
    if (cal.mode === "day") title.textContent = `${DAY[a.getDay()]}, ${a.getDate()}. ${MONTH[a.getMonth()]}`;
    else title.textContent = a.getMonth() === b.getMonth() ? `${a.getDate()}.–${b.getDate()}. ${MONTH[a.getMonth()]} ${a.getFullYear()}` : `${a.getDate()}. ${MONTH_S[a.getMonth()]} – ${b.getDate()}. ${MONTH_S[b.getMonth()]} ${b.getFullYear()}`;

    // Tagesleiste (mobil)
    const ws = monday(cal.anchor);
    $("[data-daystrip]").innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(ws, i), k = ymd(d);
      const has = cal.list.some(x => x.date === k && x.status !== "cancelled");
      return `<button class="${k === ymd(cal.anchor) ? "is-on" : ""} ${has ? "has" : ""}" data-strip="${k}">${DAY_S[d.getDay()]}<b>${d.getDate()}</b><i></i></button>`;
    }).join("");

    calEl.style.setProperty("--cols", days.length);
    calEl.style.setProperty("--ppm", `${ppm}px`);
    const t0 = ymd(today());
    let html = `<div class="cal-corner"></div>`;
    html += days.map(d => {
      const k = ymd(d), n = cal.list.filter(x => x.date === k && !["cancelled", "noshow"].includes(x.status)).length;
      return `<div class="cal-hd${k === t0 ? " is-today" : ""}">${DAY_S[d.getDay()]}<b>${d.getDate()}</b><small>${n ? `${n} ${n === 1 ? "Termin" : "Termine"}` : "&nbsp;"}</small></div>`;
    }).join("");
    let times = "";
    for (let m = start; m <= end; m += 60) times += `<span style="top:${(m - start) * ppm}px">${String(m / 60).padStart(2, "0")}:00</span>`;
    html += `<div class="cal-times" style="height:${height}px">${times}</div>`;

    const nowD = new Date(), nowM = nowD.getHours() * 60 + nowD.getMinutes();
    html += days.map(d => {
      const k = ymd(d);
      const h = SALON.hours[String(d.getDay())];
      const closed = !h || (SALON.closedDates || []).includes(k);
      let off = "";
      if (!closed) {
        const o = toMin(h[0]), c = toMin(h[1]);
        if (o > start) off += `<div class="cal-off" style="top:0;height:${(o - start) * ppm}px"></div>`;
        if (c < end) off += `<div class="cal-off" style="top:${(c - start) * ppm}px;bottom:0"></div>`;
      }
      const evs = layout(cal.list.filter(x => x.date === k)).map(({ b, col, cols }) => {
        const top = (toMin(b.time) - start) * ppm, hgt = Math.max(22, b.duration * ppm - 2);
        const w = 100 / cols;
        return `<button class="ev ev-${b.status}${hgt < 44 ? " is-short" : ""}" data-open="${b.id}"
          style="top:${top}px;height:${hgt}px;left:calc(${col * w}% + 3px);width:calc(${w}% - 6px)"
          title="${esc(`${nice(b.time)}–${nice(endTime(b))} ${b.name} · ${b.title}`)}">
          <small>${nice(b.time)}–${nice(endTime(b))}</small><b>${hgt < 44 ? `${nice(b.time)} ` : ""}${esc(b.name)}</b><span>${esc(b.title)}</span></button>`;
      }).join("");
      const now = k === t0 && nowM > start && nowM < end ? `<div class="cal-now" style="top:${(nowM - start) * ppm}px"></div>` : "";
      return `<div class="cal-col${closed ? " is-closed" : ""}" data-day="${k}" data-start="${start}" style="height:${height}px">${off}${evs}${now}<div class="cal-ghost"></div></div>`;
    }).join("");
    calEl.innerHTML = html;

    // beim ersten Anzeigen zur aktuellen Uhrzeit / Öffnung scrollen
    const wrap = $("[data-cal-wrap]");
    if (!cal.scrolled) {
      const inRange = ymd(a) <= t0 && t0 <= ymd(b) && nowM < end - 120;
      const focus = Math.max(start, inRange ? nowM - 90 : start + 30);
      wrap.scrollTop = (focus - start) * ppm;
      cal.scrolled = true;
    }
  }

  // Überlappende Termine nebeneinander anordnen
  function layout(list) {
    const evs = list.map(b => ({ b, s: toMin(b.time), e: toMin(b.time) + b.duration })).sort((x, y) => x.s - y.s || y.e - x.e);
    const out = [];
    let cluster = [], clusterEnd = -1;
    const flush = () => {
      const colsEnd = [];
      cluster.forEach(ev => {
        let c = colsEnd.findIndex(end => end <= ev.s);
        if (c === -1) { c = colsEnd.length; colsEnd.push(ev.e); } else colsEnd[c] = ev.e;
        ev.col = c;
      });
      cluster.forEach(ev => out.push({ b: ev.b, col: ev.col, cols: colsEnd.length }));
      cluster = [];
    };
    evs.forEach(ev => {
      if (ev.s >= clusterEnd && cluster.length) flush();
      cluster.push(ev);
      clusterEnd = Math.max(clusterEnd, ev.e);
    });
    if (cluster.length) flush();
    return out;
  }

  // Klick in freie Fläche → neuer Termin
  calEl.addEventListener("click", e => {
    if (e.target.closest("[data-open]")) return;
    const col = e.target.closest(".cal-col");
    if (!col || col.classList.contains("is-closed")) return;
    const ppm = parseFloat(getComputedStyle(calEl).getPropertyValue("--ppm"));
    const y = e.clientY - col.getBoundingClientRect().top;
    const m = Number(col.dataset.start) + Math.floor(y / ppm / 15) * 15;
    openForm(null, { date: col.dataset.day, time: toHM(m) });
  });
  calEl.addEventListener("mousemove", e => {
    const col = e.target.closest(".cal-col");
    if (!col || e.target.closest("[data-open]")) return;
    const ppm = parseFloat(getComputedStyle(calEl).getPropertyValue("--ppm"));
    const y = e.clientY - col.getBoundingClientRect().top;
    const q = Math.floor(y / ppm / 15) * 15;
    const g = $(".cal-ghost", col);
    g.style.top = `${q * ppm}px`;
    g.style.height = `${30 * ppm}px`;
    g.textContent = `+ ${nice(toHM(Number(col.dataset.start) + q))}`;
  });

  $("[data-cal-prev]").addEventListener("click", () => { cal.anchor = addDays(cal.anchor, cal.mode === "day" ? -1 : -7); loadCal(); });
  $("[data-cal-next]").addEventListener("click", () => { cal.anchor = addDays(cal.anchor, cal.mode === "day" ? 1 : 7); loadCal(); });
  $("[data-cal-today]").addEventListener("click", () => { cal.anchor = today(); cal.scrolled = false; loadCal(); });
  $$("[data-cal-mode]").forEach(b => b.addEventListener("click", () => { cal.mode = b.dataset.calMode; loadCal(); }));
  $("[data-daystrip]").addEventListener("click", e => {
    const b = e.target.closest("[data-strip]"); if (!b) return;
    cal.anchor = parse(b.dataset.strip); cal.mode = "day"; loadCal();
  });
  // Wischen im Tagesmodus
  let sx = null;
  $("[data-cal-wrap]").addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
  $("[data-cal-wrap]").addEventListener("touchend", e => {
    if (sx === null || cal.mode !== "day") return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 70) { cal.anchor = addDays(cal.anchor, dx < 0 ? 1 : -1); loadCal(); }
    sx = null;
  });

  /* ---------------- Terminliste ---------------- */
  const listState = { q: "", status: "", when: "up" };
  let st;
  $("[data-search]").addEventListener("input", e => { listState.q = e.target.value; clearTimeout(st); st = setTimeout(loadList, 250); });
  $("[data-status-filter]").addEventListener("click", e => {
    const b = e.target.closest("[data-s]"); if (!b) return;
    listState.status = b.dataset.s; syncListFilters(); loadList();
  });
  $$("[data-when]").forEach(b => b.addEventListener("click", () => { listState.when = b.dataset.when; syncListFilters(); loadList(); }));
  function syncListFilters() {
    $$("[data-s]").forEach(b => b.classList.toggle("is-on", b.dataset.s === listState.status));
    $$("[data-when]").forEach(b => b.classList.toggle("is-on", b.dataset.when === listState.when));
  }

  async function loadList() {
    try {
      const r = await api("search", { q: listState.q, status: listState.status, upcoming: listState.when === "up" });
      cache(r.bookings);
      const el = $("[data-list]");
      if (!r.bookings.length) { el.innerHTML = `<p class="empty">Keine Termine gefunden.</p>`; return; }
      const groups = {};
      r.bookings.forEach(b => { (groups[b.date] ||= []).push(b); });
      el.innerHTML = Object.entries(groups).map(([k, list]) => {
        const d = parse(k), rel = relDay(k);
        return `<div class="bgroup"><h3><b>${rel ? `${rel}, ` : ""}${DAY[d.getDay()]}, ${d.getDate()}. ${MONTH[d.getMonth()]}</b>${list.length} ${list.length === 1 ? "Termin" : "Termine"}</h3>
          <div class="bgroup-rows">${list.map(b => `
            <button class="brow" data-open="${b.id}">
              <span class="brow-time">${nice(b.time)}<small>${dur(b.duration)}</small></span>
              <span class="brow-name">${esc(b.name)}<small>${esc(b.phone || "ohne Telefon")}</small></span>
              <span class="brow-svc">${esc(b.title)}</span>
              <span class="pill pill-${b.status}">${STATUS[b.status]}</span>
              <span class="brow-src">${SOURCE[b.source] || ""}</span>
            </button>`).join("")}</div></div>`;
      }).join("");
    } catch (e) { if (e.message !== "auth") toast(e.message); }
  }

  /* ---------------- Detail-Panel ---------------- */
  const drawer = $("[data-drawer]"), scrim = $("[data-scrim]");
  let current = null, lastFocus = null;

  document.addEventListener("click", e => {
    const o = e.target.closest("[data-open]");
    if (o && byId[o.dataset.open]) openDrawer(byId[o.dataset.open]);
  });

  function openDrawer(b) {
    current = b;
    lastFocus = document.activeElement;
    $("[data-dr-status]").className = `pill pill-${b.status}`;
    $("[data-dr-status]").textContent = STATUS[b.status];
    $("[data-dr-ref]").textContent = `${b.ref} · ${SOURCE[b.source] || ""}`;
    $("[data-dr-name]").textContent = b.name;
    $("[data-dr-when]").textContent = `${longDate(parse(b.date))} · ${nice(b.time)}–${nice(endTime(b))} Uhr`;
    const call = $("[data-dr-call]"), wa = $("[data-dr-wa]");
    call.href = b.phone ? `tel:${b.phone.replace(/[^\d+]/g, "")}` : "#";
    call.setAttribute("aria-disabled", String(!b.phone));
    wa.href = waLink(b, b.status === "cancelled" ? "decline" : "reminder") || "#";
    wa.setAttribute("aria-disabled", String(!b.phone));
    const ex = (b.extras || []).map(id => extras[id]?.name).filter(Boolean);
    const rows = [
      ["Leistung", esc(b.title)],
      ex.length ? ["Extras", esc(ex.join(", "))] : null,
      ["Dauer", dur(b.duration)],
      b.price ? ["Preis", esc(b.price)] : null,
      ["Telefon", b.phone ? esc(b.phone) : "–"],
      b.visit ? ["Besuch", esc(b.visit)] : null,
      b.note ? ["Notiz", esc(b.note).replace(/\n/g, "<br>")] : null,
      ["Eingegangen", new Date(b.created_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })]
    ].filter(Boolean);
    $("[data-dr-kv]").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
    const active = b.status === "confirmed" || b.status === "pending";
    $$("[data-set]", drawer).forEach(x => { x.hidden = x.dataset.set === b.status || (x.dataset.set === "confirmed" && active); });
    scrim.hidden = false; drawer.hidden = false;
    document.body.classList.add("is-locked");
    requestAnimationFrame(() => { scrim.classList.add("is-on"); drawer.classList.add("is-on"); });
    $("[data-close]", drawer).focus();
  }
  function closeDrawer() {
    scrim.classList.remove("is-on"); drawer.classList.remove("is-on");
    document.body.classList.remove("is-locked");
    setTimeout(() => { if (!drawer.classList.contains("is-on")) { drawer.hidden = true; scrim.hidden = true; } }, 400);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  $("[data-close]", drawer).addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  $("[data-dr-statusbtns]").addEventListener("click", async e => {
    const s = e.target.closest("[data-set]"); if (!s || !current) return;
    await setStatus(current, s.dataset.set);
    openDrawer(current);
  });
  $("[data-dr-edit]").addEventListener("click", () => { const b = current; closeDrawer(); openForm(b); });
  $("[data-dr-delete]").addEventListener("click", async () => {
    if (!current || !confirm(`Termin von ${current.name} endgültig löschen?\n\nTipp: „Stornieren“ behält den Eintrag in der Liste.`)) return;
    try { await api("delete", { id: current.id }); toast("Termin gelöscht"); closeDrawer(); refresh(); } catch (e) { toast(e.message); }
  });

  /* ---------------- Formular ---------------- */
  const modal = $("[data-modal]"), form = $("[data-form]");
  const fm = { id: null, services: new Set(), extras: new Set(), source: "telefon", status: "confirmed", durTouched: false };

  function buildFormOptions() {
    $("[data-fm-services]").innerHTML = SALON.categories.map(c => `
      <div class="f-cat"><span>${c.label}</span><div class="chips">${c.items.map(i =>
        `<button type="button" data-svc="${i.id}" aria-pressed="false">${esc(i.name)}</button>`).join("")}</div></div>`).join("");
    $("[data-fm-extras]").innerHTML = SALON.extras.map(x => `<button type="button" data-ex="${x.id}" aria-pressed="false">${esc(x.name)}</button>`).join("");
    const sel = $("[data-fm-duration]");
    let opts = "";
    for (let m = 15; m <= 300; m += 15) opts += `<option value="${m}">${dur(m)}</option>`;
    sel.innerHTML = opts;
  }

  function autoDuration() {
    const total = [...fm.services].reduce((a, id) => a + (items[id]?.dur || 0), 0);
    return total ? Math.min(300, Math.ceil(total / 15) * 15) : 60;
  }

  function syncForm() {
    $$("[data-svc]", form).forEach(b => b.setAttribute("aria-pressed", String(fm.services.has(b.dataset.svc))));
    $$("[data-ex]", form).forEach(b => b.setAttribute("aria-pressed", String(fm.extras.has(b.dataset.ex))));
    $$("[data-fm-source] [data-v]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === fm.source)));
    $$("[data-fm-status] [data-v]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === fm.status)));
    $("[data-fm-extras-count]").textContent = fm.extras.size ? `(${fm.extras.size})` : "";
    if (!fm.durTouched) form.duration.value = String(autoDuration());
    updateHint();
  }

  function updateHint() {
    const hint = $("[data-fm-hint]");
    hint.classList.remove("is-warn");
    const d = form.date.value, t = form.time.value;
    if (!d || !t) { hint.textContent = ""; return; }
    const day = parse(d);
    const h = SALON.hours[String(day.getDay())];
    const end = toHM(toMin(t) + Number(form.duration.value));
    let msg = `${DAY[day.getDay()]}, ${day.getDate()}. ${MONTH[day.getMonth()]} · ${nice(t)}–${nice(end)} Uhr`;
    if (!h || (SALON.closedDates || []).includes(d)) { msg += " · Achtung: an diesem Tag ist geschlossen."; hint.classList.add("is-warn"); }
    else if (toMin(t) < toMin(h[0]) || toMin(end) > toMin(h[1])) { msg += ` · Achtung: außerhalb der Öffnungszeit (${nice(h[0])}–${nice(h[1])}).`; hint.classList.add("is-warn"); }
    hint.textContent = msg;
  }

  function openForm(b, prefill = {}) {
    form.reset();
    $("[data-fm-err]").textContent = "";
    fm.id = b ? b.id : null;
    fm.services = new Set(b ? b.services : []);
    fm.extras = new Set(b ? b.extras : []);
    fm.source = b ? b.source : "telefon";
    fm.status = b && b.status !== "pending" ? b.status : "confirmed";
    fm.durTouched = !!b;
    $("[data-fm-title]").textContent = b ? "Termin bearbeiten" : "Neuer Termin";
    form.name.value = b ? b.name : "";
    form.phone.value = b ? b.phone : "";
    form.note.value = b ? b.note : "";
    form.title.value = b && !b.services.length ? b.title : "";
    const now = new Date();
    let defTime = toHM(Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15);
    form.date.value = b ? b.date : (prefill.date || ymd(view === "kalender" ? cal.anchor : today()));
    form.time.value = b ? b.time : (prefill.time || defTime);
    if (b) form.duration.value = String(Math.min(300, Math.max(15, Math.round(b.duration / 15) * 15)));
    $(".f-extras", form).open = fm.extras.size > 0;
    syncForm();
    modal.hidden = false;
    document.body.classList.add("is-locked");
    requestAnimationFrame(() => modal.classList.add("is-on"));
    setTimeout(() => form.name.focus(), 60);
  }
  function closeForm() {
    modal.classList.remove("is-on");
    document.body.classList.remove("is-locked");
    setTimeout(() => { if (!modal.classList.contains("is-on")) modal.hidden = true; }, 300);
  }
  $$("[data-close]", modal).forEach(b => b.addEventListener("click", closeForm));
  modal.addEventListener("click", e => { if (e.target === modal) closeForm(); });

  form.addEventListener("click", e => {
    const s = e.target.closest("[data-svc]"), x = e.target.closest("[data-ex]");
    const src = e.target.closest("[data-fm-source] [data-v]"), stt = e.target.closest("[data-fm-status] [data-v]");
    if (s) { fm.services.has(s.dataset.svc) ? fm.services.delete(s.dataset.svc) : fm.services.add(s.dataset.svc); fm.durTouched = false; }
    if (x) fm.extras.has(x.dataset.ex) ? fm.extras.delete(x.dataset.ex) : fm.extras.add(x.dataset.ex);
    if (src) fm.source = src.dataset.v;
    if (stt) fm.status = stt.dataset.v;
    if (s || x || src || stt) syncForm();
  });
  form.duration.addEventListener("change", () => { fm.durTouched = true; updateHint(); });
  form.date.addEventListener("input", updateHint);
  form.time.addEventListener("input", updateHint);

  form.addEventListener("submit", e => { e.preventDefault(); save(false); });

  async function save(force) {
    const err = $("[data-fm-err]");
    err.textContent = "";
    if (!form.name.value.trim()) { err.textContent = "Bitte einen Namen eingeben."; form.name.focus(); return; }
    if (!fm.services.size && !form.title.value.trim()) { err.textContent = "Bitte eine Leistung wählen oder eintragen."; return; }
    if (!form.date.value || !form.time.value) { err.textContent = "Bitte Datum und Uhrzeit angeben."; return; }
    const booking = {
      id: fm.id || undefined,
      name: form.name.value.trim(), phone: form.phone.value.trim(),
      services: [...fm.services], extras: [...fm.extras], title: form.title.value.trim(),
      date: form.date.value, time: form.time.value, duration: Number(form.duration.value),
      source: fm.source, status: fm.status, note: form.note.value.trim()
    };
    const btn = $("[data-fm-save]");
    btn.disabled = true;
    try {
      const r = await api(fm.id ? "update" : "create", { booking, force });
      cache([r.booking]);
      closeForm();
      toast(fm.id ? "Termin gespeichert" : "Termin eingetragen");
      if (view === "kalender") { cal.anchor = parse(r.booking.date); }
      refresh();
    } catch (x) {
      if (x.code === "overlap") {
        if (confirm(`${x.message}\n\nTrotzdem eintragen?`)) { btn.disabled = false; return save(true); }
      } else err.textContent = x.message;
    } finally { btn.disabled = false; }
  }

  $$("[data-new]").forEach(b => b.addEventListener("click", () => openForm(null)));

  /* ---------------- Einstellungen ---------------- */
  function renderSettings() {
    const h = SALON.hours;
    const fmt = d => h[d] ? `${nice(h[d][0])}–${nice(h[d][1])}` : "geschlossen";
    $("[data-salon-info]").innerHTML = [
      ["Adresse", esc(SALON.address)],
      ["Telefon", esc(SALON.phone)],
      ["WhatsApp", `+${esc(SALON.whatsapp)}`],
      ["Mo–Fr", fmt("1")], ["Samstag", fmt("6")], ["Sonntag", fmt("0")],
      ["Plätze gleichzeitig", String(SALON.capacity)],
      ["Online buchbar", `${SALON.daysAhead} Tage im Voraus`]
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  }
  /* Geschlossene Tage (Urlaub, Feiertage) */
  let closedOwn = [];
  async function loadClosed() {
    try {
      const r = await api("closed_list");
      closedOwn = r.editable;
      SALON.closedDates = r.dates;
      renderClosed();
    } catch (_) { /* still */ }
  }
  function renderClosed() {
    const el = $("[data-closed-list]");
    const t0 = ymd(today());
    const up = closedOwn.filter(d => d >= t0);
    el.innerHTML = up.length ? up.map(d => { const x = parse(d); return `<button type="button" data-unclose="${d}" title="Wieder öffnen">${DAY_S[x.getDay()]}, ${x.getDate()}. ${MONTH_S[x.getMonth()]} ${x.getFullYear()}</button>`; }).join("")
      : `<p class="empty">Keine geschlossenen Tage eingetragen.</p>`;
  }
  async function saveClosed(dates, msg) {
    const err = $("[data-closed-err]");
    err.textContent = "";
    try {
      const r = await api("closed_save", { dates });
      closedOwn = r.dates;
      await loadClosed();
      toast(msg);
      if (r.conflicts && r.conflicts.length) {
        const list = r.conflicts.map(c => { const x = parse(c.date); return `${x.getDate()}.${x.getMonth() + 1}.: ${c.n} ${Number(c.n) === 1 ? "Termin" : "Termine"}`; }).join(", ");
        alert(`Achtung: An diesen Tagen sind schon Termine gebucht:\n${list}\n\nBitte die Kundinnen informieren oder die Termine verschieben.`);
      }
    } catch (x) { err.textContent = x.message; }
  }
  $("[data-closed-form]").addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target;
    const from = f.from.value, to = f.to.value || f.from.value;
    if (!from) return;
    if (to < from) { $("[data-closed-err]").textContent = "„Bis“ liegt vor „Von“."; return; }
    const add = [];
    for (let d = parse(from); ymd(d) <= to && add.length < 120; d = addDays(d, 1)) add.push(ymd(d));
    f.reset();
    saveClosed([...new Set([...closedOwn, ...add])], add.length === 1 ? "Tag geschlossen" : `${add.length} Tage geschlossen`);
  });
  $("[data-closed-list]").addEventListener("click", e => {
    const b = e.target.closest("[data-unclose]"); if (!b) return;
    saveClosed(closedOwn.filter(d => d !== b.dataset.unclose), "Tag wieder geöffnet");
  });

  /* Datensicherung */
  $("[data-export]").addEventListener("click", async () => {
    try {
      const r = await api("export");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
      a.download = `vietnam-nails-termine-${ymd(today())}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(`${r.count} Termine exportiert`);
    } catch (x) { if (x.message !== "auth") toast(x.message); }
  });

  $("[data-pw-form]").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target, err = $("[data-pw-err]");
    err.textContent = "";
    try { await api("password", { current: f.current.value, new: f.new.value }); f.reset(); toast("Passwort geändert"); }
    catch (x) { err.textContent = x.message; }
  });

  /* ---------------- Tastatur ---------------- */
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!modal.hidden) closeForm();
      else if (!drawer.hidden) closeDrawer();
    }
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "");
    if (!typing && !appEl.hidden && modal.hidden && (e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openForm(null); }
  });

  /* ---------------- Start ---------------- */
  let poll = null;
  async function startApp() {
    authEl.hidden = true;
    appEl.hidden = false;
    if (!SALON) {
      SALON = await (await fetch("../assets/salon.json", { cache: "no-store" })).json();
      SALON.categories.forEach(c => c.items.forEach(i => { items[i.id] = i; }));
      SALON.extras.forEach(x => { extras[x.id] = x; });
      buildFormOptions();
      await loadClosed();
    }
    route();
    clearInterval(poll);
    await checkNew();
    poll = setInterval(() => {
      checkNew(); // auch im Hintergrund, damit neue Buchungen gemeldet werden
      if (document.hidden || !modal.hidden || !drawer.hidden) return;
      if (view === "uebersicht") loadOverview();
      if (view === "kalender") loadCal();
    }, 45000);
  }

  (async () => {
    try {
      const s = await api("state");
      if (s.auth) startApp(); else showAuth(s.setup);
    } catch (e) {
      authEl.hidden = false;
      $("[data-auth-err]").textContent = "Der Server ist nicht erreichbar. Bitte später erneut versuchen.";
    }
  })();
})();
