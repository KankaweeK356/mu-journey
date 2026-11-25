"""Birthday impact analysis (read-only): what does adding a birth weekday change, compared with no birth date?

Run:  python scripts/birthday_impact.py            (writes the JSON, CSV and the Thai summary)
      python scripts/birthday_impact.py --check    (recomputes and compares with the committed files, writes nothing)

Every ranking and score comes from the unmodified reference model (get_rankings / match_trip). Nothing is stored or sent.
The two score thresholds are ANALYSIS thresholds used to describe the size of a change. They are not accuracy measures.
"""
from __future__ import annotations

import csv
import io
import itertools
import json
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
import _engine as E  # noqa: E402

m = E.m
OUT_JSON = ROOT / "model" / "results" / "birthday_impact_v1.json"
OUT_CSV = ROOT / "model" / "results" / "birthday_impact_profiles.csv"
OUT_DOC = ROOT / "docs" / "BIRTHDAY_IMPACT_ANALYSIS_TH.md"

EPS_ANY = 1e-9      # any numerical change of a normalised place score
EPS_VISIBLE = 0.01  # a change of at least 0.01 on the 0-1 score
MONDAY = date(2000, 1, 3)
DATES = [(MONDAY + timedelta(days=i)).isoformat() for i in range(7)]            # Monday .. Sunday
SECOND_DATES = [(date(1985, 6, 3) + timedelta(days=i)).isoformat() for i in range(7)]  # another Monday .. Sunday
WISHES = sorted(m.W)
COMBOS = [list(c) for k in (1, 2, 3) for c in itertools.combinations(WISHES, k)]
SCENARIOS = [("none", [])] + [(f"exclude:{g}", [g]) for g in m.TRADITION_GROUPS]
CLASSES = ("NO_SIGNAL", "SIGNAL_NO_RANKING_CHANGE", "SIGNAL_RANKING_CHANGED")
COUNTERS = ("profiles", *CLASSES, "top5_members_changed", "top5_order_only_changed", "score_diff_gt_1e-9", "score_diff_ge_0.01", "trip_match_changed")


def run(wishes, groups, birthdate):
    pr = {"wish_ids": wishes, "birthdate": birthdate, "exclusions": {"tradition_groups": groups, "deity_ids": [], "place_ids": []}}
    r = m.get_rankings(pr)
    t = m.match_trip(pr)["matched_trip"]
    return {"scores": r["scores"]["ppr"], "top5": r["ranked"]["ppr_coverage"][:5], "birth": r["birth_deity_ids_used"],
            "trip": t["trip_id"] if t else None, "profile": r["profile"]}


def compare(base, new) -> dict:
    assert set(base["scores"]) == set(new["scores"]), "a birth date must never change which places are allowed"
    diff = max((abs(new["scores"][p] - base["scores"][p]) for p in base["scores"]), default=0.0)
    members = set(base["top5"]) != set(new["top5"])
    order = not members and base["top5"] != new["top5"]
    cls = "NO_SIGNAL" if not new["birth"] else ("SIGNAL_RANKING_CHANGED" if members or order else "SIGNAL_NO_RANKING_CHANGE")
    if cls == "NO_SIGNAL":
        assert diff == 0 and not members and not order and base["trip"] == new["trip"], "no signal must change nothing"
    return {"class": cls, "max_score_diff": diff, "members_changed": members, "order_only_changed": order, "trip_changed": base["trip"] != new["trip"]}


def tally(counter: Counter, c: dict):
    counter["profiles"] += 1
    counter[c["class"]] += 1
    counter["top5_members_changed"] += c["members_changed"]
    counter["top5_order_only_changed"] += c["order_only_changed"]
    counter["score_diff_gt_1e-9"] += c["max_score_diff"] > EPS_ANY
    counter["score_diff_ge_0.01"] += c["max_score_diff"] >= EPS_VISIBLE
    counter["trip_match_changed"] += c["trip_changed"]


def full(counter: Counter) -> dict:
    return {k: int(counter[k]) for k in COUNTERS}


