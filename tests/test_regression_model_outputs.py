"""Regression: the Network Model, PPR, Top 5 and trip matching give exactly the same results as before this round of UI/API changes.
The golden file was produced by scripts/regression_snapshot.py on commit 286c485 (before the step 04 / activity mode / friend feedback work).
python -m unittest discover -s tests -v"""
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLDEN = json.loads((ROOT / "tests" / "golden" / "model_outputs_286c485.json").read_text(encoding="utf-8"))


def current_snapshot():
    argv, sys.argv = sys.argv, ["regression_snapshot.py", str(ROOT)]
    try:
        spec = importlib.util.spec_from_file_location("regression_snapshot", ROOT / "scripts" / "regression_snapshot.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod.main()
    finally:
        sys.argv = argv


NOW = current_snapshot()


class ModelOutputsUnchanged(unittest.TestCase):
    def test_same_profiles_were_compared(self):
        self.assertEqual(GOLDEN["count"], NOW["count"])
        self.assertGreaterEqual(NOW["count"], 300)
        self.assertEqual(set(GOLDEN["profiles"]), set(NOW["profiles"]))

    def test_model_top5_ranks_scores_and_matched_wishes_identical(self):
        for key, old in GOLDEN["profiles"].items():
            self.assertEqual(NOW["profiles"][key]["model_top5"], old["model_top5"], key)

    def test_trip_matching_identical(self):
        for key, old in GOLDEN["profiles"].items():
            self.assertEqual(NOW["profiles"][key]["model_trip"], old["model_trip"], key)

    def test_service_layer_top5_and_trip_identical(self):
        for key, old in GOLDEN["profiles"].items():
            self.assertEqual(NOW["profiles"][key]["service_top5"], old["service_top5"], key)
            self.assertEqual(NOW["profiles"][key]["service_trip"], old["service_trip"], key)

    def test_model_files_are_byte_identical_to_the_baseline_commit(self):
        for name in ("model/network_phase1.py", "model/input_drive_v2_snapshot.json", "model/offline_signature_trip_v1.json"):
            old = subprocess.run(["git", "show", f"286c485:{name}"], cwd=ROOT, capture_output=True).stdout
            if not old:
                self.skipTest("git history not available")
            cur = (ROOT / name).read_bytes()
            self.assertEqual(cur.replace(b"\r\n", b"\n"), old.replace(b"\r\n", b"\n"), name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
