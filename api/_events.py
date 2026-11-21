"""EVENT_RANKING_V1 — a ranking LAYER on top of the existing Personalized PageRank. No new network model.

Layer A (this module): which events are relevant to a profile, and how strongly (date independent).
Layer B (calendar / reminders, Stage 2) decides what may be shown or notified on a given day.

Rules locked with the domain expert:
  * Place score  = the SAME normalised score Step 05 uses (ppr/sqrt(deg+1), divided by max over ALL candidate places).
  * Deity score  = raw PPR(d) / max raw PPR over ELIGIBLE deities of the filtered graph (not over the event list).
  * EventScore   = w_deity * DeityScore + w_place * PlaceScore, default 0.5 / 0.5 (a demo assumption, not proven optimal).
  * Ties         = event_id ascending. Scores keep full precision.
  * Events without a valid Wish->Deity->Place path are never given a score and never get an invented path.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import networkx as nx

import _engine as E
import _calendar as CAL

m = E.m
EVENT_RANKING_VERSION = "EVENT_RANKING_V1"
DEFAULT_WEIGHTS = (0.5, 0.5)  # (deity, place)
SCENARIOS = {"deity30_place70": (0.3, 0.7), "baseline_50_50": (0.5, 0.5), "deity70_place30": (0.7, 0.3)}

# ---------------------------------------------------------------- source data (File 03 / CL_EVENTS)
_raw = json.loads((E.MODEL_DIR / "events_cl.json").read_text(encoding="utf-8"))
EVENTS = [dict(zip(_raw["columns"], row)) for row in _raw["rows"]]
EVENT_BY_ID = {e["event_id"]: e for e in EVENTS}
assert len(EVENTS) == 37 and len(EVENT_BY_ID) == 37, "CL_EVENTS must have 37 unique rows"

WEEKDAYS = {"จันทร์": 0, "อังคาร": 1, "พุธ": 2, "พฤหัสบดี": 3, "ศุกร์": 4, "เสาร์": 5, "อาทิตย์": 6}


def is_lunar(ev: dict) -> bool:
    return "ปฏิทินจีน" in ev["date_or_recurrence"] and ev["calendar_type"] == "monthly"


def static_status(ev: dict) -> dict:
    """Profile-independent QA status of one source event (never edits a source relationship)."""
    d, p = ev["deity_id"], ev["place_id"]
    if d not in m.E or p not in m.P or (d, p) not in m.DP:
        network = "RELATIONSHIP_REVIEW_REQUIRED"
    elif not any((w, d) in m.WD for w in m.W):
        network = "NO_VALID_NETWORK_PATH"
    else:
        network = "GRAPH_VALID"
    ctype = ev["calendar_type"]
    if ctype == "weekly" or (ctype == "monthly" and "เสาร์แรก" in ev["date_or_recurrence"]):
        cal = "CALENDAR_DATE_VERIFIED"      # computable from a calendar rule
    elif is_lunar(ev):
        cal = "CALENDAR_DATE_VERIFIED"      # computed from the HKO Gregorian-Lunar table (2026-2027, no leap month)
    else:
        cal = "DATE_UNVERIFIED"             # a date typed in the sheet with no source URL
    return {"network": network, "calendar_date": cal, "event_schedule": "EVENT_SCHEDULE_UNVERIFIED"}


STATIC = {e["event_id"]: static_status(e) for e in EVENTS}
SCHEDULE = {e["event_id"]: CAL.schedule_for(e) for e in EVENTS}   # Layer B rule per event (same event_id on every occurrence)
CROSSCHECK = {e["event_id"]: CAL.lunar_crosscheck(e, SCHEDULE[e["event_id"]]) for e in EVENTS}


# ---------------------------------------------------------------- shared PPR context (same steps as get_rankings)
def ppr_context(profile: dict) -> dict:
    prof = m.normalize_profile(profile)
    pathmap = m.allowed_paths(prof)
    graph = m.G.copy()
    graph.remove_nodes_from("D:" + d for d in prof["blocked_deity_ids"])
    graph.remove_nodes_from("P:" + p for p in prof["blocked_place_ids"])
    seeds = {"W:" + w: 1 / len(prof["wish_ids"]) for w in prof["wish_ids"]}
    birth_ids, _ = m.birth_seed(prof)
    for d in birth_ids:
        seeds["D:" + d] = E.BIRTH_STRENGTH / len(birth_ids)
    seeds = {k: v for k, v in seeds.items() if k in graph}
    norm = sum(seeds.values())
    pers = {n: seeds.get(n, 0.0) / norm for n in graph}
    raw = nx.pagerank(graph, alpha=E.ALPHA, personalization=pers, tol=1e-11, max_iter=1000)
    place_scores = m.get_rankings(profile)["scores"]["ppr"]  # exactly what Step 05 ranks on
    eligible_deities = sorted({e for lst in pathmap.values() for (_, e) in lst})
    return {"prof": prof, "pathmap": pathmap, "raw": raw, "place_scores": place_scores, "eligible_deities": eligible_deities}


def _paths_for(ev, ctx):
    d, p = ev["deity_id"], ev["place_id"]
    wishes = sorted({w for (w, e) in ctx["pathmap"].get(p, []) if e == d})
    return wishes, [{"wish_id": w, "wish_name": m.W[w]["wish_th"], "deity_id": d, "deity_name": m.E[d]["name_th"],
                     "place_id": p, "place_name": m.P[p]["place_name"], "event_id": ev["event_id"],
                     "text": f"{m.W[w]['wish_th']} → {m.E[d]['name_th']} → {m.P[p]['place_name']} → {ev['event_name_th']}"}
                    for w in wishes]


def score_events(profile: dict, events=None, ctx=None) -> dict:
    """Layer A. Returns eligible events (unsorted scores kept at full precision) plus every excluded event with a reason."""
    events = EVENTS if events is None else events
    ctx = ctx or ppr_context(profile)
    prof = ctx["prof"]
    den = max((ctx["raw"].get("D:" + d, 0.0) for d in ctx["eligible_deities"]), default=0.0)
    eligible, excluded = [], []
    for ev in events:
        st = STATIC.get(ev["event_id"]) or static_status(ev)
        d, p = ev["deity_id"], ev["place_id"]
        base = {"event_id": ev["event_id"], "event_name": ev["event_name_th"], "deity_id": d, "place_id": p, "static": st,
                "date_text": ev["date_or_recurrence"], "schedule": SCHEDULE[ev["event_id"]]}
        if st["network"] != "GRAPH_VALID":
            excluded.append(dict(base, network_status=st["network"])); continue
        wishes, paths = _paths_for(ev, ctx)
        if d in prof["blocked_deity_ids"] or p in prof["blocked_place_ids"]:
            had_wish = any((w, d) in m.WD for w in prof["wish_ids"])
            excluded.append(dict(base, network_status="HARD_EXCLUDED" if had_wish else "NO_PATH_FOR_PROFILE")); continue
        if not wishes:
            excluded.append(dict(base, network_status="NO_PATH_FOR_PROFILE")); continue
        if den <= 0:
            excluded.append(dict(base, network_status="ZERO_NETWORK_SCORE")); continue
        deity_score = ctx["raw"].get("D:" + d, 0.0) / den
        place_score = ctx["place_scores"].get(p, 0.0)
        eligible.append(dict(base, network_status="NETWORK_ELIGIBLE", deity_name=m.E[d]["name_th"], place_name=m.P[p]["place_name"],
                             deity_raw_ppr=ctx["raw"].get("D:" + d, 0.0), deity_score=deity_score, place_score=place_score,
                             compatible_wish_ids=wishes, compatible_wishes=[m.W[w]["wish_th"] for w in wishes], evidence_paths=paths))
    return {"eligible": eligible, "excluded": excluded, "deity_denominator": den, "eligible_deities": ctx["eligible_deities"]}


def combine(row: dict, weights=DEFAULT_WEIGHTS) -> float:
    return weights[0] * row["deity_score"] + weights[1] * row["place_score"]


def order(rows: list, weights=DEFAULT_WEIGHTS) -> list:
    """Deterministic order: score desc, event_id asc. Adds network_rank and the size of the tie group."""
    scored = [(combine(r, weights), r) for r in rows]
    scored.sort(key=lambda x: (-x[0], x[1]["event_id"]))
    counts = {}
    for s, _ in scored:
        counts[s] = counts.get(s, 0) + 1
    out = []
    for i, (s, r) in enumerate(scored, 1):
        out.append(dict(r, event_score=s, network_rank=i, tie_group_size=counts[s]))
    return out


def direct_events(profile: dict, all_wishes: bool = False) -> list:
    """GD_EVENTS (synthetic): wish tag only. Never mixed into the network ranking and never given a path or a PPR score.
    all_wishes=True lists every synthetic event (used only by the Tab 2 reminder simulation)."""
    wishes = set(m.W) if all_wishes else set(m.normalize_profile(profile)["wish_ids"])
    out = []
    for r in m.D["events"]:
        if r["wish_id"] in wishes:
            out.append({"event_id": r["event_id"], "event_name": r["event_name"], "type": r["type"], "wish_id": r["wish_id"],
                        "wish_name": m.W[r["wish_id"]]["wish_th"], "event_date": r["event_date"], "event_time": r["event_time"],
                        "notify_days_before": r["notify_days_before"],
                        "network_status": "DIRECT_WISH_BASED", "calendar_date": "SYNTHETIC_DATE", "event_schedule": "SYNTHETIC_DEMO",
                        "note": "จับคู่จากป้ายเรื่องที่ขอโดยตรง ไม่ผ่านเครือข่าย ไม่มีเส้นทางและไม่มีคะแนน PPR"})
    return sorted(out, key=lambda x: (x["event_date"], x["event_id"]))


def rank_events(profile: dict, weights=DEFAULT_WEIGHTS, ctx=None) -> dict:
    ctx = ctx or ppr_context(profile)
    sc = score_events(profile, ctx=ctx)
    ranked = order(sc["eligible"], weights)
    return {"version": EVENT_RANKING_VERSION, "weights": {"deity": weights[0], "place": weights[1]},
            "normalisation": {"place": "same as Step 05: ppr/sqrt(degree+1) divided by max over all candidate places",
                              "deity": "raw PPR divided by max raw PPR over eligible deities of the filtered graph"},
            "relative_scores_note": "คะแนนเป็นค่าสัมพัทธ์ภายในโปรไฟล์นี้ ไม่ใช่คะแนนสัมบูรณ์",
            "eligible": ranked, "excluded": sc["excluded"],
            "counts": {"eligible": len(ranked), "excluded": len(sc["excluded"]),
                       "distinct_deity_place_pairs": len({(r["deity_id"], r["place_id"]) for r in ranked})},
            "eligible_deity_count": len(sc["eligible_deities"]), "direct": direct_events(profile)}


# ---------------------------------------------------------------- rank stability (pure functions, unit-testable)
def average_ranks(values: list) -> list:
    """Rank 1 = highest value; equal values share the average rank."""
    idx = sorted(range(len(values)), key=lambda i: -values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(idx):
        j = i
        while j + 1 < len(idx) and values[idx[j + 1]] == values[idx[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[idx[k]] = avg
        i = j + 1
    return ranks


def spearman(a: list, b: list):
    ra, rb = average_ranks(a), average_ranks(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    va = sum((x - ma) ** 2 for x in ra)
    vb = sum((y - mb) ** 2 for y in rb)
    if va == 0 or vb == 0:
        return None
    return sum((x - ma) * (y - mb) for x, y in zip(ra, rb)) / math.sqrt(va * vb)


def tie_boundary(scores_sorted: list, k: int = 5) -> dict:
    """Is there a group of equal scores straddling the cut between rank k and k+1?"""
    if len(scores_sorted) <= k:
        return {"straddles": False, "group_size": 0}
    edge = scores_sorted[k - 1]
    if scores_sorted[k] != edge:
        return {"straddles": False, "group_size": 0}
    return {"straddles": True, "group_size": sum(1 for s in scores_sorted if s == edge)}


def stability_from_rows(rows: list, threshold: float = 0.80) -> dict:
    n = len(rows)
    base_info = {"n_events": n, "distinct_deity_place_pairs": len({(r["deity_id"], r["place_id"]) for r in rows}),
                 "threshold": threshold, "threshold_note": "เกณฑ์ 0.80 เป็น Internal Demo Threshold ไม่ใช่ความแม่นยำ"}
    if n == 0:
        return dict(base_info, status="NO_ELIGIBLE_NETWORK_EVENTS", interpretation="NOT_EVALUABLE")
    base = order(rows, SCENARIOS["baseline_50_50"])
    top5_base = [r["event_id"] for r in base[:5]]
    if n < 5:
        return dict(base_info, status="NOT_EVALUABLE_INSUFFICIENT_EVENTS", interpretation="NOT_EVALUABLE", top5_baseline=top5_base)
    out = dict(base_info, top5_baseline=top5_base, scenarios={})
    boundary_any = False
    for name, w in SCENARIOS.items():
        ordered = order(rows, w)
        scores_sorted = [r["event_score"] for r in ordered]
        tb = tie_boundary(scores_sorted)
        boundary_any = boundary_any or tb["straddles"]
        top5 = [r["event_id"] for r in ordered[:5]]
        entry = {"weights": {"deity": w[0], "place": w[1]}, "top5": top5, "tie_boundary": tb}
        if name != "baseline_50_50":
            ev_ids = [r["event_id"] for r in rows]
            vb = [combine(r, SCENARIOS["baseline_50_50"]) for r in rows]
            vv = [combine(r, w) for r in rows]
            rho = spearman(vb, vv)
            entry.update({"top5_overlap": len(set(top5_base) & set(top5)) / 5, "spearman": rho,
                          "spearman_status": "OK" if rho is not None else "NOT_EVALUABLE_CONSTANT_RANKING"})
        out["scenarios"][name] = entry
    out["tie_boundary_any"] = boundary_any
    if n == 5:
        out.update(status="TOP5_ONLY", interpretation="NOT_EVALUABLE",
                   note="N = 5: Top-5 ซ้ำกัน 100% โดยโครงสร้าง จึงไม่ใช้ Top-5 Overlap ตัดสินความเสถียร")
        return out
    variants = [out["scenarios"]["deity30_place70"], out["scenarios"]["deity70_place30"]]
    if any(v["spearman"] is None for v in variants):
        out.update(status="EVALUATED", interpretation="NOT_EVALUABLE_CONSTANT_RANKING")
    elif boundary_any:
        out.update(status="EVALUATED", interpretation="TIE_BOUNDARY_REVIEW",
                   note="มีคะแนนเท่ากันคร่อมอันดับ 5 รายงาน Top-5 ตาม Event ID แต่ไม่สรุป Stable/Unstable จาก Top-5 Overlap เพียงอย่างเดียว")
    elif all(v["top5_overlap"] >= threshold and v["spearman"] >= threshold for v in variants):
        out.update(status="EVALUATED", interpretation="STABLE")
    else:
        out.update(status="EVALUATED", interpretation="SENSITIVE")
    return out


def rank_stability(profile: dict, ctx=None) -> dict:
    sc = score_events(profile, ctx=ctx)
    return stability_from_rows(sc["eligible"])
