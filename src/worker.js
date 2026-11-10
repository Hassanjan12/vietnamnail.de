/**
 * Vietnam Nails – Cloudflare Worker.
 * /api/* läuft hier; alles andere (Website, Admin-Oberfläche, Bilder) liefert Cloudflare direkt aus „public/“ aus.
 */
import * as slots from "./api/slots.js";
import * as book from "./api/book.js";
import * as track from "./api/track.js";
import * as admin from "./api/admin.js";
import * as catalog from "./api/catalog.js";
import * as gallery from "./api/gallery.js";

const ROUTES = {
  "/api/slots": { GET: slots.onRequestGet },
  "/api/book": { POST: book.onRequestPost },
  "/api/track": { POST: track.onRequestPost },
  "/api/admin": { POST: admin.onRequestPost },
  "/api/catalog": { GET: catalog.onRequestGet },
  "/api/gallery": { GET: gallery.onGalleryGet },
  "/api/admin/photo": { POST: admin.onPhotoUpload },
  "/api/admin/staff-photo": { POST: admin.onStaffPhotoUpload }
};

/**
 * Studio-Video mit „Range“-Unterstützung (in Stücken). Safari auf dem iPhone spielt Videos nur so ab;
 * die statischen Dateien von Cloudflare liefern immer die ganze Datei.
 */
const VIDEOS = { "/api/video/studio.mp4": "/assets/video/studio.mp4" };
async function serveVideo(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  const asset = await env.ASSETS.fetch(new Request(new URL(VIDEOS[url.pathname], url)));
  if (!asset.ok) return new Response("Nicht gefunden", { status: 404 });
  const buf = new Uint8Array(await asset.arrayBuffer()), size = buf.length;
  const headers = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=604800", "X-Content-Type-Options": "nosniff" };
  const head = request.method === "HEAD";
  const m = /^bytes=(\d*)-(\d*)$/.exec((request.headers.get("Range") || "").trim());
  if (m && (m[1] || m[2])) {
    let start, end;
    if (m[1] === "") { start = Math.max(0, size - Number(m[2])); end = size - 1; } // letzte n Bytes
    else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(head ? null : buf.subarray(start, end + 1), {
      status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) }
    });
  }
  return new Response(head ? null : buf, { headers: { ...headers, "Content-Length": String(size) } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (VIDEOS[url.pathname]) return serveVideo(request, env, url);
    if (url.pathname.startsWith("/api/booking-photo/")) {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET" } });
      return admin.onBookingPhotoGet({ request, env });
    }
    if (url.pathname.startsWith("/api/staff-photo/")) {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET" } });
      return gallery.onStaffPhotoGet({ request, env });
    }
    if (url.pathname.startsWith("/api/photo/")) {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET" } });
      return gallery.onPhotoGet({ request, env, ctx });
    }
    if (url.pathname.startsWith("/api/")) {
      const route = ROUTES[url.pathname];
      const handler = route && route[request.method];
      if (!handler) {
        return new Response(JSON.stringify({ ok: false, error: route ? "Methode nicht erlaubt." : "Nicht gefunden." }), {
          status: route ? 405 : 404,
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(route ? { Allow: Object.keys(route).join(", ") } : {}) }
        });
      }
      return handler({ request, env, ctx });
    }
    return env.ASSETS.fetch(request);
  }
};
