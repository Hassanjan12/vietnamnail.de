# Vietnam Nails – Website & Admin (Cloudflare Worker)

- Website: `public/` (statische Dateien, von Cloudflare direkt ausgeliefert)
- Server: `src/worker.js` → `src/api/*` (nur `/api/*` läuft durch den Worker), gemeinsame Funktionen in `src/lib.js`
- Datenbank: Cloudflare D1 (Binding `DB`), Tabellen werden automatisch angelegt
- Admin: `https://DOMAIN/admin/`

## Veröffentlichen (einmalig)
1. **D1-Datenbank anlegen:** Dashboard → *Storage & Databases* → *D1* → *Create*,
   Name `vietnam-nails`, **Location/Jurisdiction: EU**. Die **Database ID** in `wrangler.toml` bei `database_id` eintragen.
2. **Worker anlegen:** *Workers & Pages* → *Create* → *Import a repository* → dieses Repository.
   - Projektname: **`vietnamnail-de`** (muss mit `name` in `wrangler.toml` übereinstimmen)
   - Build command: leer · Deploy command: `npx wrangler deploy` (Standard)
3. **Deploy** – danach ist die Seite unter `vietnamnail-de.<konto>.workers.dev` erreichbar.
4. **Sofort** `/admin/` öffnen und das Admin-Passwort festlegen (mind. 10 Zeichen).
5. **Domain:** Worker → *Settings* → *Domains & Routes* → *Add* → *Custom domain*.
6. Optional: *Email Routing*, damit `info@DOMAIN` an ein bestehendes Postfach weitergeleitet wird.

Jeder Push auf `master` veröffentlicht automatisch neu.

## Lokal testen
```
npx wrangler@4.149.0 dev
```
(liest `wrangler.toml`, legt eine lokale Test-Datenbank in `.wrangler/` an)

## Pflegen
- Öffnungszeiten, letzter Termin, Leistungen, Preise, Dauer, Plätze (`capacity`): `public/assets/salon.json`
- Urlaub/Feiertage: im Admin unter *Einstellungen → Geschlossene Tage*
- Nach Änderungen an CSS/JS die Versionsnummer `?v=` in den HTML-Dateien erhöhen.

## Sicherheit
- Nur `public/` ist öffentlich; Server-Code und Datenbank sind von außen nicht erreichbar.
- Admin-Passwort: PBKDF2-SHA256 mit Salt; Sperre nach 8 Fehlversuchen für 15 Minuten.
- Sitzung: zufälliges Token (nur als Hash gespeichert), Cookie `HttpOnly`, `Secure`, `SameSite=Strict`, 14 Tage.
- Gleichzeitige Buchungen: Platzprüfung und Speichern in einer SQL-Anweisung – keine Überbuchung.
- Sicherheits-Header und Content-Security-Policy: `public/_headers`
  (wird das Inline-Skript in `index.html` geändert, muss der `sha256`-Wert dort angepasst werden).

## Datensicherung
Admin → Einstellungen → „Termine exportieren“ (CSV für Excel), am besten monatlich.
Zusätzlich kann D1 frühere Stände wiederherstellen („Time Travel“, Zeitraum je nach Tarif).
