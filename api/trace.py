"""POST /api/trace — same profile contract as /api/recommendations, but returns every intermediate number
(pruning, seeds, PageRank, coverage re-ranking, trip scores) for the analytics explainer tab."""
from http.server import BaseHTTPRequestHandler

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _http import profile_from, read_json, send_json
import _engine as E


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            send_json(self, 200, E.trace(profile_from(read_json(self))))
        except (ValueError, KeyError) as exc:
            send_json(self, 400, {"error": "invalid_profile", "message": str(exc)})
        except Exception:  # noqa: BLE001
            send_json(self, 500, {"error": "internal_error"})

    def log_message(self, *args):
        pass
