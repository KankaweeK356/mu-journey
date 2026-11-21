"""GET /api/catalog — 10 wishes, sacred entities, tradition groups, places, fixed trips."""
from http.server import BaseHTTPRequestHandler

from _http import send_json
import _engine as E


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        send_json(self, 200, E.catalog(), cache="public, max-age=300")

    def log_message(self, *args):  # keep request lines out of logs
        pass
