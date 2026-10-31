/**
 * POST /api/track – anonyme Besucherzählung ohne Cookies.
 * Gespeichert wird nur ein Hash aus (Tagesschlüssel + IP + Browser); der Schlüssel wechselt täglich.
 */
import { db, getSetting, setSetting, sha256, randomHex, berlinNow } from "../lib.js";

const MAP = { google: "Google", instagram: "Instagram", facebook: "Facebook", "fb.": "Facebook", tiktok: "TikTok", bing: "Bing",
  whatsapp: "WhatsApp", "wa.me": "WhatsApp", maps: "Google Maps", duckduckgo: "DuckDuckGo" };

export const onRequestPost = async ({ request, env }) => {
  try {
    const ua = request.headers.get("User-Agent") || "";
    if (!ua || /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor/i.test(ua)) return new Response(null, { status: 204 });
    let input = {};
    try { input = JSON.parse((await request.text()).slice(0, 2000) || "{}"); } catch (_) { /* leer */ }
    const path = String(input.p || "/").replace(/[^\w\-/.#]/g, "").slice(0, 120) || "/";
    let host = "";
    try { host = new URL(String(input.r || "")).hostname.toLowerCase(); } catch (_) { /* kein Referrer */ }
    const self = new URL(request.url).hostname.toLowerCase();
    let source = "Direkt";
    if (host && host !== self) {
      source = host.replace(/^www\./, "");
      for (const [k, v] of Object.entries(MAP)) if (host.includes(k)) { source = v; break; }
    } else if (host === self) source = "Intern";

    const DB = await db(env);
    const day = berlinNow().date;
    let salt = (await getSetting(DB, "salt_day")) === day ? await getSetting(DB, "salt") : null;
    if (!salt) { await setSetting(DB, "salt_day", day); salt = await setSetting(DB, "salt", randomHex(16)); }
    const hash = (await sha256(`${salt}|${request.headers.get("CF-Connecting-IP") || ""}|${ua}`)).slice(0, 24);
    const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobil" : "desktop";
    // Schutz gegen künstliches Aufblähen: max. 200 Aufrufe je Besucher und Tag
    const n = await DB.prepare("SELECT COUNT(*) AS n FROM pageviews WHERE day = ? AND hash = ?").bind(day, hash).first();
    if ((n?.n || 0) < 200) {
      await DB.prepare("INSERT INTO pageviews(day, hash, path, source, device, ts) VALUES(?, ?, ?, ?, ?, ?)")
        .bind(day, hash, path, source, device, Math.floor(Date.now() / 1000)).run();
    }
  } catch (e) { console.error("track", e); }
  return new Response(null, { status: 204 });
};
