"""Feedback: interest question (would_use_again = pre-use interest, versioned in `scope`) and the status the user is told after sending.
No test here talks to Google: the Apps Script call is replaced, and nothing is written to any sheet.
python -m unittest discover -s tests -v"""
import json
import os
import re
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
import _engine as E  # noqa: E402
import feedback as FB  # noqa: E402

DEMO = (ROOT / "public" / "js" / "demo.js").read_text(encoding="utf-8")
BASE = {"kind": "trip", "rating": 4, "consent": True, "wish_ids": ["W01"], "place_ids": [], "comment": "x", "rating_question": "V2_RELEVANCE"}


class InterestQuestionVersion(unittest.TestCase):
    def test_interest_answer_is_stamped_in_scope(self):
        row = E.validate_feedback(dict(BASE, would_use_again="YES", interest_question="V1_PREUSE_INTEREST"))
        self.assertEqual(row["would_use_again"], "YES")
        self.assertEqual(row["scope"], "DEMO_UX_FEEDBACK_NOT_REAL_SERVICE|RATING_Q=V2_RELEVANCE|INTEREST_Q=V1_PREUSE_INTEREST")

    def test_all_three_values_accepted(self):
        for v in ("YES", "MAYBE", "NO"):
            self.assertEqual(E.validate_feedback(dict(BASE, would_use_again=v, interest_question="V1_PREUSE_INTEREST"))["would_use_again"], v)

    def test_answer_without_a_version_is_refused(self):
        with self.assertRaises(ValueError):
            E.validate_feedback(dict(BASE, would_use_again="YES"))                      # it would be read as 'repeat usage'

    def test_unknown_version_or_value_refused(self):
        with self.assertRaises(ValueError):
            E.validate_feedback(dict(BASE, would_use_again="YES", interest_question="V9"))
        with self.assertRaises(ValueError):
            E.validate_feedback(dict(BASE, would_use_again="PROBABLY", interest_question="V1_PREUSE_INTEREST"))

    def test_rows_without_the_question_carry_no_interest_stamp(self):
        row = E.validate_feedback(dict(BASE))
        self.assertNotIn("INTEREST_Q", row["scope"])
        self.assertEqual(row["would_use_again"], "")

    def test_sheet_columns_are_unchanged(self):
        script = (ROOT / "docs" / "feedback_apps_script.gs").read_text(encoding="utf-8")
        cols = re.findall(r"'(\w+)'", re.search(r"const COLUMNS = \[(.*?)\]", script, re.S).group(1))
        self.assertEqual(cols, ["submitted_at", "kind", "rating", "reason_tag", "would_use_again", "wish_ids", "place_ids", "trip_id", "offer_id", "comment", "scope", "data_origin", "consent"])
        self.assertNotIn("interest", script)


class ForwardStatuses(unittest.TestCase):
    ROW = {"kind": "trip"}

    def env(self, **kw):
        return mock.patch.dict(os.environ, kw, clear=False)

    def test_not_configured(self):
        with mock.patch.dict(os.environ, {"FEEDBACK_WEBHOOK_URL": "", "FEEDBACK_TOKEN": ""}):
            self.assertEqual(FB._forward(self.ROW), (False, "not_configured"))

    def test_bad_webhook_host(self):
        with self.env(FEEDBACK_WEBHOOK_URL="https://example.com/x", FEEDBACK_TOKEN="t"):
            self.assertEqual(FB._forward(self.ROW), (False, "bad_webhook_host"))

    def resp(self, body, status=200):
        r = mock.MagicMock()
        r.__enter__.return_value = r
        r.status = status
        r.read.return_value = json.dumps(body).encode()
        return r

    def test_saved_only_when_the_script_says_ok(self):
        with self.env(FEEDBACK_WEBHOOK_URL="https://script.google.com/macros/s/x/exec", FEEDBACK_TOKEN="t"):
            with mock.patch("urllib.request.urlopen", return_value=self.resp({"ok": True})):
                self.assertEqual(FB._forward(self.ROW), (True, "saved"))

    def test_rejected(self):
        with self.env(FEEDBACK_WEBHOOK_URL="https://script.google.com/macros/s/x/exec", FEEDBACK_TOKEN="t"):
            with mock.patch("urllib.request.urlopen", return_value=self.resp({"ok": False, "error": "unauthorized"})):
                self.assertEqual(FB._forward(self.ROW), (False, "rejected"))
            with mock.patch("urllib.request.urlopen", return_value=self.resp({"ok": True}, status=500)):
                self.assertEqual(FB._forward(self.ROW), (False, "rejected"))

    def test_unreachable(self):
        with self.env(FEEDBACK_WEBHOOK_URL="https://script.google.com/macros/s/x/exec", FEEDBACK_TOKEN="t"):
            for exc in (urllib.error.URLError("down"), TimeoutError()):
                with mock.patch("urllib.request.urlopen", side_effect=exc):
                    self.assertEqual(FB._forward(self.ROW), (False, "unreachable"))


