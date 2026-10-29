<?php
/**
 * Vietnam Nails – gemeinsame Funktionen für alle API-Endpunkte.
 * Datenbank: SQLite-Datei in /data (wird automatisch angelegt).
 */
declare(strict_types=1);

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === '_lib.php') { http_response_code(404); exit; }

date_default_timezone_set('Europe/Berlin');

const VN_ROOT = __DIR__ . '/..';
const VN_DATA = VN_ROOT . '/data';

$VN_CONFIG = [
  // E-Mail für Benachrichtigungen bei neuen Online-Anfragen (leer = aus)
  'notify_email' => '',
  'mail_from'    => 'noreply@vietnamnail.de',
];
if (is_file(__DIR__ . '/config.php')) {
  $VN_CONFIG = array_merge($VN_CONFIG, (array) require __DIR__ . '/config.php');
}

function vn_salon(): array {
  static $s = null;
  if ($s === null) {
    $s = json_decode((string) file_get_contents(VN_ROOT . '/assets/salon.json'), true, 512, JSON_THROW_ON_ERROR);
  }
  return $s;
}

function vn_db(): PDO {
  static $db = null;
  if ($db) return $db;
  if (!is_dir(VN_DATA)) mkdir(VN_DATA, 0750, true);
  if (!is_file(VN_DATA . '/.htaccess')) {
    file_put_contents(VN_DATA . '/.htaccess', "Require all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
  }
  $db = new PDO('sqlite:' . VN_DATA . '/vietnamnails.sqlite', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  $db->exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000;');
  $db->exec(<<<SQL
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'online',
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      services TEXT NOT NULL DEFAULT '[]',
      extras TEXT NOT NULL DEFAULT '[]',
      title TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 60,
      price TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      visit TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
    CREATE TABLE IF NOT EXISTS pageviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      hash TEXT NOT NULL,
      path TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      device TEXT NOT NULL DEFAULT '',
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pv_day ON pageviews(day);
    CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS hits (k TEXT NOT NULL, ts INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_hits ON hits(k, ts);
  SQL);
  return $db;
}

function vn_setting(string $k, ?string $v = null): ?string {
  $db = vn_db();
  if ($v !== null) {
    $db->prepare('INSERT INTO settings(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')->execute([$k, $v]);
    return $v;
  }
  $st = $db->prepare('SELECT v FROM settings WHERE k = ?');
  $st->execute([$k]);
  $r = $st->fetchColumn();
  return $r === false ? null : (string) $r;
}

/* ---------- HTTP ---------- */

function vn_json($data, int $code = 200): never {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  header('X-Content-Type-Options: nosniff');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function vn_fail(string $msg, int $code = 400, array $extra = []): never {
  vn_json(['ok' => false, 'error' => $msg] + $extra, $code);
}

function vn_input(): array {
  $raw = file_get_contents('php://input') ?: '';
  if (strlen($raw) > 20000) vn_fail('Anfrage zu groß.', 413);
  $d = json_decode($raw, true);
  return is_array($d) ? $d : [];
}

function vn_client_key(): string {
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  return hash('sha256', vn_secret() . '|' . $ip);
}

function vn_secret(): string {
  $s = vn_setting('secret');
  if (!$s) $s = vn_setting('secret', bin2hex(random_bytes(32)));
  return $s;
}

/** Einfache Begrenzung: max. $max Aufrufe pro $window Sekunden je Schlüssel. */
function vn_rate_limit(string $bucket, int $max, int $window): void {
  $db = vn_db();
  $k = $bucket . ':' . vn_client_key();
  $now = time();
  $db->prepare('DELETE FROM hits WHERE ts < ?')->execute([$now - 86400]);
  $st = $db->prepare('SELECT COUNT(*) FROM hits WHERE k = ? AND ts > ?');
  $st->execute([$k, $now - $window]);
  if ((int) $st->fetchColumn() >= $max) vn_fail('Zu viele Versuche. Bitte später erneut versuchen.', 429);
  $db->prepare('INSERT INTO hits(k, ts) VALUES(?, ?)')->execute([$k, $now]);
}

/* ---------- Zeit & Verfügbarkeit ---------- */

function vn_min(string $hm): int { [$h, $m] = array_map('intval', explode(':', $hm)); return $h * 60 + $m; }
function vn_hm(int $m): string { return sprintf('%02d:%02d', intdiv($m, 60), $m % 60); }
function vn_valid_date(string $d): bool { $x = DateTime::createFromFormat('Y-m-d', $d); return $x && $x->format('Y-m-d') === $d; }
function vn_valid_time(string $t): bool { return (bool) preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t); }

function vn_hours_for(string $date): ?array {
  $s = vn_salon();
  if (in_array($date, $s['closedDates'] ?? [], true)) return null;
  $dow = (int) (new DateTime($date))->format('w');
  return $s['hours'][(string) $dow] ?? null;
}

/** Aktive Termine (Anfrage oder bestätigt) eines Tages als [start, ende] in Minuten. */
function vn_busy(string $date, ?int $excludeId = null): array {
  $st = vn_db()->prepare("SELECT id, time, duration FROM bookings WHERE date = ? AND status IN ('pending','confirmed')");
  $st->execute([$date]);
  $out = [];
  foreach ($st as $r) {
    if ($excludeId !== null && (int) $r['id'] === $excludeId) continue;
    $s = vn_min($r['time']);
    $out[] = [$s, $s + (int) $r['duration']];
  }
  return $out;
}

/** Passt ein Termin [start, start+dur) unter die Kapazität? */
function vn_fits(array $busy, int $start, int $dur, int $cap): bool {
  for ($t = $start; $t < $start + $dur; $t += 5) {
    $n = 0;
    foreach ($busy as [$a, $b]) if ($a <= $t && $t < $b) $n++;
    if ($n >= $cap) return false;
  }
  return true;
}

/** Freie Startzeiten eines Tages für eine Dauer – für die Online-Buchung. */
function vn_free_slots(string $date, int $dur): array {
  $s = vn_salon();
  $h = vn_hours_for($date);
  if (!$h) return [];
  $today = date('Y-m-d');
  if ($date < $today) return [];
  $last = (new DateTime($today))->modify('+' . (int) $s['daysAhead'] . ' days')->format('Y-m-d');
  if ($date > $last) return [];
  [$o, $c] = [vn_min($h[0]), vn_min($h[1])];
  $lastStart = isset($h[2]) ? vn_min($h[2]) : $c;
  $earliest = $date === $today ? ((int) date('G')) * 60 + (int) date('i') + (int) $s['leadMinutes'] : -1;
  $busy = vn_busy($date);
  $cap = max(1, (int) ($s['capacity'] ?? 1));
  $out = [];
  $starts = [];
  for ($m = $o; $m <= $lastStart; $m += (int) $s['slotStep']) $starts[] = $m;
  if (isset($h[2]) && !in_array($lastStart, $starts, true)) $starts[] = $lastStart; // z. B. 18:15
  foreach ($starts as $m) {
    if ($m < $earliest || $m + $dur > $c) continue;
    if (vn_fits($busy, $m, $dur, $cap)) $out[] = vn_hm($m);
  }
  return $out;
}

/** Leistungen aus dem Katalog auflösen → [titel, dauer, preis-text] */
function vn_resolve(array $serviceIds, array $extraIds): array {
  $s = vn_salon();
  $items = [];
  foreach ($s['categories'] as $c) foreach ($c['items'] as $i) $items[$i['id']] = $i;
  $extras = [];
  foreach ($s['extras'] as $x) $extras[$x['id']] = $x;
  $names = []; $dur = 0; $sum = 0; $from = false; $request = false; $ids = [];
  foreach ($serviceIds as $id) {
    if (!isset($items[$id])) continue;
    $i = $items[$id]; $ids[] = $id;
    $names[] = $i['name']; $dur += (int) $i['dur'];
    if ($i['price'] === null) $request = true; else $sum += (int) $i['price'];
  }
  $xids = [];
  foreach ($extraIds as $id) {
    if (!isset($extras[$id])) continue;
    $xids[] = $id; $sum += (int) $extras[$id]['min'];
    if (!empty($extras[$id]['from'])) $from = true;
  }
  $price = $sum ? (($from ? 'ab ' : '') . $sum . ' €') : ($request ? 'auf Anfrage' : '');
  if ($sum && $request) $price .= ' + Wimpern';
  return ['ids' => $ids, 'extras' => $xids, 'title' => implode(' + ', $names), 'duration' => $dur, 'price' => $price];
}

function vn_ref(): string {
  $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  do {
    $r = 'VN-';
    for ($i = 0; $i < 5; $i++) $r .= $chars[random_int(0, strlen($chars) - 1)];
    $st = vn_db()->prepare('SELECT 1 FROM bookings WHERE ref = ?');
    $st->execute([$r]);
  } while ($st->fetchColumn());
  return $r;
}

function vn_clean(string $s, int $max): string {
  $s = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '');
  return mb_substr($s, 0, $max);
}

function vn_booking_out(array $r): array {
  $r['id'] = (int) $r['id'];
  $r['duration'] = (int) $r['duration'];
  $r['services'] = json_decode($r['services'], true) ?: [];
  $r['extras'] = json_decode($r['extras'], true) ?: [];
  return $r;
}