def compute():
    base = {(i, s): run(w, g, None) for i, w in enumerate(COMBOS) for s, g in SCENARIOS}
    rows, per_day, overall, seed_only = [], {}, {}, {}
    seeds, same_weekday = [], []
    for d, (first, second) in enumerate(zip(DATES, SECOND_DATES)):
        weekday = m.weekday_from_dob(first)
        assert weekday == m.weekday_from_dob(second)
        for s, g in SCENARIOS:
            group = "unconstrained" if s == "none" else "constrained"
            day = per_day.setdefault((group, s, weekday), Counter())
            for i, w in enumerate(COMBOS):
                new = run(w, g, first)
                c = compare(base[i, s], new)
                tally(day, c)
                tally(overall.setdefault(group, Counter()), c)
                if new["birth"]:
                    tally(seed_only.setdefault(group, Counter()), c)
                rows.append([weekday, s, "+".join(w), c["class"], f"{c['max_score_diff']:.9f}", int(c["members_changed"]), int(c["order_only_changed"]),
                             int(c["trip_changed"]), " ".join(base[i, s]["top5"]), " ".join(new["top5"]), base[i, s]["trip"] or "", new["trip"] or ""])
                if s == "none":
                    other = run(w, g, second)
                    same_weekday.append(other["top5"] == new["top5"] and other["birth"] == new["birth"] and other["trip"] == new["trip"]
                                        and all(abs(other["scores"][p] - new["scores"][p]) < 1e-15 for p in new["scores"]))
            sig = E.birth_signal(run(COMBOS[0], g, first)["profile"])
            if s == "none":
                for n_wishes in (1, 2, 3):
                    wishes = WISHES[:n_wishes]
                    st = E.trace({"wish_ids": wishes, "birthdate": first, "exclusions": {"tradition_groups": [], "deity_ids": [], "place_ids": []}})["step2_seeds"]
                    birth = sum(v for k, v in st["seeds"].items() if k.startswith("D:"))
                    seeds.append({"weekday": weekday, "wishes": n_wishes, "status": sig["status"], "birth_seed_nodes": [x["id"] for x in sig["deities"]],
                                  "claim_ids": sig["claim_ids"], "sum_before": round(st["seeds_sum"], 9), "birth_before": round(birth, 9),
                                  "birth_share_after": round(birth / st["seeds_sum"], 9)})
            per_day[(group, s, weekday)] = day
            per_day.setdefault("status", {})[f"{weekday}|{s}"] = sig["status"]
    status = per_day.pop("status")
    result = {
        "analysis_version": "BIRTHDAY_IMPACT_V1", "model_version": E.MODEL_VERSION, "versions": E.VERSIONS,
        "design": {"wish_combinations": len(COMBOS), "weekday_dates": DATES, "second_dates_for_same_weekday_check": SECOND_DATES,
                   "scenarios": [s for s, _ in SCENARIOS], "compared_with": "the same wishes and exclusions without a birth date",
                   "thresholds": {"any_change": EPS_ANY, "visible_change": EPS_VISIBLE, "note": "analysis thresholds, not accuracy"}},
        "status_by_weekday_and_scenario": status,
        "overall": {k: full(v) for k, v in overall.items()},
        "seed_days_only": {k: full(v) for k, v in seed_only.items()},
        "per_day": [dict(group=g, scenario=s, weekday=w, **full(c)) for (g, s, w), c in per_day.items()],
        "seeds": seeds,
        "same_weekday_different_date_identical": {"checked": len(same_weekday), "identical": sum(same_weekday)},
    }
    return result, rows


