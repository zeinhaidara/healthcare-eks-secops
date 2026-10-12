import pytest
from pydantic import ValidationError

from src.models import Patient

BASE = {
    "patient_id": "P001",
    "name": "Test Person",
    "age": 40,
    "condition": "Asthma",
    "date_of_birth": "1986-01-01",
    "admission_date": "2026-03-01",
}
FULL = {
    **BASE,
    "height_cm": 170.0,
    "weight_kg": 70.0,
    "blood_type": "O+",
    "conditions": ["Asthma", "Hypertension"],
    "risk_band": "moderate",
    "status": "watch",
    "ward": "Ward A",
    "data_classification": "synthetic",
}


def test_full_record_is_accepted():
    p = Patient(**FULL)
    assert p.data_classification == "synthetic"
    assert p.conditions == ["Asthma", "Hypertension"]


def test_v1_record_without_new_fields_is_still_accepted():
    p = Patient(**BASE)
    assert p.height_cm is None and p.conditions == []
    assert p.data_classification == "synthetic"


@pytest.mark.parametrize(
    "change",
    [
        {"age": -1},
        {"age": 121},
        {"height_cm": 49},
        {"height_cm": 231},
        {"weight_kg": 1.5},
        {"weight_kg": 301},
        {"height_cm": 200.0, "weight_kg": 15.0},  # implausible pair
        {"height_cm": 100.0, "weight_kg": 150.0},  # implausible pair
        {"blood_type": "Z+"},
        {"risk_band": "extreme"},
        {"status": "critical"},
        {"ward": ""},
        {"conditions": [""]},
        {"conditions": ["x" * 61]},
        {"conditions": [f"C{i}" for i in range(9)]},
        {"conditions": ["Asthma", "Asthma"]},
        {"admission_date": "1980-01-01"},  # before date_of_birth
        {"data_classification": "phi"},
        {"data_classification": "real"},
        {"data_classification": ""},
        {"unexpected": "field"},
    ],
)
def test_bad_values_are_rejected(change):
    with pytest.raises(ValidationError):
        Patient(**{**FULL, **change})


def test_record_marked_anything_but_synthetic_is_rejected_even_with_valid_fields():
    for mark in ("phi", "PHI", "clinical", None):
        with pytest.raises(ValidationError):
            Patient(**{**FULL, "data_classification": mark})
