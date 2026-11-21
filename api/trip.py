"""GET /api/trips/:id  (rewritten to /api/trip?id=TRIP_LOVE) — a FIXED signature trip, loaded from locked data."""
from http.server import BaseHTTPRequestHandler

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _http import query, send_json
import _engine as E


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        tid = query(self).get("id", "")
        try:
            send_json(self, 200, E.trip_detail(tid), cache="public, max-age=300")
        except KeyError:
            send_json(self, 404, {"error": "unknown_trip", "id": tid})

    def log_message(self, *args):
        pass
