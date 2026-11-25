"""Final improvement round: birth_signal, seed values, transit display fields, network analysis and graph facts.
python -m unittest discover -s tests -v"""
import csv
import importlib.util
import json
import re
import sys
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
import _engine as E  # noqa: E402
import networkx as nx  # noqa: E402

m = E.m
MON_TO_SUN = [f"2000-01-{d:02d}" for d in range(3, 10)]
NONE = {"tradition_groups": [], "deity_ids": [], "place_ids": []}
read = lambda p: (ROOT / p).read_text(encoding="utf-8")


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def constraint_sets():
    yield "none", NONE
    yield "one place", dict(NONE, place_ids=["P001"])
    for d in ("D_UMA", "D_SKANDA", "D_SARASWATI", "D_LAKSHMI", "D_GANESHA", "D_SHIVA"):
        yield "deity " + d, dict(NONE, deity_ids=[d])
    for g in m.TRADITION_GROUPS:
        yield "group " + g, dict(NONE, tradition_groups=[g])


class BirthSignal(unittest.TestCase):
    def profile(self, birthdate, exc=NONE, wishes=("W01", "W04")):
        return {"wish_ids": list(wishes), "birthdate": birthdate, "exclusions": exc}

    def test_status_matches_the_reference_model_for_7_days_and_every_constraint_set(self):
        seen = Counter()
        for birthdate in MON_TO_SUN:
            for name, exc in constraint_sets():
                prof = m.normalize_profile(self.profile(birthdate, exc))
                ids, refs = m.birth_seed(prof)
                sig = E.birth_signal(prof)
                seen[sig["status"]] += 1
                self.assertEqual([d["id"] for d in sig["deities"]], ids, (birthdate, name))
                self.assertEqual(sig["claim_ids"], refs, (birthdate, name))
                self.assertEqual(sig["status"] == "APPLIED", bool(ids), (birthdate, name))
                if not ids:
                    would = m.birth_seed(dict(prof, blocked_deity_ids=set()))[0]
                    self.assertEqual(sig["status"], "EXCLUDED" if would else "NO_ELIGIBLE_DATA", (birthdate, name))
                    self.assertEqual([d["id"] for d in sig["excluded"]], would, (birthdate, name))
        self.assertEqual(set(seen), {"APPLIED", "EXCLUDED", "NO_ELIGIBLE_DATA"})

    def test_not_provided(self):
        sig = E.recommend(self.profile(None))["birth_signal"]
        self.assertEqual((sig["status"], sig["deities"], sig["claim_ids"]), ("NOT_PROVIDED", [], []))

    def test_wednesday_and_sunday_have_no_eligible_data(self):
        for birthdate in (MON_TO_SUN[2], MON_TO_SUN[6]):
            self.assertEqual(E.recommend(self.profile(birthdate))["birth_signal"]["status"], "NO_ELIGIBLE_DATA")

    def test_excluded_names_the_reason(self):
        by_deity = E.recommend(self.profile(MON_TO_SUN[0], dict(NONE, deity_ids=["D_UMA"])))["birth_signal"]
        self.assertTrue(by_deity["excluded"][0]["by_deity_choice"])
        by_group = E.recommend(self.profile(MON_TO_SUN[0], dict(NONE, tradition_groups=["ฮินดู"])))["birth_signal"]
        self.assertEqual(by_group["excluded"][0]["by_groups"], ["ฮินดู"])

    def test_excluding_a_place_does_not_block_the_birth_signal(self):
        self.assertEqual(E.recommend(self.profile(MON_TO_SUN[0], dict(NONE, place_ids=["P001"])))["birth_signal"]["status"], "APPLIED")

    def test_trace_seeds_before_and_after_normalisation_reproduce_pagerank(self):
        for birthdate in [None, *MON_TO_SUN]:
            pr = self.profile(birthdate)
            T = E.trace(pr)
            S = T["step2_seeds"]
            self.assertAlmostEqual(S["seeds_sum"], sum(S["seeds"].values()), places=12)
            self.assertAlmostEqual(sum(S["seeds_normalized"].values()), 1.0, places=12)
            has = T["birth_signal"]["status"] == "APPLIED"
            self.assertAlmostEqual(S["seeds_sum"], 1.05 if has else 1.0, places=12)
            graph = m.G.copy()
            rank = nx.pagerank(graph, alpha=.85, personalization={n: S["seeds_normalized"].get(n, 0.0) for n in graph}, tol=1e-11, max_iter=1000)
            for node, value in T["step3_pagerank"]["node_scores"].items():
                self.assertAlmostEqual(rank[node], value, places=12)
            self.assertTrue(T["step5_result"]["matches_reference"])

    def test_recommendation_and_trace_give_the_same_signal(self):
        for birthdate in [None, *MON_TO_SUN]:
            self.assertEqual(E.recommend(self.profile(birthdate))["birth_signal"], E.trace(self.profile(birthdate))["birth_signal"])

    def test_no_month_zodiac_or_year_signal_was_added(self):
        rows = {r.get("birth_dimension") for r in m.D["birth_belief"] if r.get("resolution_method") == "EXISTING_MASTER_ID"}
        self.assertIn("weekday", rows)
        source = read("model/network_phase1.py")
        self.assertIn("r.get('birth_dimension')=='weekday'", source)
        self.assertNotRegex(read("api/_engine.py"), r"birth_dimension|zodiac")


