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
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL)`
];
let ready = null;

export async function db(env) {
  if (!ready) {
    ready = (async () => {
      await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
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
    DB.prepare("DELETE FROM hits WHERE ts < ?").bind(now - 86400)
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

/** Leistungen aus dem Katalog auflösen → Titel, Dauer, Preistext */
export function resolve(serviceIds, extraIds) {
  const items = {}, extras = {};
  salon.categories.forEach(c => c.items.forEach(i => { items[i.id] = i; }));
  salon.extras.forEach(x => { extras[x.id] = x; });
  const ids = [], xids = [], names = [];
  let dur = 0, sum = 0, from = false, request = false;
  for (const id of Array.isArray(serviceIds) ? serviceIds : []) {
    const i = items[id]; if (!i || ids.includes(id)) continue;
    ids.push(id); names.push(i.name); dur += Number(i.dur);
    if (i.price === null) request = true; else sum += Number(i.price);
  }
  for (const id of Array.isArray(extraIds) ? extraIds : []) {
    const x = extras[id]; if (!x || xids.includes(id)) continue;
    xids.push(id); sum += Number(x.min); if (x.from) from = true;
  }
  let price = sum ? `${from ? "ab " : ""}${sum} €` : (request ? "auf Anfrage" : "");
  if (sum && request) price += " + Wimpern";
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
  const sql = `INSERT INTO bookings (ref, status, source, name, phone, services, extras, title, date, time, start_min, duration, price, note, visit, created_at, updated_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16
    WHERE NOT EXISTS (
      SELECT 1 FROM (
        SELECT ?11 AS p
        UNION SELECT start_min FROM bookings WHERE date = ?9 AND status IN ${ACTIVE} AND start_min > ?11 AND start_min < ?11 + ?12
      ) pts
      WHERE (SELECT COUNT(*) FROM bookings x WHERE x.date = ?9 AND x.status IN ${ACTIVE}
             AND x.start_min <= pts.p AND x.start_min + x.duration > pts.p) >= ?17
    )`;
  const r = await DB.prepare(sql).bind(b.ref, b.status, b.source, b.name, b.phone, JSON.stringify(b.services), JSON.stringify(b.extras),
    b.title, b.date, b.time, toMin(b.time), b.duration, b.price, b.note, b.visit, new Date().toISOString(), cap).run();
  return r.meta.changes === 1;
}

export function bookingOut(r) {
  return { ...r, id: Number(r.id), duration: Number(r.duration), services: JSON.parse(r.services || "[]"), extras: JSON.parse(r.extras || "[]") };
}
