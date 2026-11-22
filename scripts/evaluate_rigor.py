"""Rigor addendum for the Network model (read-only): confidence intervals, a leakage-free holdout, and a measurement of the coverage layer.

  python scripts/evaluate_rigor.py        -> model/results/rigor_addendum_v1.json (+ a byte-identical copy in public/data/rigor_addendum.json for the web page)

It only CALLS the reference model (api/_engine.m); it changes no model file and does not overwrite model/results/network_phase1_results.json.
Everything is deterministic (fixed seeds). It makes no new claim about user relevance: the labels are the same researcher-chosen labels.

  A. Fixtures: per-profile NDCG@5 and a paired bootstrap (95% CI) of the differences between methods.
  B. Leave-one-edge-out holdout over ALL eligible Deity-Place edges (replaces "6 random trials x 8 hidden edges" drawn from the same 28 edges).
  C. Coverage layer: PPR vs PPR+Coverage over every 1-, 2- and 3-wish combination of the 10 wishes (no labels needed: it measures what the layer targets).
"""
import itertools
import json
import math
import random
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
import networkx as nx  # noqa: E402
import _engine as E  # noqa: E402

m = E.m
SEED = 7202
B = 10000


def wilson(k, n, z=1.96):
    if n == 0:
        return [None, None]
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [round(max(0.0, c - h), 4), round(min(1.0, c + h), 4)]


def binom_two_sided(k, n):
    """Exact two-sided binomial (p = 0.5) used as an exact McNemar test."""
    if n == 0:
        return 1.0
    tail = sum(math.comb(n, i) for i in range(0, min(k, n - k) + 1)) / 2 ** n
    return round(min(1.0, 2 * tail), 4)


def boot_ci(diffs, rng, b=B):
    n = len(diffs)
    means = sorted(statistics.mean(diffs[rng.randrange(n)] for _ in range(n)) for _ in range(b))
    return [round(means[int(0.025 * b)], 4), round(means[int(0.975 * b) - 1], 4)]


# ---------------------------------------------------------------- A. fixtures
def fixtures():
    rows = []
    for fx in m.FIXTURES:
        rr = m.get_rankings(fx)
        allowed = rr["paths"]
        labels = {p for p in fx["expected_relevant"] if p in allowed}
        row = {"profile_id": fx["profile_id"], "n_wishes": len(fx["wish_ids"]), "valid_labels": len(labels), "candidates": len(allowed)}
        for name in ("popularity", "direct", "ppr", "ppr_coverage"):
            met = m.classification_metrics(rr["ranked"][name], labels)
            row[name] = met["ndcg_at5"]
        rows.append(row)
    usable = [r for r in rows if r["ppr"] is not None]                       # profiles with at least one valid label
    rng = random.Random(SEED)
    out = {"n_profiles": len(rows), "n_with_valid_labels": len(usable), "single_wish_profiles": sum(r["n_wishes"] == 1 for r in rows),
           "multi_wish_profiles": sum(r["n_wishes"] > 1 for r in rows), "per_profile": rows, "pairs": {}}
    for a, b in (("ppr", "popularity"), ("ppr", "direct"), ("ppr_coverage", "ppr"), ("direct", "popularity")):
        d = [r[a] - r[b] for r in usable]
        out["pairs"][f"{a}_minus_{b}"] = {"mean_diff_ndcg_at5": round(statistics.mean(d), 4), "ci95_bootstrap": boot_ci(d, rng),
            "profiles_better": sum(x > 1e-12 for x in d), "profiles_equal": sum(abs(x) <= 1e-12 for x in d), "profiles_worse": sum(x < -1e-12 for x in d)}
    out["means"] = {n: round(statistics.mean(r[n] for r in usable), 4) for n in ("popularity", "direct", "ppr", "ppr_coverage")}
    return out


# ---------------------------------------------------------------- B. leave-one-edge-out
def loeo():
    G = m.G
    edges = sorted(m.DP)
    eligible = [(e, p) for e, p in edges if G.degree("D:" + e) > 2 and G.degree("P:" + p) > 1]      # same eligibility rule as the original holdout
    rows = []
    for e, p in eligible:
        train = G.copy()
        train.remove_edge("D:" + e, "P:" + p)
        pers = {n: (1.0 if n == "D:" + e else 0.0) for n in train.nodes}
        pr = nx.pagerank(train, alpha=0.85, personalization=pers, max_iter=1000, tol=1e-10)
        known = {n[2:] for n in train.neighbors("D:" + e) if n.startswith("P:")}
        cands = [x for x in m.P if x not in known]
        ranks = {"ppr": sorted(cands, key=lambda x: (-pr["P:" + x] / (train.degree("P:" + x) + 1) ** 0.5, x)),
                 "degree": sorted(cands, key=lambda x: (-train.degree("P:" + x), x))}
        row = {"deity_id": e, "place_id": p, "candidates": len(cands)}
        for k, items in ranks.items():
            r = items.index(p) + 1
            row[k] = {"rank": r, "hit_at5": int(r <= 5), "ndcg_at5": (1 / math.log2(r + 1)) if r <= 5 else 0.0, "rr": 1 / r}
        rows.append(row)
    n = len(rows)
    out = {"design": "leave-one-edge-out over every eligible Deity-Place edge (deterministic, each edge hidden exactly once)", "n_edges": n, "models": {}}
    for k in ("ppr", "degree"):
        hits = sum(r[k]["hit_at5"] for r in rows)
        out["models"][k] = {"hit_at5": round(hits / n, 4), "hits": hits, "wilson95": wilson(hits, n), "mean_ndcg_at5": round(statistics.mean(r[k]["ndcg_at5"] for r in rows), 4),
                            "mrr": round(statistics.mean(r[k]["rr"] for r in rows), 4), "median_rank": statistics.median(r[k]["rank"] for r in rows)}
    only_ppr = sum(r["ppr"]["hit_at5"] and not r["degree"]["hit_at5"] for r in rows)
    only_deg = sum(r["degree"]["hit_at5"] and not r["ppr"]["hit_at5"] for r in rows)
    rng = random.Random(SEED)
    out["paired"] = {"hit_only_ppr": only_ppr, "hit_only_degree": only_deg, "exact_mcnemar_p": binom_two_sided(min(only_ppr, only_deg), only_ppr + only_deg),
                     "hit_diff_ppr_minus_degree": round((out["models"]["ppr"]["hits"] - out["models"]["degree"]["hits"]) / n, 4),
                     "hit_diff_ci95_bootstrap": boot_ci([r["ppr"]["hit_at5"] - r["degree"]["hit_at5"] for r in rows], rng)}
    out["per_edge"] = [{"deity_id": r["deity_id"], "place_id": r["place_id"], "ppr_rank": r["ppr"]["rank"], "degree_rank": r["degree"]["rank"]} for r in rows]
    return out


