"""Regenerate public/data/graph.json (nodes, edges, centralities, communities) from the reference model.
Run after the snapshot changes:  python scripts/build_public_data.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))

import networkx as nx  # noqa: E402
import _engine as E  # noqa: E402

m = E.m
G = m.G
bet = nx.betweenness_centrality(G, normalized=True)
clo = nx.closeness_centrality(G)
communities = sorted(nx.community.greedy_modularity_communities(G), key=lambda c: (-len(c), sorted(c)[0]))
comm_of = {n: i for i, c in enumerate(communities) for n in c}

nodes = []
for n in sorted(G):
    t, key = n.split(":", 1)
    if t == "W":
        label, extra = m.W[key]["wish_th"], {}
    elif t == "D":
        label, extra = m.E[key]["name_th"], {"tradition": m.E[key]["tradition"], "name_en": m.E[key]["name_en"]}
    else:
        label, extra = m.P[key]["place_name"], {"district": m.P[key]["district"],
                                                "hours_status": E.place_hours_status(m.P[key])}
    nodes.append(dict(id=n, type=t, label=label, degree=G.degree(n), betweenness=round(bet[n], 6),
                      closeness=round(clo[n], 6), community=comm_of[n], **extra))

edges = []
for w, e in sorted(m.WD):
    edges.append({"s": f"W:{w}", "t": f"D:{e}", "kind": "wish_deity", "status": "UNVERIFIED"})
for e, p in sorted(m.DP):
    edges.append({"s": f"D:{e}", "t": f"P:{p}", "kind": "deity_place", "status": E._DP_STATUS[(e, p)]})

out = {"model_version": E.MODEL_VERSION, "nodes": nodes, "edges": edges,
       "communities": [{"index": i, "size": len(c)} for i, c in enumerate(communities)],
       "modularity": round(nx.community.modularity(G, communities), 6),
       "isolated_places": [n["id"] for n in nodes if n["type"] == "P" and n["degree"] == 0]}
path = ROOT / "public" / "data" / "graph.json"
path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"wrote {path.relative_to(ROOT)}: {len(nodes)} nodes, {len(edges)} edges, {len(communities)} communities, "
      f"modularity {out['modularity']}, isolated places {len(out['isolated_places'])}")