def doc(r) -> str:
    cols = ["profiles", *CLASSES, "top5_members_changed", "top5_order_only_changed", "score_diff_gt_1e-9", "score_diff_ge_0.01", "trip_match_changed"]
    head = ["โปรไฟล์", "No Signal", "Signal อันดับไม่เปลี่ยน", "Signal อันดับเปลี่ยน", "สมาชิก Top 5 เปลี่ยน", "เปลี่ยนแค่ลำดับ", "คะแนนต่าง >1e-9", "คะแนนต่าง ≥0.01", "ทริปที่จับคู่เปลี่ยน"]
    table = lambda first, lines: "\n".join(["| " + " | ".join(first + head) + " |", "|" + "---|" * (len(first) + len(head))] +
                                           ["| " + " | ".join([*a, *[str(d[c]) for c in cols]]) + " |" for a, d in lines])
    days = [m.weekday_from_dob(x) for x in r["design"]["weekday_dates"]]
    unc = [([d["weekday"], r["status_by_weekday_and_scenario"][d["weekday"] + "|none"]], d) for d in r["per_day"] if d["scenario"] == "none"]
    con = [([d["weekday"], d["scenario"].split(":", 1)[1], r["status_by_weekday_and_scenario"][d["weekday"] + "|" + d["scenario"]]], d) for d in r["per_day"] if d["scenario"] != "none"]
    seed_rows = ["| " + " | ".join([s["weekday"], str(s["wishes"]), s["status"], ", ".join(s["birth_seed_nodes"]) or "—", ", ".join(s["claim_ids"]) or "—",
                                    f"{s['sum_before']:.2f}", f"{s['birth_before']:.2f}", f"{s['birth_share_after']:.6f}"]) + " |" for s in r["seeds"] if s["wishes"] in (1, 3)]
    sw = r["same_weekday_different_date_identical"]
    return f"""# Birthday Impact Analysis (7 วันในสัปดาห์)

สร้างโดย `python scripts/birthday_impact.py` (ห้ามแก้ตัวเลขด้วยมือ ตรวจซ้ำด้วย `--check`)
โมเดล {r['model_version']} · Snapshot {r['versions']['snapshot_sha256']} · อ่านอย่างเดียว ไม่เปลี่ยนโมเดลหรือข้อมูล

## วิธีเปรียบเทียบ

- โปรไฟล์: ทุกชุดความสนใจ 1–3 เรื่องจาก 10 เรื่อง = {r['design']['wish_combinations']} ชุด
- เทียบโปรไฟล์ **มีวันเกิด** กับ **ไม่มีวันเกิด** โดยความสนใจและข้อจำกัดเหมือนกันทุกอย่าง ทำครบ {len(days)} วัน
- ไม่มีข้อจำกัด: 1 สถานการณ์ · มีข้อจำกัด: ตัดกลุ่มความเชื่อทีละกลุ่ม 4 สถานการณ์ (รายงานแยกกัน)
- No Signal = โมเดลไม่ใส่ Birth Seed · Signal อันดับไม่เปลี่ยน / เปลี่ยน = ดูรายการและลำดับ Top 5
- เกณฑ์ >1e-9 (มีการเปลี่ยนเชิงตัวเลข) และ ≥0.01 (เปลี่ยนอย่างน้อย 0.01 บนคะแนน 0–1) เป็น **เกณฑ์วิเคราะห์ ไม่ใช่ Accuracy**
- ผลนี้บอกว่าอันดับเปลี่ยนแค่ไหน **ไม่ได้บอกว่าการเปลี่ยนนั้นดีขึ้นหรือถูกต้องกว่า**
- สัดส่วนข้างล่างเป็นของชุดโปรไฟล์ที่แจกแจงครบ ไม่ใช่สัดส่วนผู้ใช้จริง

## ไม่มีข้อจำกัด (รายวัน)

{table(['วันเกิด', 'สถานะ'], unc)}

## รวมทุกวัน

{table(['กลุ่ม'], [([k], v) for k, v in r['overall'].items()])}

## เฉพาะกรณีที่มี Birth Seed

{table(['กลุ่ม'], [([k], v) for k, v in r['seed_days_only'].items()])}

## มีข้อจำกัด (ตัดกลุ่มความเชื่อ)

{table(['วันเกิด', 'กลุ่มที่ตัด', 'สถานะ'], con)}

## Birth Seed ก่อนและหลัง Normalize (ไม่มีข้อจำกัด)

| วันเกิด | จำนวนเรื่อง | สถานะ | โหนด Seed | ข้อความอ้างอิง | ผลรวมก่อน | น้ำหนักวันเกิดก่อน | สัดส่วนวันเกิดหลัง |
|---|---|---|---|---|---|---|---|
{chr(10).join(seed_rows)}

น้ำหนักเรื่องที่เลือกรวมกัน = 1 ทุกกรณี น้ำหนักวันเกิด 0.05 สัดส่วนหลัง Normalize = 0.05 ÷ 1.05 ≈ 0.047619

## วันเดียวกันในสัปดาห์ แต่คนละวันที่

ตรวจ {sw['checked']} คู่ (ไม่มีข้อจำกัด) ได้ผลเหมือนกันทุกประการ {sw['identical']} คู่ — วันที่ เดือน และปี ไม่มีผลนอกจากบอกว่าเป็นวันอะไรในสัปดาห์

## ไฟล์หลักฐาน

- `model/results/birthday_impact_v1.json` — ตัวเลขทั้งหมด
- `model/results/birthday_impact_profiles.csv` — หนึ่งแถวต่อ (วัน, สถานการณ์, ชุดความสนใจ) พร้อม Top 5 และทริปก่อน/หลัง
"""


def render():
    result, rows = compute()
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["weekday", "scenario", "wish_ids", "class", "max_score_diff", "top5_members_changed", "top5_order_only_changed", "trip_changed",
                "top5_without_birthdate", "top5_with_birthdate", "trip_without", "trip_with"])
    w.writerows(rows)
    return {OUT_JSON: json.dumps(result, ensure_ascii=False, indent=1) + "\n", OUT_CSV: buf.getvalue(), OUT_DOC: doc(result)}


def main() -> int:
    files = render()
    if "--check" in sys.argv:
        bad = [p for p, text in files.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
        print("OK: committed results reproduce exactly" if not bad else "DIFFERENT: " + ", ".join(str(p.relative_to(ROOT)) for p in bad))
        return 1 if bad else 0
    for p, text in files.items():
        p.write_text(text, encoding="utf-8", newline="\n")
        print("wrote", p.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
