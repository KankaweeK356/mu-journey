"""Local dev server: serves public/ and mounts the api/*.py handlers exactly like Vercel does.
Run:  python scripts/dev_server.py   ->  http://localhost:3000
"""
import importlib.util
import mimetypes
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
API = ROOT / "api"
PUBLIC = ROOT / "public"
sys.path.insert(0, str(API))

REWRITES = [(re.compile(r"^/api/places/([^/]+)$"), "/api/place?id=%s"),
            (re.compile(r"^/api/trips/([^/]+)$"), "/api/trip?id=%s")]
_cache = {}


def load(name):
    if name not in _cache:
        spec = importlib.util.spec_from_file_location("api_" + name, API / (name + ".py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _cache[name] = mod
    return _cache[name]


class Dev(BaseHTTPRequestHandler):
    def _route(self, verb):
        path = urlparse(self.path).path
        for rx, dest in REWRITES:
            hit = rx.match(path)
            if hit:
                self.path = dest % hit.group(1)
                path = urlparse(self.path).path
        if path.startswith("/api/"):
            name = path[5:].strip("/")
            if not re.fullmatch(r"[a-z_]+", name) or name.startswith("_") or not (API / (name + ".py")).exists():
                return self._text(404, "not found")
            fn = getattr(load(name).handler, "do_" + verb, None)
            return fn(self) if fn else self._text(405, "method not allowed")
        if verb != "GET":
            return self._text(405, "method not allowed")
        rel = "index.html" if path in ("", "/") else path.lstrip("/")
        f = (PUBLIC / rel).resolve()
        if PUBLIC.resolve() not in f.parents or not f.is_file():
            return self._text(404, "not found")
        data = f.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", (mimetypes.guess_type(str(f))[0] or "application/octet-stream") + ("; charset=utf-8" if f.suffix in {".html", ".js", ".css", ".json"} else ""))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _text(self, code, msg):
        b = msg.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    print(f"MU Journey dev server on http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Dev).serve_forever()
