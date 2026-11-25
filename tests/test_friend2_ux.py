"""Second friend's feedback (display and wording only): station names, label legend, "register interest" wording, trip price/date "not set".
python -m unittest discover -s tests -v"""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
import _engine as E  # noqa: E402

DEMO = (ROOT / "public" / "js" / "demo.js").read_text(encoding="utf-8")
SNAP = json.loads((ROOT / "model" / "input_drive_v2_snapshot.json").read_text(encoding="utf-8"))["tables"]
PROFILE = {"wish_ids": ["W02"], "birthdate": None, "exclusions": {"tradition_groups": [], "deity_ids": [], "place_ids": []}}


class StationNames(unittest.TestCase):
    def test_recommendation_carries_station_name_and_keeps_station_id(self):
        top = E.recommend(PROFILE)["top5"]
        self.assertTrue(top)
        names = {s["station_id"]: s["name_th"] for s in SNAP["stations"]}
        for p in top:
            self.assertIn("station_id", p)                                       # existing field untouched
            self.assertEqual(p["station_name"], names.get(p["station_id"]))

    def test_place_detail_carries_station_name(self):
        pid = E.recommend(PROFILE)["top5"][0]["place_id"]
        st = E.place_detail(pid)["station"]
        self.assertIn("id", st)
        self.assertTrue(st["name_th"])

    def test_every_place_with_a_station_has_a_thai_name(self):
        for pl in SNAP["places"]:
            sid = pl.get("routing_station_id")
            if sid:
                self.assertTrue(E.station_name(sid), f"{pl['place_id']} {sid}")

    def test_ranking_is_not_affected(self):
        ref = [p["place_id"] for p in E.m.place_recommendation(PROFILE)["top5"]]        # straight from the unmodified model
        self.assertEqual([p["place_id"] for p in E.recommend(PROFILE)["top5"]], ref)

    def test_pages_show_the_name_and_fall_back_to_the_code(self):
        self.assertIn("stationText(p.station_name, p.station_system, p.station_id, 'สถานีใกล้สุด')", DEMO)
        self.assertIn("stationText(P.station.name_th, P.station.system, P.station.id)", DEMO)
        text = (ROOT / "public" / "js" / "usertext.js").read_text(encoding="utf-8")
        self.assertIn("name || id", text)                                          # the fallback itself; behaviour in tests/js/usertext.test.mjs


class WordingAndLegend(unittest.TestCase):
    def test_interest_buttons_say_register_interest_not_booking(self):
        self.assertIn("แสดงความสนใจทริป (Demo)", DEMO)
        self.assertIn("แสดงความสนใจบริการ (Demo)", DEMO)
        self.assertNotIn("ลงทะเบียนสนใจ", DEMO.replace("ไม่ใช่การลงทะเบียน", ""))
        self.assertNotIn("'ทดลองสนใจทริป'", DEMO)
        self.assertIn("ไม่ใช่การลงทะเบียน จอง หรือสั่งซื้อ", DEMO)

    def test_trip_price_and_date_are_labelled_mock_and_booking_stays_closed(self):
        # superseded 2026-11-25: price and rounds now come from the mock catalogue (tests/test_trip_products.py)
        self.assertNotIn("ยังไม่กำหนด", DEMO)
        self.assertIn("ราคาและรอบเดินทางเป็นข้อมูลจำลอง ยังไม่เปิดรับจองจริง", DEMO)
        self.assertIn("การจองล่วงหน้า: ยังไม่เปิดจอง", DEMO)
        self.assertEqual(E.trip_detail("TRIP_LOVE")["commercial_status"], "PRICE_AND_CAPACITY_TBD")   # the claim comes from the data, no invented price
        self.assertNotRegex(DEMO, r"ราคา[^'`\n]{0,12}\d{2,}\s*บาท.{0,20}ทริป")

    def test_legend_explains_the_labels_and_the_weekday_only_use(self):
        for text in ("ป้ายต่าง ๆ หมายถึงอะไร", "ป้ายชมพู", "ป้ายทอง", "ใช้เฉพาะวันเกิดในสัปดาห์ ยังไม่ใช้เดือนเกิด ราศี หรือปีนักษัตร"):
            self.assertIn(text, DEMO)
        self.assertGreaterEqual(DEMO.count("legend()"), 2)                       # step 04 and step 05


if __name__ == "__main__":
    unittest.main(verbosity=2)