class EndpointAnswers(unittest.TestCase):
    """What the endpoint tells the page for every outcome (the page must never show success when nothing was stored)."""

    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), FB.handler)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def post(self, forward_result):
        body = dict(BASE, would_use_again="MAYBE", interest_question="V1_PREUSE_INTEREST")
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}/", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
        with mock.patch.object(FB, "_forward", return_value=forward_result):
            with urllib.request.urlopen(req, timeout=10) as r:
                return json.loads(r.read())

    def test_each_outcome_has_its_own_truthful_message(self):
        seen = {}
        for res in ((True, "saved"), (False, "not_configured"), (False, "bad_webhook_host"), (False, "rejected"), (False, "unreachable")):
            out = self.post(res)
            self.assertEqual((out["saved"], out["mode"]), res)
            self.assertEqual(out["message"], FB.STATUS_MESSAGES[res[1]])
            seen[res[1]] = out
        self.assertEqual(len({o["message"] for o in seen.values()}), 5)                      # five distinct messages
        for mode, out in seen.items():
            if mode != "saved":
                self.assertNotIn("ขอบคุณ", out["message"])
                self.assertNotIn("บันทึกความคิดเห็นแล้ว", out["message"])
                self.assertNotIn("รับข้อมูลแล้ว", out["message"])                              # the old text that sounded like success

    def test_only_a_temporary_connection_problem_is_retryable(self):
        for mode, retry in (("saved", False), ("not_configured", False), ("bad_webhook_host", False), ("rejected", False), ("unreachable", True)):
            self.assertEqual(self.post((mode == "saved", mode))["retryable"], retry, mode)


class PageStatusLogic(unittest.TestCase):
    def test_page_mirrors_the_server_messages(self):
        for mode, text in FB.STATUS_MESSAGES.items():
            self.assertIn(f"{mode}: '{text}'", DEMO, mode)

    def test_success_look_only_for_a_real_save_and_retry_only_for_unreachable(self):
        self.assertIn("const isSaved = (r) => !!r && r.saved === true && r.mode === 'saved'", DEMO)
        self.assertIn("r.mode === 'unreachable'", DEMO)
        self.assertIn("ok ? 'ขอบคุณสำหรับความคิดเห็น' : 'ยังไม่ได้บันทึกความคิดเห็น'", DEMO)

    def test_form_wording(self):
        for text in ("แสดงความสนใจและให้คะแนนคำแนะนำ (Demo)", "คุณสนใจ${INTEREST_TARGET[service]}ที่แนะนำนี้หรือไม่", "'สนใจ'", "'ยังไม่แน่ใจ'", "'ไม่สนใจ'",
                     "would_use_again: interest", "interest_question: 'V1_PREUSE_INTEREST'", "กรุณาเลือกว่าสนใจหรือไม่"):
            self.assertIn(text, DEMO, text)
        self.assertNotIn("เล่าประสบการณ์ให้ MUMU ฟัง", DEMO)


if __name__ == "__main__":
    unittest.main(verbosity=2)
