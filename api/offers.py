"""POST /api/offers — mock proxy-worship (ฝากมู) catalogue. No ordering and no payment in Phase 1.

Body: {"place_ids": [...], "wish_ids": [...]}"""
from http.server import BaseHTTPRequestHandler

from _http import read_json, send_json
import _engine as E


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = read_json(self)
            places = [p for p in (body.get("place_ids") or []) if p in E.m.P][:5]
            wishes = [w for w in (body.get("wish_ids") or []) if w in E.m.W][:3]
            send_json(self, 200, E.offers_for(places, wishes))
        except ValueError as exc:
            send_json(self, 400, {"error": "invalid_request", "message": str(exc)})

    def log_message(self, *args):
        pass
