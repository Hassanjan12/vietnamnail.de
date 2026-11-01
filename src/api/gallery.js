/** GET /api/gallery → Galerie-Liste;  GET /api/photo/:id/:size → hochgeladenes Bild (mit Zwischenspeicher) */
import { handle, json, db, galleryList, fromB64 } from "../lib.js";

export const onGalleryGet = handle(async ({ env }) => {
  const DB = await db(env);
  return json({ ok: true, photos: await galleryList(DB) });
});

export async function onPhotoGet({ request, env, ctx }) {
  const m = new URL(request.url).pathname.match(/^\/api\/photo\/(\d+)\/(sm|lg)$/);
  if (!m) return new Response("Nicht gefunden", { status: 404 });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) { const hit = await cache.match(request); if (hit) return hit; }
  try {
    const DB = await db(env);
    const r = await DB.prepare("SELECT p.mime, d.b64 FROM photos p JOIN photo_data d ON d.id = p.id WHERE p.id = ? AND d.size = ?").bind(Number(m[1]), m[2]).first();
    if (!r) return new Response("Nicht gefunden", { status: 404, headers: { "Cache-Control": "no-store" } });
    // Bild-IDs werden nie wiederverwendet → darf dauerhaft zwischengespeichert werden
    const res = new Response(fromB64(r.b64), { headers: { "Content-Type": r.mime, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
    if (cache && ctx) ctx.waitUntil(cache.put(request, res.clone()));
    return res;
  } catch (e) {
    console.error("photo", e);
    return new Response("Fehler", { status: 500 });
  }
}
