import json
from pathlib import Path

ROOT = Path(__file__).parent / "fixtures" / "failures"
CLASSES = {"A", "B", "C", "D", "E"}


def manifest():
    return json.loads((ROOT / "manifest.json").read_text())


def test_every_recorded_run_has_an_artifact_and_known_classes():
    data = manifest()
    assert data["runs"], "failure corpus is empty"
    for label, run in data["runs"].items():
        artifact = ROOT / run["artifact"]
        assert artifact.exists(), f"{label} artifact missing"
        assert set(run["classes"]) <= CLASSES, f"{label} has an unknown failure class"
        record = json.loads(artifact.read_text())
        assert record["label"] == label


def test_all_failure_classes_are_represented():
    data = manifest()
    seen = set()
    for run in data["runs"].values():
        seen |= set(run["classes"])
    for item in data["historical"]:
        seen |= set(item["classes"])
    assert CLASSES <= seen, f"corpus does not cover: {sorted(CLASSES - seen)}"


def test_every_call_log_is_parseable_and_names_its_model():
    for relative in manifest()["calls"]:
        path = ROOT / relative
        assert path.exists()
        rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        assert rows
        for row in rows:
            assert "model" in row and "/" in row["model"]
            assert "seconds" in row and row["seconds"] >= 0


def test_historical_harness_defects_are_retained():
    historical = {item["label"]: item for item in manifest()["historical"]}
    assert "deepseek-adapter-v1" in historical
    assert "deepseek-300s-cap" in historical
    assert historical["deepseek-adapter-v1"]["classes"] == ["E"]
