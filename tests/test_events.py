"""Stage 1 tests: event data QA, EVENT_RANKING_V1, ties, stability.   python -m unittest discover -s tests -v"""
import itertools
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))

import _engine as E  # noqa: E402
import _events as EV  # noqa: E402
m = E.m

A = {"wish_ids": ["W01", "W02", "W03"], "birthdate": "2000-03-12", "exclusions": {}}
B = {"wish_ids": ["W01"], "birthdate": "2000-03-12", "exclusions": {"tradition_groups": ["ฮินดู"]}}
C = {"wish_ids": ["W05"], "birthdate": "2000-03-12", "exclusions": {"tradition_groups": ["ฮินดู"]}}


def profiles_75():
    out = []
    for i, ws in enumerate(list(itertools.combinations(sorted(m.W), 3))[:60]):
        ex = {}
        if i % 5 == 0: ex = {"tradition_groups": ["ฮินดู"]}
        if i % 7 == 0: ex = {"deity_ids": ["D_GANESHA"]}
        if i % 11 == 0: ex = {"place_ids": ["P001"]}
        out.append({"wish_ids": list(ws), "birthdate": "2000-05-15" if i % 2 else "1997-01-02", "exclusions": ex})
    return out + [dict(f) for f in m.FIXTURES]


class DataQA(unittest.TestCase):
    def test_source_rows_and_master_references(self):
        self.assertEqual(len(EV.EVENTS), 37)
        for e in EV.EVENTS:
            self.assertIn(e["deity_id"], m.E, e["event_id"])
            self.assertIn(e["place_id"], m.P, e["event_id"])
            self.assertEqual(e["source_status"], "SOURCE_URL_NOT_IN_TABLE_REVIEW")

    def test_three_problem_events_are_flagged_not_repaired(self):
        st = {k: v["network"] for k, v in EV.STATIC.items()}
        self.assertEqual(st["E_RAHU_WEEKLY"], "NO_VALID_NETWORK_PATH")
        self.assertEqual(st["E_RAHU_TRANSIT_2569"], "NO_VALID_NETWORK_PATH")
        self.assertEqual(st["E_MOON_FESTIVAL_2569"], "RELATIONSHIP_REVIEW_REQUIRED")
        self.assertEqual(sum(v == "GRAPH_VALID" for v in st.values()), 34)
        self.assertNotIn(("D_TUBTIM", "P017"), m.DP)  # the source graph was not touched

    def test_no_event_is_schedule_verified_and_statuses_are_separate(self):
        for v in EV.STATIC.values():
            self.assertEqual(v["event_schedule"], "EVENT_SCHEDULE_UNVERIFIED")
        self.assertEqual(EV.STATIC["E_LAKSHMI_WEEKLY"]["calendar_date"], "CALENDAR_DATE_VERIFIED")
        self.assertEqual(EV.STATIC["E_CHINESE_MOON_NEW"]["calendar_date"], "CALENDAR_DATE_VERIFIED")  # via the HKO table (Stage 2)
        self.assertEqual(EV.STATIC["E_BRAHMA_BIRTH_2569"]["calendar_date"], "DATE_UNVERIFIED")


