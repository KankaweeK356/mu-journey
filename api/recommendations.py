"""POST /api/recommendations — Top<=5 places (Output A) and best fixed trip or abstain (Output B).

Body: {"wish_ids": [...1-3], "birthdate": "YYYY-MM-DD" | null,
       "exclusions": {"tradition_groups": [], "deity_ids": [], "place_ids": []}}
The date of birth is used in memory only; it is never stored or logged.
"""
from http.server import BaseHTTPRequestHandler

from _http import profile_from, read_json, send_json
import _engine as E


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = read_json(self)
            send_json(self, 200, E.recommend(profile_from(body)))
        except (ValueError, KeyError) as exc:  # invalid wish id, 4 wishes, future DOB, unknown group...
            send_json(self, 400, {"error": "invalid_profile", "message": str(exc)})
        except Exception:  # noqa: BLE001
            send_json(self, 500, {"error": "internal_error"})

    def log_message(self, *args):
        pass
