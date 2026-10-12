"""Generate the synthetic patient seed file. Same seed, same output.

Every value is invented. Names are random combinations of common given names and surnames and
do not refer to real people. Risk bands and statuses come from a simple illustrative formula
(documented below), not from any clinical rule, and are not clinical advice.

Usage (from the repo root):
    python app/tools/generate_patients.py                  # writes app/data/patients.json
    python app/tools/generate_patients.py --seed 7 --out /tmp/p.json

Terraform seeds the DynamoDB table from the same file (terraform/modules/dynamodb), so the table
and local runs always match. Only random.Random.random() is used, with integer maths of our own,
so the output does not depend on the Python version.
"""

import argparse
import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.models import Patient

DEFAULT_SEED = 20261012
DEFAULT_COUNT = 30
DEFAULT_OUT = ROOT / "data" / "patients.json"
# Fixed so the output never depends on today's date.
REFERENCE_DATE = date(2026, 10, 1)
ADMISSION_WINDOW = (date(2026, 1, 1), date(2026, 9, 30))

GIVEN = [
    "Amara",
    "Ben",
    "Carla",
    "Dev",
    "Elena",
    "Farid",
    "Grace",
    "Hugo",
    "Ines",
    "Jamal",
    "Kira",
    "Leo",
    "Maya",
    "Noor",
    "Omar",
    "Priya",
    "Quinn",
    "Rosa",
    "Sven",
    "Tara",
    "Uma",
    "Victor",
    "Wren",
    "Xavier",
    "Yara",
    "Zane",
]
SURNAME = [
    "Adler",
    "Bakr",
    "Castillo",
    "Dunne",
    "Eriksen",
    "Faro",
    "Gill",
    "Haddad",
    "Ivanov",
    "Jansen",
    "Kovac",
    "Lindqvist",
    "Moreau",
    "Nakamura",
    "Okafor",
    "Petrov",
    "Quist",
    "Rahman",
    "Santos",
    "Tanaka",
    "Underhill",
    "Varga",
    "Whitlock",
    "Yilmaz",
    "Zielinski",
]
CONDITIONS = [
    "Asthma",
    "COPD",
    "Type 2 Diabetes",
    "Hypertension",
    "Atrial Fibrillation",
    "Chronic Kidney Disease",
    "Osteoarthritis",
    "Hypothyroidism",
    "Anxiety Disorder",
    "Migraine",
    "Heart Failure",
    "Anemia",
    "Sleep Apnea",
    "Rheumatoid Arthritis",
    "Depression",
    "Gastroesophageal Reflux",
    "Hyperlipidemia",
    "Epilepsy",
]
BLOOD_TYPES = [
    ("O+", 38),
    ("A+", 34),
    ("B+", 9),
    ("AB+", 3),
    ("O-", 7),
    ("A-", 6),
    ("B-", 2),
    ("AB-", 1),
]
WARDS = ["Ward A", "Ward B", "Ward C", "Ward D"]


class Rng:
    """Thin wrapper so every draw goes through one deterministic primitive."""

    def __init__(self, seed: int) -> None:
        self._r = random.Random(seed)

    def below(self, n: int) -> int:
        return int(self._r.random() * n)

    def between(self, a: int, b: int) -> int:
        return a + self.below(b - a + 1)

    def pick(self, items):
        return items[self.below(len(items))]

    def weighted(self, pairs):
        total = sum(w for _, w in pairs)
        x = self.below(total)
        for item, w in pairs:
            if x < w:
                return item
            x -= w
        return pairs[-1][0]

    def normalish(self, mean: float, spread: float) -> float:
        # Sum of four uniforms, centred: close enough to a bell curve for demo data.
        return mean + spread * (sum(self._r.random() for _ in range(4)) - 2.0) / 2.0


def age_on(born: date, on: date) -> int:
    return on.year - born.year - ((on.month, on.day) < (born.month, born.day))


def risk_score(age: int, conditions: int, bmi: float) -> int:
    """Illustrative only: older, more conditions and an extreme body-mass index score higher."""
    score = age // 10 + conditions * 2
    if bmi >= 30:
        score += 2
    if bmi < 18.5:
        score += 2
    return score


def risk_band(score: int) -> str:
    if score < 6:
        return "low"
    if score < 10:
        return "moderate"
    if score < 13:
        return "elevated"
    return "high"


def status_for(band: str, rng: Rng) -> str:
    roll = rng.below(10)
    if band == "high":
        return "review"
    if band == "elevated":
        return "review" if roll < 5 else "watch"
    if band == "moderate":
        return "watch" if roll < 6 else "stable"
    return "stable"


def make_record(index: int, rng: Rng, used_names: set[str]) -> dict:
    while True:
        name = f"{rng.pick(GIVEN)} {rng.pick(SURNAME)}"
        if name not in used_names:
            used_names.add(name)
            break
    target_age = rng.between(19, 92)
    born = date(REFERENCE_DATE.year - target_age, rng.between(1, 12), rng.between(1, 28))
    age = age_on(born, REFERENCE_DATE)

    window_days = (ADMISSION_WINDOW[1] - ADMISSION_WINDOW[0]).days
    admitted = ADMISSION_WINDOW[0] + timedelta(days=rng.below(window_days + 1))

    primary = rng.pick(CONDITIONS)
    extra = []
    for _ in range(rng.between(0, 3)):
        c = rng.pick(CONDITIONS)
        if c != primary and c not in extra:
            extra.append(c)
    conditions = [primary, *extra]

    height = round(rng.normalish(170, 24) * 2) / 2
    height = min(max(height, 140.0), 200.0)
    bmi = min(max(rng.normalish(27.0, 14.0), 17.0), 40.0)
    weight = round(bmi * (height / 100) ** 2 * 2) / 2

    band = risk_band(risk_score(age, len(conditions), weight / (height / 100) ** 2))
    return {
        "patient_id": f"P{index:03d}",
        "name": name,
        "age": age,
        "condition": primary,
        "date_of_birth": born.isoformat(),
        "admission_date": admitted.isoformat(),
        "height_cm": height,
        "weight_kg": weight,
        "blood_type": rng.weighted(BLOOD_TYPES),
        "conditions": conditions,
        "risk_band": band,
        "status": status_for(band, rng),
        "ward": rng.pick(WARDS),
        "data_classification": "synthetic",
    }


def generate(seed: int = DEFAULT_SEED, count: int = DEFAULT_COUNT) -> list[dict]:
    rng = Rng(seed)
    used: set[str] = set()
    records = [make_record(i, rng, used) for i in range(1, count + 1)]
    for record in records:
        Patient(**record)  # the same validation the API applies; a bad record stops the run
    return records


def render(records: list[dict]) -> str:
    return json.dumps(records, indent=2, ensure_ascii=False) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--count", type=int, default=DEFAULT_COUNT)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    args.out.write_text(render(generate(args.seed, args.count)), encoding="utf-8", newline="\n")
    print(f"wrote {args.count} synthetic records to {args.out} (seed {args.seed})")


if __name__ == "__main__":
    main()
