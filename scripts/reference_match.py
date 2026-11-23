"""Reference answer for Trip Matching straight from the unmodified model (no service layer, no HTTP).
  echo '{"wish_ids":["W01"],...}' | python scripts/reference_match.py
Used by tests/e2e/matching_strict.mjs to check what the page shows against the model itself.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "model"))
import network_phase1 as m  # noqa: E402

profile = json.loads(sys.stdin.buffer.read().decode("utf-8-sig"))
out = m.match_trip(profile)
res = {
    "wish_names": [m.W[w]["wish_th"] for w in profile["wish_ids"]],
    "matched_trip_id": (out["matched_trip"] or {}).get("trip_id"),
    "decision": out["decision"],
    "scores": [{k: s.get(k) for k in ("trip_id", "eligible", "graph_relevance", "coverage_fraction", "matching_score", "reason_codes")} for s in out["all_trip_scores"]],
}
sys.stdout.write(json.dumps(res, ensure_ascii=False))
