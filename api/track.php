<?php
/**
 * Anonyme Besucherzählung ohne Cookies.
 * Gespeichert wird nur ein Hash aus (Tagesschlüssel + IP + Browser) – der Schlüssel
 * wechselt täglich, daher lassen sich Besucher nicht über Tage hinweg wiedererkennen.
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(204); exit; }
$ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
if ($ua === '' || preg_match('/bot|crawl|spider|slurp|preview|headless|lighthouse|monitor/i', $ua)) { http_response_code(204); exit; }

$in = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
$path = substr(preg_replace('/[^\w\-\/.#]/', '', (string) ($in['p'] ?? '/')), 0, 120) ?: '/';
$ref = (string) ($in['r'] ?? '');

$host = strtolower((string) parse_url($ref, PHP_URL_HOST));
$self = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$source = 'Direkt';
if ($host && $host !== $self) {
  $map = ['google' => 'Google', 'instagram' => 'Instagram', 'facebook' => 'Facebook', 'fb.' => 'Facebook', 'tiktok' => 'TikTok',
          'bing' => 'Bing', 'whatsapp' => 'WhatsApp', 'wa.me' => 'WhatsApp', 'maps' => 'Google Maps', 'duckduckgo' => 'DuckDuckGo'];
  $source = preg_replace('/^www\./', '', $host);
  foreach ($map as $k => $v) if (str_contains($host, $k)) { $source = $v; break; }
} elseif ($host === $self && $self !== '') {
  $source = 'Intern';
}

$day = date('Y-m-d');
$salt = vn_setting('salt_day') === $day ? vn_setting('salt') : null;
if (!$salt) { vn_setting('salt_day', $day); $salt = vn_setting('salt', bin2hex(random_bytes(16))); }
$hash = substr(hash('sha256', $salt . '|' . ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . $ua), 0, 24);
$device = preg_match('/Mobi|Android|iPhone|iPad/i', $ua) ? 'mobil' : 'desktop';

vn_db()->prepare('INSERT INTO pageviews(day, hash, path, source, device, ts) VALUES(?, ?, ?, ?, ?, ?)')
  ->execute([$day, $hash, $path, $source, $device, time()]);
http_response_code(204);
