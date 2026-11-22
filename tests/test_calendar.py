"""Stage 2 tests: HKO lunar table, occurrences, Layer B display.   python -m unittest discover -s tests -v"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))

import _calendar as CAL  # noqa: E402
import _engine as E  # noqa: E402
import _events as EV  # noqa: E402
import _http  # noqa: E402

A = {"wish_ids": ["W01", "W02", "W03"], "birthdate": "2000-03-12", "exclusions": {}}


class LunarTable(unittest.TestCase):
    def test_provenance_and_coverage(self):
        L = CAL.LUNAR
        self.assertEqual((L["rows"], L["covers"]), (730, ["2026-01-01", "2027-12-31"]))
        for k in ("source_url", "source_year", "retrieved_at", "attribution", "conversion_version", "leap_month_check"):
            self.assertTrue(L[k], k)
        self.assertFalse(L["leap_month_in_range"])
        self.assertIn("DATA.GOV.HK", L["attribution"])

    def test_known_lunar_dates(self):
        by = CAL.LUNAR["by_lunar_month_day"]
        self.assertEqual(by["01-01"], ["2026-02-17", "2027-02-06"])   # Chinese New Year
        self.assertEqual(by["01-15"], ["2026-03-03", "2027-02-20"])
        self.assertEqual(CAL.LUNAR["lunar_new_year_eve"], ["2026-02-16", "2027-02-05"])

    def test_lunar_events_are_now_calendar_verified_but_schedule_stays_unverified(self):
        for eid in ("E_CHINESE_MOON_NEW", "E_CHINESE_MOON_FULL"):
            self.assertEqual(EV.STATIC[eid]["calendar_date"], "CALENDAR_DATE_VERIFIED")
            self.assertEqual(EV.STATIC[eid]["event_schedule"], "EVENT_SCHEDULE_UNVERIFIED")
            self.assertEqual(EV.SCHEDULE[eid]["calendar_basis"], "HKO_TABLE")
        for eid in ("E_CHINESE_MOON_NEW", "E_CHINESE_MOON_FULL"):   # 730 days = about 24.7 lunar months, so 24-25 dates
            ds = [CAL.d(x) for x in EV.SCHEDULE[eid]["dates"]]
            self.assertIn(len(ds), (24, 25))
            self.assertTrue(all(29 <= (b - a).days <= 30 for a, b in zip(ds, ds[1:])), eid)  # consecutive lunar months

    def test_crosscheck_is_information_only(self):
        cc = {k: v for k, v in EV.CROSSCHECK.items() if v}
        self.assertTrue(cc)
        self.assertTrue(cc["E_CHINESE_NEW_YEAR_2569"]["match"] and cc["E_CHINESE_NEW_YEAR_2570"]["match"])
        self.assertTrue(cc["E_CHINESE_NY_EVE_2569"]["match"] and cc["E_YUANXIAO_2569"]["match"])
        for eid in cc:                                    # a typed date never gets promoted by the cross-check
            self.assertEqual(EV.STATIC[eid]["calendar_date"], "DATE_UNVERIFIED")


class Occurrences(unittest.TestCase):
    def test_thai_dates_convert_be_to_gregorian_without_shifting(self):
        self.assertEqual(CAL.parse_thai_range("14-25 ก.ย. 2569"), ("2026-09-14", "2026-09-25"))
        self.assertEqual(CAL.parse_thai_range("29 ก.ย. - 9 ต.ค. 2570"), ("2027-09-29", "2027-10-09"))
        self.assertEqual(CAL.parse_thai_range("20 ต.ค. 2569"), ("2026-10-20", "2026-10-20"))
        for eid, s in EV.SCHEDULE.items():
            if s["kind"] == "annual":
                o = s["occurrences"][0]
                self.assertLessEqual(o["start"], o["end"], eid)
                self.assertEqual(o["start"][:4], str(int(eid[-4:]) - 543) if eid[-4:].isdigit() else o["start"][:4], eid)

    def test_all_37_events_have_a_rule(self):
        self.assertEqual(len(EV.SCHEDULE), 37)
        self.assertEqual([k for k, s in EV.SCHEDULE.items() if s["kind"] == "none"], [])

    def test_weekly_and_first_saturday(self):
        two = EV.SCHEDULE["E_GANESHA_WEEKLY"]
        self.assertEqual(two["weekdays"], [1, 3])
        days = CAL.occurrences_between(two, "2026-11-21", "2026-11-30")
        self.assertEqual([o["start"] for o in days], ["2026-11-24", "2026-11-26"])
        sat = CAL.occurrences_between(EV.SCHEDULE["E_CITYPILLAR_MONTHLY"], "2026-11-21", "2027-02-28")
        self.assertEqual([o["start"] for o in sat], ["2026-12-05", "2027-01-02", "2027-02-06"])

    def test_lunar_moon_next_date(self):
        c = CAL.classify(EV.SCHEDULE["E_CHINESE_MOON_NEW"], "2026-11-21")
        self.assertEqual(c["display_status"], "UPCOMING")
        self.assertIn(c["next_start"], CAL.LUNAR["by_lunar_month_day"]["11-01"])
        self.assertTrue(0 < c["days_until"] <= 31)


class LayerB(unittest.TestCase):
    def setUp(self):
        self.rows = EV.rank_events(A)["eligible"]

    def test_past_events_are_not_upcoming_and_nothing_is_shifted_a_year(self):
        d = CAL.display_layer(self.rows, "2026-11-21")
        shown = {r["event_id"] for r in d["displayable"]}
        hidden = {r["event_id"]: r for r in d["not_displayed"]}
        self.assertIn("E_DIWALI_2569", hidden)                    # 8 Nov 2026: already past
        self.assertEqual(hidden["E_DIWALI_2569"]["display_status"], "PAST")
        self.assertNotIn("E_DIWALI_2569", shown)
        self.assertIn("E_DIWALI_2570", shown)                     # a separate occurrence of its own, not a shifted copy
        self.assertEqual(d["counts"]["displayable"] + d["counts"]["not_displayed"], len(self.rows))

    def test_date_never_changes_scores_or_network_order(self):
        base = {r["event_id"]: (r["event_score"], r["network_rank"]) for r in self.rows}
        for day in ("2026-11-21", "2027-02-06", "2027-09-30", "2028-06-01"):
            d = CAL.display_layer(self.rows, day)
            for r in d["displayable"] + d["not_displayed"]:
                self.assertEqual((r["event_score"], r["network_rank"]), base[r["event_id"]])
            ranks = [r["network_rank"] for r in d["displayable"]]
            self.assertEqual(ranks, sorted(ranks))                 # Layer A order is kept
            self.assertEqual([r["display_rank"] for r in d["displayable"]], list(range(1, len(ranks) + 1)))

    def test_ongoing_and_boundaries(self):
        on = {r["event_id"]: r for r in CAL.display_layer(self.rows, "2027-10-01")["displayable"]}
        self.assertEqual(on["E_NAVARATRI_2570"]["display_status"], "ONGOING")      # 29 Sep - 9 Oct 2027
        last = CAL.display_layer(self.rows, "2027-10-09")["displayable"]
        self.assertIn("E_NAVARATRI_2570", {r["event_id"] for r in last})            # still on its last day
        after = CAL.display_layer(self.rows, "2027-10-10")["not_displayed"]
        self.assertIn("E_NAVARATRI_2570", {r["event_id"] for r in after})

    def test_recurring_event_keeps_its_id_and_never_goes_past(self):
        d = CAL.display_layer(self.rows, "2026-11-21")
        weekly = [r for r in d["displayable"] if r["event_id"] == "E_LAKSHMI_WEEKLY"]
        self.assertEqual(len(weekly), 1)
        self.assertEqual(weekly[0]["next_start"], "2026-11-27")                      # next Friday

    def test_lunar_table_end_is_reported_not_extended(self):
        c = CAL.classify(EV.SCHEDULE["E_CHINESE_MOON_FULL"], "2028-03-01")
        self.assertEqual(c["display_status"], "NO_OCCURRENCE_IN_RANGE")


class JsParity(unittest.TestCase):
    """public/js/calendar.js must give exactly the same Layer B answers as api/_calendar.py (and the JS reminder tests must pass)."""

    @staticmethod
    def _node():
        import shutil
        return shutil.which("node")

    def test_python_and_javascript_agree_on_every_event_and_date(self):
        import json, subprocess
        node = self._node()
        if not node:
            self.skipTest("node is not installed")
        dates = ["2026-11-21", "2026-12-31", "2027-02-06", "2027-02-20", "2027-10-01", "2027-12-15", "2028-01-15"]
        cases = [{"eid": eid, "sched": s, "today": t} for eid, s in EV.SCHEDULE.items() for t in dates]
        out = subprocess.run([node, str(ROOT / "tests" / "js" / "parity.mjs")], input=json.dumps({"cases": cases}), capture_output=True, text=True, encoding="utf-8", timeout=120)
        self.assertEqual(out.returncode, 0, out.stderr)
        got = json.loads(out.stdout)
        self.assertEqual(len(got), len(cases))
        for c, g in zip(cases, got):
            a = (c["today"], (lambda x: dt_add(c["today"], 90))(0))
            self.assertEqual(g["classify"], CAL.classify(c["sched"], c["today"]), (c["eid"], c["today"]))
            self.assertEqual(g["occ"], CAL.occurrences_between(c["sched"], c["today"], a[1]), (c["eid"], c["today"]))

    def test_javascript_reminder_tests_pass(self):
        import subprocess
        node = self._node()
        if not node:
            self.skipTest("node is not installed")
        out = subprocess.run([node, "--test"] + [str(f) for f in sorted((ROOT / "tests" / "js").glob("*.test.mjs"))], capture_output=True, text=True, encoding="utf-8", timeout=180)
        self.assertEqual(out.returncode, 0, out.stdout[-2500:] + out.stderr[-1500:])


def dt_add(iso, n):
    import datetime as _dt
    return (_dt.date.fromisoformat(iso) + _dt.timedelta(days=n)).isoformat()


class ExpertDecisionA(unittest.TestCase):
    """Expert decision (option A): no reminder for real events whose schedule is unverified; synthetic events only in the Tab 2 simulation."""

    def test_no_real_event_is_schedule_verified(self):
        self.assertTrue(all(v["event_schedule"] == "EVENT_SCHEDULE_UNVERIFIED" for v in EV.STATIC.values()))

    def test_tab1_has_no_demo_clock_and_defaults_to_info_only(self):
        js = (ROOT / "public" / "js")
        ui = (js / "notifyui.js").read_text(encoding="utf-8")
        self.assertNotIn("openClock", ui)
        self.assertNotIn("setDemo", ui)
        st = (js / "state.js").read_text(encoding="utf-8")
        self.assertIn("demo: false", st)
        self.assertNotIn("demo: true", st)                      # Tab 1 has no simulation store
        lab = (js / "eventlab.js").read_text(encoding="utf-8")
        self.assertNotIn("เตือนพร้อมป้าย (รออนุมัติ)", lab)       # no option B in the Tab 2 simulation either


class ProactiveDiscoveryExpertRules(unittest.TestCase):
    """Expert decision (a): discovery card in step 04. Static guards on the source, because the rules are about what the card must NOT do."""

    def setUp(self):
        self.js = ROOT / "public" / "js"
        self.card = (self.js / "discovery.js").read_text(encoding="utf-8")
        self.demo = (self.js / "demo.js").read_text(encoding="utf-8")

    def test_card_never_touches_notifications_or_the_follow_store(self):
        for banned in ("notify.js", "store()", "runCheck", "markRead", "follow(", "openCenter", "unread", "createStore", "localStorage"):
            self.assertNotIn(banned, self.card, banned)

    def test_user_pages_do_not_use_synthetic_events(self):
        self.assertNotIn("snapDirect", self.demo)
        self.assertNotIn("E.direct", self.demo)
        self.assertNotIn("simulation_events", self.card)

    def test_wording_and_label_rules(self):
        self.assertIn("กำหนดการยังไม่ยืนยัน", self.card)
        self.assertIn("ยังไม่ยืนยันกับผู้จัดว่าจะจัดงานในวันดังกล่าว", self.card)
        self.assertIn("กิจกรรมที่คุณอาจสนใจ", self.card)
        self.assertNotIn("จะจัดงานวันที่", self.card)

    def test_step04_uses_the_card_and_does_not_recompute_for_focus(self):
        self.assertIn("discoverySection(R", self.demo)
        self.assertIn("ไม่เปลี่ยนอันดับสถานที่", self.card)

    def test_events_in_the_payload_come_from_the_unchanged_ranking(self):
        ids = [r["event_id"] for r in E.recommend(A)["events"]["eligible"]]
        self.assertEqual(ids, [r["event_id"] for r in EV.rank_events(A)["eligible"]])
        for r in E.recommend(A)["events"]["eligible"]:
            self.assertTrue(r["evidence_paths"])


class CalendarV3Data(unittest.TestCase):
    """Versioned JSON from Calendar Dataset v3: provenance, isolation of synthetic data, no network-model change."""

    def setUp(self):
        import json
        self.fixed = json.loads((ROOT / "public" / "data" / "calendar_fixed.json").read_text(encoding="utf-8"))
        self.demo = json.loads((ROOT / "public" / "data" / "calendar_demo.json").read_text(encoding="utf-8"))

    def test_versions_and_provenance_are_kept(self):
        for d in (self.fixed, self.demo):
            m = d["meta"]
            self.assertEqual(m["dataset_version"], "MUMU_CALENDAR_V3")
            self.assertEqual(len(m["source_sha256"]), 64)
            self.assertEqual((m["timezone"], m["utc_offset"]), ("Asia/Bangkok", "+07:00"))
        self.assertEqual(self.fixed["meta"]["visibility_scope"], "NORMAL_CALENDAR")
        self.assertEqual(self.demo["meta"]["visibility_scope"], "SIMULATION_ONLY")
        self.assertIn("DEMO", self.demo["meta"]["label"])

    def test_normal_file_has_only_the_valentine_rule(self):
        self.assertEqual([r["calendar_item_id"] for r in self.fixed["fixed_days"]], ["CAL_VALENTINE"])
        text = (ROOT / "public" / "data" / "calendar_fixed.json").read_text(encoding="utf-8")
        for banned in ("SYNTHETIC", "SALE_DEMO", "MILESTONE_DEMO", "CON_DEMO", "EXAM_DEMO", "SIMULATION_ONLY"):
            self.assertNotIn(banned, text, banned)

    def test_synthetic_file_is_all_simulation_only_with_source_ids(self):
        d = self.demo
        self.assertEqual((len(d["artists"]), len(d["concerts"]), len(d["ticket_sales"]), len(d["exam_programs"]), len(d["exam_milestones"]), len(d["calendar_feed"])), (64, 120, 360, 120, 480, 840))
        for r in d["ticket_sales"] + d["exam_milestones"]:
            self.assertEqual((r["data_origin"], r["visibility_scope"]), ("SYNTHETIC_DEMO", "SIMULATION_ONLY"))
        for r in d["calendar_feed"]:
            self.assertEqual(r["real_reminder_capability"], "N")
        sales = {r["sale_id"] for r in d["ticket_sales"]}
        miles = {r["milestone_id"] for r in d["exam_milestones"]}
        self.assertEqual({r["source_entity_id"] for r in d["calendar_feed"]}, sales | miles)   # joined by key, never by title
        self.assertTrue(all(isinstance(o, int) for r in d["ticket_sales"] for o in r["reminder_offsets_minutes"]))

    def test_tab1_code_never_loads_the_synthetic_file(self):
        for f in (ROOT / "public" / "js").glob("*.js"):
            if f.name in ("eventlab.js", "calendar_sim.js", "calendarlab.js"):      # Tab 2 only
                continue
            self.assertNotIn("calendar_demo", f.read_text(encoding="utf-8"), f.name)

    def test_build_script_stops_on_a_broken_key(self):
        src = (ROOT / "scripts" / "build_calendar_v3.py").read_text(encoding="utf-8")
        self.assertIn("SystemExit", src)
        self.assertIn("GD_TICKET_SALES.concert_id -> GD_CONCERTS", src)

    def test_no_python_function_or_model_file_was_added_for_calendar(self):
        names = {p.name for p in (ROOT / "api").glob("*.py")}
        self.assertEqual(names, {"_calendar.py", "_engine.py", "_events.py", "_http.py", "catalog.py", "feedback.py", "offers.py", "place.py", "recommendations.py", "trace.py", "trip.py"})


class SimulationIsolation(unittest.TestCase):
    """Calendar v3 data safety: the simulation never reaches the real notification centre, Tab 1 never loads synthetic data."""

    def js(self, name):
        return (ROOT / "public" / "js" / name).read_text(encoding="utf-8")

    def test_tab2_simulation_has_its_own_store_and_never_imports_tab1_state(self):
        lab = self.js("calendarlab.js")
        self.assertNotIn("from './state.js'", lab)
        self.assertNotIn("from './notifyui.js'", lab)
        self.assertIn("createStore({ demo: true })", lab)

    def test_tab1_modules_do_not_touch_the_simulation_or_synthetic_data(self):
        for name in ("demo.js", "fixedcal.js", "notifyui.js", "state.js", "discovery.js"):
            src = self.js(name)
            for banned in ("calendarlab", "calendar_demo", "SALE_DEMO", "MILESTONE_DEMO", "SIMULATION_ONLY"):
                self.assertNotIn(banned, src, f"{name}: {banned}")

    def test_normal_store_is_never_in_simulation_mode(self):
        self.assertIn("demo: false", self.js("state.js"))
        self.assertIn("mode = demo ? 'SIMULATION' : 'NORMAL'", self.js("notify.js"))

    def test_policy_version_and_no_old_reminder_rules_left(self):
        self.assertIn("REMINDER_POLICY_V3", self.js("reminder.js"))
        cal = self.js("calendar.js")
        for gone in ("alertRule", "dueOccurrences", "dedupKey", "ALERT_WITH_LABEL"):
            self.assertNotIn(gone, cal, gone)

    def test_label_for_synthetic_screens(self):
        self.assertIn("DEMO — ข้อมูลสมมติ", self.js("calendarlab.js"))


class Api(unittest.TestCase):
    def test_profile_as_of_is_optional_and_validated(self):
        self.assertNotIn("as_of", _http.profile_from({"wish_ids": ["W01"]}))
        self.assertNotIn("as_of", _http.profile_from({"wish_ids": ["W01"], "as_of": "2026-13-45"}))
        self.assertEqual(_http.profile_from({"wish_ids": ["W01"], "as_of": "2026-11-21"})["as_of"], "2026-11-21")

    def test_trace_has_simulation_pool_with_the_three_agreed_test_events(self):
        pool = {r["event_id"]: r for r in E.trace(A)["event_ranking"]["simulation_events"]}
        self.assertEqual(len(pool), 36)
        for eid, date, off in (("SYN_EV_025", "2027-01-20", 14), ("SYN_EV_013", "2027-01-14", 7), ("SYN_EV_001", "2027-01-10", 1)):
            self.assertEqual((pool[eid]["event_date"], pool[eid]["notify_days_before"]), (date, off))
            self.assertEqual(pool[eid]["event_schedule"], "SYNTHETIC_DEMO")
        self.assertNotIn("simulation_events", E.recommend(A)["events"])   # Tab 1 payload does not carry the pool

    def test_event_eval_file_matches_engine(self):
        import json
        ev = json.loads((ROOT / "public" / "data" / "event_eval.json").read_text(encoding="utf-8"))
        self.assertEqual((ev["exclusion_violations"], ev["valid_path_rate"]["valid"] == ev["valid_path_rate"]["total"]), (0, True))
        self.assertEqual(ev["kind"], "SYNTHETIC_STRUCTURAL_CHECKS")
        self.assertEqual(ev["version"], EV.EVENT_RANKING_VERSION)

    def test_as_of_does_not_change_existing_outputs(self):
        a = E.recommend(A)
        b = E.recommend(dict(A, as_of="2026-11-21"))
        self.assertEqual(a["model"], b["model"])
        self.assertEqual(a["events"]["eligible"], b["events"]["eligible"])
        self.assertNotIn("display", a["events"])
        self.assertIn("display", b["events"])
        self.assertEqual(b["events"]["lunar_source"]["conversion_version"], "HKO_NONGLI_2026_2027_V1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
