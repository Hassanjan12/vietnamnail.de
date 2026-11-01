/**
 * Vietnam Nails – gemeinsame Funktionen für die Cloudflare Pages Functions.
 * Datenbank: Cloudflare D1 (Binding „DB“). Tabellen werden beim ersten Aufruf automatisch angelegt.
 */
import salon from "../public/assets/salon.json";

export { salon };
export const STATUSES = ["pending", "confirmed", "done", "cancelled", "noshow"];
export const SOURCES = ["online", "telefon", "vorort", "whatsapp", "instagram"];
const ACTIVE = "('pending','confirmed')";

/* ---------- Antworten ---------- */

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { ...HEADERS, ...headers } });
export const fail = (message, status = 400, extra = {}) => { throw new HttpError(status, message, extra); };

/** Hüllt einen Handler ein: Fehler werden als JSON zurückgegeben, technische Details nie an den Browser. */
export const handle = fn => async ctx => {
  try {
    if (!ctx.env.DB) throw new Error("D1-Datenbank ist nicht verbunden (Binding „DB“ fehlt).");
    return await fn(ctx);
  } catch (e) {
    if (e instanceof HttpError) return json({ ok: false, error: e.message, ...e.extra }, e.status);
    console.error("Vietnam Nails API:", e && e.stack || e);
    return json({ ok: false, error: "Technischer Fehler. Bitte versuchen Sie es später erneut oder rufen Sie uns an: 0345 686 739 49" }, 500);
  }
};

export async function readJson(request, max = 20000) {
  const text = await request.text();
  if (text.length > max) fail("Anfrage zu groß.", 413);
  try { const d = JSON.parse(text || "{}"); return d && typeof d === "object" ? d : {}; } catch (_) { return {}; }
}

/* ---------- Zeit (immer deutsche Zeit, egal wo Cloudflare den Code ausführt) ---------- */

export function berlinNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
export const toMin = hm => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
export const toHM = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dow = ymd => new Date(`${ymd}T12:00:00Z`).getUTCDay();
export const validDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;
export const validTime = s => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);

/* ---------- Krypto ---------- */

const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export async function sha256(text) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export const randomHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");

const PBKDF2_ITER = 30000; // passt in die 10 ms Rechenzeit des kostenlosen Cloudflare-Tarifs
async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(await pbkdf2(password, salt, PBKDF2_ITER))}`;
}
export async function verifyPassword(password, stored) {
  const [kind, iter, salt, hash] = String(stored || "").split("$");
  if (kind !== "pbkdf2") return false;
  const a = new Uint8Array(await pbkdf2(password, unb64(salt), Number(iter)));
  const b = unb64(hash);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; // zeitkonstanter Vergleich
  return diff === 0;
}

/* ---------- Datenbank ---------- */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed',
    source TEXT NOT NULL DEFAULT 'online', name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
    services TEXT NOT NULL DEFAULT '[]', extras TEXT NOT NULL DEFAULT '[]', title TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL, time TEXT NOT NULL, start_min INTEGER NOT NULL, duration INTEGER NOT NULL DEFAULT 30,
    price TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', visit TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date)`,
  `CREATE TABLE IF NOT EXISTS pageviews (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, hash TEXT NOT NULL,
    path TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_pv_day ON pageviews(day, hash)`,
  `CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS hits (k TEXT NOT NULL, ts INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_hits ON hits(k, ts)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, ckey TEXT UNIQUE NOT NULL,
    note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`,
  // Galerie: Metadaten getrennt von den Bilddaten, damit Listen schnell bleiben
  `CREATE TABLE IF NOT EXISTS photos (id INTEGER PRIMARY KEY AUTOINCREMENT, sort INTEGER NOT NULL DEFAULT 0,
    cat TEXT NOT NULL DEFAULT 'elegant', title TEXT NOT NULL DEFAULT '', sub TEXT NOT NULL DEFAULT '',
    static TEXT, mime TEXT NOT NULL DEFAULT 'image/webp', w INTEGER NOT NULL DEFAULT 700, h INTEGER NOT NULL DEFAULT 900,
    created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS photo_data (id INTEGER NOT NULL, size TEXT NOT NULL, b64 TEXT NOT NULL, PRIMARY KEY (id, size))`
];

/* ---------- Galerie ---------- */