class Ranking(unittest.TestCase):
    def test_counts_for_the_three_personas(self):
        self.assertEqual(EV.rank_events(A)["counts"]["eligible"], 25)
        self.assertEqual(EV.rank_events(B)["counts"]["eligible"], 2)
        r = EV.rank_events(C)
        self.assertEqual(r["counts"]["eligible"], 0)
        self.assertEqual({x["network_status"] for x in r["excluded"] if x["static"]["network"] == "GRAPH_VALID"} <= {"HARD_EXCLUDED", "NO_PATH_FOR_PROFILE"}, True)

    def test_place_score_matches_step05_and_formula(self):
        ctx = EV.ppr_context(A)
        r = EV.rank_events(A, ctx=ctx)
        step05 = m.get_rankings(A)["scores"]["ppr"]
        for row in r["eligible"]:
            self.assertEqual(row["place_score"], step05[row["place_id"]])
            self.assertAlmostEqual(row["event_score"], 0.5 * row["deity_score"] + 0.5 * row["place_score"], places=15)
            self.assertTrue(0 < row["deity_score"] <= 1 and 0 < row["place_score"] <= 1)
        self.assertEqual(max(x["deity_score"] for x in r["eligible"]) <= 1.0, True)

    def test_scores_do_not_depend_on_the_event_list(self):
        ctx = EV.ppr_context(A)
        full = {x["event_id"]: x for x in EV.rank_events(A, ctx=ctx)["eligible"]}
        subset = [e for e in EV.EVENTS if e["event_id"] not in ("E_NAVARATRI_2569", "E_DIWALI_2570", "E_LAKSHMI_WEEKLY")]
        part = {x["event_id"]: x for x in EV.order(EV.score_events(A, events=subset, ctx=ctx)["eligible"])}
        for eid, row in part.items():
            self.assertEqual(row["deity_score"], full[eid]["deity_score"])
            self.assertEqual(row["place_score"], full[eid]["place_score"])

    def test_not_limited_to_top_15_candidates(self):
        t = E.trace(A)
        top15 = {c["place_id"] for c in t["step3_pagerank"]["candidates"]}
        self.assertGreater(t["step3_pagerank"]["candidate_count"], 15)
        outside = [r for r in t["event_ranking"]["eligible"] if r["place_id"] not in top15]
        self.assertTrue(outside, "expected at least one eligible event whose place is outside the top 15")

    def test_ties_are_broken_by_event_id_only(self):
        rows = EV.rank_events(A)["eligible"]
        self.assertTrue(any(r["tie_group_size"] > 1 for r in rows))
        for a, b in zip(rows, rows[1:]):
            self.assertTrue(a["event_score"] > b["event_score"] or (a["event_score"] == b["event_score"] and a["event_id"] < b["event_id"]))
        self.assertEqual([r["network_rank"] for r in rows], list(range(1, len(rows) + 1)))

    def test_evidence_paths_are_real_edges_and_exclusions_never_leak(self):
        for pr in profiles_75():
            prof = m.normalize_profile(pr)
            for row in EV.rank_events(pr)["eligible"]:
                self.assertNotIn(row["deity_id"], prof["blocked_deity_ids"])
                self.assertNotIn(row["place_id"], prof["blocked_place_ids"])
                self.assertTrue(row["evidence_paths"])
                for z in row["evidence_paths"]:
                    self.assertIn((z["wish_id"], z["deity_id"]), m.WD)
                    self.assertIn((z["deity_id"], z["place_id"]), m.DP)
                    self.assertIn(z["wish_id"], prof["wish_ids"])
                self.assertEqual(row["compatible_wish_ids"], sorted({z["wish_id"] for z in row["evidence_paths"]}))

    def test_problem_events_never_ranked_and_direct_events_are_separate(self):
        ids = {r["event_id"] for r in EV.rank_events(A)["eligible"]}
        self.assertFalse(ids & {"E_RAHU_WEEKLY", "E_RAHU_TRANSIT_2569", "E_MOON_FESTIVAL_2569"})
        direct = EV.rank_events({"wish_ids": ["W04", "W05"], "exclusions": {}})["direct"]
        self.assertEqual({d["type"] for d in direct}, {"CONCERT", "EXAM"})
        for d in direct:
            self.assertEqual((d["network_status"], d["calendar_date"], d["event_schedule"]), ("DIRECT_WISH_BASED", "SYNTHETIC_DATE", "SYNTHETIC_DEMO"))
            self.assertNotIn("evidence_paths", d)
            self.assertNotIn("event_score", d)

    def test_deterministic_and_api_contract(self):
        self.assertEqual(EV.rank_events(A), EV.rank_events(A))
        rec = E.recommend(A)
        self.assertEqual(rec["events"]["version"], "EVENT_RANKING_V1")
        self.assertEqual([r["event_id"] for r in rec["events"]["eligible"]], [r["event_id"] for r in E.trace(A)["event_ranking"]["eligible"]])
        self.assertTrue(E.trace(A)["event_ranking"]["step05_check"])

    def test_existing_behaviour_unchanged(self):
        a = E.recommend(A)
        self.assertEqual(a["model"]["place_recommendation"]["top5"], m.place_recommendation(A)["top5"])
        self.assertEqual(a["model"]["match_trip"], m.match_trip(A))


