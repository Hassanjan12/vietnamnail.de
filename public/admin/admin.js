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
  let STAFF = []; // Team: [{ id, name, hidden }]
  const staffName = b => b && b.staff_id ? ((STAFF.find(p => p.id === b.staff_id) || {}).name || "?") : "";
  const withStaff = b => esc(b.title) + (b.staff_id ? ` · bei ${esc(staffName(b))}` : "");
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
  const VIEWS = ["uebersicht", "kalender", "termine", "kunden", "leistungen", "galerie", "einstellungen", "mehr"];
  let view = null, sub = null;

  function route() {
    const [h, s2] = location.hash.slice(1).split("/");
    const v = VIEWS.includes(h) ? h : "uebersicht";
    view = v; sub = s2 || null;
    $$("[data-view]").forEach(s => { s.hidden = s.dataset.view !== v; });
    $$("[data-nav]").forEach(a => a.classList.toggle("is-on", a.dataset.nav === v || (a.dataset.navAlso || "").split(" ").includes(v)));
    if (v === "uebersicht") loadOverview();
    if (v === "kalender") loadCal();
    if (v === "termine") loadList();
    if (v === "einstellungen") { renderSettings(); loadClosed(); loadStaff().then(renderSettings); }
    if (v === "kunden") sub ? loadCustomer(Number(sub)) : loadCustomers();
    if (v === "leistungen") loadCatalog();
    if (v === "galerie") loadGallery();
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
        <span><span class="drow-name">${esc(b.name)}</span><span class="drow-meta">${withStaff(b)}</span></span>
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
        <span><span class="drow-name">${esc(b.name)}</span><span class="drow-meta">${withStaff(b)}</span></span>
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
    if (view === "kunden") sub ? loadCustomer(Number(sub)) : loadCustomers();
    if (view !== "uebersicht") checkNew();
  }

  /* ---------------- Kunden ---------------- */
  const custState = { q: "", sort: "last" };
  const custNo = id => 1000 + Number(id);
  const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
  const fmtDate = s => { if (!s) return "–"; const d = parse(s.slice(0, 10)); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; };
  const whenText = (date, time) => `${relDay(date) || fmtDate(date)} · ${nice(time)}`;
  let custTimer;
  $("[data-cust-search]").addEventListener("input", e => { custState.q = e.target.value.trim(); clearTimeout(custTimer); custTimer = setTimeout(loadCustomers, 250); });
  $("[data-cust-sort]").addEventListener("change", e => { custState.sort = e.target.value; loadCustomers(); });

  async function loadCustomers() {
    $("[data-cust-list-wrap]").hidden = false;
    $("[data-cust-detail]").hidden = true;
    const req = custState.req = (custState.req || 0) + 1;
    try {
      const r = await api("customers", { q: custState.q, sort: custState.sort });
      if (req !== custState.req) return;
      const list = r.customers, el = $("[data-cust-list]");
      $("[data-cust-count]").textContent = `${list.length} ${list.length === 1 ? "Kundin" : "Kundinnen"}${custState.q ? " gefunden" : ""}`;
      if (!list.length) {
        el.innerHTML = `<p class="empty">${custState.q ? "Keine Kundin gefunden." : "Noch keine Kundinnen – sie erscheinen automatisch mit dem ersten Termin."}</p>`;
        return;
      }
      el.innerHTML = `<div class="crow crow-h"><span></span><span>Name</span><span class="c-hide-m">Letzter Besuch</span><span class="c-hide-m c-hide-t">Nächster Termin</span><span class="c-hide-m" style="text-align:right">Besuche</span><span style="text-align:right">Umsatz ca.</span><span></span></div>`
        + list.map(c => {
          const next = c.next_at ? whenText(...c.next_at.split(" ")) : "–";
          return `<a class="crow" href="#kunden/${c.id}">
            <span class="c-av">${esc(initials(c.name))}</span>
            <span class="c-name">${esc(c.name)}${c.noshow ? `<i class="c-tag">${c.noshow}× nicht da</i>` : ""}<small>${esc(c.phone || "ohne Telefon")} · Nr. ${custNo(c.id)}</small></span>
            <span class="c-col c-hide-m">${fmtDate(c.last_visit)}<small>Kundin seit ${fmtDate(c.first_date)}</small></span>
            <span class="c-col c-hide-m c-hide-t">${next}</span>
            <span class="c-num c-hide-m">${c.visits}</span>
            <span class="c-num">${c.revenue} €</span>
            <i class="ic ic-chev c-chev"></i>
          </a>`;
        }).join("");
    } catch (e) { if (e.message !== "auth") toast(e.message); }
  }

  let custCur = null;
  async function loadCustomer(id) {
    $("[data-cust-list-wrap]").hidden = true;
    $("[data-cust-detail]").hidden = false;
    try {
      const r = await api("customer", { id });
      const bs = r.bookings;
      cache(bs);
      const t0 = ymd(today());
      const gone = b => ["cancelled", "noshow"].includes(b.status);
      const happened = bs.filter(b => (b.date < t0 || b.status === "done") && !gone(b)); // nur Vergangenes oder Erledigtes
      const upcoming = bs.filter(b => b.date >= t0 && ["pending", "confirmed"].includes(b.status)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      const noshow = bs.filter(b => b.status === "noshow").length, cancelled = bs.filter(b => b.status === "cancelled").length;
      const revenue = happened.reduce((s, b) => s + (Number(b.price_value) || 0), 0);
      // häufigste Schreibweise von Name und Telefonnummer anzeigen
      const mostCommon = vals => { const c = {}; vals.filter(Boolean).forEach(v => { c[v] = (c[v] || 0) + 1; }); return Object.keys(c).sort((x, y) => c[y] - c[x] || (y !== y.toLowerCase()) - (x !== x.toLowerCase()))[0] || ""; };
      custCur = { id: r.customer.id, name: mostCommon(bs.map(b => b.name)), phone: mostCommon(bs.map(b => b.phone)) };

      $("[data-cd-no]").textContent = `Kundennummer ${custNo(custCur.id)}`;
      $("[data-cd-name]").textContent = custCur.name;
      $("[data-cd-phone]").textContent = custCur.phone || "Keine Telefonnummer hinterlegt";
      const call = $("[data-cd-call]"), wa = $("[data-cd-wa]");
      call.href = custCur.phone ? `tel:${custCur.phone.replace(/[^\d+]/g, "")}` : "#";
      wa.href = custCur.phone ? `https://wa.me/${waNumber(custCur.phone)}` : "#";
      call.setAttribute("aria-disabled", String(!custCur.phone));
      wa.setAttribute("aria-disabled", String(!custCur.phone));

      const visits = bs.filter(b => !gone(b)).length;
      const last = happened.length ? happened[0].date : null;
      const tiles = [
        ["Besuche", `${visits}`, noshow || cancelled ? `${noshow ? `${noshow}× nicht erschienen` : ""}${noshow && cancelled ? " · " : ""}${cancelled ? `${cancelled}× storniert` : ""}` : "bisher alle wahrgenommen"],
        ["Umsatz ca.", `${revenue}<small>€</small>`, "Listenpreise, ungefähr"],
        ["Erster Termin", fmtDate(bs.length ? bs[bs.length - 1].date : null), ""],
        ["Letzter Besuch", last ? fmtDate(last) : "–", last ? (relDay(last) || "") : "noch kein Besuch"],
        ["Nächster Termin", upcoming[0] ? fmtDate(upcoming[0].date) : "–", upcoming[0] ? `${nice(upcoming[0].time)} Uhr · ${esc(upcoming[0].title)}` : "keiner geplant"],
        ["Termine gesamt", `${bs.length}`, `${upcoming.length} anstehend`]
      ];
      $("[data-cd-stats]").innerHTML = tiles.map(([k, v, s], i) => `<div class="tile${i === 0 ? " tile-dark" : ""}"><span class="tile-k">${k}</span><b class="tile-v">${v}</b><span class="tile-s">${s}</span></div>`).join("");

      const note = $("[data-cd-note]");
      note.value = r.customer.note || "";
      note.dataset.saved = note.value;
      $("[data-cd-note-state]").textContent = r.customer.note ? "" : "Noch keine Notiz";

      // Lieblingsleistungen: wie oft jede Leistung gebucht wurde (ohne Storno)
      const counts = {};
      bs.filter(b => !gone(b)).forEach(b => {
        const names = b.services.length ? b.services.map(id => items[id]?.name || id) : [b.title];
        names.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
      });
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      $("[data-cd-top]").innerHTML = top.length ? top.map(([n, c]) => `<li><b>${esc(n)}</b><span>${c}×</span></li>`).join("") : `<li class="muted">Noch keine Besuche</li>`;

      $("[data-cd-count]").textContent = `${bs.length} ${bs.length === 1 ? "Termin" : "Termine"}`;
      $("[data-cd-bookings]").innerHTML = bs.length ? bs.map(b => `
        <button class="brow" data-open="${b.id}">
          <span class="brow-time">${fmtDate(b.date)}<small>${nice(b.time)} Uhr</small></span>
          <span class="brow-name">${esc(b.title)}<small>${esc(b.price || "")}</small></span>
          <span class="brow-svc">${SOURCE[b.source] || ""}</span>
          <span class="pill pill-${b.status}">${STATUS[b.status]}</span>
          <span class="brow-src">${b.ref}</span>
        </button>`).join("") : `<p class="empty">Keine Termine.</p>`;
      window.scrollTo(0, 0);
    } catch (e) {
      if (e.message === "auth") return;
      toast(e.message);
      if (e.status === 404) location.hash = "kunden";
    }
  }

  $("[data-cd-note-save]").addEventListener("click", async () => {
    if (!custCur) return;
    const note = $("[data-cd-note]"), state = $("[data-cd-note-state]");
    try {
      await api("customer_note", { id: custCur.id, note: note.value });
      note.dataset.saved = note.value;
      state.textContent = "Gespeichert";
      toast("Notiz gespeichert");
    } catch (e) { if (e.message !== "auth") toast(e.message); }
  });
  $("[data-cd-note]").addEventListener("input", e => {
    $("[data-cd-note-state]").textContent = e.target.value !== e.target.dataset.saved ? "Nicht gespeichert" : "Gespeichert";
  });
  $("[data-cd-new]").addEventListener("click", () => { if (custCur) openForm(null, { name: custCur.name, phone: custCur.phone }); });
  $("[data-logout-m]").addEventListener("click", () => $("[data-logout]").click());

  /* ---------------- Galerie ---------------- */
  const GCATS = { elegant: "Elegant", color: "Farbe", art: "Nail Art", lash: "Wimpern" };
  const gl = { list: [], grid: $("[data-gl-grid]"), queue: $("[data-gl-queue]"), busy: false };

  async function loadGallery() {
    try {
      const r = await api("gallery_list");
      gl.list = r.photos;
      renderGalleryAdmin();
    } catch (e) { if (e.message !== "auth") toast(e.message); }
  }
  function renderGalleryAdmin() {
    const n = gl.list.length;
    $("[data-gl-count]").textContent = `${n} ${n === 1 ? "Foto" : "Fotos"} auf der Website · Reihenfolge wie auf der Website (die ersten 9 sind sofort sichtbar)`;
    gl.grid.innerHTML = gl.list.map((p, i) => `
      <div class="gl-card" data-id="${p.id}">
        <div class="gl-img"><img src="${esc(p.sm)}" alt="${esc([p.title, p.sub].filter(Boolean).join(" – "))}" loading="lazy">${i < 9 ? `<em>${i + 1}</em>` : ""}</div>
        <div class="gl-f">
          <select class="lp-in" data-gf="cat" aria-label="Kategorie">${Object.entries(GCATS).map(([k, v]) => `<option value="${k}"${p.cat === k ? " selected" : ""}>${v}</option>`).join("")}</select>
          <input class="lp-in" data-gf="title" value="${esc(p.title)}" maxlength="60" placeholder="Titel, z. B. Stiletto" aria-label="Titel">
          <input class="lp-in" data-gf="sub" value="${esc(p.sub)}" maxlength="80" placeholder="Beschreibung (optional)" aria-label="Beschreibung">
        </div>
        <div class="gl-act">
          <button type="button" class="lp-btn" data-ga="left" ${i === 0 ? "disabled" : ""} aria-label="Nach vorne">←</button>
          <button type="button" class="lp-btn" data-ga="right" ${i === n - 1 ? "disabled" : ""} aria-label="Nach hinten">→</button>
          <button type="button" class="lp-btn danger" data-ga="del">Löschen</button>
        </div>
      </div>`).join("") || `<p class="empty">Noch keine Fotos.</p>`;
  }
  // Titel/Kategorie speichern, sobald das Feld verlassen wird
  gl.grid.addEventListener("change", async e => {
    const card = e.target.closest(".gl-card");
    if (!card || !e.target.dataset.gf) return;
    const id = Number(card.dataset.id), p = gl.list.find(x => x.id === id);
    const data = { id, cat: $('[data-gf="cat"]', card).value, title: $('[data-gf="title"]', card).value.trim(), sub: $('[data-gf="sub"]', card).value.trim() };
    card.classList.add("is-saving");
    try { await api("photo_update", data); Object.assign(p, data); toast("Gespeichert"); }
    catch (x) { if (x.message !== "auth") toast(x.message); }
    finally { card.classList.remove("is-saving"); }
  });
  gl.grid.addEventListener("click", async e => {
    const b = e.target.closest("[data-ga]"), card = e.target.closest(".gl-card");
    if (!b || !card) return;
    const id = Number(card.dataset.id), i = gl.list.findIndex(x => x.id === id);
    if (b.dataset.ga === "del") {
      if (!confirm("Dieses Foto von der Website löschen?")) return;
      try { await api("photo_delete", { id }); gl.list.splice(i, 1); renderGalleryAdmin(); toast("Foto gelöscht"); }
      catch (x) { if (x.message !== "auth") toast(x.message); }
      return;
    }
    const j = i + (b.dataset.ga === "left" ? -1 : 1);
    if (j < 0 || j >= gl.list.length) return;
    [gl.list[i], gl.list[j]] = [gl.list[j], gl.list[i]];
    renderGalleryAdmin();
    const moved = $(`.gl-card[data-id="${id}"] [data-ga="${b.dataset.ga}"]`, gl.grid);
    if (moved && !moved.disabled) moved.focus();
    try { await api("photo_order", { ids: gl.list.map(x => x.id) }); }
    catch (x) { if (x.message !== "auth") toast(x.message); loadGallery(); }
  });

  // Foto im Browser verkleinern: große Version (max. 1400 px) und Vorschau (700 px), WebP oder JPG
  async function shrinkPhoto(file) {
    let src;
    try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (_) {
      src = await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error("Dieses Bildformat wird nicht unterstützt. Bitte als JPG speichern."));
        img.src = URL.createObjectURL(file);
      });
    }
    const W = src.width || src.naturalWidth, H = src.height || src.naturalHeight;
    if (!W || !H) throw new Error("Bild konnte nicht gelesen werden.");
    const encode = async (maxW, q, type) => {
      const sc = Math.min(1, maxW / W), w = Math.round(W * sc), h = Math.round(H * sc);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(src, 0, 0, w, h);
      const blob = await new Promise(r => c.toBlob(r, type, q));
      return { blob, w, h };
    };
    // Safari kann kein WebP erzeugen → dann JPG für beide Größen
    let type = "image/webp";
    let lg = await encode(1400, .82, type);
    if (!lg.blob || lg.blob.type !== "image/webp") { type = "image/jpeg"; lg = await encode(1400, .85, type); }
    if (lg.blob.size > 1_700_000) lg = await encode(1100, .72, type);
    const sm = await encode(700, .8, type);
    if (!sm.blob || !lg.blob) throw new Error("Bild konnte nicht umgewandelt werden.");
    return { sm: sm.blob, lg: lg.blob, w: sm.w, h: sm.h, type };
  }

  async function uploadFiles(files) {
    const list = [...files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (!list.length) return;
    if (gl.busy) { toast("Bitte warten, bis der aktuelle Upload fertig ist."); return; }
    gl.busy = true;
    const cat = $("[data-gl-newcat]").value;
    gl.queue.innerHTML = list.map((f, i) => `<li data-q="${i}"><b>${esc(f.name)}</b><span>wartet …</span></li>`).join("");
    let ok = 0;
    // rückwärts hochladen: neue Fotos kommen nach vorne, so bleibt die gewählte Reihenfolge erhalten
    for (let i = list.length - 1; i >= 0; i--) {
      const li = $(`[data-q="${i}"]`, gl.queue), st = $("span", li);
      try {
        st.textContent = "wird verkleinert …";
        const p = await shrinkPhoto(list[i]);
        st.textContent = "wird hochgeladen …";
        const ext = p.type === "image/webp" ? "webp" : "jpg";
        const fd = new FormData();
        fd.append("sm", p.sm, `sm.${ext}`); fd.append("lg", p.lg, `lg.${ext}`);
        fd.append("cat", cat); fd.append("w", p.w); fd.append("h", p.h); fd.append("title", ""); fd.append("sub", "");
        const res = await fetch("/api/admin/photo", { method: "POST", credentials: "same-origin", headers: { "X-VN": "1" }, body: fd });
        const j = await res.json().catch(() => ({}));
        if (res.status === 401) { showAuth(false); return; }
        if (!res.ok || !j.ok) throw new Error(j.error || "Hochladen fehlgeschlagen.");
        li.classList.add("is-done"); st.textContent = "✓ fertig"; ok++;
      } catch (x) { li.classList.add("is-err"); st.textContent = x.message; }
    }
    gl.busy = false;
    $("[data-gl-file]").value = "";
    if (ok) { toast(`${ok} ${ok === 1 ? "Foto" : "Fotos"} hinzugefügt`); await loadGallery(); }
    setTimeout(() => { $$(".is-done", gl.queue).forEach(li => li.remove()); }, 4000);
  }
  $("[data-gl-file]").addEventListener("change", e => uploadFiles(e.target.files));
  const drop = $("[data-gl-drop]");
  ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach(t => drop.addEventListener(t, () => drop.classList.remove("is-over")));
  drop.addEventListener("drop", e => { e.preventDefault(); uploadFiles(e.dataTransfer.files); });

  /* ---------------- Leistungen & Preise ---------------- */
  const DURS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300];
  const priceTxt = i => (i.price === null || i.price === undefined || i.price === "") ? "auf Anfrage" : `${i.from ? "ab " : ""}${i.price} €`;
  const extraTxt = x => x.from ? `ab ${x.min ?? 0} €` : (x.max ? `+${x.min ?? 0}–${x.max} €` : `+${x.min ?? 0} €`);
  const lp = { cat: null, saved: null, el: $("[data-cat-editor]") };
  const lpDirty = () => !!lp.cat && JSON.stringify(lp.cat) !== lp.saved;
  const lpSync = () => { $("[data-cat-savebar]").hidden = !lpDirty(); };
  window.addEventListener("beforeunload", e => { if (lpDirty()) { e.preventDefault(); e.returnValue = ""; } });

  function applyCatalog(c) {
    SALON.categories = c.categories;
    SALON.extras = c.extras;
    Object.keys(items).forEach(k => delete items[k]);
    Object.keys(extras).forEach(k => delete extras[k]);
    c.categories.forEach(cc => cc.items.forEach(i => { items[i.id] = i; }));
    c.extras.forEach(x => { extras[x.id] = x; });
    buildFormOptions();
  }

  async function loadCatalog() {
    if (lpDirty()) { renderCatEditor(); lpSync(); return; } // ungespeicherte Änderungen behalten
    try {
      const r = await api("catalog_get");
      lp.cat = r.catalog;
      lp.saved = JSON.stringify(lp.cat);
      renderCatEditor();
      lpSync();
    } catch (e) { if (e.message !== "auth") toast(e.message); }
  }

  const durSelect = v => {
    const opts = DURS.includes(Number(v)) ? DURS : [...DURS, Number(v)].sort((a, b) => a - b);
    return `<select class="lp-in" data-f="dur" aria-label="Dauer">${opts.map(m => `<option value="${m}"${Number(v) === m ? " selected" : ""}>${dur(m)}</option>`).join("")}</select>`;
  };
  const moveBtns = (i, n, what) => `<div class="lp-move"><button type="button" class="lp-btn" data-act="up" ${i === 0 ? "disabled" : ""} aria-label="${what} nach oben">↑</button><button type="button" class="lp-btn" data-act="down" ${i === n - 1 ? "disabled" : ""} aria-label="${what} nach unten">↓</button></div>`;
  const visBox = hidden => `<label class="lp-vis" title="Auf Website und in der Buchung zeigen"><input type="checkbox" data-f="visible" ${hidden ? "" : "checked"}>Sichtbar</label>`;
  const NOTES = {
    hands: "Bei diesen Leistungen werden in der Online-Buchung zusätzlich die Extras (Design) angeboten.",
    feet: "Auf der Website erscheinen Standard-, Deluxe-Pediküre und Fußnägel als Karten. Neue Leistungen stehen als Liste darunter."
  };

  function renderCatEditor() {
    const c = lp.cat;
    if (!c) return;
    const nC = c.categories.length;
    let html = c.categories.map((cat, ci) => `
      <section class="lp-cat${cat.hidden ? " is-hidden" : ""}" data-cat="${ci}">
        <div class="lp-head" data-c="${ci}" data-i="head">
          <div class="lp-head-f">
            <input class="lp-title" data-f="label" value="${esc(cat.label)}" maxlength="40" aria-label="Name der Kategorie">
            <input class="lp-desc" data-f="desc" value="${esc(cat.desc || "")}" maxlength="200" placeholder="Kurze Beschreibung für die Website" aria-label="Beschreibung der Kategorie">
          </div>
          <div class="lp-tools">
            ${moveBtns(ci, nC, "Kategorie")}
            ${visBox(cat.hidden)}
            <button type="button" class="lp-btn danger" data-act="delcat">Löschen</button>
          </div>
        </div>
        ${NOTES[cat.id] ? `<p class="lp-note">${NOTES[cat.id]}</p>` : ""}
        <div class="lp-cols"><span></span><span>Name</span><span>Beschreibung</span><span style="text-align:right">Preis €</span><span style="text-align:center">ab</span><span>Dauer</span><span>Anzeige</span><span></span></div>
        ${cat.items.map((it, ii) => `
          <div class="lp-row${it.hidden ? " is-hidden" : ""}${it.id ? "" : " is-new"}" data-c="${ci}" data-i="${ii}">
            ${moveBtns(ii, cat.items.length, "Leistung")}
            <label class="lp-f-name"><span class="lp-lbl">Name</span><input class="lp-in" data-f="name" value="${esc(it.name)}" maxlength="80" placeholder="Name der Leistung"></label>
            <label class="lp-f-meta"><span class="lp-lbl">Beschreibung</span><input class="lp-in" data-f="meta" value="${esc(it.meta || "")}" maxlength="120" placeholder="optional"></label>
            <label><span class="lp-lbl">Preis €</span><input class="lp-in" type="number" min="0" max="9999" step="1" inputmode="numeric" data-f="price" value="${it.price ?? ""}" placeholder="Anfrage"></label>
            <label class="lp-ab" title="Preis als „ab …“ anzeigen"><span class="lp-lbl">ab</span><input type="checkbox" data-f="from" ${it.from ? "checked" : ""}></label>
            <label><span class="lp-lbl">Dauer</span>${durSelect(it.dur || 30)}</label>
            <span class="lp-prev" data-prev title="So erscheint der Preis">${esc(priceTxt(it))}</span>
            <div class="lp-f-act">${visBox(it.hidden)}<button type="button" class="lp-btn danger" data-act="del" aria-label="Leistung löschen">✕</button></div>
          </div>`).join("")}
        <button type="button" class="btn btn-line btn-sm lp-add" data-act="add"><span class="plus"></span>Leistung hinzufügen</button>
      </section>`).join("");
    html += `
      <section class="lp-cat lp-x" data-cat="x">
        <div class="lp-head"><div class="lp-head-f"><p class="lp-title" style="border:0">Design &amp; Extras</p><p class="lp-desc" style="border:0">Aufpreise zusätzlich zur Leistung. Bei „bis“ entsteht eine Spanne (z. B. +5–10 €).</p></div></div>
        <div class="lp-cols"><span></span><span>Name</span><span>Hinweis</span><span style="text-align:right">Preis €</span><span style="text-align:right">bis €</span><span style="text-align:center">ab</span><span>Anzeige</span><span></span></div>
        ${c.extras.map((x, xi) => `
          <div class="lp-row${x.hidden ? " is-hidden" : ""}${x.id ? "" : " is-new"}" data-x="${xi}">
            ${moveBtns(xi, c.extras.length, "Extra")}
            <label class="lp-f-name"><span class="lp-lbl">Name</span><input class="lp-in" data-f="name" value="${esc(x.name)}" maxlength="80" placeholder="Name des Extras"></label>
            <label class="lp-f-meta"><span class="lp-lbl">Hinweis</span><input class="lp-in" data-f="meta" value="${esc(x.meta || "")}" maxlength="80" placeholder="optional"></label>
            <label><span class="lp-lbl">Preis €</span><input class="lp-in" type="number" min="0" max="999" step="1" inputmode="numeric" data-f="min" value="${x.min ?? 0}"></label>
            <label><span class="lp-lbl">bis €</span><input class="lp-in" type="number" min="0" max="999" step="1" inputmode="numeric" data-f="max" value="${x.max ?? ""}" placeholder="–"></label>
            <label class="lp-ab" title="Preis als „ab …“ anzeigen"><span class="lp-lbl">ab</span><input type="checkbox" data-f="from" ${x.from ? "checked" : ""}></label>
            <span class="lp-prev" data-prev>${esc(extraTxt(x))}</span>
            <div class="lp-f-act">${visBox(x.hidden)}<button type="button" class="lp-btn danger" data-act="del" aria-label="Extra löschen">✕</button></div>
          </div>`).join("")}
        <button type="button" class="btn btn-line btn-sm lp-add" data-act="addx"><span class="plus"></span>Extra hinzufügen</button>
      </section>`;
    lp.el.innerHTML = html;
  }

  // Ziel-Objekt einer Zeile ermitteln
  const lpTarget = row => {
    if (row.dataset.x !== undefined) return { list: lp.cat.extras, idx: Number(row.dataset.x) };
    const cat = lp.cat.categories[Number(row.dataset.c)];
    if (row.dataset.i === "head") return { list: lp.cat.categories, idx: Number(row.dataset.c), head: true };
    return { list: cat.items, idx: Number(row.dataset.i) };
  };

  lp.el.addEventListener("input", e => {
    const f = e.target.dataset.f, row = e.target.closest("[data-x], [data-c]");
    if (!f || !row) return;
    const { list, idx, head } = lpTarget(row);
    const o = list[idx], t = e.target;
    if (f === "visible") o.hidden = !t.checked;
    else if (f === "from") o.from = t.checked;
    else if (f === "dur") o.dur = Number(t.value);
    else if (f === "price" || f === "max") o[f] = t.value === "" ? null : Math.max(0, Math.round(Number(t.value)));
    else if (f === "min") o.min = t.value === "" ? 0 : Math.max(0, Math.round(Number(t.value)));
    else o[f] = t.value;
    const prev = $("[data-prev]", row);
    if (prev) prev.textContent = row.dataset.x !== undefined ? extraTxt(o) : priceTxt(o);
    if (f === "visible") (head ? row.closest(".lp-cat") : row).classList.toggle("is-hidden", o.hidden);
    lpSync();
  });

  lp.el.addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act, sec = b.closest("[data-cat]"), row = b.closest("[data-x], [data-c]");
    const cats = lp.cat.categories;
    let focusSel = null;
    if (act === "add" || act === "addx") {
      if (act === "add") { const ci = Number(sec.dataset.cat); cats[ci].items.push({ name: "", meta: "", price: null, from: false, dur: 30, hidden: false }); focusSel = `[data-c="${ci}"][data-i="${cats[ci].items.length - 1}"] [data-f="name"]`; }
      else { lp.cat.extras.push({ name: "", meta: "", min: 0, max: null, from: false, hidden: false }); focusSel = `[data-x="${lp.cat.extras.length - 1}"] [data-f="name"]`; }
    } else if (act === "delcat") {
      const ci = Number(sec.dataset.cat);
      const n = cats[ci].items.length;
      if (cats.length === 1) { toast("Mindestens eine Kategorie muss bleiben."); return; }
      if (!confirm(`Kategorie „${cats[ci].label}“${n ? ` mit ${n} Leistungen` : ""} löschen?\n\nTipp: Mit „Sichtbar“ ausschalten bleibt sie gespeichert.`)) return;
      cats.splice(ci, 1);
    } else if (row) {
      const { list, idx } = lpTarget(row);
      if (act === "del") {
        const o = list[idx];
        if ((o.name || o.id) && !confirm(`„${o.name || "Ohne Namen"}“ löschen?\n\nBestehende Termine behalten ihren Text. Tipp: „Sichtbar“ ausschalten statt löschen.`)) return;
        list.splice(idx, 1);
      } else if (act === "up" || act === "down") {
        const j = idx + (act === "up" ? -1 : 1);
        if (j < 0 || j >= list.length) return;
        [list[idx], list[j]] = [list[j], list[idx]];
      }
    }
    renderCatEditor();
    lpSync();
    if (focusSel) { const el = $(focusSel, lp.el); if (el) { el.focus(); el.scrollIntoView({ block: "center", behavior: "smooth" }); } }
  });

  $("[data-cat-addcat]").addEventListener("click", () => {
    if (!lp.cat) return;
    lp.cat.categories.push({ label: "Neue Kategorie", desc: "", hidden: false, items: [{ name: "", meta: "", price: null, from: false, dur: 30, hidden: false }] });
    renderCatEditor(); lpSync();
    const secs = $$(".lp-cat:not(.lp-x)", lp.el), last = secs[secs.length - 1];
    last.scrollIntoView({ block: "center", behavior: "smooth" });
    $(".lp-title", last).select();
  });
  $("[data-cat-reset]").addEventListener("click", () => {
    if (!confirm("Alle ungespeicherten Änderungen verwerfen?")) return;
    lp.cat = JSON.parse(lp.saved); renderCatEditor(); lpSync();
  });
  $("[data-cat-save]").addEventListener("click", async () => {
    const btn = $("[data-cat-save]");
    btn.disabled = true;
    try {
      const r = await api("catalog_save", { catalog: lp.cat });
      lp.cat = r.catalog;
      lp.saved = JSON.stringify(lp.cat);
      renderCatEditor(); lpSync();
      applyCatalog(r.catalog);
      toast("Gespeichert – Website und Buchung sind aktualisiert");
    } catch (e) { if (e.message !== "auth") toast(e.message, 5000); }
    finally { btn.disabled = false; }
  });

  /* ---------------- Kalender ---------------- */
  const cal = { mode: window.innerWidth < 900 ? "day" : "week", anchor: today(), list: [] };
  const calEl = $("[data-cal]");

  const monthStart = d => new Date(d.getFullYear(), d.getMonth(), 1);
  const monthEnd = d => new Date(d.getFullYear(), d.getMonth() + 1, 0);

  function calRange() {
    if (cal.mode === "day") return [cal.anchor, cal.anchor];
    if (cal.mode === "month") return [monday(monthStart(cal.anchor)), addDays(monday(monthEnd(cal.anchor)), 6)];
    const s = monday(cal.anchor);
    return [s, addDays(s, 6)];
  }

  async function loadCal() {
    syncCalMode();
    const [a, b] = calRange();
    const stripStart = monday(cal.anchor);
    const from = cal.mode === "day" ? stripStart : a, to = cal.mode === "day" ? addDays(stripStart, 6) : b;
    const req = cal.req = (cal.req || 0) + 1;
    try {
      const r = await api("bookings", { from: ymd(from), to: ymd(to) });
      if (req !== cal.req) return; // inzwischen wurde weitergeblättert
      cal.list = r.bookings;
      cache(cal.list);
      renderCal();
    } catch (e) { if (e.message !== "auth") toast(e.message); }
  }

  function syncCalMode() {
    $$("[data-cal-mode]").forEach(b => b.classList.toggle("is-on", b.dataset.calMode === cal.mode));
    $('[data-view="kalender"]').dataset.mode = cal.mode;
    calEl.dataset.view = cal.mode === "month" ? "month" : "time";
  }

  // Aktive Termine (ohne storniert / nicht erschienen)
  const active = b => !["cancelled", "noshow"].includes(b.status);

  function calTitle() {
    const [a, b] = calRange();
    if (cal.mode === "month") return `${MONTH[cal.anchor.getMonth()]} ${cal.anchor.getFullYear()}`;
    if (cal.mode === "day") {
      const rel = relDay(ymd(a));
      return `${rel ? `${rel}, ` : `${DAY[a.getDay()]}, `}${a.getDate()}. ${MONTH[a.getMonth()]}`;
    }
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()}.–${b.getDate()}. ${MONTH[a.getMonth()]} ${a.getFullYear()}`
      : `${a.getDate()}. ${MONTH_S[a.getMonth()]} – ${b.getDate()}. ${MONTH_S[b.getMonth()]} ${b.getFullYear()}`;
  }

  /* Monatsansicht: Überblick mit Anzahl und ersten Terminen je Tag */
  function renderMonth() {
    const [a, b] = calRange();
    const m = cal.anchor.getMonth(), t0 = ymd(today());
    const cap = Number(SALON.capacity) || 1;
    let html = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(x => `<div class="m-dow">${x}</div>`).join("");
    for (let d = a; d <= b; d = addDays(d, 1)) {
      const k = ymd(d);
      const list = cal.list.filter(x => x.date === k && active(x)).sort((x, y) => x.time.localeCompare(y.time));
      const h = SALON.hours[String(d.getDay())];
      const closed = !h || (SALON.closedDates || []).includes(k);
      // Auslastung: belegte Minuten im Verhältnis zur Kapazität des Tages
      let load = 0;
      if (h && !closed) {
        const open = (toMin(h[1]) - toMin(h[0])) * cap;
        load = Math.min(1, list.reduce((s, x) => s + x.duration, 0) / open);
      }
      const cls = ["m-cell", d.getMonth() !== m && "is-out", k === t0 && "is-today", closed && "is-closed", k < t0 && "is-past"].filter(Boolean).join(" ");
      const shown = list.slice(0, 3).map(x => `<span class="m-ev${x.source === "online" ? " is-online" : ""}" data-open="${x.id}">${nice(x.time)} ${esc(x.name)}</span>`).join("");
      html += `<div class="${cls}" data-mday="${k}" tabindex="0" role="button" aria-label="${DAY[d.getDay()]}, ${d.getDate()}. ${MONTH[d.getMonth()]}: ${list.length} Termine">
        <div class="m-top"><b>${d.getDate()}</b>${list.length ? `<em>${list.length}</em>` : closed && d.getMonth() === m ? `<small>geschlossen</small>` : ""}</div>
        ${load ? `<i class="m-load" style="--l:${Math.round(load * 100)}%"></i>` : ""}
        <div class="m-evs">${shown}${list.length > 3 ? `<span class="m-more">+${list.length - 3} weitere</span>` : ""}</div>
      </div>`;
    }
    calEl.innerHTML = html;
  }

  /* Datumsauswahl (Mini-Kalender) – schnell zu jedem Tag springen */
  const pk = { el: $("[data-picker]"), btn: $("[data-cal-pick]"), month: null, counts: {}, req: 0 };
  function openPicker() {
    pk.month = monthStart(cal.anchor);
    pk.el.hidden = false;
    pk.btn.setAttribute("aria-expanded", "true");
    $("[data-pk-input]").value = ymd(cal.anchor);
    renderPicker();
    loadPickerCounts();
    const sel = $(".pk-day.is-sel", pk.el) || $(".pk-day", pk.el);
    if (sel) sel.focus();
  }
  function closePicker(focusBtn) {
    if (pk.el.hidden) return;
    pk.el.hidden = true;
    pk.btn.setAttribute("aria-expanded", "false");
    if (focusBtn) pk.btn.focus();
  }
  async function loadPickerCounts() {
    const from = pk.month, to = monthEnd(pk.month), req = ++pk.req;
    try {
      const r = await api("bookings", { from: ymd(from), to: ymd(to) });
      if (req !== pk.req) return;
      pk.counts = {};
      r.bookings.filter(active).forEach(x => { pk.counts[x.date] = (pk.counts[x.date] || 0) + 1; });
      renderPicker();
    } catch (_) { /* Zahlen sind optional */ }
  }
  function renderPicker() {
    const y = pk.month.getFullYear(), m = pk.month.getMonth(), t0 = ymd(today());
    $("[data-pk-month]").textContent = `${MONTH[m]} ${y}`;
    const [ra, rb] = calRange();
    const selFrom = ymd(cal.mode === "month" ? monthStart(cal.anchor) : ra), selTo = ymd(cal.mode === "month" ? monthEnd(cal.anchor) : rb);
    const start = monday(pk.month);
    let html = "";
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i), k = ymd(d);
      if (i >= 35 && d.getMonth() !== m) break;
      const n = d.getMonth() === m ? (pk.counts[k] || 0) : 0;
      const h = SALON.hours[String(d.getDay())];
      const closed = !h || (SALON.closedDates || []).includes(k);
      const cls = ["pk-day", d.getMonth() !== m && "is-out", k === t0 && "is-today", k >= selFrom && k <= selTo && "is-sel", closed && "is-closed"].filter(Boolean).join(" ");
      html += `<button type="button" class="${cls}" data-pick="${k}" aria-label="${DAY[d.getDay()]}, ${d.getDate()}. ${MONTH[d.getMonth()]}${n ? `, ${n} Termine` : ""}${closed ? ", geschlossen" : ""}">
        ${d.getDate()}${n ? `<i>${n}</i>` : ""}</button>`;
    }
    $("[data-pk-grid]").innerHTML = html;
  }
  function jumpTo(d) {
    cal.anchor = d;
    cal.scrolled = false;
    closePicker(true);
    loadCal();
  }
  pk.btn.addEventListener("click", e => { e.stopPropagation(); pk.el.hidden ? openPicker() : closePicker(true); });
  $("[data-pk-prev]").addEventListener("click", () => { pk.month = new Date(pk.month.getFullYear(), pk.month.getMonth() - 1, 1); renderPicker(); loadPickerCounts(); });
  $("[data-pk-next]").addEventListener("click", () => { pk.month = new Date(pk.month.getFullYear(), pk.month.getMonth() + 1, 1); renderPicker(); loadPickerCounts(); });
  $("[data-pk-grid]").addEventListener("click", e => { const b = e.target.closest("[data-pick]"); if (b) jumpTo(parse(b.dataset.pick)); });
  $$("[data-pk-jump]").forEach(b => b.addEventListener("click", () => jumpTo(addDays(today(), Number(b.dataset.pkJump)))));
  $("[data-pk-input]").addEventListener("change", e => { if (e.target.value) jumpTo(parse(e.target.value)); });
  // Pfeiltasten im Mini-Kalender
  $("[data-pk-grid]").addEventListener("keydown", e => {
    const b = e.target.closest("[data-pick]"); if (!b) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const d = addDays(parse(b.dataset.pick), step);
    if (d.getMonth() !== pk.month.getMonth()) { pk.month = monthStart(d); renderPicker(); loadPickerCounts(); }
    const next = $(`[data-pick="${ymd(d)}"]`, pk.el); if (next) next.focus();
  });
  document.addEventListener("click", e => { if (!pk.el.hidden && !e.target.closest("[data-picker]")) closePicker(false); });

  function renderCal() {
    $("[data-cal-title]").textContent = calTitle();
    if (cal.mode === "month") { renderMonth(); return; }
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
    const ppm = window.innerWidth < 900 ? 1.7 : 1.8; // 30 Min. ≈ 54 px – genug Platz für Zeit, Name und Leistung
    const height = (end - start) * ppm;

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
      const k = ymd(d), n = cal.list.filter(x => x.date === k && active(x)).length;
      return `<button type="button" class="cal-hd${k === t0 ? " is-today" : ""}" data-goday="${k}" title="Tagesansicht öffnen">${DAY_S[d.getDay()]}<b>${d.getDate()}</b><small>${n ? `${n} ${n === 1 ? "Termin" : "Termine"}` : "&nbsp;"}</small></button>`;
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
        return `<button class="ev ev-${b.status}${b.source === "online" ? " is-online" : ""}${hgt < 44 ? " is-short" : ""}" data-open="${b.id}"
          style="top:${top}px;height:${hgt}px;left:calc(${col * w}% + 3px);width:calc(${w}% - 6px)"
          title="${esc(`${nice(b.time)}–${nice(endTime(b))} ${b.name} · ${b.title}${b.staff_id ? ` · bei ${staffName(b)}` : ""}`)}">
          <b>${hgt < 44 ? `${nice(b.time)} ` : ""}${esc(b.name)}</b><span>${nice(b.time)}–${nice(endTime(b))} · ${withStaff(b)}</span></button>`;
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
  const openDay = k => { cal.anchor = parse(k); cal.mode = "day"; cal.scrolled = false; loadCal(); };
  calEl.addEventListener("keydown", e => {
    const c = e.target.closest("[data-mday]");
    if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDay(c.dataset.mday); }
  });
  calEl.addEventListener("click", e => {
    if (e.target.closest("[data-open]")) return;
    const md = e.target.closest("[data-mday]");
    if (md) { openDay(md.dataset.mday); return; }
    const gd = e.target.closest("[data-goday]");
    if (gd) { if (cal.mode !== "day") openDay(gd.dataset.goday); return; }
    const col = e.target.closest(".cal-col");
    if (!col || col.classList.contains("is-closed")) return;
    const ppm = parseFloat(getComputedStyle(calEl).getPropertyValue("--ppm"));
    const y = e.clientY - col.getBoundingClientRect().top;
    const m = Number(col.dataset.start) + Math.floor(y / ppm / 15) * 15;
    openForm(null, { date: col.dataset.day, time: toHM(m) });
  });
  calEl.addEventListener("mousemove", e => {
    const col = e.target.closest(".cal-col");
    if (!col || col.classList.contains("is-closed") || e.target.closest("[data-open]")) return;
    const ppm = parseFloat(getComputedStyle(calEl).getPropertyValue("--ppm"));
    const y = e.clientY - col.getBoundingClientRect().top;
    const q = Math.floor(y / ppm / 15) * 15;
    const g = $(".cal-ghost", col);
    g.style.top = `${q * ppm}px`;
    g.style.height = `${30 * ppm}px`;
    g.textContent = `+ ${nice(toHM(Number(col.dataset.start) + q))}`;
  });

  const shift = dir => {
    if (cal.mode === "month") cal.anchor = new Date(cal.anchor.getFullYear(), cal.anchor.getMonth() + dir, 1);
    else cal.anchor = addDays(cal.anchor, (cal.mode === "day" ? 1 : 7) * dir);
    loadCal();
  };
  $("[data-cal-prev]").addEventListener("click", () => shift(-1));
  $("[data-cal-next]").addEventListener("click", () => shift(1));
  $("[data-cal-today]").addEventListener("click", () => { cal.anchor = today(); cal.scrolled = false; loadCal(); });
  $$("[data-cal-mode]").forEach(b => b.addEventListener("click", () => { cal.mode = b.dataset.calMode; cal.scrolled = false; loadCal(); }));
  $("[data-daystrip]").addEventListener("click", e => {
    const b = e.target.closest("[data-strip]"); if (!b) return;
    cal.anchor = parse(b.dataset.strip); cal.mode = "day"; loadCal();
  });
  // Wischen im Tagesmodus
  let sx = null;
  $("[data-cal-wrap]").addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
  $("[data-cal-wrap]").addEventListener("touchend", e => {
    if (sx === null || cal.mode === "week") return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 70) shift(dx < 0 ? 1 : -1);
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
              <span class="brow-svc">${withStaff(b)}</span>
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
      STAFF.length || b.staff_id ? ["Bei", b.staff_id ? `${esc(staffName(b))} <small class="muted">(Wunsch der Kundin)</small>` : "Kein Wunsch"] : null,
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
  $("[data-dr-customer]").addEventListener("click", async () => {
    if (!current) return;
    try {
      const r = await api("customer", { bookingId: current.id });
      closeDrawer();
      const target = `kunden/${r.customer.id}`;
      if (location.hash.slice(1) === target) route(); else location.hash = target;
    } catch (e) { if (e.message !== "auth") toast(e.message); }
  });
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
        `<button type="button" data-svc="${i.id}" aria-pressed="false"${i.hidden || c.hidden ? ' class="is-off" title="Auf der Website ausgeblendet"' : ""}>${esc(i.name)}</button>`).join("")}</div></div>`).join("");
    $("[data-fm-extras]").innerHTML = SALON.extras.map(x => `<button type="button" data-ex="${x.id}" aria-pressed="false"${x.hidden ? ' class="is-off" title="Auf der Website ausgeblendet"' : ""}>${esc(x.name)}</button>`).join("");
    const sel = $("[data-fm-duration]");
    let opts = "";
    for (let m = 15; m <= 300; m += 15) opts += `<option value="${m}">${dur(m)}</option>`;
    sel.innerHTML = opts;
  }
  function staffOptions(cur) {
    const box = $("[data-fm-staff-box]"), sel = $("[data-fm-staff]");
    const list = STAFF.filter(p => !p.hidden || p.id === cur);
    box.hidden = !list.length;
    sel.innerHTML = `<option value="">Kein Wunsch</option>` + list.map(p => `<option value="${p.id}">${esc(p.name)}${p.hidden ? " (ausgeblendet)" : ""}</option>`).join("");
    sel.value = cur ? String(cur) : "";
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
    form.name.value = b ? b.name : (prefill.name || "");
    form.phone.value = b ? b.phone : (prefill.phone || "");
    form.note.value = b ? b.note : "";
    form.title.value = b && !b.services.length ? b.title : "";
    const now = new Date();
    let defTime = toHM(Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15);
    form.date.value = b ? b.date : (prefill.date || ymd(view === "kalender" ? cal.anchor : today()));
    form.time.value = b ? b.time : (prefill.time || defTime);
    if (b) form.duration.value = String(Math.min(300, Math.max(15, Math.round(b.duration / 15) * 15)));
    staffOptions(b ? b.staff_id : null);
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
      source: fm.source, status: fm.status, note: form.note.value.trim(),
      staff_id: Number($("[data-fm-staff]").value) || null
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
      ["Termine gleichzeitig", String(STAFF.filter(p => !p.hidden).length || SALON.capacity)],
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

  /* Team (Wunsch-Mitarbeiter bei der Buchung) */
  async function loadStaff() {
    try { STAFF = (await api("staff_list")).staff; } catch (_) { /* still */ }
    renderStaff();
  }
  function renderStaff() {
    const el = $("[data-staff-list]");
    el.innerHTML = STAFF.length ? STAFF.map(p => `
      <div class="st-row${p.hidden ? " is-hidden" : ""}" data-id="${p.id}">
        <input class="lp-in" value="${esc(p.name)}" maxlength="40" aria-label="Name" data-st-name>
        <span class="st-state">${p.hidden ? "ausgeblendet" : "buchbar"}</span>
        <button type="button" class="lp-btn" data-st-toggle>${p.hidden ? "Einblenden" : "Ausblenden"}</button>
      </div>`).join("") : `<p class="empty">Noch niemand eingetragen – online gelten ${SALON.capacity} Plätze gleichzeitig.</p>`;
    const n = STAFF.filter(p => !p.hidden).length;
    $("[data-staff-cap]").textContent = n ? `Gleichzeitig online buchbar: ${n} ${n === 1 ? "Termin" : "Termine"} (= sichtbare Personen).` : "";
  }
  async function staffCall(action, data, msg) {
    const err = $("[data-staff-err]");
    err.textContent = "";
    try { STAFF = (await api(action, data)).staff; renderStaff(); renderSettings(); toast(msg); return true; }
    catch (x) { if (x.message !== "auth") err.textContent = x.message; renderStaff(); return false; }
  }
  $("[data-staff-form]").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target, name = f.name.value.trim();
    if (!name) return;
    if (await staffCall("staff_add", { name }, `${name} hinzugefügt`)) f.reset();
  });
  $("[data-staff-list]").addEventListener("change", e => {
    const row = e.target.closest(".st-row"); if (!row || !e.target.matches("[data-st-name]")) return;
    const p = STAFF.find(x => x.id === Number(row.dataset.id));
    staffCall("staff_update", { id: p.id, name: e.target.value.trim(), hidden: p.hidden }, "Gespeichert");
  });
  $("[data-staff-list]").addEventListener("click", e => {
    const b = e.target.closest("[data-st-toggle]"); if (!b) return;
    const p = STAFF.find(x => x.id === Number(b.closest(".st-row").dataset.id));
    staffCall("staff_update", { id: p.id, name: p.name, hidden: !p.hidden }, p.hidden ? `${p.name} ist wieder buchbar` : `${p.name} ausgeblendet`);
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
      if (!pk.el.hidden) closePicker(true);
      else if (!modal.hidden) closeForm();
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
      try { applyCatalog((await api("catalog_get")).catalog); } // Leistungen aus der Datenbank
      catch (_) { applyCatalog({ categories: SALON.categories, extras: SALON.extras }); }
      await loadClosed();
      await loadStaff();
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
