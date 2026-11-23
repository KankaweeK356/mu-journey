"""Before/after regression snapshot of the recommendation engine.

Runs a fixed, deterministic set of profiles through the model and the service layer and writes every ranking, score and trip match.
  python scripts/regression_snapshot.py <repo_root> <out.json>
Run it on the old commit (git worktree) to make the golden file, and tests/test_regression_model_outputs.py runs the same code on the
current tree and compares: any difference in the Network Model, PPR, Top 5 or trip matching shows up as a failed test.
"""
import itertools
import json
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
import _engine as E  # noqa: E402

WISHES = sorted(E.m.W)
BIRTHS = [None, "2000-01-03", "1999-06-09", "1995-11-17"]                          # none, Monday, Wednesday, Friday
EXCL = [
    {"tradition_groups": [], "deity_ids": [], "place_ids": []},
    {"tradition_groups": [sorted(E.m.TRADITION_GROUPS)[0]], "deity_ids": [], "place_ids": []},
]


def profiles():
    combos = [(w,) for w in WISHES] + list(itertools.combinations(WISHES, 2)) + list(itertools.islice(itertools.combinations(WISHES, 3), 0, None, 4))
    for wishes in combos:
        for b in BIRTHS:
            yield {"wish_ids": list(wishes), "birthdate": b, "exclusions": EXCL[0]}
    for wishes in [(WISHES[0],), (WISHES[1], WISHES[2])]:
        yield {"wish_ids": list(wishes), "birthdate": None, "exclusions": EXCL[1]}


def r(x):
    return round(x, 12) if isinstance(x, float) else x


def snap(profile):
    ref = E.m.place_recommendation(profile)
    trip = E.m.match_trip(profile)
    svc = E.recommend(profile)
    return {
        "model_top5": [[p["place_id"], r(p["ppr_normalized_score"]), p["matched_wish_ids"]] for p in ref["top5"]],
        "model_trip": [trip["matched_trip"]["trip_id"] if trip["matched_trip"] else None,
                       [[s["trip_id"], r(s.get("matching_score")), s.get("eligible")] for s in trip["all_trip_scores"]]],
        "service_top5": [[p["place_id"], r(p["score"])] for p in svc["top5"]],
        "service_trip": (svc["trip"].get("matched") or {}).get("trip_id"),
    }


def main():
    out = {"count": 0, "profiles": {}}
    for p in profiles():
        out["profiles"][json.dumps(p, sort_keys=True, ensure_ascii=False)] = snap(p)
    out["count"] = len(out["profiles"])
    if len(sys.argv) > 2:
        Path(sys.argv[2]).write_text(json.dumps(out, sort_keys=True, ensure_ascii=False, indent=0), encoding="utf-8")
    return out


if __name__ == "__main__":
    res = main()
    print("profiles:", res["count"])