class Stability(unittest.TestCase):
    def rows(self, specs):
        return [{"event_id": f"E{i:02d}", "deity_id": f"D{i}", "place_id": f"P{i}", "deity_score": d, "place_score": p} for i, (d, p) in enumerate(specs)]

    def test_n_rules(self):
        self.assertEqual(EV.stability_from_rows([])["status"], "NO_ELIGIBLE_NETWORK_EVENTS")
        self.assertEqual(EV.stability_from_rows(self.rows([(1, 1)] * 3))["status"], "NOT_EVALUABLE_INSUFFICIENT_EVENTS")
        five = EV.stability_from_rows(self.rows([(0.9, 0.1), (0.8, 0.2), (0.7, 0.3), (0.6, 0.4), (0.5, 0.5)]))
        self.assertEqual((five["status"], five["interpretation"]), ("TOP5_ONLY", "NOT_EVALUABLE"))

    def test_constant_ranking_has_no_spearman(self):
        r = EV.stability_from_rows(self.rows([(0.5, 0.5)] * 8))
        self.assertEqual(r["interpretation"], "NOT_EVALUABLE_CONSTANT_RANKING")

    def test_tie_boundary_is_labelled_not_judged(self):
        specs = [(0.9, 0.9), (0.8, 0.8), (0.7, 0.7), (0.6, 0.6)] + [(0.5, 0.5)] * 4  # equal scores straddle rank 5/6
        r = EV.stability_from_rows(self.rows(specs))
        self.assertTrue(r["scenarios"]["baseline_50_50"]["tie_boundary"]["straddles"])
        self.assertEqual(r["interpretation"], "TIE_BOUNDARY_REVIEW")

    def test_stable_and_sensitive(self):
        stable = EV.stability_from_rows(self.rows([(1 - i * 0.05, 1 - i * 0.05) for i in range(10)]))
        self.assertEqual(stable["interpretation"], "STABLE")
        flip = [(1 - i * 0.09, i * 0.045) for i in range(10)]  # deity falls, place rises: the weights reverse the order
        self.assertEqual(EV.stability_from_rows(self.rows(flip))["interpretation"], "SENSITIVE")

    def test_spearman_uses_average_ranks(self):
        self.assertEqual(EV.average_ranks([3, 3, 1]), [1.5, 1.5, 3.0])
        self.assertAlmostEqual(EV.spearman([1, 2, 3, 4], [1, 2, 3, 4]), 1.0)
        self.assertIsNone(EV.spearman([1, 1, 1], [1, 2, 3]))

    def test_real_profile_reports_counts(self):
        s = E.trace(A)["event_ranking"]["stability"]
        self.assertEqual(s["n_events"], 25)
        self.assertIn("distinct_deity_place_pairs", s)
        self.assertLess(s["distinct_deity_place_pairs"], s["n_events"])  # several events share a deity/place pair
        self.assertEqual(E.trace(B)["event_ranking"]["stability"]["status"], "NOT_EVALUABLE_INSUFFICIENT_EVENTS")
        self.assertEqual(E.trace(C)["event_ranking"]["stability"]["status"], "NO_ELIGIBLE_NETWORK_EVENTS")


if __name__ == "__main__":
    unittest.main(verbosity=2)
