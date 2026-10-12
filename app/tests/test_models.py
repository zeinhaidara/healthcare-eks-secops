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


# ---- v2.1 fields -------------------------------------------------------------------------------

V21 = {
    **FULL,
    "systolic_bp": 128,
    "diastolic_bp": 82,
    "heart_rate": 72,
    "temperature_c": 36.8,
    "hba1c_percent": 5.6,
    "egfr_ml_min": 88,
    "medications": ["Albuterol", "Lisinopril"],
    "allergies": ["Penicillin"],
    "last_visit": "2026-06-01",
    "next_visit": "2026-07-15",
    "care_team": ["primary care", "pulmonology"],
    "note": "Synthetic record. Follow-up booked in 6 weeks.",
}


def test_full_v21_record_is_accepted():
    p = Patient(**V21)
    assert p.systolic_bp == 128 and p.medications == ["Albuterol", "Lisinopril"]


def test_v21_fields_are_all_optional():
    p = Patient(**FULL)
    assert p.systolic_bp is None and p.medications == [] and p.note is None


@pytest.mark.parametrize(
    "change",
    [
        # boundaries that must pass
        {"systolic_bp": 220, "diastolic_bp": 130},
        {"systolic_bp": 85, "diastolic_bp": 70},  # gap 15, the lower bound
        {"systolic_bp": 170, "diastolic_bp": 70},  # gap 100, the upper bound
        {"heart_rate": 30},
        {"heart_rate": 200},
        {"temperature_c": 34.0},
        {"temperature_c": 42.0},
        {"hba1c_percent": 4.0},
        {"hba1c_percent": 15.0},
        {"egfr_ml_min": 5},
        {"egfr_ml_min": 150},
        {"medications": ["Metformin", "Aspirin"]},
        {"allergies": []},
        {"last_visit": "2026-06-01", "next_visit": "2026-06-01"},  # same day is allowed
        {"care_team": ["primary care"]},
        {"note": "x" * 280},
        {"note": "Review in 12 weeks."},  # short numbers are fine
    ],
)
def test_valid_v21_values_pass(change):
    Patient(**{**V21, **change})


@pytest.mark.parametrize(
    "change",
    [
        # ranges
        {"systolic_bp": 69},
        {"systolic_bp": 221},
        {"diastolic_bp": 39},
        {"diastolic_bp": 131},
        {"heart_rate": 29},
        {"heart_rate": 201},
        {"temperature_c": 33.9},
        {"temperature_c": 42.1},
        {"temperature_c": 36.85},  # more than one decimal
        {"hba1c_percent": 3.9},
        {"hba1c_percent": 15.1},
        {"egfr_ml_min": 4},
        {"egfr_ml_min": 151},
        # blood pressure pair
        {"systolic_bp": 120, "diastolic_bp": 120},  # not above diastolic
        {"systolic_bp": 110, "diastolic_bp": 120},
        {"systolic_bp": 120, "diastolic_bp": 106},  # gap 14
        {"systolic_bp": 200, "diastolic_bp": 99},  # gap 101
        # allowlists, sizes and duplicates
        {"medications": ["Oxycodone"]},
        {"medications": ["metformin"]},  # allowlist is exact
        {"medications": ["Metformin", "Metformin"]},
        {
            "medications": [
                "Metformin",
                "Lisinopril",
                "Amlodipine",
                "Atorvastatin",
                "Levothyroxine",
                "Albuterol",
                "Tiotropium",
                "Apixaban",
                "Metoprolol",
            ]
        },  # 9 > 8
        {"allergies": ["Pollen"]},
        {"allergies": ["Latex", "Latex"]},
        {
            "allergies": ["Penicillin", "Sulfonamides", "Latex", "Peanuts", "Shellfish", "Codeine"]
        },  # 6 > 5
        {"care_team": ["Dr Smith"]},
        {"care_team": ["cardiology", "cardiology"]},
        {
            "care_team": [
                "primary care",
                "cardiology",
                "endocrinology",
                "nephrology",
                "pulmonology",
                "neurology",
                "psychiatry",
            ]
        },  # 7 > 6
        # allergy also listed as a medication
        {"allergies": ["Aspirin"], "medications": ["Aspirin"]},
        # visits
        {"last_visit": "2026-06-01", "next_visit": "2026-05-31"},
        {"last_visit": "1980-01-01"},  # before date_of_birth
        {"next_visit": "1980-01-01", "last_visit": None},
        # note
        {"note": ""},
        {"note": "x" * 281},
        {"note": "Contact patient at someone@example.org"},
        {"note": "See https://example.org/record"},
        {"note": "See www.example.org"},
        {"note": "Reference 1234567"},  # five or more digits in a row
    ],
)
def test_bad_v21_values_are_rejected(change):
    with pytest.raises(ValidationError):
        Patient(**{**V21, **change})


def test_model_has_no_identifier_like_field():
    names = set(Patient.model_fields)
    forbidden = ("ssn", "mrn", "insurance", "phone", "address", "email", "postcode", "zip")
    assert not [n for n in names if any(f in n for f in forbidden)]
