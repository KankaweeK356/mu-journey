"""Requirement "price and travel rounds" (2026-11-25): data snapshot, display-layer only, model untouched.
python -m unittest discover -s tests -v"""
import json
import subprocess
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
import _engine as E  # noqa: E402

TEXT = (ROOT / "public" / "data" / "trip_products.json").read_text(encoding="utf-8")
DATA = json.loads(TEXT)
EXPECTED = {"TRIP_LOVE": (899, "09:00", "13:15"), "TRIP_CAREER": (1099, "09:00", "14:00"), "TRIP_WEALTH": (999, "09:00", "13:15")}
read = lambda p: (ROOT / p).read_text(encoding="utf-8")


class Catalogue(unittest.TestCase):
    def test_price_time_capacity_and_meeting_point(self):
        self.assertEqual(set(DATA["trips"]), set(E.m.TRIPS))                      # joined by the model's Trip ID
        for trip_id, (price, start, end) in EXPECTED.items():
            t = DATA["trips"][trip_id]
            self.assertEqual((t["price_thb"], t["start_time"], t["end_time"], t["capacity"], t["meeting_point"]), (price, start, end, 10, "BTS สยาม"))
            self.assertEqual(t["status"], "MOCK_NOT_BOOKABLE")

    def test_rounds_are_the_24_weekend_rounds_of_the_schedule_sheet(self):
        s = DATA["sessions"]
        self.assertEqual(len(s), 24)
        self.assertEqual(len({x["session_id"] for x in s}), 24)
        dates = sorted({x["service_date"] for x in s})
        self.assertEqual(dates, [f"2026-12-{d:02d}" for d in (5, 6, 12, 13, 19, 20, 26, 27)])
        self.assertTrue(all(date.fromisoformat(d).weekday() >= 5 for d in dates))
        for x in s:
            t = DATA["trips"][x["trip_id"]]
            self.assertEqual((x["price_thb"], x["start_time"], x["end_time"], x["capacity"]), (t["price_thb"], t["start_time"], t["end_time"], t["capacity"]))

    def test_service_time_equals_model_duration_plus_stated_buffer(self):
        for trip_id, t in DATA["trips"].items():
            self.assertAlmostEqual(t["model_duration_min"], E.trip_detail(trip_id)["duration_min"], delta=0.05)
            minutes = lambda c: int(c[:2]) * 60 + int(c[3:])
            self.assertAlmostEqual(minutes(t["end_time"]) - minutes(t["start_time"]), t["model_duration_min"] + t["buffer_min"], places=6)

    def test_no_cost_figure_and_no_link_to_the_workbook_is_published(self):
        low = TEXT.lower()
        for banned in ("cost", "margin", "revenue", "ต้นทุน", "กำไร", "docs.google.com", "drive.google.com", "/d/"):
            self.assertNotIn(banned, low, banned)
        tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8").stdout
        self.assertNotIn("Mock_Trip_Catalog", tracked)


class DisplayLayerOnly(unittest.TestCase):
    def test_python_model_and_service_never_read_the_catalogue(self):
        for path in [*(ROOT / "api").glob("*.py"), ROOT / "model" / "network_phase1.py"]:
            self.assertNotIn("trip_products", path.read_text(encoding="utf-8"), path.name)
        self.assertEqual(E.trip_detail("TRIP_LOVE")["commercial_status"], "PRICE_AND_CAPACITY_TBD")      # model output unchanged

    def test_model_data_feedback_and_trips_are_byte_identical_to_a04c459(self):
        for name in ("model/network_phase1.py", "model/input_drive_v2_snapshot.json", "model/offline_signature_trip_v1.json", "public/data/graph.json",
                     "public/data/trips_design.json", "api/feedback.py", "docs/feedback_apps_script.gs", "tests/golden/model_outputs_286c485.json"):
            old = subprocess.run(["git", "show", f"a04c459:{name}"], cwd=ROOT, capture_output=True).stdout
            if not old:
                self.skipTest("git history not available")
            self.assertEqual((ROOT / name).read_bytes().replace(b"\r\n", b"\n"), old.replace(b"\r\n", b"\n"), name)

    def test_chosen_date_is_never_sent(self):
        demo = read("public/js/demo.js")
        self.assertNotRegex(demo[demo.index("function openFeedback"):demo.index("function openPlace")], r"tripDate|service_date|travel_date")
        self.assertIn("tripDate: null", read("public/js/state.js"))

    def test_fingerprint_is_the_same_for_crlf_and_lf_checkouts(self):
        self.assertEqual(E.VERSIONS["snapshot_sha256"], "44f01c2b5ac6")
        self.assertIn('replace(b"\\r\\n", b"\\n")', read("api/_engine.py"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
