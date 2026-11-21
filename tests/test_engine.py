"""Parity and safety tests for the service layer.   python -m unittest discover -s tests -v

1. Output of the service layer == the golden output the model team saved in model/results/ (15 fixtures).
2. trace() reproduces get_rankings() on 75 profiles (the same set the model team uses for acceptance).
3. Exclusions are never violated, trips stay fixed, invalid input is rejected, DOB never leaks.
"""
import itertools
import json
import sys
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "scripts"))

import _engine as E  # noqa: E402
m = E.m
GOLDEN = json.loads((ROOT / "model" / "results" / "network_phase1_results.json").read_text(encoding="utf-8"))["examples"]


def acceptance_profiles():
    cases = []
    for i, wishes in enumerate(list(itertools.combinations(sorted(m.W), 3))[:60]):
        exc = {}
        if i % 5 == 0: exc = {"tradition_groups": ["ฮินดู"]}
        if i % 7 == 0: exc = {"deity_ids": ["D_GANESHA"]}
        if i % 11 == 0: exc = {"place_ids": ["P001"]}
        if i % 13 == 0: exc = {"tradition_groups": ["ฮินดู"], "place_ids": ["P001"]}
        cases.append({"profile_id": f"AUTO_{i+1:03d}", "wish_ids": list(wishes),
                      "birthdate": "2000-05-15" if i % 2 else "1997-01-02", "exclusions": exc})
    return cases + list(m.FIXTURES)


class GoldenParity(unittest.TestCase):
    def test_fixture_outputs_equal_saved_reference(self):
        for fx in m.FIXTURES:
            out = E.recommend(fx)
            gold = GOLDEN[fx["profile_id"]]
            self.assertEqual(out["model"]["place_recommendation"], gold["places"], fx["profile_id"])
            self.assertEqual(out["model"]["match_trip"], gold["trip"], fx["profile_id"])


class TraceParity(unittest.TestCase):
    def test_trace_matches_reference_on_75_profiles(self):
        cases = acceptance_profiles()
        self.assertEqual(len(cases), 75)
        for pr in cases:
            t = E.trace(pr)
            self.assertTrue(t["step5_result"]["matches_reference"], pr["profile_id"])
            self.assertEqual(t["step5_result"]["top5"], [x["place_id"] for x in m.place_recommendation(pr)["top5"]])