export const PHOTO_CATS = { elegant: "Elegant", color: "Farbe", art: "Nail Art", lash: "Wimpern" };
// Startbilder (liegen als Dateien in public/assets/img/gallery) – werden beim ersten Aufruf in die Galerie übernommen
const GALLERY_SEED = [
  ["rosa-marmor-gold", "elegant", "Rosé & Marmor", "Blattgold", 933], ["stiletto-tuerkis-gold", "art", "Stiletto", "Türkis, Gold & Cat-Eye", 875],
  ["nude-glitzer-schleifen", "elegant", "Mandelform", "Nude, Glitzer & Schleifen", 933], ["tuerkis-3d-blumen", "color", "Ombré", "Türkis mit 3D-Blüten", 658],
  ["halloween-patchwork", "art", "Handgemalt", "Patchwork Nail Art", 933], ["perlmutt-chrome", "elegant", "Chrome", "Perlmutt-Effekt", 761],
  ["hellblau-goldfolie", "color", "Coffin", "Hellblau mit Goldfolie", 1244], ["stiletto-blau-rosen", "art", "3D-Modellage", "Stiletto mit Rosen", 786],
  ["marmor-weiss-muster", "elegant", "Marmor", "Milchweiß mit Ornament", 933], ["blau-ombre-glitzer", "color", "Ombré", "Blau mit Glitzerlinien", 733],
  ["halloween-kitty", "art", "Character Art", "French mit 3D-Details", 933], ["nude-braun-blume", "elegant", "3D-Blüte", "Nude & Braun", 743],
  ["tuerkis-schwarz-schleifen", "color", "Statement", "Türkis & Schwarz", 934], ["nude-weiss-ombre", "elegant", "Babyboomer", "Nude mit weißem Ombré", 844],
  ["wimpern", "lash", "Wimpern", "Volumen-Verlängerung", 941]
];

