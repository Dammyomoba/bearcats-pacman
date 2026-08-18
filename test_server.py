#!/usr/bin/env python3
"""
test_server.py
────────────────────────────────────────────────────────────────────────
Local test server for the UC Bearcats Pac-Man research task.

Serves the game files like a normal web server, AND handles
POST /save-trial.php the same way the real save-trial.php will once
deployed on ceas3.uc.edu — creating a per-player folder under
game_results/ and writing one CSV file per completed trial into it.

WHY THIS EXISTS
    GitHub Pages can only serve static files — it cannot run save-trial.php
    (or any server-side code) at all. This script gives you that exact
    same folder/CSV-writing behavior on your own machine so you can verify
    it works BEFORE deploying to ceas3.uc.edu. The existing Google Sheets
    submission in the game HTML is untouched and keeps working wherever
    you run this (it doesn't depend on this local server at all).

USAGE
    python3 test_server.py            # serves at http://localhost:8000
    python3 test_server.py 8080       # custom port

No third-party dependencies — Python standard library only.
────────────────────────────────────────────────────────────────────────
"""
import http.server
import json
import os
import re
import sys
from datetime import datetime

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(BASE_DIR, "game_results")
MAX_BYTES = 2 * 1024 * 1024  # 2 MB per trial


def safe_component(s, max_len=40):
    """Mirrors safe_component() in save-trial.php exactly."""
    s = re.sub(r'[^A-Za-z0-9_-]', '_', s or '').strip('_')
    return (s or "unknown")[:max_len]


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/save-trial.php":
            self._json(404, {"status": "error", "message": "Not found"})
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length <= 0:
                self._json(400, {"status": "error", "message": "Empty request body"})
                return
            if length > MAX_BYTES:
                self._json(413, {"status": "error", "message": "Payload too large"})
                return
            raw = self.rfile.read(length)
            data = json.loads(raw)

            first_name = str(data.get("first_name", "")).strip()
            last_name  = str(data.get("last_name", "")).strip()
            m_number   = str(data.get("m_number", "")).strip()
            csv_text   = str(data.get("csv", ""))
            trial_num  = int(data.get("trial_number") or 0)
            num_ghosts = int(data.get("num_ghosts") or 0)

            if not (first_name and last_name and m_number and csv_text):
                self._json(400, {"status": "error",
                                  "message": "Missing required fields (first_name, last_name, m_number, csv)"})
                return

            # Layout: game_results/<Player>/<N>ghost/trial_....csv — each
            # difficulty level a participant plays gets its own subfolder.
            folder = f"{safe_component(last_name)}_{safe_component(first_name)}_{safe_component(m_number)}"
            ghost_folder = f"{num_ghosts}ghost" if num_ghosts > 0 else "unknown_ghost_count"
            target_dir = os.path.join(RESULTS_DIR, folder, ghost_folder)
            os.makedirs(target_dir, exist_ok=True)

            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            trial_label = trial_num if trial_num > 0 else "x"
            fname = f"trial_{trial_label}_{ts}_{num_ghosts}g.csv"
            fpath = os.path.join(target_dir, fname)
            i = 1
            while os.path.exists(fpath):
                fpath = os.path.join(target_dir, f"trial_{trial_label}_{ts}_{num_ghosts}g_{i}.csv")
                i += 1

            with open(fpath, "w", newline="") as f:
                f.write(csv_text)

            print(f"[saved] {folder}/{ghost_folder}/{os.path.basename(fpath)}")
            self._json(200, {"status": "ok", "saved_as": f"{folder}/{ghost_folder}/{os.path.basename(fpath)}"})
        except json.JSONDecodeError:
            self._json(400, {"status": "error", "message": "Invalid JSON"})
        except Exception as e:
            self._json(500, {"status": "error", "message": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, fmt, *args):
        pass  # keep the console clean; remove this override to see every GET too


if __name__ == "__main__":
    os.makedirs(RESULTS_DIR, exist_ok=True)
    os.chdir(BASE_DIR)
    print(f"Serving {BASE_DIR} at http://localhost:{PORT}")
    print(f"Trial data will be written to {RESULTS_DIR}/<LastName>_<FirstName>_<MNumber>/")
    print("Press Ctrl+C to stop.\n")
    http.server.HTTPServer(("", PORT), Handler).serve_forever()
