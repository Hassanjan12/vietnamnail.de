/**
 * /assets/img/site/* → eigenes Foto aus der Datenbank, wenn eines hochgeladen wurde, sonst die Standard-Datei.
 * Fällt bei jedem Fehler auf die Standard-Datei zurück, damit die Website nie ohne Bilder dasteht.
 */
import { db, fromB64, SITE_FILES } from "../lib.js";

const CC = "public, max-age=300"; // Änderungen sind spätestens nach 5 Minuten für alle sichtbar
let ov = { t: 0, set: new Set() };
export const forgetSiteOverrides = () => { ov = { t: 0, set: new Set() }; };

async function overrides(env) {
  if (Date.now() - ov.t < 60000) return ov.set;
  const DB = await db(env);
  const { results } = await DB.prepare("SELECT slot, size FROM site_images").all();
  ov = { t: Date.now(), set: new Set(results.map(r => `${r.slot}|${r.size}`)) };
  return ov.set;
}

/** Zwischengespeicherte Kopien eines Bereichs entfernen (nach Änderung oder Zurücksetzen) */
export async function purgeSiteImage(origin, slot) {
  try {
    if (typeof caches === "undefined") return;
    await Promise.all(Object.entries(SITE_FILES).filter(([, v]) => v[0] === slot)
      .map(([file]) => caches.default.delete(new Request(`${origin}/assets/img/site/${file}`))));
  } catch (_) { /* nicht kritisch */ }
}

export async function onSiteImage({ request, env, ctx }) {
  const url = new URL(request.url);
  const key = SITE_FILES[url.pathname.slice("/assets/img/site/".length)];
  const standard = async () => {
    const r = await env.ASSETS.fetch(request);
    if (r.status !== 200) return r;
    const h = new Headers(r.headers);
    h.set("Cache-Control", CC);
    return new Response(r.body, { status: 200, headers: h });
  };
  if (!key) return standard();
  try {
    if (!(await overrides(env)).has(key.join("|"))) return standard();
    const cache = typeof caches !== "undefined" ? caches.default : null, ck = new Request(url.origin + url.pathname);
    if (cache) { const hit = await cache.match(ck); if (hit) return hit; }
    const DB = await db(env);
    const r = await DB.prepare("SELECT mime, b64 FROM site_images WHERE slot = ? AND size = ?").bind(key[0], key[1]).first();
    if (!r) return standard();
    const res = new Response(fromB64(r.b64), { headers: { "Content-Type": r.mime, "Cache-Control": CC, "X-Content-Type-Options": "nosniff" } });
    if (cache && ctx) ctx.waitUntil(cache.put(ck, res.clone()));
    return res;
  } catch (e) {
    console.error("site image", e);
    return standard();
  }
}
