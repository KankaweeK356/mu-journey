"""Network analysis for the defence (read-only): community validation, schema-preserving random graphs, degree by node type.

Run:  python scripts/network_analysis.py              (writes model/results/network_analysis* and public/data/network_analysis.json)
      python scripts/network_analysis.py --check      (recomputes and compares with the committed files, writes nothing)

It never changes the graph, the reference model, PageRank, rankings or public/data/graph.json.
Method and limits: docs/NETWORK_ANALYSIS_METHOD_TH.md
"""
from __future__ import annotations

import csv
import io
import json
import random
import statistics
import sys
from collections import Counter
from itertools import combinations
from pathlib import Path

import networkx as nx

ROOT = Path(__file__).resolve().parent.parent
GRAPH_JSON = ROOT / "public" / "data" / "graph.json"
SNAPSHOT = ROOT / "model" / "input_drive_v2_snapshot.json"
OUT_DIR = ROOT / "model" / "results" / "network_analysis"
OUT_JSON = ROOT / "model" / "results" / "network_analysis_v1.json"
OUT_PUBLIC = ROOT / "public" / "data" / "network_analysis.json"

# ---------------------------------------------------------------- criteria, fixed BEFORE the results were produced
NULL_COPIES = 1000          # course (MADT7202 ch.9) asks for 100; 1000 shows the spread better
SWAPS_PER_EDGE = 10         # successful swaps per edge, inside each relation type
RUNS_PER_GRAPH = 10         # "real Q" = best of 10 Louvain runs, for the real graph and for every copy alike
STABILITY_RUNS = 100        # Louvain seeds 0-99
DIAL = (0.5, 1.0, 1.5, 2.0)  # resolution values
DIAL_RUNS = 50
NULL_SEED = 7202            # copy i uses random.Random(NULL_SEED * 100000 + i)
ALPHA_LIMIT = 0.05          # modularity counts as higher than chance only if at most 4 of every 100 copies reach it
STABLE_AT = 0.80            # co-association confidence
NAMING_RULE = ("A community gets a descriptive name only if (1) the whole-graph modularity passes the random-graph check, "
               "(2) it contains at least one Wish node, and (3) EVERY member has co-association confidence >= 0.80 over "
               "100 Louvain seeds. Otherwise it is shown by its Community number only. The name is just the Wish labels inside it.")


def load():
    """Typed graph with integer node numbers in sorted ID order, so results do not depend on string hashing."""
    tables = json.loads(SNAPSHOT.read_text(encoding="utf-8"))["tables"]
    graph = json.loads(GRAPH_JSON.read_text(encoding="utf-8"))
    ids = sorted(n["id"] for n in graph["nodes"])
    num = {x: i for i, x in enumerate(ids)}
    wd = sorted({(num["W:" + r["wish_id"]], num["D:" + r["deity_id"]]) for r in tables["wish_deity"]})
    dp = sorted({(num["D:" + r["deity_id"]], num["P:" + r["place_id"]]) for r in tables["deity_place"]})
    file_edges = {tuple(sorted((num[e["s"]], num[e["t"]]))) for e in graph["edges"]}
    assert file_edges == {tuple(sorted(e)) for e in wd + dp}, "graph.json and the snapshot disagree"
    return graph, ids, num, wd, dp


def build(n_nodes: int, edges) -> nx.Graph:
    g = nx.Graph()
    g.add_nodes_from(range(n_nodes))
    g.add_edges_from(sorted(edges))
    return g


def rewire(edges: list[tuple[int, int]], rng: random.Random, n_swaps: int):
    """Degree-preserving swaps inside ONE relation (left type -> right type): (a,x),(b,y) -> (a,y),(b,x).
    Every node keeps its degree in this relation, no duplicate edge appears, and no new type of edge can appear."""
    cur = list(edges)
    have = set(cur)
    done = tries = 0
    while done < n_swaps and tries < n_swaps * 100:
        tries += 1
        i, j = rng.randrange(len(cur)), rng.randrange(len(cur))
        (a, x), (b, y) = cur[i], cur[j]
        if a == b or x == y or (a, y) in have or (b, x) in have:
            continue
        have -= {(a, x), (b, y)}
        cur[i], cur[j] = (a, y), (b, x)
        have |= {(a, y), (b, x)}
        done += 1
    return cur, done


