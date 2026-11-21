"""Regenerate public/data/event_eval.json: event-recommendation checks over a synthetic set of profiles.
These are structural checks of the event layer on test profiles. They are NOT accuracy, NDCG or user-satisfaction numbers.
Run:  python scripts/build_event_eval.py
"""
import itertools
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))

import _engine as E  # noqa: E402
import _events as EV  # noqa: E402

m = E.m


def profiles():
    out = []
    for i, ws in enumerate(list(itertools.combinations(sorted(m.W), 3))[:60]):
        ex = {}
        if i % 5 == 0: ex = {"tradition_groups": ["ฮินดู"]}
        if i % 7 == 0: ex = {"deity_ids": ["D_GANESHA"]}
        if i % 11 == 0: ex = {"place_ids": ["P001"]}
        out.append({"wish_ids": list(ws), "birthdate": "2000-05-15" if i % 2 else "1997-01-02", "exclusions": ex})
    out += [dict(f) for f in m.FIXTURES]
    return out


P = profiles()
n = len(P)
valid_paths = viol = total_elig = zero = with_direct = 0
stab, interp, tie_top, tie_boundary, ever = Counter(), Counter(), 0, 0, set()
excl_reasons = Counter()
for pr in P:
    prof = m.normalize_profile(pr)
    ctx = EV.ppr_context(pr)
    r = EV.rank_events(pr, ctx=ctx)
    el = r["eligible"]
    total_elig += len(el)
    zero += not el
    with_direct += bool(r["direct"])
    for x in r["excluded"]:
        excl_reasons[x["network_status"]] += 1
    for x in el:
        ever.add(x["event_id"])
        ok = bool(x["evidence_paths"]) and all((z["wish_id"], z["deity_id"]) in m.WD and (z["deity_id"], z["place_id"]) in m.DP and z["wish_id"] in prof["wish_ids"] for z in x["evidence_paths"])
        valid_paths += ok
        viol += (x["deity_id"] in prof["blocked_deity_ids"]) or (x["place_id"] in prof["blocked_place_ids"])
    if el and el[0]["tie_group_size"] > 1:
        tie_top += 1
    s = EV.stability_from_rows(EV.score_events(pr, ctx=ctx)["eligible"])
    stab[s["status"]] += 1
    interp[s.get("interpretation", "-")] += 1
    tie_boundary += s.get("interpretation") == "TIE_BOUNDARY_REVIEW"

out = {
    "version": EV.EVENT_RANKING_VERSION, "kind": "SYNTHETIC_STRUCTURAL_CHECKS",
    "disclaimer": "ตรวจโครงสร้างของชั้นกิจกรรมบนโปรไฟล์ทดสอบ ไม่ใช่ความแม่นยำ NDCG หรือความพึงพอใจของผู้ใช้จริง",
    "n_profiles": n, "n_source_events": len(EV.EVENTS),
    "valid_path_rate": {"valid": valid_paths, "total": total_elig},
    "exclusion_violations": int(viol),
    "coverage": {"profiles_with_events": n - zero, "profiles_without_events": zero, "mean_eligible_per_profile": round(total_elig / n, 2),
                 "distinct_events_ever_eligible": len(ever), "never_eligible": sorted(e["event_id"] for e in EV.EVENTS if e["event_id"] not in ever)},
    "excluded_reasons": dict(excl_reasons),
    "network_vs_direct": {"profiles_with_network_events": n - zero, "profiles_with_direct_events": with_direct,
                          "note": "กิจกรรมจับคู่ตรงเป็นข้อมูลจำลอง ไม่มีเส้นทางและคะแนน จึงไม่นำมาเทียบความแม่นยำกับเครือข่าย"},
    "rank_stability": {"status": dict(stab), "interpretation": dict(interp), "threshold_note": "เกณฑ์ภายใน 0.80 สำหรับสาธิต ไม่ใช่เกณฑ์ความแม่นยำ"},
    "ties": {"profiles_with_tie_at_rank1": tie_top, "profiles_tie_boundary_review": int(tie_boundary)},
    "static_status": dict(Counter(v["network"] for v in EV.STATIC.values())),
    "calendar_status": dict(Counter(v["calendar_date"] for v in EV.STATIC.values())),
    "schedule_status": dict(Counter(v["event_schedule"] for v in EV.STATIC.values())),
    "lunar_source": {k: EV.CAL.LUNAR[k] for k in ("source_url", "source_year", "retrieved_at", "attribution", "conversion_version", "leap_month_check")},
}
path = ROOT / "public" / "data" / "event_eval.json"
path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("profiles", n, "| valid paths", valid_paths, "/", total_elig, "| violations", viol, "| zero-event profiles", zero)
print("stability", dict(stab), dict(interp), "| tie@1", tie_top, "| never eligible", len(out["coverage"]["never_eligible"]))
