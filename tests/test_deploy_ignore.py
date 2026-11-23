"""Deployment guard: .vercelignore must never exclude files the pages fetch from /data/ (regression: an unanchored "data/" made /data/*.json 404 in production).
python -m unittest discover -s tests -v"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LINES = [l.strip() for l in (ROOT / ".vercelignore").read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]


class VercelIgnore(unittest.TestCase):
    def test_no_unanchored_directory_pattern_matches_inside_public(self):
        for line in LINES:
            if line.endswith("/") and "/" not in line[:-1]:                       # "name/" matches a directory called name at ANY depth
                hits = [p for p in (ROOT / "public").rglob(line[:-1]) if p.is_dir()]
                self.assertEqual(hits, [], f"'{line}' would also exclude {hits}: anchor it as '/{line}'")

    def test_every_data_file_the_pages_load_is_published(self):
        urls = set()
        for js in (ROOT / "public" / "js").glob("*.js"):
            urls |= set(re.findall(r"['\"`]/data/([\w.\-]+\.json)['\"`]", js.read_text(encoding="utf-8")))
        self.assertTrue(urls)
        for name in urls:
            self.assertTrue((ROOT / "public" / "data" / name).exists(), name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
