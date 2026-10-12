import importlib.util
import json
from pathlib import Path

import pytest

from src.models import Patient

APP = Path(__file__).resolve().parent.parent
SEED_FILE = APP / "data" / "patients.json"


@pytest.fixture(scope="module")
def gen():
    spec = importlib.util.spec_from_file_location(
        "generate_patients", APP / "tools" / "generate_patients.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_same_seed_gives_identical_output(gen):
    first = gen.render(gen.generate(123))
    second = gen.render(gen.generate(123))
    assert first == second


def test_different_seed_gives_different_output(gen):
    assert gen.render(gen.generate(123)) != gen.render(gen.generate(124))


def test_default_run_has_thirty_valid_unique_records(gen):
    records = gen.generate()
    assert len(records) == 30
    assert [r["patient_id"] for r in records] == [f"P{i:03d}" for i in range(1, 31)]
    assert len({r["name"] for r in records}) == 30
    for r in records:
        Patient(**r)
        assert r["conditions"][0] == r["condition"]


def test_every_generated_record_is_marked_synthetic(gen):
    assert {r["data_classification"] for r in gen.generate()} == {"synthetic"}
    assert {r["data_classification"] for r in gen.generate(seed=99, count=200)} == {"synthetic"}


def test_output_does_not_depend_on_the_clock_or_other_entropy(gen):
    source = (APP / "tools" / "generate_patients.py").read_text(encoding="utf-8")
    for forbidden in ("today(", "now(", "time.time", "uuid", "os.urandom", "secrets."):
        assert forbidden not in source, forbidden
    assert gen.REFERENCE_DATE.isoformat() == "2026-10-01"


def test_committed_seed_file_is_exactly_the_default_generator_output(gen):
    assert SEED_FILE.read_text(encoding="utf-8") == gen.render(gen.generate())


def test_ages_match_birth_dates_on_the_reference_date(gen):
    for r in gen.generate():
        born = gen.date.fromisoformat(r["date_of_birth"])
        assert r["age"] == gen.age_on(born, gen.REFERENCE_DATE)
        assert json.loads(json.dumps(r)) == r
