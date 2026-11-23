"""Expert round 3: demo-only proxy form (no network, no storage), rating question V2 + version stamp, Tab 2 station names.
python -m unittest discover -s tests -v"""
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
import _engine as E  # noqa: E402

JS = ROOT / "public" / "js"
DEMO = (JS / "demo.js").read_text(encoding="utf-8")
DESIGNER = (JS / "designer.js").read_text(encoding="utf-8")
PROXY = DEMO[DEMO.index("function openProxyDemo"):DEMO.index("const RATING_QUESTION")]
BASE = {"kind": "places", "rating": 4, "consent": True, "wish_ids": ["W01"], "place_ids": [], "comment": "x"}


class ProxyDemoForm(unittest.TestCase):
    def test_nothing_leaves_the_page_and_nothing_is_stored(self):
        for forbidden in ("API.", "fetch(", "postJSON", "getJSON", "localStorage", "sessionStorage", "indexedDB", "XMLHttpRequest", "sendBeacon", "store()"):
            self.assertNotIn(forbidden, PROXY, forbidden)

    def test_values_are_cleared_when_it_closes(self):
        self.assertIn("name.value = ''; wish.value = ''", PROXY)
        self.assertIn("dlg.addEventListener('close'", PROXY)

    def test_it_says_it_is_a_demo_with_no_provider(self):
        for text in ("ไม่มีผู้ให้บริการรับคำขอจริง", "ชื่อสมมติ", "ไม่มีการจองหรือชำระเงิน"):
            self.assertIn(text, PROXY)

    def test_inputs_do_not_invite_browser_autofill_of_real_names(self):
        self.assertGreaterEqual(PROXY.count("autocomplete: 'off'"), 2)


class RatingQuestionVersion(unittest.TestCase):
    def test_question_text_is_about_relevance_not_satisfaction(self):
        self.assertIn("นี้ตรงกับความสนใจของคุณมากน้อยแค่ไหน", DEMO)
        self.assertIn("rating_question: 'V2_RELEVANCE'", DEMO)
        for w in ("สมหวัง", "ผิดหวัง"):
            self.assertNotIn(w, DEMO)

    def test_new_clients_are_stamped_v2_and_old_clients_v1(self):
        self.assertTrue(E.validate_feedback(dict(BASE, rating_question="V2_RELEVANCE"))["scope"].endswith("|RATING_Q=V2_RELEVANCE"))
        self.assertTrue(E.validate_feedback(dict(BASE))["scope"].endswith("|RATING_Q=V1_GENERAL"))      # a cached old page sends no version

    def test_unknown_version_is_rejected(self):
        with self.assertRaises(ValueError):
            E.validate_feedback(dict(BASE, rating_question="V9"))

    def test_sheet_schema_and_apps_script_are_unchanged(self):
        row = E.validate_feedback(dict(BASE, rating_question="V2_RELEVANCE"))
        script = (ROOT / "docs" / "feedback_apps_script.gs").read_text(encoding="utf-8")
        cols = re.search(r"const COLUMNS = \[(.*?)\]", script, re.S).group(1)
        for c in re.findall(r"'(\w+)'", cols):
            self.assertIn(c, {**row, "submitted_at": 1})
        self.assertNotIn("rating_question", script)                                                       # no new column

    def test_the_version_dates_are_documented(self):
        doc = (ROOT / "docs" / "DATA_SOURCES.md").read_text(encoding="utf-8")
        for text in ("V1_GENERAL", "V2_RELEVANCE", "2026-11-23", "ห้ามนำคะแนน V1 และ V2 มาเฉลี่ย"):
            self.assertIn(text, doc)
        self.assertEqual(E.RATING_QUESTION_V2_FROM, "2026-11-23")


class Tab2StationNames(unittest.TestCase):
    def test_designer_shows_name_first_and_code_second(self):
        self.assertIn("s.station_name ? `${s.station_name} (${s.station_id})` : s.station_id", DESIGNER)

    def test_designer_data_has_a_name_for_every_stop(self):
        import json
        design = json.loads((ROOT / "public" / "data" / "trips_design.json").read_text(encoding="utf-8"))
        stops = []

        def walk(o):
            if isinstance(o, dict):
                if isinstance(o.get("stops"), list):
                    stops.extend(s for s in o["stops"] if isinstance(s, dict) and "station_id" in s)
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(design)
        self.assertTrue(stops)
        self.assertTrue(all(s.get("station_name") for s in stops))


class Phase2StaysADocument(unittest.TestCase):
    def test_expert_conclusions_are_recorded_and_reviewer_is_tbd(self):
        doc = (ROOT / "docs" / "PHASE2_BIRTHDAY_MULTISIGNAL_PROPOSAL_TH.md").read_text(encoding="utf-8")
        for text in ("ตรุษจีน", "ไม่เกิน 0.05", "TBD", "ไม่พัฒนาฟังก์ชัน"):
            self.assertIn(text, doc)


if __name__ == "__main__":
    unittest.main(verbosity=2)
