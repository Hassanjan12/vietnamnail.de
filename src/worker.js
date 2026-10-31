/**
 * Vietnam Nails – Cloudflare Worker.
 * /api/* läuft hier; alles andere (Website, Admin-Oberfläche, Bilder) liefert Cloudflare direkt aus „public/“ aus.
 */
import * as slots from "./api/slots.js";
import * as book from "./api/book.js";
import * as track from "./api/track.js";
import * as admin from "./api/admin.js";

const ROUTES = {
  "/api/slots": { GET: slots.onRequestGet },
  "/api/book": { POST: book.onRequestPost },
  "/api/track": { POST: track.onRequestPost },
  "/api/admin": { POST: admin.onRequestPost }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
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