# ---------------------------------------------------------------- C. coverage layer
def coverage():
    out = {"design": "every 1-, 2- and 3-wish combination of the 10 wishes, no exclusions, no birth date (so only the graph and the coverage term differ)", "by_n_wishes": {}}
    for k in (1, 2, 3):
        rows = []
        for ws in itertools.combinations(sorted(m.W), k):
            rr = m.get_rankings({"profile_id": "COV", "wish_ids": list(ws), "birthdate": None, "exclusions": {}})
            paths = rr["paths"]
            if not paths:
                rows.append({"wishes": list(ws), "candidates": 0})
                continue
            res = {}
            for name in ("ppr", "ppr_coverage"):
                top = rr["ranked"][name][:5]
                res[name] = {"top5": top, "covered": len({w for p in top for w, e in paths.get(p, [])}) / len(ws)}
            reachable = len({w for p in paths for w, e in paths[p]}) / len(ws)             # what the best possible selection could cover
            rows.append({"wishes": list(ws), "candidates": len(paths), "reachable_wish_share": reachable, **res,
                         "same_set": set(res["ppr"]["top5"]) == set(res["ppr_coverage"]["top5"]), "same_order": res["ppr"]["top5"] == res["ppr_coverage"]["top5"]})
        live = [r for r in rows if r["candidates"]]
        gain = [r["ppr_coverage"]["covered"] - r["ppr"]["covered"] for r in live]
        out["by_n_wishes"][str(k)] = {
            "profiles": len(rows), "with_candidates": len(live), "top5_set_changed": sum(not r["same_set"] for r in live), "top5_order_changed": sum(not r["same_order"] for r in live),
            "coverage_up": sum(x > 1e-12 for x in gain), "coverage_equal": sum(abs(x) <= 1e-12 for x in gain), "coverage_down": sum(x < -1e-12 for x in gain),
            "mean_covered_ppr": round(statistics.mean(r["ppr"]["covered"] for r in live), 4), "mean_covered_ppr_coverage": round(statistics.mean(r["ppr_coverage"]["covered"] for r in live), 4),
            "mean_reachable_share": round(statistics.mean(r["reachable_wish_share"] for r in live), 4),
            "examples_changed": [{"wishes": r["wishes"], "ppr_top5": r["ppr"]["top5"], "coverage_top5": r["ppr_coverage"]["top5"], "covered_ppr": round(r["ppr"]["covered"], 3), "covered_coverage": round(r["ppr_coverage"]["covered"], 3)}
                                 for r in live if not r["same_set"]][:3]}
    return out


def main():
    result = {"version": "RIGOR_ADDENDUM_V1", "model_version": E.MODEL_VERSION, "seed": SEED, "bootstrap_resamples": B,
              "note": "Read-only addendum. The reference model and network_phase1_results.json are unchanged. Same researcher-chosen labels; not independent relevance accuracy.",
              "fixtures": fixtures(), "leave_one_edge_out": loeo(), "coverage_layer": coverage()}
    path = ROOT / "model" / "results" / "rigor_addendum_v1.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    # The web page (Tab 2 -> Model Evaluation) reads this byte-identical copy; model/results/ is the source of truth.
    (ROOT / "public" / "data" / "rigor_addendum.json").write_bytes(path.read_bytes())
    f, l, c = result["fixtures"], result["leave_one_edge_out"], result["coverage_layer"]["by_n_wishes"]
    print("fixtures: profiles", f["n_profiles"], "| with valid labels", f["n_with_valid_labels"], "| single-wish", f["single_wish_profiles"], "| means", f["means"])
    for k, v in f["pairs"].items():
        print("  ", k, v)
    print("LOEO edges", l["n_edges"], l["models"], l["paired"])
    for k, v in c.items():
        print("coverage", k, {x: v[x] for x in v if x != "examples_changed"})


if __name__ == "__main__":
    main()
