(() => {
  "use strict";

  // Studio-Daten (Öffnungszeiten, Leistungen, Preise, Plätze) kommen aus assets/salon.json –
  // dieselbe Datei nutzt auch der Server und der Admin-Bereich.
  let CONFIG = null, CATEGORIES = [], EXTRAS = [];
  const MAP_EMBED = "https://www.google.com/maps?q=Vietnam+Nails,+Rannische+Str.+6,+06108+Halle+(Saale)&output=embed";

  const GALLERY = [
    ["rosa-marmor-gold", "elegant", "Rosé & Marmor", "Blattgold"],
    ["stiletto-tuerkis-gold", "art", "Stiletto", "Türkis, Gold & Cat-Eye"],
    ["nude-glitzer-schleifen", "elegant", "Mandelform", "Nude, Glitzer & Schleifen"],
    ["tuerkis-3d-blumen", "color", "Ombré", "Türkis mit 3D-Blüten"],
    ["halloween-patchwork", "art", "Handgemalt", "Patchwork Nail Art"],
    ["perlmutt-chrome", "elegant", "Chrome", "Perlmutt-Effekt"],
    ["hellblau-goldfolie", "color", "Coffin", "Hellblau mit Goldfolie"],
    ["stiletto-blau-rosen", "art", "3D-Modellage", "Stiletto mit Rosen"],
    ["marmor-weiss-muster", "elegant", "Marmor", "Milchweiß mit Ornament"],
    ["blau-ombre-glitzer", "color", "Ombré", "Blau mit Glitzerlinien"],
    ["halloween-kitty", "art", "Character Art", "French mit 3D-Details"],
    ["nude-braun-blume", "elegant", "3D-Blüte", "Nude & Braun"],
    ["tuerkis-schwarz-schleifen", "color", "Statement", "Türkis & Schwarz"],
    ["nude-weiss-ombre", "elegant", "Babyboomer", "Nude mit weißem Ombré"],
    ["wimpern", "lash", "Wimpern", "Volumen-Verlängerung"]
  ];

  // Bildmaße (Breite, Höhe) der -sm Varianten, damit das Layout beim Laden nicht springt
  const DIMS = {"blau-ombre-glitzer": [700, 733], "halloween-kitty": [700, 933], "halloween-patchwork": [700, 933], "hellblau-goldfolie": [700, 1244], "marmor-weiss-muster": [700, 933], "nude-braun-blume": [700, 743], "nude-glitzer-schleifen": [700, 933], "nude-weiss-ombre": [700, 844], "perlmutt-chrome": [700, 761], "rosa-marmor-gold": [700, 933], "stiletto-blau-rosen": [700, 786], "stiletto-tuerkis-gold": [700, 875], "tuerkis-3d-blumen": [700, 658], "tuerkis-schwarz-schleifen": [700, 934], "wimpern": [700, 941]};

  const DAY = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const DAY_S = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const MONTH = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  /* ====================================================================== */

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const toHM = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const nice = t => t.replace(":", ".");
  const eur = n => `${n} €`;
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  /* ---------------- Header: Farbmodus & Zustand ---------------- */
  const hd = $("[data-header]");
  const themed = $$("[data-theme]");
  const fab = $(".fab");
  const cta = $("#termin");
  const footer = $(".ft");
  let ticking = false;

  const updateHeader = () => {
    ticking = false;
    const probe = hd.offsetHeight / 2;
    let mode = "dark";
    for (const el of themed) {
      const r = el.getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) { mode = el.dataset.theme; break; }
    }
    hd.dataset.mode = mode;
    hd.classList.toggle("is-solid", window.scrollY > 40);
    if (fab) {
      const visible = el => { const r = el.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; };
      fab.classList.toggle("is-hidden", window.scrollY < window.innerHeight * .6 || visible(cta) || visible(footer));
    }
  };
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(updateHeader); } }, { passive: true });
  window.addEventListener("resize", updateHeader);
  updateHeader();

  /* ---------------- Mobile-Menü ---------------- */
  const burger = $("[data-burger]");
  const menu = $("[data-menu]");
  const setMenu = open => {
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
    hd.classList.toggle("is-menu", open);
    document.body.classList.toggle("is-locked", open);
    if (open) { menu.hidden = false; requestAnimationFrame(() => menu.classList.add("is-open")); }
    else { menu.classList.remove("is-open"); setTimeout(() => { if (!menu.classList.contains("is-open")) menu.hidden = true; }, 450); }
  };
  burger.addEventListener("click", () => setMenu(burger.getAttribute("aria-expanded") !== "true"));
  $$("a", menu).forEach(a => a.addEventListener("click", () => setMenu(false)));

  /* ---------------- Reveal on scroll ---------------- */
  if ("IntersectionObserver" in window && !reduced) {
    // clip-path versteckt .reveal-img auch vor dem Observer – daher das Elternelement beobachten
    const targets = new Map();
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { (targets.get(e.target) || []).forEach(t => t.classList.add("is-in")); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    $$(".reveal, .reveal-img").forEach(el => {
      const watch = el.classList.contains("reveal-img") ? el.parentElement : el;
      targets.set(watch, [...(targets.get(watch) || []), el]);
      io.observe(watch);
    });
  } else {
    $$(".reveal, .reveal-img").forEach(el => el.classList.add("is-in"));
  }

  /* ---------------- Öffnungszeiten ---------------- */
  const dow = now.getDay();
  function initHours() {
    const label = d => CONFIG.hours[d] ? `${nice(CONFIG.hours[d][0])} – ${nice(CONFIG.hours[d][1])}` : "geschlossen";
    const hoursEl = $("[data-hours]");
    if (hoursEl) {
      hoursEl.innerHTML = [[[1, 2, 3, 4, 5], "Montag – Freitag"], [[6], "Samstag"], [[0], "Sonntag"]]
        .map(([ds, l]) => `<tr class="${ds.includes(dow) ? "is-today" : ""}"><td>${l}</td><td>${label(ds[0])}</td></tr>`).join("");
    }
    const statusEl = $("[data-open-status]");
    if (statusEl) {
      const h = CONFIG.hours[dow];
      const m = now.getHours() * 60 + now.getMinutes();
      let txt, open = false;
      if (h && m >= toMin(h[0]) && m < toMin(h[1])) { open = true; txt = `Jetzt geöffnet · bis ${nice(h[1])} Uhr`; }
      else if (h && m < toMin(h[0])) txt = `Heute ab ${nice(h[0])} Uhr geöffnet`;
      else {
        let d = (dow + 1) % 7, n = 1;
        while (!CONFIG.hours[d] && n < 7) { d = (d + 1) % 7; n++; }
        txt = `Geschlossen · ${n === 1 ? "Morgen" : DAY[d]} ab ${nice(CONFIG.hours[d][0])} Uhr`;
      }
      statusEl.innerHTML = `<i class="dot${open ? " is-open" : ""}"></i>${txt}`;
    }
    const lastEl = $("[data-last-start]");
    const wk = CONFIG.hours[1];
    if (lastEl && wk && wk[2]) lastEl.textContent = `Letzter Termin Mo – Fr um ${nice(wk[2])} Uhr`;
  }

  const yearEl = $("[data-year]");
  if (yearEl) yearEl.textContent = now.getFullYear();

  /* ---------------- Hover-Bild in der Preisliste ---------------- */
  const hov = $("[data-hover-img]");
  if (hov && window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reduced) {
    const img = $("img", hov);
    let x = 0, y = 0, cx = 0, cy = 0, raf = null;
    const loop = () => {
      cx += (x - cx) * .16; cy += (y - cy) * .16;
      hov.style.transform = `translate3d(${cx + 40}px, ${cy - 160}px, 0)`;
      raf = Math.abs(x - cx) + Math.abs(y - cy) > .5 ? requestAnimationFrame(loop) : null;
    };
    $$("[data-hover-list] li[data-img]").forEach(li => {
      li.addEventListener("mouseenter", e => {
        img.src = `assets/img/gallery/${li.dataset.img}-sm.webp`;
        if (!hov.classList.contains("is-on")) { cx = x = e.clientX; cy = y = e.clientY; }
        hov.classList.add("is-on");
        if (!raf) raf = requestAnimationFrame(loop);
      });
      li.addEventListener("mousemove", e => { x = e.clientX; y = e.clientY; if (!raf) raf = requestAnimationFrame(loop); });
      li.addEventListener("mouseleave", () => hov.classList.remove("is-on"));
    });
  }

  /* ---------------- Galerie & Lightbox ---------------- */
  const gal = $("[data-gallery]");
  gal.innerHTML = GALLERY.map(([f, cat, t, d], i) => `
    <button class="g reveal" data-cat="${cat}" data-i="${i}" aria-label="${esc(t)}: ${esc(d)} – vergrößern">
      <img src="assets/img/gallery/${f}-sm.webp" alt="${esc(t)} – ${esc(d)}" loading="lazy" width="${DIMS[f][0]}" height="${DIMS[f][1]}">
      <span class="g-cap">${esc(t)}<b>${esc(d)}</b></span>
    </button>`).join("");
  $$(".g", gal).forEach(el => el.classList.add("is-in"));

  $$("[data-filter]").forEach(b => b.addEventListener("click", () => {
    $$("[data-filter]").forEach(x => x.classList.toggle("is-active", x === b));
    $$(".g", gal).forEach(g => g.classList.toggle("is-hidden", b.dataset.filter !== "all" && g.dataset.cat !== b.dataset.filter));
  }));

  const lb = $("[data-lb]"), lbImg = $("[data-lb-img]"), lbCap = $("[data-lb-cap]"), lbCount = $("[data-lb-count]");
  let lbList = [], lbPos = 0, lbReturn = null;
  const lbShow = p => {
    lbPos = (p + lbList.length) % lbList.length;
    const [f, , t, d] = GALLERY[lbList[lbPos]];
    lbImg.src = `assets/img/gallery/${f}.webp`;
    lbImg.alt = `${t} – ${d}`;
    lbCap.textContent = `${t} — ${d}`;
    lbCount.textContent = `${String(lbPos + 1).padStart(2, "0")} / ${String(lbList.length).padStart(2, "0")}`;
  };
  const lbOpen = btn => {
    lbReturn = btn;
    lbList = $$(".g:not(.is-hidden)", gal).map(g => Number(g.dataset.i));
    lbShow(lbList.indexOf(Number(btn.dataset.i)));
    lb.hidden = false;
    document.body.classList.add("is-locked");
    requestAnimationFrame(() => lb.classList.add("is-open"));
    $("[data-lb-close]").focus();
  };
  const lbClose = () => {
    lb.classList.remove("is-open");
    document.body.classList.remove("is-locked");
    setTimeout(() => { lb.hidden = true; }, 350);
    if (lbReturn) lbReturn.focus();
  };
  gal.addEventListener("click", e => { const g = e.target.closest(".g"); if (g) lbOpen(g); });
  $("[data-lb-close]").addEventListener("click", lbClose);
  $("[data-lb-prev]").addEventListener("click", () => lbShow(lbPos - 1));
  $("[data-lb-next]").addEventListener("click", () => lbShow(lbPos + 1));
  lb.addEventListener("click", e => { if (e.target === lb || e.target.tagName === "FIGURE") lbClose(); });
  let tx = null;
  lb.addEventListener("touchstart", e => { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", e => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) lbShow(lbPos + (dx < 0 ? 1 : -1));
    tx = null;
  });

  /* ---------------- Karte ---------------- */
  const mapBtn = $("[data-map-load]");
  if (mapBtn) mapBtn.addEventListener("click", () => {
    $("[data-map]").innerHTML = `<iframe src="${MAP_EMBED}" title="Karte: Vietnam Nails, Rannische Str. 6, Halle" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  });

  function initBooking() {
    /* ======================================================================
       Buchung
       ====================================================================== */
    const bk = $("[data-bk]");
    const S = {
      step: 1,
      tab: "hands",
      sel: { hands: null, feet: null, lash: null },
      extras: new Set(),
      month: new Date(today.getFullYear(), today.getMonth(), 1),
      date: null,
      time: null,
      ref: null
    };
    const STEPS = 4;
    const lastDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + CONFIG.daysAhead);
    const findItem = id => CATEGORIES.flatMap(c => c.items).find(i => i.id === id);
    const chosen = () => CATEGORIES.map(c => S.sel[c.id] && { cat: c, item: findItem(S.sel[c.id]) }).filter(Boolean);
    const duration = () => chosen().reduce((a, { item }) => a + item.dur, 0);

    const totals = () => {
      let sum = 0, from = false, request = false;
      chosen().forEach(({ item }) => { if (item.price == null) request = true; else sum += item.price; });
      EXTRAS.filter(x => S.extras.has(x.id)).forEach(x => { sum += x.min; if (x.from) from = true; });
      const txt = sum ? `${from ? "ab " : ""}${eur(sum)}` : (request ? "auf Anfrage" : "—");
      return { sum, from, request, txt: sum && request ? `${txt} + Wimpern` : txt };
    };

    const els = {
      tabs: $("[data-bk-tabs]"), services: $("[data-bk-services]"),
      extras: $("[data-bk-extras]"), extraGrid: $("[data-bk-extra-grid]"),
      month: $("[data-cal-month]"), grid: $("[data-cal-grid]"), prev: $("[data-cal-prev]"), next: $("[data-cal-next]"),
      slots: $("[data-slots]"), form: $("[data-bk-form]"), review: $("[data-review]"),
      sumItems: $("[data-sum-items]"), sumWhen: $("[data-sum-when]"), sumTotal: $("[data-sum-total]"),
      progress: $("[data-bk-progress]"), stepinfo: $("[data-bk-stepinfo]"),
      back: $("[data-bk-back]"), nextBtn: $("[data-bk-next]"), err: $("[data-bk-err]"),
      foot: $(".bk-foot"), aside: $("[data-bk-aside]"), mini: $("[data-bk-mini]"), sumToggle: $("[data-bk-sumtoggle]"),
      main: $("[data-bk-main]"), body: $(".bk-body")
    };
    const scrim = document.createElement("div");
    scrim.className = "bk-scrim";
    bk.appendChild(scrim);

    /* Schritt 1 */
    const renderTabs = () => {
      els.tabs.innerHTML = CATEGORIES.map(c => `
        <button class="bk-tab${S.sel[c.id] ? " has-sel" : ""}" role="tab" aria-selected="${S.tab === c.id}" data-tab="${c.id}">${c.label}<i></i></button>`).join("");
    };
    const renderServices = () => {
      const cat = CATEGORIES.find(c => c.id === S.tab);
      els.services.innerHTML = cat.items.map(i => `
        <button class="svc-opt" aria-pressed="${S.sel[cat.id] === i.id}" data-svc="${i.id}">
          <span><span class="svc-opt-name">${i.name}</span><span class="svc-opt-meta">${i.meta}</span></span>
          <span class="svc-opt-price">${i.price == null ? "auf Anfrage" : eur(i.price)}</span>
          <span class="tick" aria-hidden="true"></span>
        </button>`).join("");
      const showExtras = S.tab === "hands" && !!S.sel.hands;
      els.extras.hidden = !showExtras;
    };
    const renderExtras = () => {
      els.extraGrid.innerHTML = EXTRAS.map(x => `
        <button class="ex" aria-pressed="${S.extras.has(x.id)}" data-ex="${x.id}"><span>${x.name}</span><b>${x.label}</b></button>`).join("");
    };

    els.tabs.addEventListener("click", e => {
      const t = e.target.closest("[data-tab]"); if (!t) return;
      S.tab = t.dataset.tab; renderTabs(); renderServices();
    });
    els.services.addEventListener("click", e => {
      const b = e.target.closest("[data-svc]"); if (!b) return;
      const cur = S.sel[S.tab];
      S.sel[S.tab] = cur === b.dataset.svc ? null : b.dataset.svc;
      if (S.tab === "hands" && !S.sel.hands) S.extras.clear();
      S.time = null; // Dauer kann sich ändern
      renderTabs(); renderServices(); renderExtras(); renderSummary(); clearErr();
    });
    els.extraGrid.addEventListener("click", e => {
      const b = e.target.closest("[data-ex]"); if (!b) return;
      S.extras.has(b.dataset.ex) ? S.extras.delete(b.dataset.ex) : S.extras.add(b.dataset.ex);
      b.setAttribute("aria-pressed", String(S.extras.has(b.dataset.ex)));
      renderSummary();
    });

    /* Schritt 2 */

    // Freie Zeiten vom Server (berücksichtigt bereits gebuchte Termine); lokal berechnet, solange sie laden
    const avail = {};
    const closedExtra = new Set(); // im Admin eingetragene Urlaubs-/Feiertage
    const isClosed = d => !CONFIG.hours[d.getDay()] || CONFIG.closedDates.includes(ymd(d)) || closedExtra.has(ymd(d));
    const availKey = d => `${ymd(d).slice(0, 7)}|${Math.max(duration(), 30)}`;
    const ensureAvail = d => {
      const k = availKey(d);
      if (avail[k]) return;
      avail[k] = "loading";
      fetch(`api/slots.php?month=${ymd(d).slice(0, 7)}&dur=${Math.max(duration(), 30)}`, { cache: "no-store" })
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(j => { avail[k] = j.days; (j.closed || []).forEach(x => closedExtra.add(x)); if (S.step === 2) { renderCal(); renderSlots(); } })
        .catch(() => { avail[k] = "offline"; });
    };
    const slotsFor = d => {
      const a = avail[availKey(d)];
      if (a && typeof a === "object") return a[ymd(d)] || [];
      return localSlots(d);
    };
    const localSlots = d => {
      if (isClosed(d)) return [];
      const [o, c, last] = CONFIG.hours[d.getDay()].map(toMin);
      const lastStart = last ?? c;
      const dur = Math.max(duration(), 30);
      const earliest = d.getTime() === today.getTime() ? now.getHours() * 60 + now.getMinutes() + CONFIG.leadMinutes : -1;
      const starts = [];
      for (let m = o; m <= lastStart; m += CONFIG.slotStep) starts.push(m);
      if (last !== undefined && !starts.includes(last)) starts.push(last);
      return starts.filter(m => m >= earliest && m + dur <= c).map(toHM);
    };
    const renderCal = () => {
      ensureAvail(S.month);
      const y = S.month.getFullYear(), mo = S.month.getMonth();
      els.month.textContent = `${MONTH[mo]} ${y}`;
      const first = new Date(y, mo, 1);
      const pad = (first.getDay() + 6) % 7;
      const days = new Date(y, mo + 1, 0).getDate();
      let html = "";
      for (let i = 0; i < pad; i++) html += `<span class="day-pad"></span>`;
      for (let n = 1; n <= days; n++) {
        const d = new Date(y, mo, n);
        const out = d < today || d > lastDay;
        const closed = !out && isClosed(d);
        const full = !out && !closed && slotsFor(d).length === 0;
        const dis = out || closed || full;
        const cls = ["day", d.getTime() === today.getTime() && "is-today", closed && "is-closed", S.date && d.getTime() === S.date.getTime() && "is-sel"].filter(Boolean).join(" ");
        const lab = `${DAY[d.getDay()]}, ${n}. ${MONTH[mo]}${closed ? ", geschlossen" : full ? ", ausgebucht" : ""}`;
        html += `<button class="${cls}" data-day="${ymd(d)}" ${dis ? "disabled" : ""} aria-label="${lab}" aria-pressed="${!!(S.date && d.getTime() === S.date.getTime())}">${n}</button>`;
      }
      els.grid.innerHTML = html;
      els.prev.disabled = y === today.getFullYear() && mo === today.getMonth();
      els.next.disabled = new Date(y, mo + 1, 1) > lastDay;
    };
    const renderSlots = () => {
      if (!S.date) { els.slots.innerHTML = `<p class="slots-empty">Bitte wählen Sie zuerst einen Tag.</p>`; return; }
      const all = slotsFor(S.date);
      const groups = [["Vormittag", t => toMin(t) < 720], ["Nachmittag", t => toMin(t) >= 720 && toMin(t) < 1020], ["Abend", t => toMin(t) >= 1020]];
      els.slots.innerHTML = `<p class="label">${DAY[S.date.getDay()]}, ${S.date.getDate()}. ${MONTH[S.date.getMonth()]}</p>` + groups.map(([name, fn]) => {
        const list = all.filter(fn);
        if (!list.length) return "";
        return `<div class="slot-group"><h4>${name}</h4><div class="slot-row">${list.map(t =>
          `<button class="slot" data-slot="${t}" aria-pressed="${S.time === t}">${nice(t)}</button>`).join("")}</div></div>`;
      }).join("");
    };
    els.grid.addEventListener("click", e => {
      const b = e.target.closest("[data-day]"); if (!b || b.disabled) return;
      const [y, m, d] = b.dataset.day.split("-").map(Number);
      S.date = new Date(y, m - 1, d);
      if (S.time && !slotsFor(S.date).includes(S.time)) S.time = null;
      renderCal(); renderSlots(); renderSummary(); clearErr();
      if (window.innerWidth < 900) els.slots.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    });
    els.slots.addEventListener("click", e => {
      const b = e.target.closest("[data-slot]"); if (!b) return;
      S.time = b.dataset.slot;
      $$("[data-slot]", els.slots).forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      renderSummary(); clearErr();
    });
    els.prev.addEventListener("click", () => { S.month = new Date(S.month.getFullYear(), S.month.getMonth() - 1, 1); renderCal(); });
    els.next.addEventListener("click", () => { S.month = new Date(S.month.getFullYear(), S.month.getMonth() + 1, 1); renderCal(); });

    /* Zusammenfassung */
    const dateLong = () => S.date ? `${DAY[S.date.getDay()]}, ${S.date.getDate()}. ${MONTH[S.date.getMonth()]} ${S.date.getFullYear()}` : "";
    const extrasList = () => EXTRAS.filter(x => S.extras.has(x.id));
    const renderSummary = () => {
      const items = chosen();
      els.sumItems.innerHTML = items.length ? items.map(({ cat, item }) => `
        <div class="sum-item"><span>${item.name}<small>${cat.label}</small></span><b>${item.price == null ? "auf Anfrage" : eur(item.price)}</b></div>`).join("")
        + extrasList().map(x => `<div class="sum-item"><span>${x.name}<small>Extra</small></span><b>${x.label}</b></div>`).join("")
        : `<p class="sum-empty">Noch keine Leistung gewählt.</p>`;
      els.sumWhen.innerHTML = S.date ? `<p><i>Datum</i>${dateLong()}</p>${S.time ? `<p><i>Zeit</i>${nice(S.time)} Uhr</p>` : ""}` : "";
      const t = totals();
      els.sumTotal.textContent = t.txt;
      const n = items.length + S.extras.size;
      els.mini.textContent = n ? t.txt : "—";
      els.sumToggle.dataset.count = n === 1 ? "1 Leistung" : `${n} Leistungen`;
    };

    /* Prüfen */
    const fv = name => els.form.elements[name].value.trim();
    const renderReview = () => {
      const items = chosen();
      const rows = [
        ["Leistung", items.map(({ item }) => esc(item.name)).join("<br>") + (S.extras.size ? `<small>Extras: ${extrasList().map(x => x.name).join(", ")}</small>` : ""), 1],
        ["Termin", `${dateLong()}<small>${nice(S.time)} Uhr</small>`, 2],
        ["Kontakt", `${esc(fv("name"))}<small>${esc(fv("phone"))}</small>`, 3],
        fv("note") ? ["Wunsch", esc(fv("note")), 3] : null,
        ["Preis", `${totals().txt}<small>Endpreis je nach Design und Aufwand</small>`, 1]
      ].filter(Boolean);
      els.review.innerHTML = `<dl>${rows.map(([k, v, s]) => `<div class="rv"><dt>${k}</dt><dd>${v}</dd><button type="button" data-goto="${s}">Ändern</button></div>`).join("")}</dl>`;
    };
    els.review.addEventListener("click", e => { const b = e.target.closest("[data-goto]"); if (b) go(Number(b.dataset.goto)); });

    /* Validierung */
    const setErr = msg => { els.err.textContent = msg; };
    const clearErr = () => { els.err.textContent = ""; };
    const validate = step => {
      if (step === 1 && !chosen().length) return "Bitte wählen Sie mindestens eine Leistung.";
      if (step === 2 && !S.date) return "Bitte wählen Sie einen Tag.";
      if (step === 2 && !S.time) return "Bitte wählen Sie eine Uhrzeit.";
      if (step === 3) {
        const f = els.form;
        const nameOk = fv("name").length >= 2;
        const phoneOk = fv("phone").replace(/[^\d]/g, "").length >= 6;
        const consentOk = f.elements.consent.checked;
        f.elements.name.parentElement.classList.toggle("is-invalid", !nameOk);
        f.elements.phone.parentElement.classList.toggle("is-invalid", !phoneOk);
        $(".bk-consent", f).classList.toggle("is-invalid", !consentOk);
        if (!nameOk) return "Bitte geben Sie Ihren Namen an.";
        if (!phoneOk) return "Bitte geben Sie eine gültige Telefonnummer an.";
        if (!consentOk) return "Bitte bestätigen Sie, dass Sie die Datenschutzhinweise gelesen haben.";
      }
      return null;
    };
    els.form.addEventListener("input", e => { e.target.closest(".fl")?.classList.remove("is-invalid"); clearErr(); });
    els.form.addEventListener("change", e => { if (e.target.name === "consent") $(".bk-consent", els.form).classList.remove("is-invalid"); });
    els.form.addEventListener("submit", e => { e.preventDefault(); els.nextBtn.click(); });

    /* Navigation */
    const go = (n, dir) => {
      const back = dir === undefined ? n < S.step : dir < 0;
      S.step = n;
      $$("[data-bk-step]", bk).forEach(s => {
        const on = Number(s.dataset.bkStep) === n;
        s.hidden = !on;
        if (on) { s.classList.toggle("is-back", back); s.style.animation = "none"; void s.offsetWidth; s.style.animation = ""; }
      });
      if (n === 1) { renderTabs(); renderServices(); renderExtras(); }
      if (n === 2) { if (S.date) S.month = new Date(S.date.getFullYear(), S.date.getMonth(), 1); renderCal(); renderSlots(); }
      if (n === 4) renderReview();
      const pct = Math.min(n, STEPS) / STEPS * 100;
      els.progress.style.width = `${n > STEPS ? 100 : pct}%`;
      els.stepinfo.textContent = n <= STEPS ? `Schritt ${n} / ${STEPS}` : "Fertig";
      els.back.classList.toggle("is-off", n === 1);
      els.nextBtn.textContent = n === STEPS ? "Termin buchen" : "Weiter";
      els.foot.classList.toggle("is-done", n > STEPS);
      els.aside.hidden = n > STEPS;
      setSheet(false);
      clearErr();
      els.body.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      if (n === 3) setTimeout(() => { if (!fv("name")) els.form.elements.name.focus({ preventScroll: true }); }, 400);
    };

    els.nextBtn.addEventListener("click", () => {
      const e = validate(S.step);
      if (e) { setErr(e); return; }
      if (S.step === STEPS) return submit();
      go(S.step + 1, 1);
    });
    els.back.addEventListener("click", () => go(Math.max(1, S.step - 1), -1));

    /* Mobile Zusammenfassung */
    const setSheet = open => {
      els.sumToggle.setAttribute("aria-expanded", String(open));
      els.aside.classList.toggle("is-open", open);
      scrim.classList.toggle("is-open", open);
      bk.style.setProperty("--foot-h", `${els.foot.offsetHeight}px`);
    };
    els.sumToggle.addEventListener("click", () => setSheet(els.sumToggle.getAttribute("aria-expanded") !== "true"));
    scrim.addEventListener("click", () => setSheet(false));

    /* Absenden */
    const waMessage = () => {
      const items = chosen();
      return [
        "Hallo Vietnam Nails, ich möchte gern einen Termin buchen:",
        "",
        `• Leistung: ${items.map(({ item }) => item.name).join(" + ")}`,
        S.extras.size ? `• Extras: ${extrasList().map(x => x.name).join(", ")}` : null,
        `• Termin: ${dateLong()}, ${nice(S.time)} Uhr`,
        `• Preis laut Website: ${totals().txt}`,
        "",
        `Name: ${fv("name")}`,
        `Telefon: ${fv("phone")}`,
        `Besuch: ${els.form.elements.visit.value}`,
        fv("note") ? `Wunsch: ${fv("note")}` : null,
        "",
        `Nr.: ${S.ref}`
      ].filter(l => l !== null).join("\n");
    };
    const openWa = () => window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(waMessage())}`, "_blank", "noopener");

    const localRef = () => {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      return "VN-" + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    };
    let sending = false;
    const submit = async () => {
      if (sending) return;
      sending = true;
      els.nextBtn.disabled = true;
      els.nextBtn.textContent = "Wird gebucht …";
      const payload = {
        services: chosen().map(({ item }) => item.id), extras: [...S.extras],
        date: ymd(S.date), time: S.time,
        name: fv("name"), phone: fv("phone"), note: fv("note"),
        visit: els.form.elements.visit.value, consent: true,
        website: els.form.elements.website.value
      };
      let saved = false;
      try {
        const r = await fetch("api/book.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok) { S.ref = j.ref; saved = true; }
        else if (r.status === 409 || r.status === 400 || r.status === 429) {
          // Termin vergeben oder Eingabe fehlerhaft → zurück und Hinweis zeigen
          Object.keys(avail).forEach(k => delete avail[k]);
          if (j.code === "taken") { S.time = null; go(2, -1); }
          setErr(j.error || "Bitte prüfen Sie Ihre Angaben.");
          return;
        } else throw new Error();
      } catch (_) {
        // Kein Server erreichbar: Anfrage per WhatsApp schicken
        S.ref = localRef();
        openWa();
      } finally {
        sending = false;
        els.nextBtn.disabled = false;
        els.nextBtn.textContent = S.step === STEPS ? "Termin buchen" : "Weiter";
      }
      S.saved = saved;
      $("[data-done-name]").textContent = fv("name").split(" ")[0] + ".";
      $("[data-done-label]").textContent = saved ? "Termin gebucht" : "Fast geschafft";
      $("[data-done-text]").textContent = saved
        ? "Vielen Dank für Ihre Buchung. Wir freuen uns auf Sie!"
        : "Bitte senden Sie die vorbereitete Nachricht in WhatsApp ab – dann ist Ihr Termin bei uns eingetragen.";
      $("[data-done-wa]").hidden = saved;
      $("[data-done-card]").innerHTML = [
        ["Termin", `${dateLong()}, ${nice(S.time)} Uhr`],
        ["Leistung", chosen().map(({ item }) => esc(item.name)).join(" + ")],
        ["Adresse", "Rannische Str. 6, Halle"]
      ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
      go(5, 1);
    };
    $("[data-done-wa]").addEventListener("click", openWa);

    $("[data-done-ics]").addEventListener("click", () => {
      const [h, m] = S.time.split(":").map(Number);
      const start = new Date(S.date.getFullYear(), S.date.getMonth(), S.date.getDate(), h, m);
      const end = new Date(start.getTime() + Math.max(duration(), 30) * 60000);
      const f = d => `${ymd(d).replace(/-/g, "")}T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
      const ics = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vietnam Nails//Termin//DE", "BEGIN:VEVENT",
        `UID:${S.ref}@vietnamnail.de`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
        `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
        `SUMMARY:Vietnam Nails – ${chosen().map(({ item }) => item.name).join(" + ")} `,
        `LOCATION:${CONFIG.address.replace(/,/g, "\\,")}`,
        `DESCRIPTION:Wir freuen uns auf Sie! Termin ändern oder absagen: Tel. ${CONFIG.phone}`,
        "END:VEVENT", "END:VCALENDAR"
      ].join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
      a.download = `vietnam-nails-${ymd(S.date)}.ics`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    /* Öffnen / Schließen */
    let bkReturn = null;
    const openBk = (trigger, preselect) => {
      bkReturn = trigger || null;
      if (preselect) {
        const cat = CATEGORIES.find(c => c.items.some(i => i.id === preselect));
        if (cat) { S.sel[cat.id] = preselect; S.tab = cat.id; }
      }
      if (S.step > STEPS) resetBk();
      if (burger.getAttribute("aria-expanded") === "true") setMenu(false);
      bk.hidden = false;
      document.body.classList.add("is-locked");
      requestAnimationFrame(() => bk.classList.add("is-open"));
      go(S.step, 1);
      renderSummary();
      $("[data-bk-close]").focus({ preventScroll: true });
      if (location.hash !== "#buchen") history.pushState({ bk: 1 }, "", "#buchen");
    };
    const closeBk = (fromPop) => {
      bk.classList.remove("is-open");
      document.body.classList.remove("is-locked");
      setTimeout(() => { if (!bk.classList.contains("is-open")) bk.hidden = true; }, 450);
      if (!fromPop && location.hash === "#buchen") history.back();
      if (bkReturn) bkReturn.focus({ preventScroll: true });
    };
    const resetBk = () => {
      S.step = 1; S.tab = "hands"; S.sel = { hands: null, feet: null, lash: null }; S.extras.clear();
      S.date = null; S.time = null; S.ref = null; S.saved = false; els.form.reset();
    };

    $$("[data-book]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); openBk(b, b.dataset.preselect); }));
    $("[data-bk-close]").addEventListener("click", () => closeBk(false));
    window.addEventListener("popstate", () => { if (!bk.hidden && location.hash !== "#buchen") closeBk(true); });
    window.addEventListener("hashchange", () => { if (location.hash === "#buchen" && bk.hidden) openBk(); });
    if (location.hash === "#buchen") { history.replaceState(null, "", location.pathname); openBk(); }

    // Tastatur: Escape & Fokus im Dialog halten
    document.addEventListener("keydown", e => {
      if (!lb.hidden) {
        if (e.key === "Escape") lbClose();
        if (e.key === "ArrowLeft") lbShow(lbPos - 1);
        if (e.key === "ArrowRight") lbShow(lbPos + 1);
        return;
      }
      if (bk.hidden) { if (e.key === "Escape" && burger.getAttribute("aria-expanded") === "true") setMenu(false); return; }
      if (e.key === "Escape") { els.aside.classList.contains("is-open") ? setSheet(false) : closeBk(false); }
      if (e.key === "Tab") {
        const f = $$("button:not([disabled]), input, textarea, a[href]", bk).filter(x => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });

    renderTabs(); renderServices(); renderExtras(); renderSummary();
  }

  /* ---------------- Start: Studio-Daten laden ---------------- */
  fetch("assets/salon.json")
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(data => {
      CONFIG = data; CATEGORIES = data.categories; EXTRAS = data.extras;
      initHours();
      initBooking();
    })
    .catch(() => {
      // Ohne Daten: Buchen-Knöpfe rufen direkt im Studio an
      $$("[data-book]").forEach(b => b.addEventListener("click", () => { location.href = "tel:+4934568673949"; }));
    });

  /* ---------------- Anonyme Besucherzählung (ohne Cookies) ---------------- */
  try {
    const payload = JSON.stringify({ p: location.pathname, r: document.referrer });
    if (navigator.sendBeacon) navigator.sendBeacon("api/track.php", new Blob([payload], { type: "application/json" }));
    else fetch("api/track.php", { method: "POST", body: payload, keepalive: true }).catch(() => {});
  } catch (_) { /* Zählung ist optional */ }
})();
