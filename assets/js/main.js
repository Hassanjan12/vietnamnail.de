(() => {
  "use strict";

  // ---- Salon settings (edit here) ----------------------------------------
  const CONFIG = {
    whatsapp: "4915227859766",
    // 0 = Sonntag … 6 = Samstag; null = geschlossen
    hours: {
      1: ["08:30", "18:30"],
      2: ["08:30", "18:30"],
      3: ["08:30", "18:30"],
      4: ["08:30", "18:30"],
      5: ["08:30", "18:30"],
      6: ["09:00", "16:00"],
      0: null
    },
    slotMinutes: 30,
    lastSlotBeforeClose: 60, // letzter Termin X Min. vor Ladenschluss
    bookingDaysAhead: 42,
    mapEmbed: "https://www.google.com/maps?q=Vietnam+Nails,+Rannische+Str.+6,+06108+Halle+(Saale)&output=embed"
  };

  const SERVICES = {
    hands: [
      { id: "neu", name: "Neumodellage", price: "33 €", nails: true },
      { id: "auffuellen", name: "Auffüllen", price: "30 €", nails: true }
    ],
    feet: [
      { id: "pedi-standard", name: "Standard-Pediküre", info: "ca. 30 Min.", price: "25 €" },
      { id: "pedi-deluxe", name: "Deluxe-Pediküre", info: "ca. 41 Min.", price: "36 €" },
      { id: "pedi-standard-shellac", name: "Standard-Pediküre + Shellac", price: "42 €" },
      { id: "pedi-deluxe-shellac", name: "Deluxe-Pediküre + Shellac", price: "52 €" },
      { id: "fuss-shellac", name: "Shellac Füße", info: "ohne Pediküre", price: "29 €" },
      { id: "fuss-pulver", name: "Pulvermodellage Füße", info: "ohne Pediküre", price: "35 €" }
    ],
    lash: [
      { id: "wimpern", name: "Wimpernverlängerung", info: "Neuanlage oder Auffüllen", price: "auf Anfrage" }
    ]
  };

  const EXTRAS = [
    { id: "french", name: "French / Farbe", price: "+5 €" },
    { id: "laenge", name: "Überlänge", price: "+3–10 €" },
    { id: "3d", name: "3D-Blumen", price: "+4 €" },
    { id: "cateye", name: "Cat-Eye", price: "+8–10 €" },
    { id: "chrome", name: "Chrome", price: "+5–10 €" },
    { id: "design-set", name: "Design ganzes Set", price: "ab 10 €" },
    { id: "design-nagel", name: "Design einzelne Nägel", price: "ab 2 €/Nagel" },
    { id: "steine", name: "Schmucksteine", price: "+3 €" }
  ];

  const GALLERY = [
    ["rosa-marmor-gold", "elegant", "Rosa und Marmor mit Blattgold"],
    ["stiletto-tuerkis-gold", "art", "Stiletto in Türkis und Gold mit Cat-Eye-Effekt"],
    ["nude-glitzer-schleifen", "elegant", "Mandelform in Nude mit Glitzer und Schleifen"],
    ["tuerkis-3d-blumen", "color", "Türkis-Ombré mit 3D-Blüten und Steinen"],
    ["halloween-patchwork", "art", "Handgemalte Patchwork-Nail-Art"],
    ["perlmutt-chrome", "elegant", "Perlmutt-Chrome in Mandelform"],
    ["hellblau-goldfolie", "color", "Hellblau mit Goldfolie"],
    ["stiletto-blau-rosen", "art", "Stiletto mit modellierten 3D-Rosen"],
    ["marmor-weiss-muster", "elegant", "Milchweiß mit Marmor und Muster"],
    ["blau-ombre-glitzer", "color", "Blau-Ombré mit Glitzerlinien"],
    ["halloween-kitty", "art", "French mit 3D-Charakter-Design"],
    ["nude-braun-blume", "elegant", "Nude und Braun mit 3D-Blüte"],
    ["tuerkis-schwarz-schleifen", "color", "Türkis und Schwarz mit 3D-Schleifen"],
    ["nude-weiss-ombre", "elegant", "Nude mit weißem Ombré"],
    ["wimpern", "lash", "Wimpernverlängerung"]
  ];

  const DAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const DAY_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const MONTHS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const toTime = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const fmtTime = t => t.replace(":", ".");

  // ---- Header / Menu -----------------------------------------------------
  const header = $("[data-header]");
  const nav = $("[data-nav]");
  const toggle = $("[data-menu-toggle]");
  const mobileCta = $(".mobile-cta");
  const bookingSection = $("#termin");

  const onScroll = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
    if (mobileCta && bookingSection) {
      const r = bookingSection.getBoundingClientRect();
      const inBooking = r.top < window.innerHeight && r.bottom > 0;
      mobileCta.classList.toggle("is-hidden", window.scrollY < 300 || inBooking);
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const closeMenu = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Menü öffnen");
  };
  toggle.addEventListener("click", () => {
    const open = !nav.classList.contains("is-open");
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
  });
  $$("a", nav).forEach(a => a.addEventListener("click", closeMenu));

  const year = $("[data-year]");
  if (year) year.textContent = new Date().getFullYear();

  // ---- Opening hours -----------------------------------------------------
  const now = new Date();
  const today = now.getDay();
  const hoursLabel = d => CONFIG.hours[d] ? `${fmtTime(CONFIG.hours[d][0])} – ${fmtTime(CONFIG.hours[d][1])} Uhr` : "geschlossen";

  const hoursTable = $("[data-hours]");
  if (hoursTable) {
    const rows = [
      [[1, 2, 3, 4, 5], "Montag – Freitag"],
      [[6], "Samstag"],
      [[0], "Sonntag"]
    ];
    hoursTable.innerHTML = rows.map(([days, label]) =>
      `<tr class="${days.includes(today) ? "is-today" : ""}"><td>${label}</td><td>${hoursLabel(days[0])}</td></tr>`
    ).join("");
  }

  const status = $("[data-open-status]");
  if (status) {
    const h = CONFIG.hours[today];
    const mins = now.getHours() * 60 + now.getMinutes();
    let text, open = false;
    if (h && mins >= toMin(h[0]) && mins < toMin(h[1])) {
      open = true;
      text = `Geöffnet bis ${fmtTime(h[1])} Uhr`;
    } else if (h && mins < toMin(h[0])) {
      text = `Öffnet heute um ${fmtTime(h[0])} Uhr`;
    } else {
      let d = (today + 1) % 7, n = 1;
      while (!CONFIG.hours[d] && n < 7) { d = (d + 1) % 7; n++; }
      text = `Geschlossen · ${n === 1 ? "morgen" : DAY_LONG[d]} ab ${fmtTime(CONFIG.hours[d][0])} Uhr`;
    }
    status.innerHTML = `<span class="status-dot${open ? " is-open" : ""}"></span>${text}`;
  }

  // ---- Tabs --------------------------------------------------------------
  const tabs = $$("[data-tab]");
  const selectTab = tab => {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", e => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
      selectTab(next); next.focus();
    });
  });

  // ---- Gallery + Lightbox ------------------------------------------------
  const gallery = $("[data-gallery]");
  const lb = $("[data-lightbox]");
  const lbImg = $("[data-lb-img]");
  let lbIndex = 0;

  gallery.innerHTML = GALLERY.map(([file, cat, alt], i) =>
    `<button class="g-item" data-cat="${cat}" data-index="${i}" aria-label="${alt} – vergrößern">
       <img src="assets/img/gallery/${file}-sm.webp" alt="${alt}" loading="lazy">
     </button>`
  ).join("");

  const visibleItems = () => $$(".g-item:not([hidden])", gallery);

  $$("[data-filter]").forEach(chip => chip.addEventListener("click", () => {
    $$("[data-filter]").forEach(c => c.classList.toggle("is-active", c === chip));
    const f = chip.dataset.filter;
    $$(".g-item", gallery).forEach(it => { it.hidden = f !== "all" && it.dataset.cat !== f; });
  }));

  const showLb = idx => {
    const items = visibleItems();
    lbIndex = (idx + items.length) % items.length;
    const [file, , alt] = GALLERY[Number(items[lbIndex].dataset.index)];
    lbImg.src = `assets/img/gallery/${file}.webp`;
    lbImg.alt = alt;
  };
  let lastFocus = null;
  const openLb = item => {
    lastFocus = item;
    lb.hidden = false;
    document.body.style.overflow = "hidden";
    showLb(visibleItems().indexOf(item));
    $("[data-lb-close]").focus();
  };
  const closeLb = () => {
    lb.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  };
  gallery.addEventListener("click", e => { const it = e.target.closest(".g-item"); if (it) openLb(it); });
  $("[data-lb-close]").addEventListener("click", closeLb);
  $("[data-lb-prev]").addEventListener("click", () => showLb(lbIndex - 1));
  $("[data-lb-next]").addEventListener("click", () => showLb(lbIndex + 1));
  lb.addEventListener("click", e => { if (e.target === lb) closeLb(); });
  document.addEventListener("keydown", e => {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLb();
    if (e.key === "ArrowLeft") showLb(lbIndex - 1);
    if (e.key === "ArrowRight") showLb(lbIndex + 1);
  });
  let touchX = null;
  lb.addEventListener("touchstart", e => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) showLb(lbIndex + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  // ---- Map (loads only after consent) ------------------------------------
  const mapBtn = $("[data-map-load]");
  if (mapBtn) mapBtn.addEventListener("click", () => {
    $("[data-map]").innerHTML = `<iframe src="${CONFIG.mapEmbed}" title="Karte: Vietnam Nails, Rannische Str. 6, Halle" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  });

  // ---- Booking -----------------------------------------------------------
  const form = $("[data-booking]");
  const state = { step: 1, service: null, extras: new Set(), date: null, time: null, dateOffset: 0 };
  const allServices = Object.values(SERVICES).flat();

  const optHtml = (type, name, o) => `
    <label class="opt">
      <input type="${type}" name="${name}" value="${o.id}">
      <span class="opt-box"><span>${o.name}${o.info ? `<small>${o.info}</small>` : ""}</span><b>${o.price}</b></span>
    </label>`;

  Object.entries(SERVICES).forEach(([group, list]) => {
    $(`[data-services="${group}"]`).innerHTML = list.map(o => optHtml("radio", "service", o)).join("");
  });
  $("[data-extras-list]").innerHTML = EXTRAS.map(o => optHtml("checkbox", "extra", o)).join("");

  const extrasBox = $("[data-extras]");
  // Extras nur bei Nagelmodellage anzeigen
  const syncExtras = () => {
    extrasBox.toggleAttribute("data-disabled", !(state.service && state.service.nails));
  };
  syncExtras();

  form.addEventListener("change", e => {
    if (e.target.name === "service") {
      state.service = allServices.find(s => s.id === e.target.value);
      if (!state.service.nails) { state.extras.clear(); $$('input[name="extra"]', form).forEach(i => { i.checked = false; }); }
      syncExtras();
      hideError(1);
    }
    if (e.target.name === "extra") {
      e.target.checked ? state.extras.add(e.target.value) : state.extras.delete(e.target.value);
    }
  });

  // Dates
  const datesEl = $("[data-dates]");
  const timesEl = $("[data-times]");
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const sameDay = (a, b) => a && b && a.toDateString() === b.toDateString();

  const slotsFor = date => {
    const h = CONFIG.hours[date.getDay()];
    if (!h) return [];
    const out = [];
    const minNow = sameDay(date, now) ? now.getHours() * 60 + now.getMinutes() + 60 : -1;
    for (let m = toMin(h[0]); m <= toMin(h[1]) - CONFIG.lastSlotBeforeClose; m += CONFIG.slotMinutes) {
      if (m > minNow) out.push(toTime(m));
    }
    return out;
  };

  const renderDates = () => {
    const days = [];
    for (let i = 0; i < 7; i++) days.push(addDays(startOfToday, state.dateOffset + i));
    datesEl.innerHTML = days.map(d => {
      const closed = slotsFor(d).length === 0;
      const sel = sameDay(d, state.date) ? " is-selected" : "";
      return `<button type="button" class="date-btn${sel}" data-date="${d.toISOString()}" ${closed ? "disabled" : ""}
                aria-label="${DAY_LONG[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}${closed ? " – geschlossen" : ""}">
                <small>${DAY_SHORT[d.getDay()]}</small><b>${d.getDate()}</b><small>${MONTHS[d.getMonth()]}</small>
              </button>`;
    }).join("");
    $("[data-date-prev]").disabled = state.dateOffset === 0;
    $("[data-date-next]").disabled = state.dateOffset + 7 >= CONFIG.bookingDaysAhead;
  };

  const renderTimes = () => {
    if (!state.date) return;
    const slots = slotsFor(state.date);
    timesEl.innerHTML = slots.length
      ? slots.map(t => `<button type="button" class="time-btn${t === state.time ? " is-selected" : ""}" data-time="${t}">${fmtTime(t)}</button>`).join("")
      : `<p class="muted">An diesem Tag sind keine Termine mehr möglich.</p>`;
  };

  datesEl.addEventListener("click", e => {
    const b = e.target.closest("[data-date]");
    if (!b || b.disabled) return;
    state.date = new Date(b.dataset.date);
    state.time = null;
    renderDates(); renderTimes();
  });
  timesEl.addEventListener("click", e => {
    const b = e.target.closest("[data-time]");
    if (!b) return;
    state.time = b.dataset.time;
    renderTimes();
    hideError(2);
  });
  $("[data-date-prev]").addEventListener("click", () => { state.dateOffset = Math.max(0, state.dateOffset - 7); renderDates(); });
  $("[data-date-next]").addEventListener("click", () => { state.dateOffset += 7; renderDates(); });

  // Steps
  const showError = n => { $(`[data-error="${n}"]`).hidden = false; };
  const hideError = n => { $(`[data-error="${n}"]`).hidden = true; };

  const extrasText = () => EXTRAS.filter(x => state.extras.has(x.id)).map(x => x.name).join(", ");
  const dateText = () => state.date ? `${DAY_LONG[state.date.getDay()]}, ${state.date.toLocaleDateString("de-DE")}` : "";

  const renderSummary = () => {
    const rows = [
      ["Leistung", `${state.service.name} (${state.service.price})`],
      state.extras.size ? ["Extras", extrasText()] : null,
      ["Termin", `${dateText()}, ${fmtTime(state.time)} Uhr`]
    ].filter(Boolean);
    $("[data-summary]").innerHTML = `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
  };

  const goTo = n => {
    state.step = n;
    $$("[data-step]", form).forEach(s => { s.hidden = Number(s.dataset.step) !== n; });
    $$("[data-step-label]", form).forEach(l => {
      const i = Number(l.dataset.stepLabel);
      l.classList.toggle("is-current", i === n);
      l.classList.toggle("is-done", i < n);
    });
    if (n === 2) { renderDates(); renderTimes(); }
    if (n === 3) renderSummary();
    const top = form.getBoundingClientRect().top + window.scrollY - (header.offsetHeight + 12);
    if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
  };

  const valid = n => {
    if (n === 1) return !!state.service;
    if (n === 2) return !!(state.date && state.time);
    if (n === 3) return form.name.value.trim() && form.phone.value.trim().length >= 6 && form.consent.checked;
    return true;
  };

  $$("[data-next]", form).forEach(b => b.addEventListener("click", () => {
    if (!valid(state.step)) return showError(state.step);
    hideError(state.step);
    goTo(state.step + 1);
  }));
  $$("[data-prev]", form).forEach(b => b.addEventListener("click", () => goTo(state.step - 1)));

  form.addEventListener("submit", e => {
    e.preventDefault();
    if (!valid(3)) return showError(3);
    hideError(3);

    const lines = [
      "Hallo, ich möchte gerne einen Termin anfragen:",
      "",
      `Leistung: ${state.service.name}`,
      state.extras.size ? `Extras: ${extrasText()}` : null,
      `Wunschtermin: ${dateText()}, ${fmtTime(state.time)} Uhr`,
      `Name: ${form.name.value.trim()}`,
      `Telefon: ${form.phone.value.trim()}`,
      form.note.value.trim() ? `Anmerkung: ${form.note.value.trim()}` : null
    ].filter(l => l !== null);

    window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener");

    $$("[data-step]", form).forEach(s => { s.hidden = true; });
    $(".steps", form).hidden = true;
    const done = document.createElement("div");
    done.className = "booking-done";
    done.innerHTML = `<h3>Fast geschafft.</h3>
      <p>Ihre Anfrage wurde in WhatsApp vorbereitet – bitte dort nur noch auf „Senden“ tippen. Wir melden uns mit einer Bestätigung.</p>
      <button type="button" class="btn btn-ghost-light" data-restart>Neue Anfrage</button>`;
    form.appendChild(done);
    $("[data-restart]", done).addEventListener("click", () => window.location.reload());
  });

  // Preselect from other links (z. B. „Beratungstermin anfragen“ bei Wimpern)
  $$("[data-preselect]").forEach(a => a.addEventListener("click", () => {
    const input = $(`input[name="service"][value="${a.dataset.preselect}"]`, form);
    if (input) { input.checked = true; input.dispatchEvent(new Event("change", { bubbles: true })); }
  }));
})();
