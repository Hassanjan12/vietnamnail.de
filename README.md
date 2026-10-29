# Vietnam Nails – Website & Admin

Website: `index.html` · Admin: `/admin/` · Server: `api/` (PHP ≥ 8.1 mit SQLite)

## Vor dem Livegang
1. **E-Mail-Adresse** in `impressum.html` und `datenschutz.html` eintragen (Pflichtangabe).
2. **Hosting-Anbieter** in `datenschutz.html` (Abschnitt 3) eintragen und beim Anbieter den
   Vertrag zur Auftragsverarbeitung (AVV) abschließen – bei IONOS, Strato, All-Inkl im Kundenkonto.
3. **SSL/HTTPS** beim Hoster aktivieren (kostenloses Let's Encrypt). Die `.htaccess` leitet automatisch auf HTTPS um.
4. Domain prüfen: `canonical`, `og:url`, `robots.txt` und `sitemap.xml` sind auf `https://vietnamnail.de` eingestellt.

## Hochladen
1. Alle Dateien per FTP auf den Webspace laden (PHP 8.1 oder neuer).
2. **Sofort danach** `https://vietnamnail.de/admin/` öffnen und das Admin-Passwort festlegen.
3. Der Ordner `data/` (Datenbank) wird automatisch angelegt und ist gesperrt.
   Bei Nginx-Servern `/data` zusätzlich in der Server-Konfiguration sperren.

## Im Alltag (Admin)
- Termine eintragen: „Neuer Termin“ oder im Kalender in eine freie Stelle klicken.
- Urlaub/Feiertage: Einstellungen → Geschlossene Tage. An diesen Tagen ist keine Online-Buchung möglich.
- Termine werden 12 Monate nach dem Termin automatisch gelöscht (siehe Datenschutzerklärung).

## Pflege durch den Entwickler
- Öffnungszeiten, letzter Termin, Leistungen, Preise, Dauer, Plätze (`capacity`): `assets/salon.json`.
- Nach Änderungen an CSS/JS die Versionsnummer `?v=` in den HTML-Dateien erhöhen.
- E-Mail bei neuen Buchungen: `api/config.sample.php` nach `api/config.php` kopieren und Adresse eintragen.

## Datensicherung
`data/vietnamnails.sqlite` enthält alle Termine – regelmäßig per FTP sichern.
