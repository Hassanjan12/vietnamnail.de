/**
 * POST /api/admin – Admin-API. Aufruf: JSON { action: "...", ... } mit Header „X-VN: 1“ (Schutz gegen fremde Seiten).
 */
import {
  handle, json, fail, readJson, db, getSetting, setSetting, rateLimit, hashPassword, verifyPassword, sha256, randomHex,
  clean, validDate, validTime, resolve, busy, fits, toMin, closedDates, bookingOut, newRef, berlinNow, addDays,
  customerKey, priceValue, ensureCustomer, normPhone, getCatalog, validateCatalog, publicCatalog,
  STATUSES, SOURCES, salon
} from "../lib.js";

const SESSION_DAYS = 14;
const MIN_PW = 10;

function cookie(token, maxAge) {
  return `vn_admin=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}
function readToken(request) {
  const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)vn_admin=([a-f0-9]{64})/);
  return m ? m[1] : null;
}
async function startSession(DB) {
  const token = randomHex(32);
  await DB.prepare("INSERT INTO sessions(token_hash, expires) VALUES(?, ?)")
    .bind(await sha256(token), Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400).run();
  return cookie(token, SESSION_DAYS * 86400);
}
async function isAuthed(DB, request) {
  const t = readToken(request);
  if (!t) return false;
  const r = await DB.prepare("SELECT expires FROM sessions WHERE token_hash = ?").bind(await sha256(t)).first();
  return !!r && r.expires > Math.floor(Date.now() / 1000);
}

export const onRequestPost = handle(async ({ request, env }) => {
  if (request.headers.get("X-VN") !== "1") fail("Ungültige Anfrage.");
  const input = await readJson(request);
  const action = String(input.action || "");
  const DB = await db(env);

  /* ---------- ohne Anmeldung ---------- */
  if (action === "state") {
    return json({ ok: true, setup: !(await getSetting(DB, "admin_hash")), auth: await isAuthed(DB, request) });
  }
  if (action === "setup") {
    await rateLimit(DB, request, "setup", 10, 900);
    if (await getSetting(DB, "admin_hash")) fail("Bereits eingerichtet.", 403);
    const pw = String(input.password || "");
    if (pw.length < MIN_PW) fail(`Das Passwort muss mindestens ${MIN_PW} Zeichen haben.`);
    // nur setzen, wenn noch kein Passwort existiert (auch bei zwei gleichzeitigen Versuchen)
    const r = await DB.prepare("INSERT INTO settings(k, v) VALUES('admin_hash', ?) ON CONFLICT(k) DO NOTHING").bind(await hashPassword(pw)).run();
    if (r.meta.changes !== 1) fail("Bereits eingerichtet.", 403);
    return json({ ok: true }, 200, { "Set-Cookie": await startSession(DB) });
  }
  if (action === "login") {
    await rateLimit(DB, request, "login", 8, 900);
    const hash = await getSetting(DB, "admin_hash");
    if (!hash || !(await verifyPassword(String(input.password || ""), hash))) fail("Passwort ist nicht korrekt.", 401);
    return json({ ok: true }, 200, { "Set-Cookie": await startSession(DB) });
  }

  /* ---------- ab hier nur angemeldet ---------- */
  if (!(await isAuthed(DB, request))) fail("Bitte anmelden.", 401);
  const today = berlinNow().date;

  switch (action) {
    case "logout": {
      const t = readToken(request);
      if (t) await DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(t)).run();
      return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
    }

    case "bookings": {
      const from = String(input.from || today), to = String(input.to || from);
      if (!validDate(from) || !validDate(to)) fail("Ungültiger Zeitraum.");
      const { results } = await DB.prepare("SELECT * FROM bookings WHERE date BETWEEN ? AND ? ORDER BY date, time").bind(from, to).all();
      return json({ ok: true, bookings: results.map(bookingOut) });
    }

    case "search": {
      const q = `%${clean(input.q, 60).replace(/[\\%_]/g, c => "\\" + c)}%`;
      const status = String(input.status || "");
      const upcoming = !!input.upcoming;
      let sql = "SELECT * FROM bookings WHERE (name LIKE ?1 ESCAPE '\\' OR phone LIKE ?1 ESCAPE '\\' OR ref LIKE ?1 ESCAPE '\\' OR title LIKE ?1 ESCAPE '\\')";
      const params = [q];
      if (STATUSES.includes(status)) { sql += ` AND status = ?${params.length + 1}`; params.push(status); }
      if (upcoming) { sql += ` AND date >= ?${params.length + 1}`; params.push(today); }
      sql += upcoming ? " ORDER BY date, time LIMIT 300" : " ORDER BY date DESC, time DESC LIMIT 300";
      const { results } = await DB.prepare(sql).bind(...params).all();
      return json({ ok: true, bookings: results.map(bookingOut) });
    }

    case "create":
    case "update": {
      const b = input.booking && typeof input.booking === "object" ? input.booking : {};
      const id = action === "update" ? Number(b.id || 0) : null;
      let cur = null;
      if (id) {
        cur = await DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first();
        if (!cur) fail("Termin nicht gefunden.", 404);
      }
      const get = (k, d = "") => (k in b ? b[k] : (cur ? cur[k] : d));
      const name = clean(get("name"), 80), phone = clean(get("phone"), 40), note = clean(get("note"), 1000);
      const date = String(get("date")), time = String(get("time"));
      let status = String(get("status", "confirmed")), source = String(get("source", "telefon"));
      if (!name) fail("Bitte einen Namen eingeben.");
      if (!validDate(date) || !validTime(time)) fail("Bitte Datum und Uhrzeit prüfen.");
      if (!STATUSES.includes(status)) status = "confirmed";
      if (!SOURCES.includes(source)) source = "telefon";
      const svcIds = "services" in b ? b.services : JSON.parse(cur?.services || "[]");
      const exIds = "extras" in b ? b.extras : JSON.parse(cur?.extras || "[]");
      const svc = resolve(svcIds, exIds, await getCatalog(DB), true);
      const title = svc.title || clean(get("title"), 160);
      if (!title) fail("Bitte mindestens eine Leistung wählen.");
      let duration = Number(get("duration", svc.duration || 60)) || 60;
      duration = Math.max(15, Math.min(600, duration));
      const price = ("services" in b || "extras" in b) ? svc.price : String(cur?.price ?? svc.price);

      // Überschneidung nur als Warnung – mit force trotzdem speichern
      if (["pending", "confirmed"].includes(status) && !input.force) {
        const cap = Math.max(1, Number(salon.capacity) || 1);
        if (!fits(await busy(DB, date, id), toMin(time), duration, cap)) fail("Zu dieser Zeit sind bereits alle Plätze belegt.", 409, { code: "overlap" });
      }
      const now = new Date().toISOString();
      let newId = id;
      if (id) {
        await DB.batch([
          DB.prepare(`UPDATE bookings SET status=?, source=?, name=?, phone=?, services=?, extras=?, title=?, date=?, time=?, start_min=?,
            duration=?, price=?, note=?, updated_at=?, customer_key=?, price_value=? WHERE id=?`)
            .bind(status, source, name, phone, JSON.stringify(svc.ids), JSON.stringify(svc.extras), title, date, time, toMin(time), duration, price, note, now,
              customerKey(name, phone), priceValue(price), id),
          ensureCustomer(DB, customerKey(name, phone))
        ]);
      } else {
        const [r] = await DB.batch([
          DB.prepare(`INSERT INTO bookings(ref, status, source, name, phone, services, extras, title, date, time, start_min, duration, price, note, visit, created_at, updated_at, customer_key, price_value)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .bind(newRef(), status, source, name, phone, JSON.stringify(svc.ids), JSON.stringify(svc.extras), title, date, time, toMin(time), duration, price, note, "", now, now,
              customerKey(name, phone), priceValue(price)),
          ensureCustomer(DB, customerKey(name, phone))
        ]);
        newId = r.meta.last_row_id;
      }
      const row = await DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(newId).first();
      return json({ ok: true, booking: bookingOut(row) });
    }

    case "status": {
      const status = String(input.status || "");
      if (!STATUSES.includes(status)) fail("Ungültiger Status.");
      await DB.prepare("UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?").bind(status, new Date().toISOString(), Number(input.id || 0)).run();
      return json({ ok: true });
    }

    case "delete": {
      await DB.prepare("DELETE FROM bookings WHERE id = ?").bind(Number(input.id || 0)).run();
      return json({ ok: true });
    }

    case "stats": {
      const days = 30, start = addDays(today, -(days - 1));
      const { results: pv } = await DB.prepare("SELECT day, COUNT(*) AS views, COUNT(DISTINCT hash) AS visitors FROM pageviews WHERE day >= ? GROUP BY day").bind(start).all();
      const byDay = Object.fromEntries(pv.map(r => [r.day, r]));
      const series = Array.from({ length: days }, (_, i) => {
        const d = addDays(start, i);
        return { day: d, views: Number(byDay[d]?.views || 0), visitors: Number(byDay[d]?.visitors || 0) };
      });
      const sum = n => series.slice(-n).reduce((a, x) => a + x.visitors, 0);
      const [sources, devices, today_, week, online30, online7] = await Promise.all([
        DB.prepare("SELECT source, COUNT(DISTINCT day || hash) AS n FROM pageviews WHERE day >= ? AND source != 'Intern' GROUP BY source ORDER BY n DESC LIMIT 6").bind(start).all(),
        DB.prepare("SELECT device, COUNT(DISTINCT day || hash) AS n FROM pageviews WHERE day >= ? GROUP BY device").bind(start).all(),
        DB.prepare("SELECT COUNT(*) AS n FROM bookings WHERE date = ? AND status IN ('pending','confirmed','done')").bind(today).first(),
        DB.prepare("SELECT COUNT(*) AS n FROM bookings WHERE date BETWEEN ? AND ? AND status IN ('pending','confirmed','done')").bind(today, addDays(today, 6)).first(),
        DB.prepare("SELECT COUNT(*) AS n FROM bookings WHERE source = 'online' AND created_at >= ?").bind(`${start}T00:00:00`).first(),
        DB.prepare("SELECT COUNT(*) AS n FROM bookings WHERE source = 'online' AND created_at >= ?").bind(`${addDays(today, -6)}T00:00:00`).first()
      ]);
      return json({ ok: true, series, visitorsToday: series[series.length - 1].visitors, visitors7: sum(7), visitors30: sum(30),
        views30: series.reduce((a, x) => a + x.views, 0), sources: sources.results, devices: devices.results,
        today: today_.n, week: week.n, online30: online30.n, online7: online7.n });
    }

    case "recent": {
      const { results } = await DB.prepare("SELECT * FROM bookings WHERE source = 'online' AND date >= ? AND status != 'cancelled' ORDER BY created_at DESC LIMIT 8").bind(today).all();
      return json({ ok: true, bookings: results.map(bookingOut) });
    }

    case "closed_list": {
      return json({ ok: true, dates: await closedDates(DB), editable: JSON.parse((await getSetting(DB, "closed_dates")) || "[]") });
    }

    case "closed_save": {
      const dates = [...new Set((Array.isArray(input.dates) ? input.dates : []).filter(validDate))]
        .filter(d => d >= addDays(today, -1)).sort().slice(0, 400);
      await setSetting(DB, "closed_dates", JSON.stringify(dates));
      let conflicts = [];
      if (dates.length) {
        const { results } = await DB.prepare(`SELECT date, COUNT(*) AS n FROM bookings WHERE status IN ('pending','confirmed')
          AND date IN (${dates.map(() => "?").join(",")}) GROUP BY date`).bind(...dates).all();
        conflicts = results;
      }
      return json({ ok: true, dates, conflicts });
    }

    case "export": {
      const { results } = await DB.prepare("SELECT ref, date, time, duration, name, phone, title, price, status, source, note, created_at FROM bookings ORDER BY date, time").all();
      const head = ["Nr.", "Datum", "Uhrzeit", "Dauer (Min.)", "Name", "Telefon", "Leistung", "Preis", "Status", "Gebucht über", "Notiz", "Eingegangen"];
      // Formel-Injection in Excel verhindern (Zellen, die mit = + - @ beginnen)
      const cell = v => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
      const csv = "﻿" + [head, ...results.map(r => Object.values(r))].map(row => row.map(cell).join(";")).join("\r\n") + "\r\n";
      return json({ ok: true, csv, count: results.length });
    }

    case "customers": {
      // Kundenliste: alles in einer Abfrage zusammengefasst (Name/Telefon aus dem jüngsten Termin)
      const q = clean(input.q, 60);
      const like = `%${q.replace(/[\\%_]/g, c => "\\" + c)}%`;
      const order = { last: "last_visit DESC NULLS LAST, c.id DESC", visits: "visits DESC, last_visit DESC", revenue: "revenue DESC, visits DESC", name: "name COLLATE NOCASE ASC", next: "next_at IS NULL, next_at ASC" }[String(input.sort)] || "last_visit DESC NULLS LAST, c.id DESC";
      const { results } = await DB.prepare(`
        SELECT c.id, c.note,
          (SELECT name FROM bookings x WHERE x.customer_key = c.ckey GROUP BY name ORDER BY COUNT(*) DESC, (name != lower(name)) DESC, MAX(date) DESC LIMIT 1) AS name,
          (SELECT phone FROM bookings x WHERE x.customer_key = c.ckey AND phone != '' GROUP BY phone ORDER BY COUNT(*) DESC, MAX(date) DESC LIMIT 1) AS phone,
          COUNT(b.id) AS total,
          SUM(CASE WHEN b.status IN ('cancelled','noshow') THEN 0 ELSE 1 END) AS visits,
          SUM(CASE WHEN b.status = 'noshow' THEN 1 ELSE 0 END) AS noshow,
          MIN(b.date) AS first_date,
          MAX(CASE WHEN (b.date < ?1 OR b.status = 'done') AND b.status NOT IN ('cancelled','noshow') THEN b.date END) AS last_visit,
          MIN(CASE WHEN b.date >= ?1 AND b.status IN ('pending','confirmed') THEN b.date || ' ' || b.time END) AS next_at,
          SUM(CASE WHEN (b.date < ?1 OR b.status = 'done') AND b.status NOT IN ('cancelled','noshow') THEN b.price_value ELSE 0 END) AS revenue
        FROM customers c JOIN bookings b ON b.customer_key = c.ckey
        WHERE ?2 = '' OR c.ckey IN (SELECT customer_key FROM bookings WHERE name LIKE ?3 ESCAPE '\\' OR phone LIKE ?3 ESCAPE '\\' OR ref LIKE ?3 ESCAPE '\\')
           OR CAST(c.id + 1000 AS TEXT) = ?2
           OR (?4 != '' AND substr(c.ckey, 1, instr(c.ckey, '|') - 1) LIKE '%' || ?4 || '%')
        GROUP BY c.id
        ORDER BY ${order}
        LIMIT 500`).bind(today, q, like, (q.replace(/\D/g, "").length >= 3 ? normPhone(q) : "")).all();
      return json({ ok: true, customers: results });
    }

    case "customer": {
      // Kundenkarte: per Kunden-ID oder über einen Termin (Link aus der Terminansicht)
      let c = null;
      if (input.bookingId) {
        const b = await DB.prepare("SELECT customer_key FROM bookings WHERE id = ?").bind(Number(input.bookingId)).first();
        if (b) c = await DB.prepare("SELECT * FROM customers WHERE ckey = ?").bind(b.customer_key).first();
      } else {
        c = await DB.prepare("SELECT * FROM customers WHERE id = ?").bind(Number(input.id || 0)).first();
      }
      if (!c) fail("Kundin nicht gefunden.", 404);
      const { results } = await DB.prepare("SELECT * FROM bookings WHERE customer_key = ? ORDER BY date DESC, time DESC").bind(c.ckey).all();
      return json({ ok: true, customer: { id: c.id, note: c.note, created_at: c.created_at }, bookings: results.map(bookingOut) });
    }

    case "customer_note": {
      const r = await DB.prepare("UPDATE customers SET note = ? WHERE id = ?").bind(clean(input.note, 2000), Number(input.id || 0)).run();
      if (!r.meta.changes) fail("Kundin nicht gefunden.", 404);
      return json({ ok: true });
    }

    case "catalog_get": {
      return json({ ok: true, catalog: await getCatalog(DB) });
    }

    case "catalog_save": {
      const catalog = validateCatalog(input.catalog);
      await setSetting(DB, "catalog", JSON.stringify(catalog));
      return json({ ok: true, catalog, public: publicCatalog(catalog) });
    }

    case "password": {
      if (!(await verifyPassword(String(input.current || ""), await getSetting(DB, "admin_hash")))) fail("Das aktuelle Passwort ist nicht korrekt.", 401);
      const pw = String(input.new || "");
      if (pw.length < MIN_PW) fail(`Das neue Passwort muss mindestens ${MIN_PW} Zeichen haben.`);
      await setSetting(DB, "admin_hash", await hashPassword(pw));
      // alle anderen Sitzungen beenden
      const t = readToken(request);
      await DB.prepare("DELETE FROM sessions WHERE token_hash != ?").bind(await sha256(t || "")).run();
      return json({ ok: true });
    }

    default:
      fail("Unbekannte Aktion.", 404);
  }
});
