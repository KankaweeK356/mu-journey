"""Thin service layer around the UNMODIFIED reference model in model/network_phase1.py.

Rule of this module: it never re-ranks, re-scores or re-routes anything on its own.
Every score comes from network_phase1 (place_recommendation / match_trip / get_rankings).
`trace()` re-runs the same steps as get_rankings() only to expose the intermediate numbers
for the explainer tab, and reports `matches_reference` so any drift is visible.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "model"
if str(MODEL_DIR) not in sys.path:
    sys.path.insert(0, str(MODEL_DIR))

import networkx as nx  # noqa: E402
import network_phase1 as m  # noqa: E402  (reference implementation, do not edit)

MODEL_VERSION = "NETWORK_PHASE1_V2_2026-11-21"
ALPHA = 0.85
BIRTH_STRENGTH = 0.05
PPR_SHARE = 0.75

# ---------------------------------------------------------------- versions (identical for every endpoint)
import hashlib  # noqa: E402

_snapshot_bytes = (MODEL_DIR / "input_drive_v2_snapshot.json").read_bytes()
_snapshot_meta = json.loads(_snapshot_bytes)
VERSIONS = {
    "model": MODEL_VERSION,
    "dataset_title": _snapshot_meta.get("dataset_title"),
    "data_as_of": _snapshot_meta.get("data_as_of"),
    "snapshot_sha256": hashlib.sha256(_snapshot_bytes).hexdigest()[:12],
    "trip_design": m.TRIP_DATA.get("version"),
}
del _snapshot_bytes, _snapshot_meta

# ---------------------------------------------------------------- ritual claims (File 01 / CL_RITUAL_CLAIMS)
_rit = json.loads((MODEL_DIR / "ritual_claims.json").read_text(encoding="utf-8"))
_cols = _rit["columns"]
RITUALS_BY_ENTITY: dict[str, list[dict]] = defaultdict(list)
for _row in _rit["rows"]:
    _r = dict(zip(_cols, _row))
    _r["quality_status"] = "SOURCE_MISSING" if _r.pop("quality") == "M" else "SOURCE_CLAIM_NOT_OFFICIAL_VERIFIED"
    _r["source_urls"] = [u.strip() for u in _r.pop("source_url").split("|") if u.strip()]
    RITUALS_BY_ENTITY[_r["entity_id"]].append(_r)

CATEGORY_TH = {
    "offering": "ของไหว้", "taboo": "ข้อห้าม/ข้อควรระวัง", "chant": "บทสวด/คำอธิษฐาน",
    "step": "ขั้นตอน", "auspicious_time": "วัน/เวลาที่เชื่อว่าดี", "note": "หมายเหตุ",
    "access": "การเดินทางเข้าถึง", "fee": "ค่าเข้า",
}

# ---------------------------------------------------------------- data-status vocabulary
# SOURCE      = tied to an official / government / official-site source record
# CANDIDATE   = taken from a web source that still needs review
# SYNTHETIC   = made up for the demo (hours, providers, offers, users)
# UNVERIFIED  = belief claim or value nobody has verified
STATUS_TH = {
    "SOURCE": "มีแหล่งอ้างอิงทางการ", "CANDIDATE": "ผู้สมัคร รอตรวจ",
    "SYNTHETIC": "ข้อมูลจำลอง", "UNVERIFIED": "ยังไม่ยืนยัน",
}


def place_hours_status(place: dict) -> str:
    return {"SYNTHETIC_DEMO_HOURS": "SYNTHETIC"}.get(place["hours_origin"], "CANDIDATE")


def edge_status(kind: str, rel_status: str) -> str:
    if kind == "wish_deity":
        return "UNVERIFIED"  # BELIEF_CLAIM_UNVERIFIED for every Wish-Deity edge in the snapshot
    return "SOURCE" if rel_status == "SOURCE_PRESENT_REVIEW" else "CANDIDATE"


_DP_STATUS = {(r["deity_id"], r["place_id"]): edge_status("deity_place", r["relationship_status"]) for r in m.D["deity_place"]}


def tradition_groups_of(tradition: str) -> list[str]:
    return [g for g, pred in m.TRADITION_GROUPS.items() if pred(tradition)]


# ---------------------------------------------------------------- catalog
def catalog() -> dict:
    return {
        "model_version": MODEL_VERSION,
        "versions": VERSIONS,
        "wishes": [{"id": w, "label": r["wish_th"]} for w, r in sorted(m.W.items())],
        "tradition_groups": list(m.TRADITION_GROUPS),
        "deities": [
            {"id": e, "name_th": r["name_th"], "name_en": r["name_en"], "tradition": r["tradition"],
             "groups": tradition_groups_of(r["tradition"])}
            for e, r in sorted(m.E.items())
        ],
        "places": [{"id": p, "name": r["place_name"], "district": r["district"]} for p, r in sorted(m.P.items())],
        "trips": [{"id": t["trip_id"], "title": t["title"], "stop_count": t["stop_count"]} for t in m.CATALOG.values()],
        "limits": {"min_wishes": 1, "max_wishes": 3, "max_places": 5},
    }


# ---------------------------------------------------------------- places
def _rituals_for(place_id: str, deity_ids: list[str]) -> dict:
    out = {"place": [], "deity": {}}
    for r in RITUALS_BY_ENTITY.get(place_id, []):
        out["place"].append(dict(r, category_th=CATEGORY_TH.get(r["category"], r["category"])))
    for d in deity_ids:
        rows = RITUALS_BY_ENTITY.get(d)
        if rows:
            out["deity"][d] = [dict(r, category_th=CATEGORY_TH.get(r["category"], r["category"])) for r in rows]
    return out


def place_detail(place_id: str) -> dict:
    if place_id not in m.P:
        raise KeyError(place_id)
    p = m.P[place_id]
    deities = sorted(m.PLACE_DEITIES[place_id])
    links = []
    for e in deities:
        wishes = sorted(w for w in m.WISH_DEITIES if e in m.WISH_DEITIES[w])
        links.append({
            "deity_id": e, "deity_name": m.E[e]["name_th"], "deity_name_en": m.E[e]["name_en"],
            "tradition": m.E[e]["tradition"],
            "wish_ids": wishes, "wish_names": [m.W[w]["wish_th"] for w in wishes],
            "place_link_status": _DP_STATUS[(e, place_id)],
            "wish_link_status": "UNVERIFIED",
        })
    trips_here = [t["trip_id"] for t in m.CATALOG.values() if place_id in t["place_ids"]]
    return {
        "place_id": place_id, "name": p["place_name"], "district": p["district"], "address": p["address"],
        "station": {"id": p["routing_station_id"], "access_min_candidate": p["access_min_candidate"],
                    "lat": p["station_anchor_lat"], "lon": p["station_anchor_lon"],
                    "coordinate_type": p["coordinate_type"],
                    "note": "พิกัดนี้คือสถานีที่ใกล้ที่สุด ไม่ใช่พิกัดสถานที่จริง"},
        "hours": {"open": p["demo_open"], "close": p["demo_close"], "origin": p["hours_origin"],
                  "status": place_hours_status(p), "source": p.get("hours_source_ref")},
        "routing_status": p["routing_status"], "caution": p.get("caution"),
        "sacred_entities": links,
        "rituals": _rituals_for(place_id, deities),
        "in_signature_trips": trips_here,
        "disclaimer": "ความเชื่อที่แสดงเป็นข้อมูลจากแหล่งอ้างอิง ไม่ใช่การรับรองทางการและไม่ใช่หลักฐานว่าคำขอพรจะสัมฤทธิ์ผล",
    }


# ---------------------------------------------------------------- trips (fixed, never re-optimised)
def trip_detail(trip_id: str) -> dict:
    if trip_id not in m.TRIPS:
        raise KeyError(trip_id)
    raw = m.TRIPS[trip_id]
    cat = m.CATALOG[trip_id]
    route = raw["route"]
    stops = []
    for s in route["stops"]:
        pid = s["place_id"]
        feat = next(z for z in cat["featured_rituals"] if z["place_id"] == pid)
        stops.append({
            "order": s["order"], "place_id": pid, "name": m.P[pid]["place_name"],
            "arrival": s["arrival_clock"], "start": s["start_clock"], "finish": s["finish_clock"],
            "station_id": s["station_id"], "station_name": s["station_name"],
            "access_mode": s["entry_access_mode"], "access_leg_min": s["approximate_leg_total_min"],
            "wait_open_min": s["wait_open_min"], "hours_origin": s["venue_hours_origin"],
            "featured_deity_id": feat["deity_id"], "featured_deity": m.E[feat["deity_id"]]["name_th"],
            "featured_tradition": feat["tradition"], "featured_wish_ids": feat["wish_ids"],
        })
    return {
        "trip_id": trip_id, "title": cat["title"], "theme_weights": cat["wish_weights"],
        "theme_weight_names": {m.W[w]["wish_th"]: v for w, v in cat["wish_weights"].items()},
        "stops": stops, "legs": route["legs"],
        "start": {"station_id": "CEN", "clock": "09:00", "note": "จุดนัดพบสยาม (สมมติ)"},
        "finish_clock": route["finish_clock"], "duration_min": route["duration_min"],
        "rail_min": route["rail_min_est"], "walk_min": route["station_walk_min_est"],
        "train_wait_min": route["train_wait_min_assumed"], "opening_wait_min": route["opening_wait_min"],
        "group_briefing_min": route["group_briefing_min"], "midday_break_min": route["midday_break_min"],
        "dwell_min": route["dwell_and_group_buffer_min"],
        "metrics": raw["metrics"], "hours_quality": route["source_data_quality"],
        "status": cat["status"], "route_reoptimized_per_user": False,
        "constraints": ["BTS/MRT + เดินหรือ Skywalk เท่านั้น", "4 จุดแวะ", "รวมไม่เกิน 6 ชั่วโมง", "ไม่มีสถานที่ซ้ำข้ามทริป"],
        "commercial_status": "PRICE_AND_CAPACITY_TBD",
    }


# ---------------------------------------------------------------- recommendations
def _reason(path: dict) -> str:
    return f"เกี่ยวข้องกับ{path['wish_name']} ผ่าน{path['deity_name']} ตามความสัมพันธ์ที่บันทึกไว้ในฐานข้อมูล"


def _event_block(profile: dict, full: bool = False) -> dict:
    """Layer A event ranking (see _events.py). Lazy import: _events imports this module."""
    import _events as EV
    ctx = EV.ppr_context(profile)
    block = EV.rank_events(profile, ctx=ctx)
    if full:
        block["stability"] = EV.stability_from_rows(EV.score_events(profile, ctx=ctx)["eligible"])
        block["step05_check"] = all(abs(r["place_score"] - ctx["place_scores"].get(r["place_id"], -1)) < 1e-15 for r in block["eligible"])
    as_of = profile.get("as_of")          # optional Layer B date (a calendar date only, never personal data)
    if as_of:
        import _calendar as CAL
        block["display"] = CAL.display_layer(block["eligible"], as_of)
    block["lunar_source"] = {k: v for k, v in EV.CAL.LUNAR.items() if k in (
        "source_name", "source_url", "source_year", "provider", "attribution", "retrieved_at", "conversion_version", "covers",
        "leap_month_in_range", "leap_month_check")}
    return block


def recommend(profile: dict) -> dict:
    """Output A (Top<=5 places) and Output B (best fixed trip or NO_ELIGIBLE_SIGNATURE_TRIP)."""
    places = m.place_recommendation(profile)
    trip = m.match_trip(profile)
    view = []
    for item in places["top5"]:
        pid = item["place_id"]
        pl = m.P[pid]
        deity_ids = sorted({z["deity_id"] for z in item["evidence_paths"]})
        paths = []
        for z in item["evidence_paths"]:
            paths.append(dict(z, reason=_reason(z), place_link_status=_DP_STATUS[(z["deity_id"], pid)],
                              wish_link_status="UNVERIFIED"))
        view.append({
            "rank": item["rank"], "place_id": pid, "name": pl["place_name"], "district": pl["district"],
            "score": item["ppr_normalized_score"], "matched_wish_ids": item["matched_wish_ids"],
            "matched_wishes": [m.W[w]["wish_th"] for w in item["matched_wish_ids"]],
            "paths": paths, "deity_ids": deity_ids,
            "hours": {"open": pl["demo_open"], "close": pl["demo_close"], "status": place_hours_status(pl)},
            "station_id": pl["routing_station_id"], "access_min": pl["access_min_candidate"],
            "rituals": _rituals_for(pid, deity_ids),
            "note": item["note"],
        })
    trip_view = None
    scores = []
    for s in trip["all_trip_scores"]:
        scores.append(dict(s, trip_name=m.CATALOG[s["trip_id"]]["title"],
                           wish_names=[m.W[w]["wish_th"] for w in s["user_wishes_covered"]]))
    if trip["matched_trip"]:
        trip_view = trip_detail(trip["matched_trip"]["trip_id"])
    return {
        "model_version": MODEL_VERSION,
        "versions": VERSIONS,
        "profile": {"wish_ids": places["wish_ids"], "weekday": places["weekday_from_dob"],
                    "applied_exclusions": places["applied_exclusions"],
                    "birth_claim_ids_used": places["birth_claim_ids_used"]},
        "candidate_places": places["candidate_places"], "limited_results": places["limited_results"],
        "limited_reason": places["limited_reason"],
        "top5": view,
        "events": _event_block(profile),
        "trip": {"decision": trip["decision"], "matched": trip["matched_trip"], "detail": trip_view,
                 "all_scores": scores, "route_reoptimized_per_user": trip["route_reoptimized_per_user"]},
        "model": {"place_recommendation": places, "match_trip": trip},  # untouched reference output
        "notes": ["ผลลัพธ์เป็นการสาธิตโมเดล ไม่ใช่การรับรองความศักดิ์สิทธิ์หรือผลของการขอพร",
                  "ทริปเป็นข้อมูลจำลอง ยังไม่มีราคา ที่นั่ง หรือวันเดินทางที่เปิดขายจริง"],
    }


# ---------------------------------------------------------------- offers (mock catalogue, no transactions)
def offers_for(place_ids: list[str], wish_ids: list[str]) -> dict:
    prov = {r["provider_id"]: r for r in m.D["providers"]}
    out = []
    for o in m.D["offers"]:
        if o["place_id"] in place_ids or o["wish_id"] in wish_ids:
            pr = prov.get(o["provider_id"], {})
            out.append({
                "offer_id": o["offer_id"], "place_id": o["place_id"], "place_name": m.P[o["place_id"]]["place_name"],
                "wish_id": o["wish_id"], "wish_name": m.W[o["wish_id"]]["wish_th"],
                "service_type": o["service_type"], "title": o["package_title"], "price_thb": o["price_thb"],
                "included": o["included_service"], "lead_time_days": o["lead_time_days"],
                "provider": pr.get("provider_display_name"), "is_real_provider": bool(pr.get("is_real_provider")),
                "status": o["offer_status"], "data_origin": o["data_origin"],
            })
    return {"offers": out, "disclaimer": "รายการฝากมูเป็นข้อมูลจำลอง ไม่ใช่ผู้ให้บริการจริง ไม่มีการจองหรือชำระเงิน"}


# ---------------------------------------------------------------- step-by-step trace for the explainer tab
def trace(profile: dict) -> dict:
    """Replays get_rankings() and records each intermediate quantity.

    Uses the same functions and constants as the reference. `matches_reference` compares the
    final Top-5 with m.place_recommendation(); the tests assert it is always True.
    """
    prof = m.normalize_profile(profile)
    pathmap = m.allowed_paths(prof)

    graph = m.G.copy()
    n_before = graph.number_of_nodes()
    graph.remove_nodes_from("D:" + d for d in prof["blocked_deity_ids"])
    graph.remove_nodes_from("P:" + p for p in prof["blocked_place_ids"])

    seeds = {"W:" + w: 1 / len(prof["wish_ids"]) for w in prof["wish_ids"]}
    birth_ids, birth_refs = m.birth_seed(prof)
    for d in birth_ids:
        seeds["D:" + d] = BIRTH_STRENGTH / len(birth_ids)
    seeds = {x: v for x, v in seeds.items() if x in graph}
    norm = sum(seeds.values())
    pers = {n: seeds.get(n, 0.0) / norm for n in graph}
    pagerank = nx.pagerank(graph, alpha=ALPHA, personalization=pers, tol=1e-11, max_iter=1000)

    base = {p: float(pagerank["P:" + p]) / (graph.degree("P:" + p) + 1) ** 0.5 for p in pathmap}
    mx = max(base.values(), default=0)
    normalized = {p: (v / mx if mx else 0) for p, v in base.items()}

    candidates = []
    for p in sorted(pathmap, key=lambda x: (-normalized[x], x)):
        candidates.append({
            "place_id": p, "name": m.P[p]["place_name"],
            "pagerank_raw": float(pagerank["P:" + p]), "degree": graph.degree("P:" + p),
            "degree_corrected": base[p], "ppr_normalized": normalized[p],
            "paths": [{"wish_id": w, "wish_name": m.W[w]["wish_th"], "deity_id": e, "deity_name": m.E[e]["name_th"]}
                      for w, e in pathmap[p]],
        })

    # Greedy coverage re-ranking — identical expression to the reference.
    remaining = set(pathmap)
    selected, covered, steps = [], set(), []
    n_wishes = len(prof["wish_ids"])
    while remaining and len(selected) < 5:
        def utility(p):
            path_wishes = {w for w, e in pathmap[p]}
            new = len(path_wishes - covered) / n_wishes
            return .75 * normalized.get(p, 0) + .25 * new
        choice = max(remaining, key=lambda p: (utility(p), normalized.get(p, 0), -int(p[1:]) if p[1:].isdigit() else 0))
        table = []
        for p in sorted(remaining, key=lambda x: (-utility(x), x))[:8]:
            path_wishes = {w for w, e in pathmap[p]}
            new_w = sorted(path_wishes - covered)
            table.append({"place_id": p, "name": m.P[p]["place_name"], "ppr_normalized": normalized[p],
                          "new_wishes": new_w, "new_fraction": len(new_w) / n_wishes,
                          "utility": utility(p), "chosen": p == choice})
        steps.append({"step": len(selected) + 1, "choice": choice, "already_covered": sorted(covered), "table": table})
        selected.append(choice)
        covered.update(w for w, e in pathmap[choice])
        remaining.remove(choice)

    direct = sorted(pathmap, key=lambda p: (-float(len(pathmap[p])), p))
    popularity = sorted(pathmap, key=lambda p: (-float(graph.degree("P:" + p)), p))

    reference = m.get_rankings(profile)
    ref_top5 = reference["ranked"]["ppr_coverage"][:5]

    # node-level PageRank for the graph canvas (wishes, deities, places still in the graph)
    node_scores = {n: float(v) for n, v in pagerank.items()}

    # trip matching ingredients, straight from the reference scores
    trip_rows = []
    for tid, trip in m.CATALOG.items():
        stop_scores = [{"place_id": p, "name": m.P[p]["place_name"], "ppr_normalized": reference["scores"]["ppr"].get(p, 0.0)}
                       for p in trip["place_ids"]]
        trip_rows.append({"trip_id": tid, "title": trip["title"], "stops": stop_scores})
    match = m.match_trip(profile)

    # Which relationships and places the exclusions took away (computed against the unfiltered graph).
    no_block = dict(prof, blocked_deity_ids=set(), blocked_place_ids=set())
    before = m.allowed_paths(no_block)
    lost_places = [p for p in before if p not in pathmap]
    reduced_places = [p for p in pathmap if len(pathmap[p]) < len(before[p])]
    rm_wd = sorted((w, e) for (w, e) in m.WD if e in prof["blocked_deity_ids"])
    rm_dp = sorted((e, p) for (e, p) in m.DP if e in prof["blocked_deity_ids"] or p in prof["blocked_place_ids"])
    removed_edges = {
        "wish_deity": len(rm_wd), "deity_place": len(rm_dp),
        "examples": [f"{m.W[w]['wish_th']} – {m.E[e]['name_th']}" for w, e in rm_wd[:4]]
                    + [f"{m.E[e]['name_th']} – {m.P[p]['place_name']}" for e, p in rm_dp[:4]],
        "places_losing_all_paths": [{"id": p, "name": m.P[p]["place_name"]} for p in lost_places],
        "places_with_fewer_paths": [{"id": p, "name": m.P[p]["place_name"], "before": len(before[p]), "after": len(pathmap[p])}
                                    for p in reduced_places],
        "candidates_before": len(before), "candidates_after": len(pathmap),
    }

    return {
        "model_version": MODEL_VERSION,
        "versions": VERSIONS,
        "parameters": {"alpha": ALPHA, "ppr_weight": 0.75, "coverage_weight": 0.25, "birth_strength": BIRTH_STRENGTH,
                       "trip_ppr_share": PPR_SHARE, "trip_min_coverage": 0.30, "k": 5,
                       "degree_correction": "ppr / sqrt(degree + 1)", "normalisation": "divide by max over candidates"},
        "profile": {"wish_ids": prof["wish_ids"], "wish_names": [m.W[w]["wish_th"] for w in prof["wish_ids"]],
                    "weekday": prof["weekday"], "blocked_deity_ids": sorted(prof["blocked_deity_ids"]),
                    "blocked_place_ids": sorted(prof["blocked_place_ids"])},
        "step1_prune": {"nodes_before": n_before, "nodes_after": graph.number_of_nodes(),
                        "removed_edges": removed_edges,
                        "removed_deities": [{"id": d, "name": m.E[d]["name_th"], "tradition": m.E[d]["tradition"]}
                                            for d in sorted(prof["blocked_deity_ids"])],
                        "removed_places": [{"id": p, "name": m.P[p]["place_name"]} for p in sorted(prof["blocked_place_ids"])]},
        "step2_seeds": {"seeds": seeds, "birth_deity_ids": birth_ids, "birth_claim_ids": birth_refs,
                        "note": "วันเกิดใช้เป็นสัญญาณรองเท่านั้น (น้ำหนัก 0.05) และต้องผูกกับ Master ID ที่มีอยู่จริง"},
        "step3_pagerank": {"candidates": candidates[:15], "candidate_count": len(candidates), "node_scores": node_scores},
        "step4_coverage": {"steps": steps},
        "step5_result": {"top5": selected, "reference_top5": ref_top5, "matches_reference": selected == ref_top5,
                         "limited": len(selected) < 5,
                         "paths": {p: [{"wish_id": w, "wish_name": m.W[w]["wish_th"], "deity_id": e, "deity_name": m.E[e]["name_th"]}
                                       for w, e in pathmap[p]] for p in selected},
                         "names": {p: m.P[p]["place_name"] for p in selected}},
        "baselines": {"direct_two_hop_top5": direct[:5], "popularity_degree_top5": popularity[:5]},
        "event_ranking": _event_block(profile, full=True),
        "trip_matching": {"trips": trip_rows, "result": match},
    }


# ---------------------------------------------------------------- feedback validation (no personal data accepted)
FEEDBACK_KINDS = {"places", "trip", "proxy"}
REASON_TAGS = {"RELEVANT", "NOT_RELEVANT", "TOO_FAR", "TOO_LONG", "PRICE", "COMMUNICATION", "OTHER"}


def validate_feedback(body: dict) -> dict:
    kind = body.get("kind")
    if kind not in FEEDBACK_KINDS:
        raise ValueError("kind must be one of " + ", ".join(sorted(FEEDBACK_KINDS)))
    rating = body.get("rating")
    if not isinstance(rating, int) or not 1 <= rating <= 5:
        raise ValueError("rating must be an integer 1-5")
    wishes = list(dict.fromkeys(body.get("wish_ids") or []))
    if len(wishes) > 3 or any(w not in m.W for w in wishes):
        raise ValueError("invalid wish_ids")
    places = list(dict.fromkeys(body.get("place_ids") or []))
    if len(places) > 5 or any(p not in m.P for p in places):
        raise ValueError("invalid place_ids")
    trip_id = body.get("trip_id") or ""
    if trip_id and trip_id not in m.TRIPS:
        raise ValueError("invalid trip_id")
    offer_id = body.get("offer_id") or ""
    if offer_id and offer_id not in {o["offer_id"] for o in m.D["offers"]}:
        raise ValueError("invalid offer_id")
    reason = body.get("reason_tag") or "OTHER"
    if reason not in REASON_TAGS:
        raise ValueError("invalid reason_tag")
    again = body.get("would_use_again") or ""
    if again not in {"", "YES", "NO", "MAYBE"}:
        raise ValueError("invalid would_use_again")
    if body.get("consent") is not True:
        raise ValueError("consent is required to store feedback")
    comment = str(body.get("comment") or "").strip()[:300]
    return {"kind": kind, "rating": rating, "wish_ids": wishes, "place_ids": places, "trip_id": trip_id,
            "offer_id": offer_id, "reason_tag": reason, "would_use_again": again, "comment": comment,
            "scope": "DEMO_UX_FEEDBACK_NOT_REAL_SERVICE", "data_origin": "DEMO_USER_INPUT", "consent": "YES"}
