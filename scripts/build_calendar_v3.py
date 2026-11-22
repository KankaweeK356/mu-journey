"""Build the versioned JSON files of Calendar Dataset v3 from the workbook, and validate every foreign key.

  python -I scripts/build_calendar_v3.py [path-to-xlsx]

Outputs
  public/data/calendar_fixed.json        real calendar facts (CL_FIXED_CALENDAR_DAYS). Tab 1 may load this.
  public/data/calendar_demo.json         SYNTHETIC concerts / ticket sales / exams. Tab 2 (simulation) only. Never loaded by Tab 1.
  tests/fixtures/reminder_test_cases.json  the 60 reminder fixtures (test input, not shipped to the browser)

Nothing is invented: only columns that exist in the workbook are copied, source IDs are kept, and the build stops on any broken key.
The workbook is untrusted input: it is parsed with the standard library only (no formulas, no macros, no external links are read).
"""
import datetime as dt
import hashlib
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_XLSX = ROOT / "model" / "calendar_v3" / "03_MU_Proactive_Calendar_Mock_v3.xlsx"
SOURCE_URL = "https://docs.google.com/spreadsheets/d/1zsZfYod-JkmDzhoSGA3kAN1RVRYhDglid5uHh9UmYfo/edit"
DATASET_VERSION = "MUMU_CALENDAR_V3"
M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def read_workbook(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(f"{M}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{M}t")))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    sheets = {}
    for s in wb.find(f"{M}sheets"):
        target = rels[s.get(f"{R}id")]
        target = target.lstrip("/")
        target = target if target.startswith("xl/") else "xl/" + target
        rows = []
        for row in ET.fromstring(z.read(target)).iter(f"{M}row"):
            cells = {}
            for c in row.findall(f"{M}c"):
                t = c.get("t")
                v = c.find(f"{M}v")
                if t == "s":
                    val = shared[int(v.text)] if v is not None else ""
                elif t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter(f"{M}t"))
                elif v is None:
                    val = ""
                else:
                    val = v.text or ""
                    if t is None:                                  # a number: keep integers as integers-as-text
                        try:
                            f = float(val)
                            val = str(int(f)) if f == int(f) else val
                        except ValueError:
                            pass
                cells[col_index(c.get("r"))] = val
            rows.append(cells)
        if not rows:
            sheets[s.get("name")] = []
            continue
        width = max(max(r) for r in rows if r) + 1
        grid = [[r.get(i, "") for i in range(width)] for r in rows]
        head = grid[0]
        sheets[s.get("name")] = [dict(zip(head, r)) for r in grid[1:] if any(x != "" for x in r)]
    return sheets


DT_RE = re.compile(r"^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$")


def check_dt(value, where):
    if not DT_RE.match(value):
        raise SystemExit(f"BAD DATETIME {value!r} in {where}")
    dt.datetime.strptime(value, "%Y-%m-%d %H:%M" if " " in value else "%Y-%m-%d")      # raises on impossible dates


def offsets(value, where):
    parts = [p.strip() for p in value.split(";") if p.strip() != ""]
    if not parts or not all(re.fullmatch(r"\d+", p) for p in parts):
        raise SystemExit(f"BAD OFFSETS {value!r} in {where}")
    return [int(p) for p in parts]