class TransitDisplayFields(unittest.TestCase):
    def test_legs_are_the_stored_values_plus_names(self):
        for trip_id, raw in m.TRIPS.items():
            legs = E.trip_detail(trip_id)["legs"]
            self.assertEqual(len(legs), len(raw["route"]["legs"]))
            for view, stored in zip(legs, raw["route"]["legs"]):
                for key, value in stored.items():
                    self.assertEqual(view[key], value, (trip_id, key))
                self.assertEqual(view["from_name"], E.station_name(stored["from"]))
                self.assertTrue(set(view["systems"]) <= {"BTS", "MRT"}, view["systems"])

    def test_total_time_is_the_sum_of_the_parts_shown(self):
        for trip_id in m.TRIPS:
            d = E.trip_detail(trip_id)
            parts = ("rail_min", "walk_min", "train_wait_min", "opening_wait_min", "group_briefing_min", "midday_break_min", "dwell_min")
            self.assertAlmostEqual(sum(d[k] for k in parts), d["duration_min"], delta=0.11, msg=trip_id)

    def test_places_without_access_time_stay_empty(self):
        missing = [p for p, r in m.P.items() if r["access_min_candidate"] is None]
        self.assertTrue(missing)
        for pid in missing:
            self.assertIsNone(E.place_detail(pid)["station"]["access_min_candidate"])

    def test_osm_share_stated_in_the_docs_matches_the_data(self):
        edges = m.D["transit_edges"]
        osm = sum(1 for e in edges if "OSM geometry" in e["method_note"])
        self.assertEqual((osm, len(edges)), (185, 202))
        self.assertIn("185", read("docs/DATA_SOURCES.md"))
        self.assertIn("openstreetmap.org/copyright", read("public/js/osm.js"))


class SourceDataKeptAndHiddenOnlyOnScreen(unittest.TestCase):
    def test_every_internal_caution_has_a_user_sentence(self):
        text = read("public/js/usertext.js")
        for caution in {p.get("caution") for p in m.P.values() if p.get("caution")}:
            self.assertIn(f"'{caution}':", text)

    def test_every_verification_code_has_a_thai_label(self):
        text = read("public/js/usertext.js")
        for code in {r["verification"] for rows in E.RITUALS_BY_ENTITY.values() for r in rows}:
            self.assertIn(code + ":", text)

    def test_api_still_returns_the_source_wording(self):
        self.assertTrue(any("Top_Deities" in r["detail"] for r in E.RITUALS_BY_ENTITY["P013"]))


