# Vietnam Nails – Website & Admin (Cloudflare)

- Website: `public/` (wird von Cloudflare Pages ausgeliefert)
- Server-Funktionen: `functions/api/` (Cloudflare Pages Functions) + `src/lib.js`
- Datenbank: Cloudflare D1 (Binding `DB`), Tabellen werden automatisch angelegt
- Admin: `https://DOMAIN/admin/`

## Veröffentlichen (einmalig)
1. **D1-Datenbank anlegen:** Cloudflare-Dashboard → *Storage & Databases* → *D1* → *Create*
   Name `vietnam-nails`, **Location: Europäische Union (Jurisdiction EU)**.
2. **Pages-Projekt anlegen:** *Workers & Pages* → *Create* → *Pages* → *Connect to Git* → dieses Repository.
   - Framework: *None*, Build-Befehl: leer, **Build output directory: `public`**
3. **Datenbank verbinden:** Pages-Projekt → *Settings* → *Bindings* → *Add* → *D1 database*
   Variablenname **`DB`**, Datenbank `vietnam-nails` (für *Production*), danach neu deployen.
4. **Domain verbinden:** Pages-Projekt → *Custom domains* → Domain eintragen (Domain muss bei Cloudflare verwaltet werden).
5. **Sofort** `https://DOMAIN/admin/` öffnen und das Admin-Passwort festlegen (mind. 10 Zeichen).
6. Optional: *Email Routing* aktivieren, damit `info@DOMAIN` an ein bestehendes Postfach weitergeleitet wird.

Jeder Push auf den Hauptzweig veröffentlicht die Website automatisch neu.

## Lokal testen
```
npx wrangler@4.149.0 pages dev
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
