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

## Sicherheit
- Termine liegen in einer SQLite-Datei im Ordner `data/` mit zufälligem, nicht erratbarem Namen
  (steht in `data/dbname.php`). Der Ordner ist per `.htaccess` gesperrt.
- **Am sichersten:** Datenordner außerhalb des Web-Verzeichnisses – in `api/config.php` `'data_dir'` setzen.
- Der Admin-Bereich prüft bei jedem Öffnen, ob `data/` von außen lesbar ist, und zeigt sonst eine rote Warnung.
  Bei Nginx-Hostern ohne `.htaccess`: `location ^~ /data/ { deny all; }` in der Server-Konfiguration.
- Admin-Login: Passwort gehasht (bcrypt), Sperre nach 8 Fehlversuchen für 15 Minuten,
  Sitzungs-Cookie `HttpOnly`, `Secure`, `SameSite=Strict`.
- Content-Security-Policy und weitere Sicherheits-Header in `.htaccess`.
  Wird das Inline-Skript in `index.html` geändert, muss der `sha256`-Wert in der CSP angepasst werden.

## Datensicherung
Admin → Einstellungen → „Termine exportieren“ (CSV für Excel), am besten monatlich.
Vollständige Sicherung: den Ordner `data/` per FTP herunterladen.