def best_louvain(g: nx.Graph, seeds) -> tuple[float, int]:
    best = max((nx.community.louvain_communities(g, seed=s) for s in seeds), key=lambda c: nx.community.modularity(g, c))
    return nx.community.modularity(g, best), len(best)


def structure(g: nx.Graph) -> dict:
    comps = sorted((len(c) for c in nx.connected_components(g)), reverse=True)
    q, k = best_louvain(g, range(RUNS_PER_GRAPH))
    greedy = nx.community.greedy_modularity_communities(g)
    return {"components": len(comps), "components_with_edges": sum(1 for c in comps if c > 1),
            "largest_component": comps[0], "modularity_louvain_best10": q, "communities_louvain_best10": k,
            "modularity_greedy": nx.community.modularity(g, greedy)}


def summary(values: list[float], observed: float) -> dict:
    v = sorted(values)
    n = len(v)
    at = lambda q: v[min(n - 1, int(round(q * (n - 1))))]
    ge = sum(1 for x in v if x >= observed - 1e-12)
    le = sum(1 for x in v if x <= observed + 1e-12)
    return {"observed": round(observed, 6), "null_mean": round(statistics.fmean(v), 6), "null_sd": round(statistics.pstdev(v), 6),
            "null_min": round(v[0], 6), "null_p2_5": round(at(0.025), 6), "null_median": round(at(0.5), 6), "null_p97_5": round(at(0.975), 6),
            "null_max": round(v[-1], 6), "copies": n, "copies_ge_observed": ge, "copies_le_observed": le,
            "p_upper": round((ge + 1) / (n + 1), 6), "p_lower": round((le + 1) / (n + 1), 6)}