class Safety(unittest.TestCase):
    def test_no_exclusion_violation_and_paths_valid(self):
        for pr in acceptance_profiles():
            prof = m.normalize_profile(pr)
            out = E.recommend(pr)
            self.assertLessEqual(len(out["top5"]), 5)
            for place in out["top5"]:
                self.assertNotIn(place["place_id"], prof["blocked_place_ids"])
                self.assertTrue(place["paths"])
                for z in place["paths"]:
                    self.assertNotIn(z["deity_id"], prof["blocked_deity_ids"])
                    self.assertIn((z["wish_id"], z["deity_id"]), m.WD)
                    self.assertIn((z["deity_id"], z["place_id"]), m.DP)

    def test_trip_is_one_of_three_fixed_or_abstains(self):
        seen = set()
        for pr in acceptance_profiles():
            t = E.recommend(pr)["trip"]
            if t["matched"]:
                self.assertIn(t["matched"]["trip_id"], {"TRIP_LOVE", "TRIP_CAREER", "TRIP_WEALTH"})
                self.assertEqual(t["matched"]["place_ids_fixed"], m.CATALOG[t["matched"]["trip_id"]]["place_ids"])
                self.assertEqual(t["detail"]["trip_id"], t["matched"]["trip_id"])
            else:
                self.assertEqual(t["decision"], "NO_ELIGIBLE_SIGNATURE_TRIP")
                self.assertIsNone(t["detail"])
            self.assertFalse(t["route_reoptimized_per_user"])
            seen.add(t["decision"])
        self.assertEqual(seen, {"PROVISIONAL_MATCH_NOT_BOOKABLE", "NO_ELIGIBLE_SIGNATURE_TRIP"})

    def test_only_concert_without_hindu_returns_nothing(self):
        out = E.recommend({"wish_ids": ["W05"], "exclusions": {"tradition_groups": ["ฮินดู"]}})
        self.assertEqual(out["top5"], [])
        self.assertTrue(out["limited_results"])
        self.assertEqual(out["trip"]["decision"], "NO_ELIGIBLE_SIGNATURE_TRIP")

    def test_invalid_input_rejected(self):
        for bad in ({"wish_ids": []}, {"wish_ids": ["W01", "W02", "W03", "W04"]}, {"wish_ids": ["WXX"]},
                    {"wish_ids": ["W01"], "birthdate": "2999-01-01"},
                    {"wish_ids": ["W01"], "exclusions": {"tradition_groups": ["nope"]}},
                    {"wish_ids": ["W01"], "exclusions": {"place_ids": ["P999"]}}):
            with self.assertRaises(ValueError):
                E.recommend(bad)

    def test_birthdate_not_echoed(self):
        out = json.dumps(E.recommend({"wish_ids": ["W01"], "birthdate": "2000-05-15"}), ensure_ascii=False)
        self.assertNotIn("2000-05-15", out)
        t = json.dumps(E.trace({"wish_ids": ["W01"], "birthdate": "2000-05-15"}), ensure_ascii=False)
        self.assertNotIn("2000-05-15", t)

    def test_feedback_validation(self):
        ok = E.validate_feedback({"kind": "trip", "rating": 4, "trip_id": "TRIP_LOVE", "wish_ids": ["W01"], "comment": "x" * 500, "consent": True})
        self.assertEqual(len(ok["comment"]), 300)
        for bad in ({"kind": "x", "rating": 3, "consent": True}, {"kind": "trip", "rating": 9, "consent": True},
                    {"kind": "trip", "rating": 3, "trip_id": "T", "consent": True},
                    {"kind": "places", "rating": 3, "place_ids": ["P999"], "consent": True},
                    {"kind": "trip", "rating": 3},  # no consent -> nothing is stored
                    {"kind": "trip", "rating": 3, "consent": "yes"}):
            with self.assertRaises(ValueError):
                E.validate_feedback(bad)

    def test_place_and_trip_detail(self):
        self.assertEqual(E.place_detail("P001")["place_id"], "P001")
        self.assertEqual(len(E.trip_detail("TRIP_LOVE")["stops"]), 4)
        with self.assertRaises(KeyError):
            E.place_detail("P999")


class HttpSmoke(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import dev_server
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), dev_server.Dev)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def call(self, path, body=None):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}",
                                     data=None if body is None else json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json", "Content-Length": str(len(json.dumps(body))) if body is not None else "0"},
                                     method="GET" if body is None else "POST")
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_endpoints(self):
        s, cat = self.call("/api/catalog")
        self.assertEqual((s, len(cat["wishes"]), len(cat["places"])), (200, 10, 52))
        s, rec = self.call("/api/recommendations", {"wish_ids": ["W01", "W03"], "birthdate": "2000-05-15"})
        self.assertEqual(s, 200)
        self.assertLessEqual(len(rec["top5"]), 5)
        s, _ = self.call("/api/recommendations", {"wish_ids": ["W01", "W02", "W03", "W04"]})
        self.assertEqual(s, 400)
        self.assertEqual(self.call("/api/places/P001")[0], 200)
        self.assertEqual(self.call("/api/places/P999")[0], 404)
        self.assertEqual(self.call("/api/trips/TRIP_CAREER")[1]["trip_id"], "TRIP_CAREER")
        s, fb = self.call("/api/feedback", {"kind": "trip", "rating": 5, "trip_id": "TRIP_LOVE", "consent": True})
        self.assertEqual((s, fb["saved"]), (200, False))  # webhook not configured in tests
        self.assertEqual(self.call("/api/feedback", {"kind": "trip", "rating": 5})[0], 400)  # consent missing
        s, off = self.call("/api/offers", {"place_ids": ["P001"], "wish_ids": ["W01"]})
        self.assertTrue(all(not o["is_real_provider"] for o in off["offers"]))
        s, tr = self.call("/api/trace", {"wish_ids": ["W02"]})
        self.assertTrue(tr["step5_result"]["matches_reference"])