def need(cond, msg):
    if not cond:
        raise SystemExit("FK/QA FAILURE: " + msg)


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    raw = path.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    S = read_workbook(path)
    for name in ("GD_ARTISTS", "GD_CONCERTS", "GD_TICKET_SALES", "GD_EXAM_PROGRAMS", "GD_EXAM_MILESTONES", "CL_FIXED_CALENDAR_DAYS",
                 "GD_CALENDAR_FEED", "GD_ARTIST_INTERESTS", "GD_EXAM_INTERESTS", "GD_REMINDER_TEST_CASES", "CL_EVENTS", "GD_EVENTS"):
        need(name in S, f"missing sheet {name}")
    A, C, T, P, MS = S["GD_ARTISTS"], S["GD_CONCERTS"], S["GD_TICKET_SALES"], S["GD_EXAM_PROGRAMS"], S["GD_EXAM_MILESTONES"]
    FX, FEED, FIX = S["GD_REMINDER_TEST_CASES"], S["GD_CALENDAR_FEED"], S["CL_FIXED_CALENDAR_DAYS"]
    counts = {"artists": len(A), "concerts": len(C), "ticket_sales": len(T), "exam_programs": len(P), "exam_milestones": len(MS), "fixed_days": len(FIX),
              "calendar_feed": len(FEED), "artist_interests": len(S["GD_ARTIST_INTERESTS"]), "exam_interests": len(S["GD_EXAM_INTERESTS"]),
              "reminder_test_cases": len(FX), "cl_events": len(S["CL_EVENTS"]), "gd_events": len(S["GD_EVENTS"])}
    expected = {"artists": 64, "concerts": 120, "ticket_sales": 360, "exam_programs": 120, "exam_milestones": 480, "fixed_days": 1, "calendar_feed": 841,
                "artist_interests": 150, "exam_interests": 150, "reminder_test_cases": 60, "cl_events": 37, "gd_events": 36}
    need(counts == expected, f"row counts {counts} != {expected}")

    # unique primary keys
    for rows, key in ((A, "artist_id"), (C, "concert_id"), (T, "sale_id"), (P, "exam_id"), (MS, "milestone_id"), (FEED, "feed_id"), (FX, "test_id")):
        ids = [r[key] for r in rows]
        need(len(ids) == len(set(ids)) and all(ids), f"duplicate/empty {key}")
    artist_ids, concert_ids, exam_ids = {r["artist_id"] for r in A}, {r["concert_id"] for r in C}, {r["exam_id"] for r in P}

    # foreign keys
    need(all(r["artist_id"] in artist_ids for r in C), "GD_CONCERTS.artist_id -> GD_ARTISTS")
    concert_artist = {r["concert_id"]: r["artist_id"] for r in C}
    need(all(r["concert_id"] in concert_ids for r in T), "GD_TICKET_SALES.concert_id -> GD_CONCERTS")
    need(all(concert_artist[r["concert_id"]] == r["artist_id"] for r in T), "GD_TICKET_SALES.artist_id agrees with its concert")
    need(all(r["exam_id"] in exam_ids for r in MS), "GD_EXAM_MILESTONES.exam_id -> GD_EXAM_PROGRAMS")
    by_exam = {}
    for r in MS:
        by_exam.setdefault(r["exam_id"], {})[r["milestone_type"]] = r
    TYPES = ["APPLICATION_OPEN", "APPLICATION_CLOSE", "EXAM_DATE", "RESULT_ANNOUNCEMENT"]
    need(set(by_exam) == exam_ids and all(sorted(v) == sorted(TYPES) and len(v) == 4 for v in by_exam.values()), "exactly 4 distinct milestones per exam")
    for ex, v in by_exam.items():
        need(v[TYPES[0]]["milestone_datetime"] < v[TYPES[1]]["milestone_datetime"] < v[TYPES[2]]["milestone_datetime"] < v[TYPES[3]]["milestone_datetime"], f"milestone chronology {ex}")

    # datetimes and offsets parse strictly; timezone is explicit
    for r in T:
        check_dt(r["sale_start_datetime"], r["sale_id"]); check_dt(r["sale_end_datetime"], r["sale_id"]); offsets(r["reminder_offsets_minutes"], r["sale_id"])
        need(r["timezone"] == "Asia/Bangkok" and r["sale_start_datetime"] < r["sale_end_datetime"], f"sale window {r['sale_id']}")
    for r in MS:
        check_dt(r["milestone_datetime"], r["milestone_id"]); offsets(r["reminder_offsets_minutes"], r["milestone_id"]); need(r["timezone"] == "Asia/Bangkok", r["milestone_id"])
        o = offsets(r["reminder_offsets_minutes"], r["milestone_id"])
        if r["milestone_type"] in ("APPLICATION_CLOSE", "EXAM_DATE"):
            need(0 not in o, f"offset 0 not allowed for {r['milestone_type']} ({r['milestone_id']})")

    # unified feed: every row points to a real parent and repeats its time
    sale_by_id, ms_by_id = {r["sale_id"]: r for r in T}, {r["milestone_id"]: r for r in MS}
    feed_types = Counter(r["source_type"] for r in FEED)
    need(feed_types == Counter({"TICKET_SALE": 360, "EXAM_MILESTONE": 480, "FIXED_CALENDAR_DAY": 1}), f"feed composition {feed_types}")
    fixed_ids = {r["calendar_item_id"] for r in FIX}
    for r in FEED:
        sid = r["source_entity_id"]
        if r["source_type"] == "TICKET_SALE":
            need(sid in sale_by_id and sale_by_id[sid]["concert_id"] == r["parent_id"], f"feed {r['feed_id']} sale parent")
            need(r["occurrence_datetime"] == sale_by_id[sid]["sale_start_datetime"], f"feed {r['feed_id']} time = sale_start")
        elif r["source_type"] == "EXAM_MILESTONE":
            need(sid in ms_by_id and ms_by_id[sid]["exam_id"] == r["parent_id"], f"feed {r['feed_id']} milestone parent")
            need(r["occurrence_datetime"] == ms_by_id[sid]["milestone_datetime"], f"feed {r['feed_id']} time = milestone")
        else:
            need(sid in fixed_ids, f"feed {r['feed_id']} fixed day")
        need(r["wish_id"] in ("W01", "W04", "W05"), f"feed {r['feed_id']} wish")
        check_dt(r["occurrence_datetime"], r["feed_id"])
    need(sorted(r["source_entity_id"] for r in FEED if r["source_type"] != "FIXED_CALENDAR_DAY") == sorted(list(sale_by_id) + list(ms_by_id)), "feed covers every sale and milestone exactly once")

    # data-safety flags: every synthetic row is simulation-only and cannot raise a real reminder
    for r in T + MS:
        need(r["visibility_scope"] == "SIMULATION_ONLY" and r["data_origin"] == "SYNTHETIC_DEMO", f"visibility/origin {r.get('sale_id') or r.get('milestone_id')}")
    need(all(r["visibility_scope"] == "SIMULATION_ONLY" and r["real_reminder_capability"] == "N" for r in FEED if r["source_type"] != "FIXED_CALENDAR_DAY"), "synthetic feed rows: SIMULATION_ONLY and real_reminder_capability N")
    v = FIX[0]
    need((v["calendar_item_id"], v["wish_id"], v["month_day"], v["recurrence_rule"], v["calendar_date_status"], v["event_schedule_status"], v["visibility_scope"]) ==
         ("CAL_VALENTINE", "W01", "02-14", "YEARLY", "CALENDAR_DATE_VERIFIED", "NOT_APPLICABLE", "NORMAL_CALENDAR"), "Valentine rule as documented")

    # fixtures reference real sources
    for r in FX:
        need(r["source_entity_id"] in sale_by_id or r["source_entity_id"] in ms_by_id, f"fixture {r['test_id']} source")
        check_dt(r["event_datetime"], r["test_id"]); check_dt(r["simulation_datetime"], r["test_id"]); need(re.fullmatch(r"\d+", r["offset_minutes"]), r["test_id"])

    # ---- write
    prov = {"dataset_version": DATASET_VERSION, "source_name": "03_MU_Proactive_Calendar_Mock_v3", "source_url": SOURCE_URL, "source_sha256": sha,
            "built_on": dt.date.today().isoformat(), "row_counts": counts, "timezone": "Asia/Bangkok", "utc_offset": "+07:00",
            "builder": "scripts/build_calendar_v3.py"}
    drop = {"disclaimer"}

    def slim(rows, offs=True, keep_disclaimer=False):
        out = []
        for r in rows:
            d = {k: v for k, v in r.items() if (keep_disclaimer or k not in drop) and k != ""}
            if offs and "reminder_offsets_minutes" in d:
                d["reminder_offsets_minutes"] = offsets(d["reminder_offsets_minutes"], "slim")
            out.append(d)
        return out

    disclaimers = sorted({r.get("disclaimer", "") for r in T + MS + FEED if r.get("disclaimer")})
    fixed = {"meta": {**prov, "scope": "REAL_CALENDAR_FACTS", "visibility_scope": "NORMAL_CALENDAR"}, "fixed_days": slim(FIX, keep_disclaimer=True)}
    demo = {"meta": {**prov, "scope": "SYNTHETIC_DEMO", "visibility_scope": "SIMULATION_ONLY", "label": "DEMO — ข้อมูลสมมติ",
                     "note": "Synthetic. Not an announcement from any organiser or agency. No real ticket or exam URL exists."},
            "disclaimers": disclaimers, "artists": slim(A), "concerts": slim(C), "ticket_sales": slim(T), "exam_programs": slim(P),
            "exam_milestones": slim(MS), "calendar_feed": slim([r for r in FEED if r["source_type"] != "FIXED_CALENDAR_DAY"]),
            "artist_interests": slim(S["GD_ARTIST_INTERESTS"]), "exam_interests": slim(S["GD_EXAM_INTERESTS"])}
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    (ROOT / "public" / "data" / "calendar_fixed.json").write_text(dump(fixed), encoding="utf-8")
    (ROOT / "public" / "data" / "calendar_demo.json").write_text(dump(demo), encoding="utf-8")
    fx_dir = ROOT / "tests" / "fixtures"
    fx_dir.mkdir(parents=True, exist_ok=True)
    (fx_dir / "reminder_test_cases.json").write_text(json.dumps({"meta": prov, "cases": slim(FX, offs=False)}, ensure_ascii=False, indent=0), encoding="utf-8")
    (ROOT / "public" / "data" / "calendar_demo_fixtures.json").write_text(json.dumps({"meta": {**prov, "scope": "SYNTHETIC_DEMO", "visibility_scope": "SIMULATION_ONLY"}, "cases": slim(FX, offs=False)}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for name in ("calendar_fixed.json", "calendar_demo.json", "calendar_demo_fixtures.json"):
        print(name, round((ROOT / "public" / "data" / name).stat().st_size / 1024, 1), "KB")
    print("counts", counts)
    print("OK: all keys valid; sha256", sha[:16])


if __name__ == "__main__":
    main()
