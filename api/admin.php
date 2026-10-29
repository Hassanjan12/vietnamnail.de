<?php
/**
 * Admin-API. Alle Aufrufe: POST JSON { action: "...", ... } mit Header "X-VN: 1".
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('vn_admin');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'secure' => $https, 'samesite' => 'Strict']);
session_start();

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || ($_SERVER['HTTP_X_VN'] ?? '') !== '1') vn_fail('Ungültige Anfrage.', 400);

$in = vn_input();
$action = (string) ($in['action'] ?? '');
$db = vn_db();

const STATUSES = ['pending', 'confirmed', 'done', 'cancelled', 'noshow'];
const SOURCES = ['online', 'telefon', 'vorort', 'whatsapp', 'instagram'];

/* ---------- ohne Anmeldung ---------- */

if ($action === 'state') {
  vn_json(['ok' => true, 'setup' => !vn_setting('admin_hash'), 'auth' => !empty($_SESSION['vn_admin'])]);
}

if ($action === 'setup') {
  if (vn_setting('admin_hash')) vn_fail('Bereits eingerichtet.', 403);
  $pw = (string) ($in['password'] ?? '');
  if (mb_strlen($pw) < 8) vn_fail('Das Passwort muss mindestens 8 Zeichen haben.');
  vn_setting('admin_hash', password_hash($pw, PASSWORD_DEFAULT));
  session_regenerate_id(true);
  $_SESSION['vn_admin'] = true;
  vn_json(['ok' => true]);
}

if ($action === 'login') {
  vn_rate_limit('login', 8, 900);
  $hash = vn_setting('admin_hash');
  if (!$hash || !password_verify((string) ($in['password'] ?? ''), $hash)) {
    usleep(400000);
    vn_fail('Passwort ist nicht korrekt.', 401);
  }
  session_regenerate_id(true);
  $_SESSION['vn_admin'] = true;
  vn_json(['ok' => true]);
}

/* ---------- ab hier nur angemeldet ---------- */

if (empty($_SESSION['vn_admin'])) vn_fail('Bitte anmelden.', 401);

