"""Tiny helpers shared by the Vercel Python functions (kept out of the route table by the leading underscore)."""
from __future__ import annotations

import json
import os
import sys
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

MAX_BODY = 16 * 1024


def send_json(h, status: int, payload, cache: str | None = None) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(body)))
    h.send_header("Cache-Control", cache or "no-store")
    h.send_header("X-Content-Type-Options", "nosniff")
    h.end_headers()
    h.wfile.write(body)


def read_json(h) -> dict:
    length = int(h.headers.get("Content-Length") or 0)
    if length <= 0:
        raise ValueError("empty body")
    if length > MAX_BODY:
        raise ValueError("body too large")
    data = json.loads(h.rfile.read(length).decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("body must be a JSON object")
    return data


def query(h) -> dict:
    return {k: v[0] for k, v in parse_qs(urlparse(h.path).query).items()}


def profile_from(body: dict) -> dict:
    """Pick only the fields of the data contract. Date of birth is used in memory and never stored or logged."""
    exc = body.get("exclusions") or {}
    as_of = body.get("as_of")
    if not (isinstance(as_of, str) and len(as_of) == 10 and as_of[4] == "-" and as_of[7] == "-"):
        as_of = None                      # optional calendar date for the Layer B display (no time, no identity)
    out = {
        "profile_id": "WEB",
        "wish_ids": body.get("wish_ids") or [],
        "birthdate": body.get("birthdate") or None,
        "exclusions": {
            "tradition_groups": list(exc.get("tradition_groups") or []),
            "deity_ids": list(exc.get("deity_ids") or []),
            "place_ids": list(exc.get("place_ids") or []),
        },
    }
    if as_of:
        try:
            __import__("datetime").date.fromisoformat(as_of)
            out["as_of"] = as_of
        except ValueError:
            pass
    return out
