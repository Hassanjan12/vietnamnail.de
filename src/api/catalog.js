/** GET /api/catalog → Studio-Daten für Website und Buchung (Öffnungszeiten aus salon.json, Leistungen aus der Datenbank) */
import { handle, json, db, getCatalog, publicCatalog, staffList, salon } from "../lib.js";

export const onRequestGet = handle(async ({ env }) => {
  const DB = await db(env);
  const { categories, extras } = publicCatalog(await getCatalog(DB));
  // nur sichtbare Mitarbeiter, nur Name (für die Auswahl bei der Buchung)
  const staff = (await staffList(DB)).filter(s => !s.hidden).map(({ id, name }) => ({ id, name }));
  const { name, whatsapp, phone, address, hours, closedDates, slotStep, leadMinutes, daysAhead, capacity } = salon;
  return json({ ok: true, name, whatsapp, phone, address, hours, closedDates, slotStep, leadMinutes, daysAhead, capacity, categories, extras, staff });
});