switch ($action) {

  case 'logout':
    $_SESSION = [];
    session_destroy();
    vn_json(['ok' => true]);

  case 'bookings': {
    $from = (string) ($in['from'] ?? date('Y-m-d'));
    $to = (string) ($in['to'] ?? $from);
    if (!vn_valid_date($from) || !vn_valid_date($to)) vn_fail('Ungültiger Zeitraum.');
    $st = $db->prepare('SELECT * FROM bookings WHERE date BETWEEN ? AND ? ORDER BY date, time');
    $st->execute([$from, $to]);
    vn_json(['ok' => true, 'bookings' => array_map('vn_booking_out', $st->fetchAll())]);
  }

  case 'search': {
    $q = '%' . str_replace(['%', '_'], ['\%', '\_'], vn_clean((string) ($in['q'] ?? ''), 60)) . '%';
    $status = (string) ($in['status'] ?? '');
    $upcoming = !empty($in['upcoming']);
    $sql = "SELECT * FROM bookings WHERE (name LIKE :q ESCAPE '\\' OR phone LIKE :q ESCAPE '\\' OR ref LIKE :q ESCAPE '\\' OR title LIKE :q ESCAPE '\\')";
    $p = [':q' => $q];
    if (in_array($status, STATUSES, true)) { $sql .= ' AND status = :s'; $p[':s'] = $status; }
    if ($upcoming) { $sql .= ' AND date >= :d'; $p[':d'] = date('Y-m-d'); }
    $sql .= $upcoming ? ' ORDER BY date, time LIMIT 300' : ' ORDER BY date DESC, time DESC LIMIT 300';
    $st = $db->prepare($sql);
    $st->execute($p);
    vn_json(['ok' => true, 'bookings' => array_map('vn_booking_out', $st->fetchAll())]);
  }

  case 'create':
  case 'update': {
    $b = (array) ($in['booking'] ?? []);
    $id = $action === 'update' ? (int) ($b['id'] ?? 0) : null;
    $cur = null;
    if ($id) {
      $st = $db->prepare('SELECT * FROM bookings WHERE id = ?');
      $st->execute([$id]);
      $cur = $st->fetch();
      if (!$cur) vn_fail('Termin nicht gefunden.', 404);
    }
    $get = fn($k, $d = '') => array_key_exists($k, $b) ? $b[$k] : ($cur[$k] ?? $d);

    $name = vn_clean((string) $get('name'), 80);
    $phone = vn_clean((string) $get('phone'), 40);
    $date = (string) $get('date');
    $time = (string) $get('time');
    $status = (string) $get('status', 'confirmed');
    $source = (string) $get('source', 'telefon');
    $note = vn_clean((string) $get('note'), 1000);
    if (mb_strlen($name) < 1) vn_fail('Bitte einen Namen eingeben.');
    if (!vn_valid_date($date) || !vn_valid_time($time)) vn_fail('Bitte Datum und Uhrzeit prüfen.');
    if (!in_array($status, STATUSES, true)) $status = 'confirmed';
    if (!in_array($source, SOURCES, true)) $source = 'telefon';

    $svcIds = array_key_exists('services', $b) ? (array) $b['services'] : (json_decode($cur['services'] ?? '[]', true) ?: []);
    $exIds = array_key_exists('extras', $b) ? (array) $b['extras'] : (json_decode($cur['extras'] ?? '[]', true) ?: []);
    $svc = vn_resolve($svcIds, $exIds);
    $title = $svc['title'] ?: vn_clean((string) $get('title'), 160);
    if ($title === '') vn_fail('Bitte mindestens eine Leistung wählen.');
    $duration = (int) $get('duration', $svc['duration'] ?: 60);
    $duration = max(15, min(600, $duration ?: 60));
    $price = array_key_exists('services', $b) || array_key_exists('extras', $b) ? $svc['price'] : (string) ($cur['price'] ?? $svc['price']);

    // Überschneidungen prüfen (nur Warnung, mit force trotzdem speichern)
    if (in_array($status, ['pending', 'confirmed'], true) && empty($in['force'])) {
      $cap = max(1, (int) (vn_salon()['capacity'] ?? 1));
      if (!vn_fits(vn_busy($date, $id), vn_min($time), $duration, $cap)) {
        vn_fail('Zu dieser Zeit sind bereits alle Plätze belegt.', 409, ['code' => 'overlap']);
      }
    }

    $now = date('c');
    if ($id) {
      $db->prepare('UPDATE bookings SET status=?, source=?, name=?, phone=?, services=?, extras=?, title=?, date=?, time=?, duration=?, price=?, note=?, updated_at=? WHERE id=?')
         ->execute([$status, $source, $name, $phone, json_encode($svc['ids']), json_encode($svc['extras']), $title, $date, $time, $duration, $price, $note, $now, $id]);
    } else {
      $db->prepare('INSERT INTO bookings(ref, status, source, name, phone, services, extras, title, date, time, duration, price, note, visit, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
         ->execute([vn_ref(), $status, $source, $name, $phone, json_encode($svc['ids']), json_encode($svc['extras']), $title, $date, $time, $duration, $price, $note, '', $now, $now]);
      $id = (int) $db->lastInsertId();
    }
    $st = $db->prepare('SELECT * FROM bookings WHERE id = ?');
    $st->execute([$id]);
    vn_json(['ok' => true, 'booking' => vn_booking_out($st->fetch())]);
  }

  case 'status': {
    $id = (int) ($in['id'] ?? 0);
    $status = (string) ($in['status'] ?? '');
    if (!in_array($status, STATUSES, true)) vn_fail('Ungültiger Status.');
    $db->prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?')->execute([$status, date('c'), $id]);
    vn_json(['ok' => true]);
  }

  case 'delete': {
    $db->prepare('DELETE FROM bookings WHERE id = ?')->execute([(int) ($in['id'] ?? 0)]);
    vn_json(['ok' => true]);
  }

  case 'stats': {
    $days = 30;
    $start = (new DateTime())->modify('-' . ($days - 1) . ' days')->format('Y-m-d');
    $today = date('Y-m-d');
    $st = $db->prepare('SELECT day, COUNT(*) AS views, COUNT(DISTINCT hash) AS visitors FROM pageviews WHERE day >= ? GROUP BY day');
    $st->execute([$start]);
    $byDay = [];
    foreach ($st as $r) $byDay[$r['day']] = ['views' => (int) $r['views'], 'visitors' => (int) $r['visitors']];
    $series = [];
    $d = new DateTime($start);
    for ($i = 0; $i < $days; $i++) {
      $k = $d->format('Y-m-d');
      $series[] = ['day' => $k] + ($byDay[$k] ?? ['views' => 0, 'visitors' => 0]);
      $d->modify('+1 day');
    }
    $sum = fn(int $n) => array_sum(array_map(fn($x) => $x['visitors'], array_slice($series, -$n)));
    $st = $db->prepare("SELECT source, COUNT(DISTINCT day || hash) AS n FROM pageviews WHERE day >= ? AND source != 'Intern' GROUP BY source ORDER BY n DESC LIMIT 6");
    $st->execute([$start]);
    $sources = $st->fetchAll();
    $st = $db->prepare("SELECT device, COUNT(DISTINCT day || hash) AS n FROM pageviews WHERE day >= ? GROUP BY device");
    $st->execute([$start]);
    $devices = $st->fetchAll();
    $cnt = fn(string $sql, array $p = []) => (function () use ($db, $sql, $p) { $s = $db->prepare($sql); $s->execute($p); return (int) $s->fetchColumn(); })();
    $weekEnd = (new DateTime())->modify('+6 days')->format('Y-m-d');
    vn_json(['ok' => true,
      'series' => $series,
      'visitorsToday' => end($series)['visitors'],
      'visitors7' => $sum(7),
      'visitors30' => $sum(30),
      'views30' => array_sum(array_map(fn($x) => $x['views'], $series)),
      'sources' => $sources,
      'devices' => $devices,
      'online7' => $cnt("SELECT COUNT(*) FROM bookings WHERE source = 'online' AND created_at >= ?", [(new DateTime())->modify('-6 days')->format('Y-m-d')]),
      'today' => $cnt("SELECT COUNT(*) FROM bookings WHERE date = ? AND status IN ('pending','confirmed','done')", [$today]),
      'week' => $cnt("SELECT COUNT(*) FROM bookings WHERE date BETWEEN ? AND ? AND status IN ('pending','confirmed','done')", [$today, $weekEnd]),
      'online30' => $cnt("SELECT COUNT(*) FROM bookings WHERE source = 'online' AND created_at >= ?", [$start]),
    ]);
  }

  case 'recent': {
    // Zuletzt online gebuchte, noch anstehende Termine (neueste zuerst)
    $st = $db->prepare("SELECT * FROM bookings WHERE source = 'online' AND date >= ? AND status != 'cancelled' ORDER BY created_at DESC LIMIT 8");
    $st->execute([date('Y-m-d')]);
    vn_json(['ok' => true, 'bookings' => array_map('vn_booking_out', $st->fetchAll())]);
  }

  case 'password': {
    $hash = vn_setting('admin_hash');
    if (!password_verify((string) ($in['current'] ?? ''), (string) $hash)) vn_fail('Das aktuelle Passwort ist nicht korrekt.', 401);
    $new = (string) ($in['new'] ?? '');
    if (mb_strlen($new) < 8) vn_fail('Das neue Passwort muss mindestens 8 Zeichen haben.');
    vn_setting('admin_hash', password_hash($new, PASSWORD_DEFAULT));
    vn_json(['ok' => true]);
  }

  default:
    vn_fail('Unbekannte Aktion.', 404);
}
