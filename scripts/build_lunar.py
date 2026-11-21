"""Build model/lunar_hko_2026_2027.json from the two raw HKO CSV files in model/hko_lunar/.

Source : Hong Kong Observatory, "Gregorian-Lunar calendar conversion table" (DATA.GOV.HK).
Output : only what the app needs (lunar day-1 and day-15 dates, plus named lunar dates) + provenance + a leap-month check.
Run    : python scripts/build_lunar.py
"""
import csv
import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "model" / "hko_lunar"
OUT = ROOT / "model" / "lunar_hko_2026_2027.json"

MONTHS = {"正月": 1, "二月": 2, "三月": 3, "四月": 4, "五月": 5, "六月": 6, "七月": 7, "八月": 8, "九月": 9,
          "十月": 10, "十一月": 11, "十二月": 12}
TENS = {"初": 0, "十": 10, "廿": 20, "三": 30}
DIGITS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
EN = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}


def lunar_day(txt):
    if txt == "初十": return 10
    if txt == "二十": return 20
    if txt == "三十": return 30
    if txt == "十": return 10
    return TENS[txt[0]] + DIGITS[txt[1]]


def parse_date(s):
    d, mon, y = s.strip().split("-")
    return dt.date(2000 + int(y), EN[mon], int(d))


rows, leap_found = [], False
for f in sorted(RAW.glob("nongli_calendar_*.csv")):
    with f.open(encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            month_txt = r["Lunar month"].strip()
            if "閏" in month_txt or "闰" in month_txt:
                leap_found = True
            rows.append((parse_date(r["Gregorian Date"]), MONTHS[month_txt.replace("閏", "").replace("闰", "")], lunar_day(r["Lunar Date"].strip())))
rows.sort()
assert len({d for d, _, _ in rows}) == len(rows), "duplicate Gregorian dates"
span = (rows[-1][0] - rows[0][0]).days + 1
assert span == len(rows), f"gap in table: {span} days vs {len(rows)} rows"

by_lunar = {}
for d, mo, ld in rows:
    by_lunar.setdefault(f"{mo:02d}-{ld:02d}", []).append(d.isoformat())
last_day_of_12 = [d.isoformat() for (d, mo, ld), nxt in zip(rows, rows[1:] + [(None, 0, 0)]) if mo == 12 and nxt[1] == 1]

out = {
    "_note": "Derived from the HKO conversion table. A computed calendar date is not a verified event schedule.",
    "source_name": "Gregorian-Lunar calendar conversion table (2026, 2027)",
    "source_url": "https://data.gov.hk/en-data/dataset/hk-hko-rss-gregorian-lunar-calendar-conversion-table",
    "source_files": ["https://data.weather.gov.hk/weatherAPI/hko_data/calendar/nongli_calendar_2026.csv",
                     "https://data.weather.gov.hk/weatherAPI/hko_data/calendar/nongli_calendar_2027.csv"],
    "source_year": [2026, 2027],
    "provider": "Hong Kong Observatory via DATA.GOV.HK",
    "attribution": "Data source: Hong Kong Observatory (DATA.GOV.HK). Used under the DATA.GOV.HK Terms and Conditions of Use.",
    "retrieved_at": dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime("%Y-%m-%d"),
    "conversion_version": "HKO_NONGLI_2026_2027_V1",
    "covers": [rows[0][0].isoformat(), rows[-1][0].isoformat()],
    "rows": len(rows),
    "leap_month_in_range": leap_found,
    "leap_month_check": "no month label containing 閏 in the two files" if not leap_found else "LEAP MONTH PRESENT - review the rules",
    "by_lunar_month_day": by_lunar,        # "MM-DD" -> [ISO dates in range]
    "lunar_new_year_eve": last_day_of_12,  # last day of lunar month 12
}
OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("rows", len(rows), "| covers", out["covers"], "| leap month:", leap_found, "| new moon dates", len(by_lunar["01-01"]) + 0)
print("lunar 01-01:", by_lunar["01-01"][:4], "... | 01-15:", by_lunar["01-15"][:3], "| 12 eve:", last_day_of_12)
