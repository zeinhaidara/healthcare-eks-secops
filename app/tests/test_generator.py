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


V21_FIELDS = {
    "systolic_bp",
    "diastolic_bp",
    "heart_rate",
    "temperature_c",
    "hba1c_percent",
    "egfr_ml_min",
    "medications",
    "allergies",
    "last_visit",
    "next_visit",
    "care_team",
    "note",
}


def test_v21_fields_do_not_change_any_v2_value(gen):
    # Rebuild the v2 records with the first stream alone; every v2 value must match exactly.
    rng = gen.Rng(gen.DEFAULT_SEED)
    used = set()
    v2_only = [gen.make_record(i, rng, used) for i in range(1, gen.DEFAULT_COUNT + 1)]
    for old, new in zip(v2_only, gen.generate(), strict=True):
        assert {k: new[k] for k in old} == old
        assert set(new) - set(old) <= V21_FIELDS
        assert list(new)[-1] == "data_classification"


def test_v21_labs_and_medicines_stay_plausible_for_the_demo(gen):
    for r in gen.generate(seed=7, count=200):
        conditions = set(r["conditions"])
        if "Type 2 Diabetes" in conditions:
            assert r["hba1c_percent"] >= 6.5
        elif "hba1c_percent" in r:
            assert r["hba1c_percent"] < 6.5
        if "Chronic Kidney Disease" in conditions:
            assert r["egfr_ml_min"] < 60
        assert not set(r["allergies"]) & set(r["medications"])
        assert r["care_team"][0] == "primary care"
        assert r["last_visit"] <= r["next_visit"]
        assert len(r["note"]) <= 280 and "Synthetic record" in r["note"]


def test_some_optional_lab_values_are_absent_so_the_page_shows_not_recorded(gen):
    records = gen.generate()
    assert any("hba1c_percent" not in r for r in records)
    assert any("egfr_ml_min" not in r for r in records)