class NetworkAnalysisResults(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.full = json.loads(read("model/results/network_analysis_v1.json"))
        cls.public = json.loads(read("public/data/network_analysis.json"))
        cls.mod = load_script("network_analysis")

    def test_committed_results_reproduce_exactly(self):
        for path, text in self.mod.render(self.mod.compute()).items():
            self.assertEqual(path.read_text(encoding="utf-8"), text, path.name)

    def test_rewiring_keeps_degree_per_relation_and_the_schema(self):
        import random
        _, ids, _, wd, dp = self.mod.load()
        for edges in (wd, dp):
            new, done = self.mod.rewire(edges, random.Random(1), 10 * len(edges))
            self.assertEqual(done, 10 * len(edges))
            self.assertEqual(len(set(new)), len(edges))
            for side in (0, 1):
                self.assertEqual(Counter(e[side] for e in new), Counter(e[side] for e in edges))
            self.assertNotEqual(set(new), set(edges))
            self.assertEqual({(ids[a][0], ids[b][0]) for a, b in new}, {(ids[a][0], ids[b][0]) for a, b in edges})

    def test_no_name_without_passing_every_criterion(self):
        passes = self.full["null_model"]["modularity_above_chance"]
        for c in self.full["communities"]:
            if c["named"]:
                self.assertTrue(passes and c["wishes"] and c["stability"]["min_confidence"] >= 0.80, c["number"])
            else:
                self.assertIsNone(c["name"])
                self.assertTrue(c["not_named_because"])

    def test_verdict_follows_the_rule_set_before_the_run(self):
        mm = self.full["null_model"]["metrics"]
        expected = all(mm[k]["p_upper"] <= 0.05 for k in ("modularity_greedy", "modularity_louvain_best10"))
        self.assertEqual(self.full["null_model"]["modularity_above_chance"], expected)

    def test_communities_are_the_ones_the_site_already_shows(self):
        graph = json.loads(read("public/data/graph.json"))
        shown = {n["id"]: n["community"] for n in graph["nodes"]}
        for c in self.full["communities"]:
            self.assertTrue(all(shown[x["id"]] == c["index"] for x in c["members"]))
        self.assertAlmostEqual(self.full["observed"]["modularity_shown_partition"], graph["modularity"], places=6)

    def test_degree_by_type_matches_the_model_graph(self):
        rows = list(csv.DictReader(read("model/results/network_analysis/degree_by_type.csv").splitlines()))
        self.assertEqual(len(rows), 101)
        for r in rows:
            total = sum(int(r[k]) for k in ("wish_links", "deity_links", "place_links") if r[k] != "")
            self.assertEqual(total, m.G.degree(r["node_id"]), r["node_id"])


class BirthdayImpactResults(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r = json.loads(read("model/results/birthday_impact_v1.json"))

    def test_committed_results_reproduce_exactly(self):
        mod = load_script("birthday_impact")
        for path, text in mod.render().items():
            self.assertEqual(path.read_text(encoding="utf-8"), text, path.name)

    def test_counts_add_up_and_no_signal_changes_nothing(self):
        self.assertEqual(len(self.r["per_day"]), 7 * 5)
        for d in self.r["per_day"]:
            self.assertEqual(d["profiles"], 175)
            self.assertEqual(d["NO_SIGNAL"] + d["SIGNAL_NO_RANKING_CHANGE"] + d["SIGNAL_RANKING_CHANGED"], d["profiles"])
            self.assertEqual(d["top5_members_changed"] + d["top5_order_only_changed"], d["SIGNAL_RANKING_CHANGED"])
            if d["NO_SIGNAL"]:
                self.assertEqual((d["score_diff_gt_1e-9"], d["trip_match_changed"], d["SIGNAL_RANKING_CHANGED"]), (0, 0, 0))
        same = self.r["same_weekday_different_date_identical"]
        self.assertEqual(same["checked"], same["identical"])


class Documents(unittest.TestCase):
    def test_graph_design_cardinality_matches_the_graph(self):
        doc = read("docs/GRAPH_DESIGN_TH.md")
        self.assertIn("DRAFT", doc)
        count = lambda prefix, other: [sum(1 for u in m.G[n] if u[0] == other) for n in m.G if n[0] == prefix]
        for prefix, other, row in (("W", "D", "Wish → Deity"), ("D", "W", "Deity → Wish"), ("D", "P", "Deity → Place"), ("P", "D", "Place → Deity")):
            values = count(prefix, other)
            line = next(x for x in doc.splitlines() if x.startswith(f"| {row} "))
            cells = [c.strip() for c in line.split("|")[3:6]]
            self.assertEqual(cells[:2], [str(min(values)), str(max(values))], row)
            self.assertAlmostEqual(float(cells[2]), sum(values) / len(values), places=2)

    def test_example_path_exists_with_the_stated_status(self):
        self.assertIn(("W01", "D_LAKSHMI"), m.WD)
        self.assertEqual(E._DP_STATUS[("D_LAKSHMI", "P023")], "CANDIDATE")


class OutOfScopeUntouched(unittest.TestCase):
    def test_sheet_script_and_data_files_unchanged_since_round_4(self):
        import subprocess
        names = ("docs/feedback_apps_script.gs", "api/feedback.py", "model/network_phase1.py", "model/input_drive_v2_snapshot.json",
                 "model/offline_signature_trip_v1.json", "model/ritual_claims.json", "public/data/graph.json", "public/data/results.json",
                 "public/data/trips_design.json", "tests/golden/model_outputs_286c485.json")
        for name in names:
            old = subprocess.run(["git", "show", f"2d3eadd:{name}"], cwd=ROOT, capture_output=True).stdout
            if not old:
                self.skipTest("git history not available")
            self.assertEqual((ROOT / name).read_bytes().replace(b"\r\n", b"\n"), old.replace(b"\r\n", b"\n"), name)

    def test_published_analysis_file_is_not_excluded_from_deploy(self):
        patterns = [x.strip() for x in read(".vercelignore").splitlines() if x.strip() and not x.startswith("#")]
        self.assertNotIn("data/", patterns)
        self.assertFalse([x for x in patterns if re.fullmatch(r"/?public(/data)?/?", x)])


if __name__ == "__main__":
    unittest.main(verbosity=2)
