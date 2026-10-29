# Vietnam Nails – Website & Admin

Website: `index.html` · Admin: `admin/` · Server: `api/` (PHP ≥ 8.1 mit SQLite)

## Hochladen
1. Alle Dateien per FTP auf den Webspace laden (z. B. IONOS, Strato, All-Inkl – PHP 8.1 oder neuer).
2. Direkt danach `https://ihre-domain.de/admin/` öffnen und das Admin-Passwort festlegen.
3. Der Ordner `data/` (Datenbank) wird automatisch angelegt und ist per `.htaccess` gesperrt.
   Bei Nginx-Servern muss `/data` zusätzlich in der Server-Konfiguration gesperrt werden.

## Pflegen
- Öffnungszeiten, Leistungen, Preise, Dauer, Plätze gleichzeitig (`capacity`), Feiertage (`closedDates`):
  `assets/salon.json` – gilt für Website, Online-Buchung und Admin.
- E-Mail bei neuen Anfragen: `api/config.sample.php` nach `api/config.php` kopieren und Adresse eintragen.

## Datensicherung
Die Datei `data/vietnamnails.sqlite` enthält alle Termine – regelmäßig per FTP sichern.
