"""Layer B: calendar display for CL_EVENTS (pure Python, no network libraries).

Layer A (EVENT_RANKING_V1 in _events.py) decides which events the *network* supports and in what order.
Layer B only decides what can be shown as "upcoming" on a given date. It never changes a Layer A score,
never moves a past event into next year (2569 stays 2026), and keeps the original event_id on every occurrence.

All dates are Asia/Bangkok calendar dates (ISO strings, no time of day).
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parent.parent / "model"
LUNAR = json.loads((MODEL_DIR / "lunar_hko_2026_2027.json").read_text(encoding="utf-8"))
LUNAR_RANGE = tuple(LUNAR["covers"])

THAI_MONTHS = {"ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6, "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12}
WEEKDAYS = {"จันทร์": 0, "อังคาร": 1, "พุธ": 2, "พฤหัสบดี": 3, "ศุกร์": 4, "เสาร์": 5, "อาทิตย์": 6}  # Python weekday(): Mon=0

# Annual events whose typed date can be cross-checked against the HKO table. These rules are an editorial reading
# of the event names (not columns of the source sheet), so a match is evidence, never a promotion of any status.
LUNAR_CROSSCHECK = {
    "E_CHINESE_NY_EVE_2569": "eve", "E_CHINESE_NY_EVE_2570": "eve",
    "E_CHINESE_NEW_YEAR_2569": "01-01", "E_CHINESE_NEW_YEAR_2570": "01-01",
    "E_YUANXIAO_2569": "01-15", "E_WENCHANG_BIRTH_2569": "02-03", "E_GUANYIN_BIRTH_2569": "02-19",
    "E_GUANYIN_ENLIGHTEN_2569": "06-19", "E_GUANYU_BIRTH_2569": "06-24", "E_MOON_FESTIVAL_2569": "08-15",
    "E_GUANYIN_RENUNCIATE_2569": "09-19", "E_VEGETARIAN_2569": "09-01", "E_VEGETARIAN_2570": "09-01",
}


def d(s: str) -> dt.date:
    return dt.date.fromisoformat(s)


def parse_thai_range(text: str):
    """'14-25 ก.ย. 2569' | '29 ก.ย. - 9 ต.ค. 2570' | '20 ต.ค. 2569'  ->  (start_iso, end_iso) in the Gregorian year (BE - 543)."""
    t = " ".join(text.replace("–", "-").split())
    parts = t.split(" ")
    year = int(parts[-1]) - 543
    body = " ".join(parts[:-1])
    if " - " in body:                                   # '29 ก.ย. - 9 ต.ค.'
        a, b = [x.strip().split(" ") for x in body.split(" - ")]
        sd, sm, ed, em = int(a[0]), THAI_MONTHS[a[1]], int(b[0]), THAI_MONTHS[b[1]]
    elif "-" in parts[0]:                               # '14-25 ก.ย.'
        lo, hi = parts[0].split("-")
        sd, ed, sm = int(lo), int(hi), THAI_MONTHS[parts[1]]
        em = sm
    else:
        sd = ed = int(parts[0]); sm = em = THAI_MONTHS[parts[1]]
    return dt.date(year, sm, sd).isoformat(), dt.date(year, em, ed).isoformat()


def first_weekday_of_month(year: int, month: int, weekday: int) -> dt.date:
    day = dt.date(year, month, 1)
    return day + dt.timedelta(days=(weekday - day.weekday()) % 7)


def schedule_for(ev: dict) -> dict:
    """Compact, serialisable occurrence rule for one source event. The same rule is evaluated in public/js/calendar.js."""
    ctype, rec, eid = ev["calendar_type"], ev["date_or_recurrence"], ev["event_id"]
    if ctype == "weekly":
        days = sorted({n for name, n in WEEKDAYS.items() if name in rec})
        return {"kind": "weekly", "weekdays": days, "calendar_basis": "RULE"}
    if ctype == "monthly" and "เสาร์แรก" in rec:
        return {"kind": "first_weekday_of_month", "weekday": WEEKDAYS["เสาร์"], "calendar_basis": "RULE"}
    if ctype == "monthly" and "ปฏิทินจีน" in rec:
        day = "01" if "1 ค่ำ" in rec else "15"
        dates = sorted(x for k, v in LUNAR["by_lunar_month_day"].items() if k.endswith("-" + day) for x in v)
        return {"kind": "dates", "dates": dates, "calendar_basis": "HKO_TABLE", "covers": list(LUNAR_RANGE)}
    try:
        s, e = parse_thai_range(rec)
    except Exception:
        return {"kind": "none", "occurrences": [], "calendar_basis": "UNPARSED"}
    return {"kind": "annual", "occurrences": [{"start": s, "end": e}], "calendar_basis": "TYPED_IN_SHEET"}


def lunar_crosscheck(ev: dict, sched: dict):
    rule = LUNAR_CROSSCHECK.get(ev["event_id"])
    if not rule or sched["kind"] != "annual":
        return None
    start = sched["occurrences"][0]["start"]
    expected = LUNAR["lunar_new_year_eve"] if rule == "eve" else LUNAR["by_lunar_month_day"].get(rule, [])
    return {"rule": rule, "typed_start": start, "table_dates": [x for x in expected if x[:4] == start[:4]],
            "match": start in expected, "basis": "EDITORIAL_RULE_FROM_EVENT_NAME", "note": "information only; does not change any status"}


def occurrences_between(sched: dict, a: str, b: str) -> list:
    """All occurrences overlapping [a, b] (inclusive), as [{'start','end'}]. Weekly/monthly rules work for any year; the lunar table is bounded."""
    lo, hi = d(a), d(b)
    out = []
    k = sched["kind"]
    if k == "weekly":
        day = lo
        while day <= hi:
            if day.weekday() in sched["weekdays"]:
                out.append({"start": day.isoformat(), "end": day.isoformat()})
            day += dt.timedelta(days=1)
    elif k == "first_weekday_of_month":
        y, mth = lo.year, lo.month
        while dt.date(y, mth, 1) <= hi:
            f = first_weekday_of_month(y, mth, sched["weekday"])
            if lo <= f <= hi:
                out.append({"start": f.isoformat(), "end": f.isoformat()})
            y, mth = (y + 1, 1) if mth == 12 else (y, mth + 1)
    elif k == "dates":
        out = [{"start": x, "end": x} for x in sched["dates"] if lo <= d(x) <= hi]
    elif k in ("annual", "none"):
        out = [o for o in sched["occurrences"] if d(o["start"]) <= hi and d(o["end"]) >= lo]
    return out


def classify(sched: dict, today: str, horizon_days: int = 400) -> dict:
    """Layer B status on one date: ONGOING | UPCOMING | PAST | NO_OCCURRENCE_IN_RANGE (never shifts a year)."""
    t = d(today)
    window_end = (t + dt.timedelta(days=horizon_days)).isoformat()
    occ = occurrences_between(sched, today, window_end)
    if occ:
        first = occ[0]
        status = "ONGOING" if d(first["start"]) <= t <= d(first["end"]) else "UPCOMING"
        return {"display_status": status, "next_start": first["start"], "next_end": first["end"],
                "days_until": max(0, (d(first["start"]) - t).days)}
    if sched["kind"] in ("annual", "none") and sched["occurrences"]:
        return {"display_status": "PAST", "next_start": None, "next_end": None, "days_until": None,
                "last_end": max(o["end"] for o in sched["occurrences"])}
    return {"display_status": "NO_OCCURRENCE_IN_RANGE", "next_start": None, "next_end": None, "days_until": None}


def display_layer(eligible_rows: list, today: str) -> dict:
    """Layer B over the Layer A order. Past events are kept (with network_rank) but are not shown as upcoming.
    display_rank = position among displayable events *in the unchanged Layer A order*; the date never changes a score or the order."""
    shown, hidden = [], []
    for r in eligible_rows:
        row = {**r, **classify(r["schedule"], today)}
        (shown if row["display_status"] in ("UPCOMING", "ONGOING") else hidden).append(row)
    for i, row in enumerate(shown, 1):
        row["display_rank"] = i
    return {"as_of": today, "timezone": "Asia/Bangkok", "displayable": shown, "not_displayed": hidden,
            "counts": {"displayable": len(shown), "not_displayed": len(hidden)},
            "rule": "คงลำดับเครือข่าย (Layer A) แล้วคัดเฉพาะกิจกรรมที่ยังมาถึง/กำลังจัด ไม่ขยับปี 2569→2570 ไม่เปลี่ยนคะแนน"}
