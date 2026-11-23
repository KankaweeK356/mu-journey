"""POST /api/feedback — store service feedback in a Google Sheet through an Apps Script web app.

Environment (Vercel project settings, never in the repo):
  FEEDBACK_WEBHOOK_URL  the deployed Apps Script web-app URL (see docs/feedback_apps_script.gs)
  FEEDBACK_TOKEN        shared secret checked by the script
If they are not set the endpoint validates the payload and answers {"saved": false, "mode": "not_configured"}
so the demo still works.  No date of birth and no personal identifiers are accepted or stored.
"""
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _http import read_json, send_json
import _engine as E


STATUS_MESSAGES = {
    "saved": "บันทึกความคิดเห็นแล้ว",
    "not_configured": "ไม่สามารถบันทึกได้ ระบบนี้ยังไม่ได้เชื่อมที่เก็บความคิดเห็น (โหมดสาธิต)",
    "bad_webhook_host": "ไม่สามารถบันทึกได้ การตั้งค่าที่เก็บความคิดเห็นของระบบไม่ถูกต้อง ผู้ดูแลระบบต้องแก้ไข",
    "rejected": "ไม่สามารถบันทึกได้ ที่เก็บความคิดเห็นปฏิเสธข้อมูลนี้ ผู้ดูแลระบบต้องตรวจสอบ",
    "unreachable": "ยังบันทึกไม่ได้ เชื่อมต่อที่เก็บความคิดเห็นไม่ได้ชั่วคราว ลองส่งใหม่อีกครั้งได้",
}


def _forward(row: dict) -> tuple[bool, str]:
    url = os.environ.get("FEEDBACK_WEBHOOK_URL", "")
    token = os.environ.get("FEEDBACK_TOKEN", "")
    if not url or not token:
        return False, "not_configured"
    if not url.startswith("https://script.google.com/"):
        return False, "bad_webhook_host"
    data = json.dumps({"token": token, "row": row}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:  # Apps Script answers 200 after a redirect
            ok = resp.status == 200 and json.loads(resp.read().decode("utf-8") or "{}").get("ok") is True
            return ok, "saved" if ok else "rejected"
    except (urllib.error.URLError, TimeoutError, ValueError):
        return False, "unreachable"


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            clean = E.validate_feedback(read_json(self))
        except ValueError as exc:
            return send_json(self, 400, {"error": "invalid_feedback", "message": str(exc)})
        row = dict(clean, submitted_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                   wish_ids=",".join(clean["wish_ids"]), place_ids=",".join(clean["place_ids"]))
        saved, mode = _forward(row)
        # The message always says what really happened. Only a temporary connection problem is worth retrying: the other causes are configuration or
        # rejection on the system side, and resending the same answer cannot fix them.
        send_json(self, 200, {"saved": saved, "mode": mode, "retryable": mode == "unreachable", "message": STATUS_MESSAGES.get(mode, STATUS_MESSAGES["unreachable"])})

    def log_message(self, *args):
        pass
