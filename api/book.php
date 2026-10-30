<?php
/** POST JSON → neue Online-Buchung (sofort fest gebucht) */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') vn_fail('Nur POST.', 405);
$in = vn_input();

// Honeypot gegen Spam-Bots
if (!empty($in['website'])) vn_json(['ok' => true, 'ref' => 'VN-00000']);

vn_rate_limit('book', 6, 3600);

$name  = vn_clean((string) ($in['name'] ?? ''), 80);
$phone = vn_clean((string) ($in['phone'] ?? ''), 40);
$note  = vn_clean((string) ($in['note'] ?? ''), 1000);
$visit = vn_clean((string) ($in['visit'] ?? ''), 40);
$date  = (string) ($in['date'] ?? '');
$time  = (string) ($in['time'] ?? '');

if (mb_strlen($name) < 2) vn_fail('Bitte geben Sie Ihren Namen an.');
if (strlen(preg_replace('/\D/', '', $phone)) < 6) vn_fail('Bitte geben Sie eine gültige Telefonnummer an.');
if (empty($in['consent'])) vn_fail('Bitte bestätigen Sie die Datenschutzhinweise.');
if (!vn_valid_date($date) || !vn_valid_time($time)) vn_fail('Ungültiger Termin.');

$svc = vn_resolve((array) ($in['services'] ?? []), (array) ($in['extras'] ?? []));
if (!$svc['ids']) vn_fail('Bitte wählen Sie eine Leistung.');

$db = vn_db();
// IMMEDIATE sperrt sofort für Schreibzugriffe: zwei gleichzeitige Buchungen können sich nicht überholen
$db->exec('BEGIN IMMEDIATE');
if (!in_array($time, vn_free_slots($date, max(30, $svc['duration'])), true)) {
  $db->exec('ROLLBACK');
  vn_fail('Dieser Termin ist leider gerade vergeben. Bitte wählen Sie eine andere Zeit.', 409, ['code' => 'taken']);
}
$ref = vn_ref();
$now = date('c');
$db->prepare('INSERT INTO bookings(ref, status, source, name, phone, services, extras, title, date, time, duration, price, note, visit, created_at, updated_at)
              VALUES(?, \'confirmed\', \'online\', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
   ->execute([$ref, $name, $phone, json_encode($svc['ids']), json_encode($svc['extras']), $svc['title'], $date, $time,
              max(30, $svc['duration']), $svc['price'], $note, $visit, $now, $now]);
$db->exec('COMMIT');

// Optional: E-Mail an das Studio
$to = $GLOBALS['VN_CONFIG']['notify_email'] ?? '';
if ($to) {
  $body = "Neue Online-Buchung $ref\n\n"
        . "Leistung: {$svc['title']}\n"
        . "Termin: " . (new DateTime($date))->format('d.m.Y') . ", $time Uhr\n"
        . "Name: $name\nTelefon: $phone\n" . ($note ? "Wunsch: $note\n" : '')
        . "\nDer Termin steht im Admin-Kalender.";
  @mail($to, "Neuer Termin $ref", $body, 'From: ' . $GLOBALS['VN_CONFIG']['mail_from'] . "\r\nContent-Type: text/plain; charset=utf-8");
}

vn_json(['ok' => true, 'ref' => $ref]);
