<?php
/**
 * save-trial.php
 * ────────────────────────────────────────────────────────────────────────
 * Receives one completed trial's data (JSON, sent by game_*ghost.html
 * right when a trial ends) and writes it to a per-player CSV file ON THIS
 * SERVER, under game_results/. This runs ALONGSIDE the existing Google
 * Sheets submission (unchanged) — both happen for every trial. The
 * player's browser never touches the file; there is no download step.
 *
 * Folder layout created under ./game_results/ (next to this script):
 *
 *   game_results/
 *     Smith_Jane_M12345678/
 *       2ghost/
 *         trial_1_20260817_143022_2g.csv
 *       3ghost/
 *         trial_1_20260817_150210_3g.csv
 *         trial_2_20260817_150530_3g.csv
 *
 * DEPLOYMENT
 *   Upload this file into the SAME folder as index.html / game_*ghost.html
 *   on ceas3.uc.edu (e.g. https://www.ceas3.uc.edu/bearcat-pacman/).
 *   Requires PHP execution to be enabled for that web space — if you're
 *   not sure, ask CEAS IT to confirm.
 *
 *   The game_results/ folder is created automatically on the first saved
 *   trial. Make sure the web server's PHP process has write permission to
 *   this script's directory (usually true by default on shared hosting).
 * ────────────────────────────────────────────────────────────────────────
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

header("Content-Type: application/json");

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(["status" => "error", "message" => $message]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail(405, "POST only");
}

$MAX_BYTES = 2 * 1024 * 1024; // 2 MB is generous for one trial's CSV
$raw = file_get_contents('php://input', false, null, 0, $MAX_BYTES + 1);
if ($raw === false || strlen($raw) === 0) fail(400, "Empty request body");
if (strlen($raw) > $MAX_BYTES) fail(413, "Payload too large");

$data = json_decode($raw, true);
if (!is_array($data)) fail(400, "Invalid JSON");

$firstName = trim((string)($data['first_name'] ?? ''));
$lastName  = trim((string)($data['last_name']  ?? ''));
$mNumber   = trim((string)($data['m_number']   ?? ''));
$csv       = (string)($data['csv'] ?? '');
$trialNum  = intval($data['trial_number'] ?? 0);
$numGhosts = intval($data['num_ghosts'] ?? 0);

if ($firstName === '' || $lastName === '' || $mNumber === '' || $csv === '') {
    fail(400, "Missing required fields (first_name, last_name, m_number, csv)");
}

// Sanitize into safe path components — letters/digits/underscore/hyphen only.
function safe_component($s, $maxLen = 40) {
    $s = preg_replace('/[^A-Za-z0-9_-]/', '_', $s);
    $s = trim($s, '_');
    if ($s === '') $s = 'unknown';
    return substr($s, 0, $maxLen);
}
$folderName = safe_component($lastName) . '_' . safe_component($firstName) . '_' . safe_component($mNumber);

// Base results directory, fixed relative to this script.
// Layout: game_results/<Player>/<N>ghost/trial_....csv — each difficulty
// level a participant plays gets its own subfolder within their folder.
$baseDir     = __DIR__ . '/game_results';
$ghostFolder = $numGhosts > 0 ? "{$numGhosts}ghost" : "unknown_ghost_count";
$targetDir   = $baseDir . '/' . $folderName . '/' . $ghostFolder;

if (!is_dir($baseDir) && !mkdir($baseDir, 0750, true) && !is_dir($baseDir)) {
    fail(500, "Could not create game_results directory");
}
if (!is_dir($targetDir) && !mkdir($targetDir, 0750, true) && !is_dir($targetDir)) {
    fail(500, "Could not create player/difficulty folder");
}

// Confirm the resolved path is really inside baseDir before writing anything.
$realBase   = realpath($baseDir);
$realTarget = realpath($targetDir);
if ($realTarget === false || strncmp($realTarget, $realBase, strlen($realBase)) !== 0) {
    fail(400, "Invalid path");
}

// Build a unique filename for this trial (never overwrites a prior one).
$ts = date('Ymd_His');
$trialLabel = $trialNum > 0 ? $trialNum : 'x';
$filename = "trial_{$trialLabel}_{$ts}_{$numGhosts}g.csv";
$filepath = $targetDir . '/' . $filename;

$i = 1;
while (file_exists($filepath)) {
    $filepath = $targetDir . "/trial_{$trialLabel}_{$ts}_{$numGhosts}g_{$i}.csv";
    $i++;
}

if (file_put_contents($filepath, $csv) === false) {
    fail(500, "Could not write file");
}

echo json_encode(["status" => "ok", "saved_as" => "{$folderName}/{$ghostFolder}/" . basename($filepath)]);

