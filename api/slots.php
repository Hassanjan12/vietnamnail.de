<?php
/** GET ?month=2026-11&dur=90  → freie Startzeiten je Tag des Monats */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$month = (string) ($_GET['month'] ?? '');
$dur = max(15, min(480, (int) ($_GET['dur'] ?? 60)));
if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) vn_fail('Ungültiger Monat.');

$d = new DateTime($month . '-01');
$days = [];
$n = (int) $d->format('t');
for ($i = 0; $i < $n; $i++) {
  $key = $d->format('Y-m-d');
  $days[$key] = vn_free_slots($key, $dur);
  $d->modify('+1 day');
}
vn_json(['ok' => true, 'days' => $days]);