async function seedGallery(DB) {
  if (await getSetting(DB, "gallery_seeded")) return;
  const now = new Date().toISOString();
  await DB.batch([
    ...GALLERY_SEED.map(([f, cat, title, sub, h], i) =>
      DB.prepare("INSERT INTO photos(sort, cat, title, sub, static, mime, w, h, created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(i + 1, cat, title, sub, f, "image/webp", 700, h, now)),
    DB.prepare("INSERT INTO settings(k, v) VALUES('gallery_seeded', '1') ON CONFLICT(k) DO NOTHING")
  ]);
}

/** Galerie für Website und Admin (ohne Bilddaten, mit fertigen Bild-Adressen) */
export async function galleryList(DB) {
  await seedGallery(DB);
  const { results } = await DB.prepare("SELECT id, sort, cat, title, sub, static, mime, w, h, created_at FROM photos ORDER BY sort, id").all();
  return results.map(r => ({
    id: r.id, cat: r.cat, title: r.title, sub: r.sub, w: r.w, h: r.h, uploaded: !r.static,
    sm: r.static ? `/assets/img/gallery/${r.static}-sm.webp` : `/api/photo/${r.id}/sm`,
    lg: r.static ? `/assets/img/gallery/${r.static}.webp` : `/api/photo/${r.id}/lg`
  }));
}

/** Bytes ↔ Base64 (in Stücken, damit auch große Bilder schnell gehen) */
export function toB64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function fromB64(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- Kunden ---------- */

/** Telefonnummer vereinheitlichen: nur Ziffern, deutsche Vorwahl (0170… → 49170…) */
export function normPhone(p) {
  let d = String(p || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "49" + d.slice(1);
  return d.replace(/\D/g, "");
}
/** Eine Kundin = gleicher Name + gleiche Telefonnummer (Groß-/Kleinschreibung und Leerzeichen egal) */
export const customerKey = (name, phone) =>
  `${normPhone(phone)}|${String(name || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()}`;
/** Preis als Zahl für die (ungefähre) Umsatzsumme: erste Zahl im Preistext, z. B. „ab 38 €“ → 38 */
export const priceValue = text => { const m = String(text || "").match(/\d+/); return m ? Number(m[0]) : 0; };
export const ensureCustomer = (DB, key) =>
  // NOT EXISTS verhindert Lücken in den Kundennummern, OR IGNORE schützt vor Fehlern bei gleichzeitigen Buchungen
  DB.prepare("INSERT OR IGNORE INTO customers(ckey, created_at) SELECT ?1, ?2 WHERE NOT EXISTS (SELECT 1 FROM customers WHERE ckey = ?1)")
    .bind(key, new Date().toISOString());

/** Spalten für Kunden nachrüsten und bestehende Termine einmalig zuordnen */
async function migrate(DB) {
  const { results: cols } = await DB.prepare("PRAGMA table_info(bookings)").all();
  const has = n => cols.some(c => c.name === n);
  const alter = [];
  if (!has("customer_key")) alter.push(DB.prepare("ALTER TABLE bookings ADD COLUMN customer_key TEXT"));
  if (!has("price_value")) alter.push(DB.prepare("ALTER TABLE bookings ADD COLUMN price_value INTEGER NOT NULL DEFAULT 0"));
  if (alter.length) await DB.batch(alter);
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_key)").run();
  for (let round = 0; round < 20; round++) {
    const { results } = await DB.prepare("SELECT id, name, phone, price FROM bookings WHERE customer_key IS NULL LIMIT 200").all();
    if (!results.length) break;
    const stmts = [];
    for (const r of results) {
      const k = customerKey(r.name, r.phone);
      stmts.push(DB.prepare("UPDATE bookings SET customer_key = ?, price_value = ? WHERE id = ?").bind(k, priceValue(r.price), r.id));
      stmts.push(ensureCustomer(DB, k));
    }
    await DB.batch(stmts);
  }
}
let ready = null;

export async function db(env) {
  if (!ready) {
    ready = (async () => {
      await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
      await migrate(env.DB);
      await cleanup(env.DB);
    })().catch(e => { ready = null; throw e; });
  }
  await ready;
  return env.DB;
}

export async function getSetting(DB, k) {
  const r = await DB.prepare("SELECT v FROM settings WHERE k = ?").bind(k).first();
  return r ? r.v : null;
}
export async function setSetting(DB, k, v) {
  await DB.prepare("INSERT INTO settings(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v).run();
  return v;
}

/** Einmal täglich: Termine nach 12 Monaten, Statistik nach 14 Monaten, alte Sitzungen und Zähler löschen. */
async function cleanup(DB) {
  const today = berlinNow().date;
  if (await getSetting(DB, "cleanup_day") === today) return;
  const now = Math.floor(Date.now() / 1000);
  await DB.batch([
    DB.prepare("INSERT INTO settings(k, v) VALUES('cleanup_day', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(today),
    DB.prepare("DELETE FROM bookings WHERE date < ?").bind(addDays(today, -365)),
    DB.prepare("DELETE FROM pageviews WHERE day < ?").bind(addDays(today, -426)),
    DB.prepare("DELETE FROM sessions WHERE expires < ?").bind(now),
    DB.prepare("DELETE FROM hits WHERE ts < ?").bind(now - 86400),
    // Kundenkarten ohne verbleibende Termine entfernen (gleiche 12-Monats-Frist)
    DB.prepare("DELETE FROM customers WHERE ckey NOT IN (SELECT customer_key FROM bookings WHERE customer_key IS NOT NULL)"),
    DB.prepare("DELETE FROM photo_data WHERE id NOT IN (SELECT id FROM photos)")
  ]);
}

async function secret(DB) {
  return (await getSetting(DB, "secret")) || setSetting(DB, "secret", randomHex(32));
}
export async function clientKey(DB, request) {
  return sha256(`${await secret(DB)}|${request.headers.get("CF-Connecting-IP") || ""}`);
}

/** Max. `max` Aufrufe je `window` Sekunden pro Internetanschluss. */
export async function rateLimit(DB, request, bucket, max, window) {
  const k = `${bucket}:${await clientKey(DB, request)}`;
  const now = Math.floor(Date.now() / 1000);
  const r = await DB.prepare("SELECT COUNT(*) AS n FROM hits WHERE k = ? AND ts > ?").bind(k, now - window).first();
  if ((r?.n || 0) >= max) fail("Zu viele Versuche. Bitte später erneut versuchen.", 429);
  await DB.prepare("INSERT INTO hits(k, ts) VALUES(?, ?)").bind(k, now).run();
}

/* ---------- Öffnungszeiten & Verfügbarkeit ---------- */

export async function closedDates(DB) {
  const extra = JSON.parse((await getSetting(DB, "closed_dates")) || "[]");
  return [...new Set([...(salon.closedDates || []), ...extra])].sort();
}

export const hoursFor = (date, closed) => closed.includes(date) ? null : (salon.hours[String(dow(date))] || null);

export async function busy(DB, date, excludeId = null) {
  const { results } = await DB.prepare(`SELECT id, start_min, duration FROM bookings WHERE date = ? AND status IN ${ACTIVE}`).bind(date).all();
  return results.filter(r => r.id !== excludeId).map(r => [r.start_min, r.start_min + r.duration]);
}

export function fits(busyList, start, dur, cap) {
  for (let t = start; t < start + dur; t += 5) {
    let n = 0;
    for (const [a, b] of busyList) if (a <= t && t < b) n++;
    if (n >= cap) return false;
  }
  return true;
}

/** Freie Startzeiten eines Tages (berücksichtigt Öffnungszeit, letzten Terminbeginn, Vorlauf, Plätze). */
export function freeSlots(date, dur, busyList, closed) {
  const h = hoursFor(date, closed);
  if (!h) return [];
  const now = berlinNow();
  if (date < now.date || date > addDays(now.date, Number(salon.daysAhead))) return [];
  const [o, c] = [toMin(h[0]), toMin(h[1])];
  const last = h[2] ? toMin(h[2]) : c;
  const earliest = date === now.date ? now.minutes + Number(salon.leadMinutes) : -1;
  const cap = Math.max(1, Number(salon.capacity) || 1);
  const starts = [];
  for (let m = o; m <= last; m += Number(salon.slotStep)) starts.push(m);
  if (h[2] && !starts.includes(last)) starts.push(last);
  return starts.filter(m => m >= earliest && m + dur <= c && fits(busyList, m, dur, cap)).map(toHM);
}

/* ---------- Leistungen & Preise (im Admin bearbeitbar) ---------- */

/** Preistext einer Leistung: „33 €“, „ab 29 €“ oder „auf Anfrage“ */
export const itemPrice = i => (i.price === null || i.price === undefined || i.price === "") ? "auf Anfrage" : `${i.from ? "ab " : ""}${i.price} €`;
/** Preistext eines Extras: „+5 €“, „+3–10 €“ oder „ab 10 €“ */
export const extraLabel = x => x.from ? `ab ${x.min} €` : (x.max ? `+${x.min}–${x.max} €` : `+${x.min} €`);

/** Gespeicherter Katalog aus der Datenbank, sonst die Startwerte aus salon.json */
export async function getCatalog(DB) {
  const raw = await getSetting(DB, "catalog");
  if (raw) { try { const c = JSON.parse(raw); if (c && Array.isArray(c.categories)) return c; } catch (_) { /* Startwerte */ } }
  return JSON.parse(JSON.stringify({ categories: salon.categories, extras: salon.extras }));
}

/** Für Website und Buchung: nur sichtbare Leistungen, mit fertigen Preistexten */
export function publicCatalog(cat) {
  return {
    categories: cat.categories.filter(c => !c.hidden)
      .map(c => ({ id: c.id, label: c.label, desc: c.desc || "", items: c.items.filter(i => !i.hidden).map(i => ({ ...i, priceText: itemPrice(i) })) }))
      .filter(c => c.items.length),
    extras: (cat.extras || []).filter(x => !x.hidden).map(x => ({ ...x, label: extraLabel(x) }))
  };
}

const ID_RE = /^[a-z0-9-]{1,40}$/;
const slug = t => String(t).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "leistung";

/** Eingaben aus dem Admin prüfen und bereinigen (bestehende IDs bleiben, damit alte Termine passen) */
export function validateCatalog(input) {
  const used = new Set();
  const uid = (id, name) => {
    let v = typeof id === "string" && ID_RE.test(id) && !used.has(id) ? id : null;
    while (!v || used.has(v)) v = `${slug(name)}-${randomHex(2)}`;
    used.add(v);
    return v;
  };
  const num = (v, lo, hi, what) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Math.round(Number(String(v).replace(",", ".")));
    if (!Number.isFinite(n) || n < lo || n > hi) fail(`${what}: bitte eine Zahl zwischen ${lo} und ${hi} eingeben.`);
    return n;
  };
  const cats = (Array.isArray(input?.categories) ? input.categories : []).slice(0, 20).map(c => {
    const label = clean(c.label, 40);
    if (!label) fail("Jede Kategorie braucht einen Namen.");
    const items = (Array.isArray(c.items) ? c.items : []).slice(0, 40).map(i => {
      const name = clean(i.name, 80);
      if (!name) fail(`Bitte jeder Leistung in „${label}“ einen Namen geben.`);
      const dur = num(i.dur, 15, 480, `Dauer bei „${name}“`) ?? 30;
      return { id: uid(i.id, name), name, meta: clean(i.meta, 120), price: num(i.price, 0, 9999, `Preis bei „${name}“`),
        from: !!i.from, dur, hidden: !!i.hidden };
    });
    return { id: uid(c.id, label), label, desc: clean(c.desc, 200), hidden: !!c.hidden, items };
  });
  if (!cats.length) fail("Es muss mindestens eine Kategorie geben.");
  const extras = (Array.isArray(input?.extras) ? input.extras : []).slice(0, 40).map(x => {
    const name = clean(x.name, 80);
    if (!name) fail("Bitte jedem Extra einen Namen geben.");
    const min = num(x.min, 0, 999, `Preis bei „${name}“`) ?? 0;
    let max = num(x.max, 0, 999, `Bis-Preis bei „${name}“`);
    if (max !== null && max <= min) max = null;
    return { id: uid(x.id, name), name, meta: clean(x.meta, 80), min, max, from: !!x.from, hidden: !!x.hidden };
  });
  return { categories: cats, extras };
}

/** Leistungen auflösen → Titel, Dauer, Preistext. Online-Buchung: ausgeblendete Leistungen sind nicht buchbar. */
export function resolve(serviceIds, extraIds, catalog, allowHidden = false) {
  const items = {}, extras = {};
  catalog.categories.forEach(c => c.items.forEach(i => { if (allowHidden || (!i.hidden && !c.hidden)) items[i.id] = i; }));
  (catalog.extras || []).forEach(x => { if (allowHidden || !x.hidden) extras[x.id] = x; });
  const ids = [], xids = [], names = [];
  let dur = 0, sum = 0, from = false, request = false;
  for (const id of Array.isArray(serviceIds) ? serviceIds : []) {
    const i = items[id]; if (!i || ids.includes(id)) continue;
    ids.push(id); names.push(i.name); dur += Number(i.dur) || 30;
    if (i.price === null || i.price === undefined) request = true; else { sum += Number(i.price); if (i.from) from = true; }
  }
  for (const id of Array.isArray(extraIds) ? extraIds : []) {
    const x = extras[id]; if (!x || xids.includes(id)) continue;
    xids.push(id); sum += Number(x.min); if (x.from || x.max) from = true;
  }
  let price = sum ? `${from ? "ab " : ""}${sum} €` : (request ? "auf Anfrage" : "");
  if (sum && request) price += " + auf Anfrage";
  return { ids, extras: xids, title: names.join(" + "), duration: dur, price };
}

export function newRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = crypto.getRandomValues(new Uint8Array(5));
  return "VN-" + [...r].map(b => chars[b % chars.length]).join("");
}

/**
 * Termin nur speichern, wenn zu jedem Zeitpunkt noch ein Platz frei ist – in EINER SQL-Anweisung,
 * damit gleichzeitige Buchungen sich nicht überholen können (D1 führt Schreibzugriffe nacheinander aus).
 * Die höchste Belegung liegt immer am eigenen Beginn oder am Beginn eines anderen Termins im Zeitraum.
 */
export async function insertIfFree(DB, b, cap) {
  const sql = `INSERT INTO bookings (ref, status, source, name, phone, services, extras, title, date, time, start_min, duration, price, note, visit, created_at, updated_at, customer_key, price_value)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16, ?18, ?19
    WHERE NOT EXISTS (
      SELECT 1 FROM (
        SELECT ?11 AS p
        UNION SELECT start_min FROM bookings WHERE date = ?9 AND status IN ${ACTIVE} AND start_min > ?11 AND start_min < ?11 + ?12
      ) pts
      WHERE (SELECT COUNT(*) FROM bookings x WHERE x.date = ?9 AND x.status IN ${ACTIVE}
             AND x.start_min <= pts.p AND x.start_min + x.duration > pts.p) >= ?17
    )`;
  const r = await DB.prepare(sql).bind(b.ref, b.status, b.source, b.name, b.phone, JSON.stringify(b.services), JSON.stringify(b.extras),
    b.title, b.date, b.time, toMin(b.time), b.duration, b.price, b.note, b.visit, new Date().toISOString(), cap,
    customerKey(b.name, b.phone), priceValue(b.price)).run();
  if (r.meta.changes === 1) await ensureCustomer(DB, customerKey(b.name, b.phone)).run();
  return r.meta.changes === 1;
}

export function bookingOut(r) {
  return { ...r, id: Number(r.id), duration: Number(r.duration), services: JSON.parse(r.services || "[]"), extras: JSON.parse(r.extras || "[]") };
}