PERSONAS = {  # synthetic personas for the cross-tab acceptance test
    "A_general": {"wish_ids": ["W01", "W02", "W03"], "birthdate": "2000-03-12", "exclusions": {}},
    "B_no_hindu": {"wish_ids": ["W01"], "birthdate": "2000-03-12", "exclusions": {"tradition_groups": ["ฮินดู"]}},
    "C_no_trip": {"wish_ids": ["W05"], "birthdate": "2000-03-12", "exclusions": {"tradition_groups": ["ฮินดู"]}},
}


class CrossTab(HttpSmoke):
    """Tab 1 (/api/mumu/recommendations) and Tab 2 (/api/trace) must tell the same story for one profile."""

    def test_aliases_and_versions(self):
        s, cat = self.call("/api/mumu/catalog")
        self.assertEqual(s, 200)
        for k in ("model", "dataset_title", "data_as_of", "snapshot_sha256", "trip_design"):
            self.assertTrue(cat["versions"][k], k)
        self.assertEqual(self.call("/api/mumu/places/P001")[0], 200)
        self.assertEqual(self.call("/api/mumu/trips/TRIP_LOVE")[0], 200)
        s, off = self.call("/api/mumu/proxy-offers?place_ids=P001&wish_ids=W01")
        self.assertEqual(s, 200)
        self.assertTrue(off["offers"] and all(not o["is_real_provider"] for o in off["offers"]))

    def test_focus_is_not_a_model_input(self):
        base = {"wish_ids": ["W01", "W02", "W03"], "birthdate": "2000-03-12"}
        a = self.call("/api/mumu/recommendations", base)[1]
        b = self.call("/api/mumu/recommendations", dict(base, focus_wish_id="W02"))[1]
        self.assertEqual(a["model"], b["model"])  # focus must never change scores, Top 5 or trip matching

    def test_personas_match_across_tabs(self):
        decisions = {}
        for name, prof in PERSONAS.items():
            s1, rec = self.call("/api/mumu/recommendations", prof)
            s2, tr = self.call("/api/trace", prof)
            self.assertEqual((s1, s2), (200, 200), name)
            self.assertEqual([p["place_id"] for p in rec["top5"]], tr["step5_result"]["top5"], name)
            for p in rec["top5"]:  # evidence paths identical
                tab1 = sorted((z["wish_id"], z["deity_id"]) for z in p["paths"])
                tab2 = sorted((z["wish_id"], z["deity_id"]) for z in tr["step5_result"]["paths"][p["place_id"]])
                self.assertEqual(tab1, tab2, (name, p["place_id"]))
            self.assertEqual(rec["trip"]["decision"], tr["trip_matching"]["result"]["decision"], name)
            self.assertEqual((rec["trip"]["matched"] or {}).get("trip_id"),
                             (tr["trip_matching"]["result"]["matched_trip"] or {}).get("trip_id"), name)
            self.assertEqual(rec["trip"]["all_scores"], [dict(s, trip_name=m.CATALOG[s["trip_id"]]["title"], wish_names=[m.W[w]["wish_th"] for w in s["user_wishes_covered"]]) for s in tr["trip_matching"]["result"]["all_trip_scores"]], name)
            self.assertEqual(rec["versions"], tr["versions"], name)
            blocked = set(tr["profile"]["blocked_deity_ids"])
            for p in rec["top5"]:
                self.assertFalse({z["deity_id"] for z in p["paths"]} & blocked, name)
                self.assertNotIn(p["place_id"], tr["profile"]["blocked_place_ids"], name)
            decisions[name] = rec["trip"]["decision"]
        self.assertEqual(decisions["A_general"], "PROVISIONAL_MATCH_NOT_BOOKABLE")
        self.assertEqual(decisions["C_no_trip"], "NO_ELIGIBLE_SIGNATURE_TRIP")

    def test_trace_reports_what_exclusions_removed(self):
        tr = self.call("/api/trace", PERSONAS["B_no_hindu"])[1]
        rm = tr["step1_prune"]["removed_edges"]
        self.assertGreater(rm["wish_deity"], 0)
        self.assertGreater(rm["deity_place"], 0)
        self.assertLessEqual(rm["candidates_after"], rm["candidates_before"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
