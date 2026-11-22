"""Model Evaluation page (Tab 2 -> 05): numbers come from the result files, wording stays within the evidence.   python -m unittest discover -s tests -v"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = (ROOT / "public" / "js" / "evaluation.js").read_text(encoding="utf-8")
SOURCE = json.loads((ROOT / "model" / "results" / "rigor_addendum_v1.json").read_text(encoding="utf-8"))
PUBLISHED = (ROOT / "public" / "data" / "rigor_addendum.json").read_bytes()
LEGACY = json.loads((ROOT / "model" / "results" / "network_phase1_results.json").read_text(encoding="utf-8"))


class DataTraceability(unittest.TestCase):
    def test_the_web_copy_is_byte_identical_to_the_source_of_truth(self):
        self.assertEqual(PUBLISHED, (ROOT / "model" / "results" / "rigor_addendum_v1.json").read_bytes())

    def test_page_reads_the_published_file_and_has_no_typed_in_results(self):
        self.assertIn("/data/rigor_addendum.json", PAGE)
        for literal in ("78.6", "82.1", "0.7622", "0.6880", "0.688", "95.8", "98.1", "66.67", "81.25", "0.0742", "0.0099", "0.1959", "22/28", "23/28"):
            self.assertNotIn(literal, PAGE, f"{literal} must come from the data files, not from the page source")


class NumbersTheExpertListed(unittest.TestCase):
    def test_leave_one_edge_out(self):
        L = SOURCE["leave_one_edge_out"]
        self.assertEqual((L["n_edges"], L["models"]["ppr"]["hits"], L["models"]["degree"]["hits"]), (28, 22, 23))
        self.assertEqual((round(L["models"]["ppr"]["hit_at5"] * 100, 1), round(L["models"]["degree"]["hit_at5"] * 100, 1)), (78.6, 82.1))
        self.assertEqual(L["paired"]["exact_mcnemar_p"], 1.0)

    def test_baseline_comparison(self):
        fx = SOURCE["fixtures"]
        self.assertEqual((fx["n_profiles"], fx["n_with_valid_labels"]), (15, 14))
        self.assertEqual(fx["means"], {"popularity": 0.688, "direct": 0.6831, "ppr": 0.7622, "ppr_coverage": 0.7622})
        pair = fx["pairs"]["ppr_minus_popularity"]
        self.assertEqual(pair["mean_diff_ndcg_at5"], 0.0742)
        self.assertEqual(pair["ci95_bootstrap"], [-0.0099, 0.1959])

    def test_coverage_summary(self):
        c3 = SOURCE["coverage_layer"]["by_n_wishes"]["3"]
        self.assertEqual((c3["profiles"], c3["coverage_up"], c3["coverage_down"]), (120, 8, 0))
        self.assertEqual((round(c3["mean_covered_ppr"] * 100, 1), round(c3["mean_covered_ppr_coverage"] * 100, 1)), (95.8, 98.1))

    def test_legacy_experiment_is_still_traceable(self):
        ho = LEGACY["graph_link_holdout"]
        self.assertEqual((ho["models"]["ppr"]["hit_rate_at5"], ho["models"]["degree"]["hit_rate_at5"], ho["models"]["ppr"]["samples"]), (0.6667, 0.8125, 48))
        self.assertIn("Legacy Experiment", PAGE)
        self.assertIn("ho.models", PAGE)                                         # the old numbers are still read from results.json
        self.assertIn("ไม่ใช่ ${ho.models.ppr.samples} เส้นอิสระ", PAGE)            # and explained as repeated random draws, not independent edges


class WordingStaysWithinTheEvidence(unittest.TestCase):
    def test_no_claim_that_a_method_wins_or_is_more_accurate(self):
        for word in ("ชนะ", "แพ้", "แม่นกว่า", "เหนือกว่าอย่างมีนัย", "outperform", "significantly better"):
            self.assertNotIn(word, PAGE, word)
        for m in re.finditer(r"เหนือกว่า", PAGE):                                # only allowed inside a sentence that denies it
            window = PAGE[max(0, m.start() - 90):m.end() + 10]
            self.assertTrue("ไม่ได้" in window or "ไม่ได้" in window or "ไม่ว่า" in window or "สรุปไม่ได้" in window or "ไม่อ้าง" in window, window)

    def test_the_required_caveats_are_present(self):
        for must in ("ไม่พบความแตกต่างอย่างมีนัยสำคัญทางสถิติ", "label มาจาก Knowledge Graph เดียวกัน", "ไม่ใช่ผลประเมินโดยผู้ใช้จริง",
                     "ไม่ใช่ความพึงพอใจของผู้ใช้", "คำนวณ NDCG ได้ 14 โปรไฟล์"):
            self.assertIn(must, PAGE, must)

    def test_scope_guard_other_features_not_touched(self):
        self.assertIn("6b · Event Recommendation & Reminder Checks", PAGE)        # calendar/reminder section kept as it was


if __name__ == "__main__":
    unittest.main(verbosity=2)
