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

# v2.1 fields. They come from a second random stream (see generate), so every v2 value above stays
# byte-identical. The links below between conditions, labs, medicines and care roles only keep the
# synthetic values plausible for a demo; they are not clinical rules and the API does not enforce
# them (the model checks ranges and allowlists only).
SECOND_STREAM_SALT = 1_000_003
VISIT_WINDOW = (date(2026, 4, 1), date(2026, 9, 30))
MEDICATIONS_FOR = {
    "Asthma": ["Albuterol"],
    "COPD": ["Tiotropium", "Albuterol"],
    "Type 2 Diabetes": ["Metformin"],
    "Hypertension": ["Lisinopril", "Amlodipine"],
    "Atrial Fibrillation": ["Apixaban", "Metoprolol"],
    "Chronic Kidney Disease": [],
    "Osteoarthritis": ["Acetaminophen"],
    "Hypothyroidism": ["Levothyroxine"],
    "Anxiety Disorder": ["Sertraline"],
    "Migraine": ["Sumatriptan"],
    "Heart Failure": ["Furosemide", "Metoprolol"],
    "Anemia": ["Ferrous sulfate"],
    "Sleep Apnea": [],
    "Rheumatoid Arthritis": ["Methotrexate"],
    "Depression": ["Sertraline"],
    "Gastroesophageal Reflux": ["Omeprazole"],
    "Hyperlipidemia": ["Atorvastatin", "Aspirin"],
    "Epilepsy": ["Levetiracetam"],
}
CARE_ROLE_FOR = {
    "Asthma": "pulmonology",
    "COPD": "pulmonology",
    "Type 2 Diabetes": "endocrinology",
    "Hypertension": "cardiology",
    "Atrial Fibrillation": "cardiology",
    "Chronic Kidney Disease": "nephrology",
    "Osteoarthritis": "orthopedics",
    "Hypothyroidism": "endocrinology",
    "Anxiety Disorder": "psychiatry",
    "Migraine": "neurology",
    "Heart Failure": "cardiology",
    "Anemia": "hematology",
    "Sleep Apnea": "sleep medicine",
    "Rheumatoid Arthritis": "rheumatology",
    "Depression": "psychiatry",
    "Gastroesophageal Reflux": "gastroenterology",
    "Hyperlipidemia": "cardiology",
    "Epilepsy": "neurology",
}
ALLERGIES = [
    "Penicillin",
    "Sulfonamides",
    "Latex",
    "Peanuts",
    "Shellfish",
    "Aspirin",
    "Codeine",
    "Iodine contrast",
]
NOTE_TEMPLATES = [
    "Synthetic record for demo use. Primary condition: {condition}. Next review in {weeks} weeks.",
    "Synthetic record. Care plan reviewed by {role}. Follow-up booked in {weeks} weeks.",
    "Synthetic record for demo use. Medicines reconciled at the last visit.",
    "Synthetic record. No change since the last visit. Review again in {weeks} weeks.",
]


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


def v21_fields(record: dict, rng: Rng) -> dict:
    """Vitals, labs, medicines, allergies, visits, care team and a note for one record."""
    conditions = record["conditions"]
    has = set(conditions)

    systolic = int(rng.normalish(122, 26)) + (10 if "Hypertension" in has else 0)
    systolic = min(max(systolic, 96), 176)
    gap = min(max(int(rng.normalish(42, 18)), 25), 70)
    diastolic = min(max(systolic - gap, 56), 104)
    heart_rate = min(
        max(int(rng.normalish(74, 22)) + (8 if "Atrial Fibrillation" in has else 0), 52), 112
    )
    temperature = min(max(round(rng.normalish(36.8, 0.8), 1), 36.0), 37.8)

    out = {
        "systolic_bp": systolic,
        "diastolic_bp": diastolic,
        "heart_rate": heart_rate,
        "temperature_c": temperature,
    }
    # Labs are not recorded for everyone, so the page has real "not recorded" cases to show.
    if "Type 2 Diabetes" in has:
        out["hba1c_percent"] = rng.between(66, 95) / 10
    elif rng.below(10) < 6:
        out["hba1c_percent"] = rng.between(48, 62) / 10
    if "Chronic Kidney Disease" in has:
        out["egfr_ml_min"] = rng.between(18, 55)
    elif rng.below(10) < 5:
        out["egfr_ml_min"] = rng.between(62, 112)

    allergies = []
    for _ in range(rng.between(0, 2)):
        a = rng.pick(ALLERGIES)
        if a not in allergies:
            allergies.append(a)
    medications = []
    for c in conditions:
        for m in MEDICATIONS_FOR.get(c, []):
            if m not in medications and m not in allergies:
                medications.append(m)
    if out.get("egfr_ml_min", 99) < 30 and "Metformin" in medications:
        medications.remove("Metformin")
    roles = ["primary care"]
    for c in conditions:
        role = CARE_ROLE_FOR.get(c)
        if role and role not in roles:
            roles.append(role)

    window_days = (VISIT_WINDOW[1] - VISIT_WINDOW[0]).days
    last_visit = VISIT_WINDOW[0] + timedelta(days=rng.below(window_days + 1))
    next_visit = last_visit + timedelta(days=rng.between(14, 120))
    weeks = rng.between(2, 16)
    note = rng.pick(NOTE_TEMPLATES).format(condition=conditions[0], role=roles[-1], weeks=weeks)

    out.update(
        {
            "medications": medications[:8],
            "allergies": allergies[:5],
            "last_visit": last_visit.isoformat(),
            "next_visit": next_visit.isoformat(),
            "care_team": roles[:6],
            "note": note,
        }
    )
    return out


def generate(seed: int = DEFAULT_SEED, count: int = DEFAULT_COUNT) -> list[dict]:
    rng = Rng(seed)
    used: set[str] = set()
    base = [make_record(i, rng, used) for i in range(1, count + 1)]
    # The v2.1 fields use their own stream: drawing them never shifts a v2 value.
    rng2 = Rng(seed * SECOND_STREAM_SALT + 17)
    records = []
    for record in base:
        extra = v21_fields(record, rng2)
        # New keys go before data_classification so the seed file diff is additions only.
        head = {k: v for k, v in record.items() if k != "data_classification"}
        records.append({**head, **extra, "data_classification": record["data_classification"]})
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