def compute() -> dict:
    graph, ids, num, wd, dp = load()
    n = len(ids)
    g = build(n, wd + dp)
    node = {x["id"]: x for x in graph["nodes"]}
    label = [node[i]["label"] for i in ids]
    kind = [node[i]["type"] for i in ids]
    shown = [set() for _ in graph["communities"]]       # the partition the website shows (greedy modularity, graph.json)
    for x in graph["nodes"]:
        shown[x["community"]].add(num[x["id"]])

    # ---- check 2: schema-preserving random graphs
    observed = structure(g)
    observed["modularity_shown_partition"] = nx.community.modularity(g, shown)
    samples = []
    for c in range(NULL_COPIES):
        rng = random.Random(NULL_SEED * 100000 + c)
        wd2, s1 = rewire(wd, rng, SWAPS_PER_EDGE * len(wd))
        dp2, s2 = rewire(dp, rng, SWAPS_PER_EDGE * len(dp))
        row = structure(build(n, wd2 + dp2))
        row.update(copy=c, swaps_done=s1 + s2, edges_unchanged_fraction=len(set(wd + dp) & set(wd2 + dp2)) / len(wd + dp))
        samples.append(row)
    metrics = ["components", "components_with_edges", "largest_component", "modularity_louvain_best10",
               "communities_louvain_best10", "modularity_greedy"]
    null = {k: summary([s[k] for s in samples], observed[k]) for k in metrics}
    modularity_passes = all(null[k]["p_upper"] <= ALPHA_LIMIT for k in ("modularity_louvain_best10", "modularity_greedy"))

    # ---- check 3: stability over Louvain seeds
    together = Counter()
    exact = Counter()
    q_runs = []
    for s in range(STABILITY_RUNS):
        part = nx.community.louvain_communities(g, seed=s)
        q_runs.append(nx.community.modularity(g, part))
        for c in part:
            exact[frozenset(c)] += 1
            together.update(combinations(sorted(c), 2))
    confidence = {}
    for c in shown:
        for v in c:
            others = [u for u in c if u != v]
            if others:
                confidence[v] = sum(together[tuple(sorted((u, v)))] for u in others) / (STABILITY_RUNS * len(others))

    # ---- check 4: resolution dial
    dial = {}
    for r in DIAL:
        runs = [frozenset(frozenset(c) for c in nx.community.louvain_communities(g, seed=s, resolution=r)) for s in range(DIAL_RUNS)]
        split, times = max(Counter(runs).items(), key=lambda kv: (kv[1], sorted(sorted(c) for c in kv[0])))
        dial[r] = (split, times, len(set(runs)))

    # ---- check 1 + composition per shown community
    communities = []
    for i, c in enumerate(shown):
        inside = [(a, b) for a, b in g.edges() if a in c and b in c]
        boundary = [(a, b) for a, b in g.edges() if (a in c) != (b in c)]
        deg = sum(d for _, d in g.degree(c))
        wishes = [label[v] for v in sorted(c) if kind[v] == "W"]
        flagged = [v for v in sorted(c) if v in confidence and confidence[v] < STABLE_AT]
        reasons = []
        if len(c) == 1:
            reasons.append("SINGLE_NODE")
        if not modularity_passes:
            reasons.append("GRAPH_MODULARITY_NOT_ABOVE_CHANCE")
        if not wishes:
            reasons.append("NO_WISH_IN_GROUP")
        if flagged:
            reasons.append("UNSTABLE_MEMBERS")
        communities.append({
            "index": i, "number": i + 1, "size": len(c),
            "types": {t: sum(1 for v in c if kind[v] == t) for t in ("W", "D", "P")},
            "internal_edges": {"total": len(inside), "wish_deity": sum(1 for a, b in inside if "W" in (kind[a], kind[b])),
                               "deity_place": sum(1 for a, b in inside if "P" in (kind[a], kind[b]))},
            "external_edges": {"total": len(boundary), "wish_deity": sum(1 for a, b in boundary if "W" in (kind[a], kind[b])),
                               "deity_place": sum(1 for a, b in boundary if "P" in (kind[a], kind[b]))},
            "internal_share_of_degree": round(2 * len(inside) / deg, 6) if deg else None,
            "modularity_contribution": round(len(inside) / g.number_of_edges() - (deg / (2 * g.number_of_edges())) ** 2, 6),
            "wishes": wishes,
            "stability": None if len(c) == 1 else {
                "min_confidence": round(min(confidence[v] for v in c), 6),
                "mean_confidence": round(statistics.fmean(confidence[v] for v in c), 6),
                "members_below_threshold": [{"id": ids[v], "label": label[v], "confidence": round(confidence[v], 6)} for v in flagged],
                "runs_with_exactly_this_group": exact[frozenset(c)]},
            "same_group_at_resolution": {str(r): frozenset(c) in dial[r][0] for r in DIAL} if len(c) > 1 else None,
            "named": not reasons, "name": ("เรื่อง " + " + ".join(wishes)) if not reasons else None,
            "not_named_because": reasons,
            "members": [{"id": ids[v], "type": kind[v], "label": label[v],
                         "confidence": round(confidence[v], 6) if v in confidence else None} for v in sorted(c)],
        })

    # ---- degree analysis, never mixing node types
    degrees = []
    for v in range(n):
        nb = Counter(kind[u] for u in g[v])
        degrees.append({"id": ids[v], "type": kind[v], "label": label[v],
                        "wish_links": nb["W"] if kind[v] == "D" else None,
                        "deity_links": nb["D"] if kind[v] in "WP" else None,
                        "place_links": nb["P"] if kind[v] == "D" else None})

    rnd = lambda d: {k: (round(x, 6) if isinstance(x, float) else x) for k, x in d.items()}
    return {
        "analysis_version": "NETWORK_ANALYSIS_V1", "status": "DRAFT_INTERPRETATION",
        "graph": {"nodes": n, "edges": g.number_of_edges(), "wish_deity_edges": len(wd), "deity_place_edges": len(dp),
                  "model_version": graph["model_version"]},
        "software": {"networkx": nx.__version__},
        "criteria": {"null_copies": NULL_COPIES, "swaps_per_edge": SWAPS_PER_EDGE, "louvain_runs_per_graph": RUNS_PER_GRAPH,
                     "stability_runs": STABILITY_RUNS, "stable_confidence_at_least": STABLE_AT, "resolution_values": list(DIAL),
                     "runs_per_resolution": DIAL_RUNS, "null_seed": NULL_SEED, "chance_limit_p": ALPHA_LIMIT, "naming_rule": NAMING_RULE},
        "observed": rnd(observed),
        "null_model": {"description": "Wish-Deity edges and Deity-Place edges rewired separately; every node keeps its degree in each relation.",
                       "metrics": null, "modularity_above_chance": modularity_passes,
                       "mean_edges_unchanged_fraction": round(statistics.fmean(s["edges_unchanged_fraction"] for s in samples), 6),
                       "min_swaps_done": min(s["swaps_done"] for s in samples), "swaps_target": SWAPS_PER_EDGE * g.number_of_edges()},
        "stability_over_seeds": {"modularity_min": round(min(q_runs), 6), "modularity_max": round(max(q_runs), 6),
                                 "distinct_groups_seen": len(exact)},
        "resolution_sweep": [{"resolution": r, "communities_in_most_common_split": len(dial[r][0]),
                              "communities_with_2plus_nodes": sum(1 for c in dial[r][0] if len(c) > 1),
                              "runs_giving_that_split": dial[r][1], "distinct_splits": dial[r][2]} for r in DIAL],
        "communities": communities,
        "degree_by_type": degrees,
        "_null_samples": [rnd(s) for s in samples],
    }


