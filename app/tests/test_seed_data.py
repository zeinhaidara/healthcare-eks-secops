import json
import re
from pathlib import Path

import pytest

from src.models import Patient

APP = Path(__file__).resolve().parent.parent
SEED = json.loads((APP / "data" / "patients.json").read_text(encoding="utf-8"))
MODULE = APP.parent / "terraform" / "modules" / "dynamodb"


def test_every_seed_record_is_valid_and_marked_synthetic():
    assert len(SEED) == 30
    for record in SEED:
        assert record["data_classification"] == "synthetic"
        assert Patient(**record).data_classification == "synthetic"


def test_seed_ids_are_unique_and_unchanged_from_v1():
    ids = [r["patient_id"] for r in SEED]
    assert ids == [f"P{i:03d}" for i in range(1, 31)]


def test_seed_has_no_value_that_looks_like_a_secret_or_real_identifier():
    blob = json.dumps(SEED)
    assert not re.search(r"\b\d{3}-\d{2}-\d{4}\b", blob)  # SSN shape
    assert not re.search(r"@[A-Za-z0-9.-]+\.[a-z]{2,}", blob)  # email shape
    assert not re.search(r"\b\d{10,}\b", blob)  # long numbers (phone, account)


@pytest.mark.skipif(not MODULE.exists(), reason="Terraform module not in this checkout")
def test_terraform_seed_encodes_every_field_type_and_keeps_the_guard():
    variables = (MODULE / "variables.tf").read_text(encoding="utf-8")
    main = (MODULE / "main.tf").read_text(encoding="utf-8")

    def default_of(name):
        block = re.search(rf'variable "{name}" \{{.*?default\s*=\s*\[(.*?)\]', variables, re.DOTALL)
        return set(re.findall(r'"([^"]+)"', block.group(1)))

    numbers, lists = default_of("number_attributes"), default_of("list_attributes")
    for key in {k for r in SEED for k in r}:
        sample = next(r[key] for r in SEED)
        if isinstance(sample, (int, float)) and not isinstance(sample, bool):
            assert key in numbers, f"{key} would be stored as a string"
        elif isinstance(sample, list):
            assert key in lists, f"{key} would be stored as a string"
        else:
            assert key not in numbers and key not in lists
    assert "sensitive(jsonencode(" in main  # SEC-025: the whole record stays sensitive
    assert 'data_classification, "") == "synthetic"' in main  # plan stops on an unmarked record
    assert 'default     = "synthetic"' in variables
