"""Rigor addendum: the evaluation script is read-only, deterministic, and its structural facts hold.   python -m unittest discover -s tests -v"""
import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
import _engine as E  # noqa: E402

spec = importlib.util.spec_from_file_location("evaluate_rigor", ROOT / "scripts" / "evaluate_rigor.py")
R = importlib.util.module_from_spec(spec)
spec.loader.exec_module(R)
m = E.m
RESULTS = json.loads((ROOT / "model" / "results" / "network_phase1_results.json").read_text(encoding="utf-8"))
ADD = json.loads((ROOT / "model" / "results" / "rigor_addendum_v1.json").read_text(encoding="utf-8"))


class OriginalResultsAreUntouched(unittest.TestCase):
    def test_reference_numbers_are_still_the_published_ones(self):
        fx = RESULTS["structural_acceptance"]["source_aligned_fixture_results"]
        self.assertEqual((fx["popularity"]["mean_ndcg_at5_over_nonempty"], fx["ppr"]["mean_ndcg_at5_over_nonempty"], fx["ppr_coverage"]["mean_ndcg_at5_over_nonempty"]), (0.688, 0.7622, 0.7622))
        ho = RESULTS["graph_link_holdout"]
        self.assertEqual((ho["models"]["ppr"]["hit_rate_at5"], ho["models"]["degree"]["hit_rate_at5"], ho["number_source_edges_tested"]), (0.6667, 0.8125, 28))

    def test_addendum_reproduces_the_published_fixture_means(self):
        self.assertEqual(ADD["fixtures"]["means"], {"popularity": 0.688, "direct": 0.6831, "ppr": 0.7622, "ppr_coverage": 0.7622})


class FixturesAndCoverageStructure(unittest.TestCase):
    def test_coverage_cannot_change_a_single_wish_profile(self):
        singles = [f for f in m.FIXTURES if len(f["wish_ids"]) == 1]
        self.assertEqual(len(singles), 13)
        for f in singles:
            rr = m.get_rankings(f)
            self.assertEqual(rr["ranked"]["ppr"][:5], rr["ranked"]["ppr_coverage"][:5], f["profile_id"])

    def test_fixture_counts_and_usable_profiles(self):
        f = ADD["fixtures"]
        self.assertEqual((f["n_profiles"], f["n_with_valid_labels"], f["single_wish_profiles"], f["multi_wish_profiles"]), (15, 14, 13, 2))

    def test_coverage_never_makes_wish_coverage_worse(self):
        for k, v in ADD["coverage_layer"]["by_n_wishes"].items():
            self.assertEqual(v["coverage_down"], 0, k)
        self.assertEqual(ADD["coverage_layer"]["by_n_wishes"]["1"]["top5_set_changed"], 0)


class LeaveOneEdgeOut(unittest.TestCase):
    def test_every_eligible_edge_is_hidden_exactly_once(self):
        loeo = ADD["leave_one_edge_out"]
        self.assertEqual(loeo["n_edges"], RESULTS["graph_link_holdout"]["number_source_edges_tested"])
        keys = [(r["deity_id"], r["place_id"]) for r in loeo["per_edge"]]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertTrue(all(k in m.DP for k in keys))

    def test_statistics_are_internally_consistent(self):
        loeo = ADD["leave_one_edge_out"]
        for k in ("ppr", "degree"):
            mod = loeo["models"][k]
            self.assertEqual(mod["hits"], sum(1 for r in loeo["per_edge"] if r[k + "_rank"] <= 5))
            lo, hi = mod["wilson95"]
            self.assertTrue(lo <= mod["hit_at5"] <= hi)
        p = loeo["paired"]
        self.assertEqual(p["hit_only_ppr"] - p["hit_only_degree"], loeo["models"]["ppr"]["hits"] - loeo["models"]["degree"]["hits"])
        self.assertTrue(0 <= p["exact_mcnemar_p"] <= 1)


class ScriptIsDeterministicAndReadOnly(unittest.TestCase):
    def test_same_numbers_every_run(self):
        a, b = R.fixtures(), R.fixtures()
        self.assertEqual(a["pairs"], b["pairs"])
        self.assertEqual(R.loeo()["models"], ADD["leave_one_edge_out"]["models"])

    def test_statistics_helpers(self):
        self.assertEqual(R.binom_two_sided(0, 1), 1.0)
        self.assertEqual(R.binom_two_sided(0, 10), round(2 / 2 ** 10, 4))
        lo, hi = R.wilson(22, 28)
        self.assertTrue(0.6 < lo < 0.62 and 0.89 < hi < 0.91)

    def test_ci_of_the_ppr_vs_popularity_difference_includes_zero(self):
        lo, hi = ADD["fixtures"]["pairs"]["ppr_minus_popularity"]["ci95_bootstrap"]
        self.assertTrue(lo < 0 < hi)                                          # not significant: a statement the docs must keep making


if __name__ == "__main__":
    unittest.main(verbosity=2)