# ---------------------------------------------------------------- outputs
def _csv(header, rows) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(header)
    w.writerows(rows)
    return buf.getvalue()


def render(res: dict) -> dict[Path, str]:
    samples = res.pop("_null_samples")
    cols = ["copy", "components", "components_with_edges", "largest_component", "modularity_louvain_best10",
            "communities_louvain_best10", "modularity_greedy", "swaps_done", "edges_unchanged_fraction"]
    public = {k: res[k] for k in ("analysis_version", "status", "graph", "criteria", "observed", "null_model", "stability_over_seeds", "resolution_sweep")}
    public["communities"] = [{k: c[k] for k in ("index", "number", "size", "types", "internal_edges", "external_edges", "wishes",
                                                "stability", "named", "name", "not_named_because")} for c in res["communities"]]
    dump = lambda d: json.dumps(d, ensure_ascii=False, indent=1) + "\n"
    return {
        OUT_JSON: dump(res),
        OUT_PUBLIC: dump(public),
        OUT_DIR / "null_model_samples.csv": _csv(cols, [[s[c] for c in cols] for s in samples]),
        OUT_DIR / "communities.csv": _csv(
            ["number", "size", "wish", "deity", "place", "internal_edges", "external_edges", "min_confidence", "mean_confidence", "named", "name", "not_named_because", "wishes"],
            [[c["number"], c["size"], c["types"]["W"], c["types"]["D"], c["types"]["P"], c["internal_edges"]["total"], c["external_edges"]["total"],
              (c["stability"] or {}).get("min_confidence", ""), (c["stability"] or {}).get("mean_confidence", ""), c["named"], c["name"] or "",
              ";".join(c["not_named_because"]), ";".join(c["wishes"])] for c in res["communities"]]),
        OUT_DIR / "community_members.csv": _csv(
            ["community_number", "node_id", "type", "label", "confidence"],
            [[c["number"], m["id"], m["type"], m["label"], "" if m["confidence"] is None else m["confidence"]] for c in res["communities"] for m in c["members"]]),
        OUT_DIR / "degree_by_type.csv": _csv(
            ["node_id", "type", "label", "wish_links", "deity_links", "place_links"],
            [["" if d[k] is None else d[k] for k in ("id", "type", "label", "wish_links", "deity_links", "place_links")] for d in res["degree_by_type"]]),
    }


def main() -> int:
    files = render(compute())
    if "--check" in sys.argv:
        bad = [p for p, text in files.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
        print("OK: committed results reproduce exactly" if not bad else "DIFFERENT: " + ", ".join(str(p.relative_to(ROOT)) for p in bad))
        return 1 if bad else 0
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for p, text in files.items():
        p.write_text(text, encoding="utf-8", newline="\n")
        print("wrote", p.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
