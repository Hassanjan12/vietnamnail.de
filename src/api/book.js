/** POST /api/book → neue Online-Buchung (sofort fest gebucht) */
import { handle, json, fail, readJson, db, rateLimit, clean, validDate, validTime, resolve, busy, closedDates, freeSlots, insertIfFree, newRef, salon } from "../lib.js";

export const onRequestPost = handle(async ({ request, env }) => {
  const input = await readJson(request);
  if (input.website) return json({ ok: true, ref: "VN-00000" }); // Honeypot gegen Spam-Bots
  const DB = await db(env);
  await rateLimit(DB, request, "book", 10, 3600);

  const name = clean(input.name, 80), phone = clean(input.phone, 40), note = clean(input.note, 1000), visit = clean(input.visit, 40);
  const date = String(input.date || ""), time = String(input.time || "");
  if (name.length < 2) fail("Bitte geben Sie Ihren Namen an.");
  if (phone.replace(/\D/g, "").length < 6) fail("Bitte geben Sie eine gültige Telefonnummer an.");
  if (!input.consent) fail("Bitte bestätigen Sie die Datenschutzhinweise.");
  if (!validDate(date) || !validTime(time)) fail("Ungültiger Termin.");

  const svc = resolve(input.services, input.extras);
  if (!svc.ids.length) fail("Bitte wählen Sie eine Leistung.");
  const duration = Math.max(30, svc.duration);

  const taken = () => fail("Dieser Termin ist leider gerade vergeben. Bitte wählen Sie eine andere Zeit.", 409, { code: "taken" });
  if (!freeSlots(date, duration, await busy(DB, date), await closedDates(DB)).includes(time)) taken();

  const booking = { status: "confirmed", source: "online", name, phone, services: svc.ids, extras: svc.extras, title: svc.title,
    date, time, duration, price: svc.price, note, visit };
  for (let attempt = 0; attempt < 3; attempt++) {
    booking.ref = newRef();
    try {
      if (!(await insertIfFree(DB, booking, Math.max(1, Number(salon.capacity) || 1)))) taken();
      return json({ ok: true, ref: booking.ref });
    } catch (e) {
      if (!String(e && e.message).includes("UNIQUE")) throw e; // Nummer schon vergeben → neue ziehen
    }
  }
  throw new Error("Keine freie Buchungsnummer gefunden");
});
