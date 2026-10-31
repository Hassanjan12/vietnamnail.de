/** GET /api/slots?month=2026-11&dur=30 → freie Startzeiten je Tag des Monats */
import { handle, json, fail, db, closedDates, freeSlots, addDays } from "../../src/lib.js";

export const onRequestGet = handle(async ({ request, env }) => {
  const url = new URL(request.url);
  const month = url.searchParams.get("month") || "";
  const dur = Math.max(15, Math.min(480, parseInt(url.searchParams.get("dur") || "30", 10) || 30));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail("Ungültiger Monat.");
  const DB = await db(env);
  const closed = await closedDates(DB);
  // alle aktiven Termine des Monats in einer Abfrage
  const { results } = await DB.prepare("SELECT date, start_min, duration FROM bookings WHERE date LIKE ? AND status IN ('pending','confirmed')").bind(`${month}-%`).all();
  const byDay = {};
  for (const r of results) (byDay[r.date] ||= []).push([r.start_min, r.start_min + r.duration]);
  const days = {};
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) days[d] = freeSlots(d, dur, byDay[d] || [], closed);
  return json({ ok: true, days, closed: closed.filter(x => x.startsWith(month)) });
});
