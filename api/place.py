"""GET /api/places/:id  (rewritten to /api/place?id=P001) — place details and ritual information."""
from http.server import BaseHTTPRequestHandler

from _http import query, send_json
import _engine as E


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        pid = query(self).get("id", "")
        try:
            send_json(self, 200, E.place_detail(pid), cache="public, max-age=300")
        except KeyError:
            send_json(self, 404, {"error": "unknown_place", "id": pid})

    def log_message(self, *args):
        pass
