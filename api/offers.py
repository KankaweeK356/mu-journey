"""POST /api/offers — mock proxy-worship (ฝากมู) catalogue. No ordering and no payment in Phase 1.

Body: {"place_ids": [...], "wish_ids": [...]}"""
from http.server import BaseHTTPRequestHandler

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _http import query, read_json, send_json
import _engine as E


def _answer(h, body):
    places = [p for p in (body.get("place_ids") or []) if p in E.m.P][:5]
    wishes = [w for w in (body.get("wish_ids") or []) if w in E.m.W][:3]
    send_json(h, 200, dict(E.offers_for(places, wishes), versions=E.VERSIONS))


class handler(BaseHTTPRequestHandler):
    def do_GET(self):  # GET /api/mumu/proxy-offers?place_ids=P001,P002&wish_ids=W01
        q = query(self)
        _answer(self, {"place_ids": [x for x in q.get("place_ids", "").split(",") if x],
                       "wish_ids": [x for x in q.get("wish_ids", "").split(",") if x]})

    def do_POST(self):
        try:
            _answer(self, read_json(self))
        except ValueError as exc:
            send_json(self, 400, {"error": "invalid_request", "message": str(exc)})

    def log_message(self, *args):
        pass
