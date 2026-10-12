import re
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

BloodType = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
# Illustrative only. These are display labels for the demo, not a clinical score or advice.
RiskBand = Literal["low", "moderate", "elevated", "high"]
Status = Literal["stable", "watch", "review"]
ConditionName = Annotated[str, StringConstraints(min_length=1, max_length=60)]

# Fixed allowlists for the v2.1 fields. Generic names and roles only: no products, no staff.
Medication = Literal[
    "Metformin",
    "Lisinopril",
    "Amlodipine",
    "Atorvastatin",
    "Levothyroxine",
    "Albuterol",
    "Tiotropium",
    "Apixaban",
    "Metoprolol",
    "Furosemide",
    "Sertraline",
    "Omeprazole",
    "Acetaminophen",
    "Sumatriptan",
    "Levetiracetam",
    "Methotrexate",
    "Ferrous sulfate",
    "Aspirin",
]
Allergy = Literal[
    "Penicillin",
    "Sulfonamides",
    "Latex",
    "Peanuts",
    "Shellfish",
    "Aspirin",
    "Codeine",
    "Iodine contrast",
]
CareRole = Literal[
    "primary care",
    "cardiology",
    "endocrinology",
    "nephrology",
    "pulmonology",
    "neurology",
    "psychiatry",
    "rheumatology",
    "gastroenterology",
    "hematology",
    "sleep medicine",
    "orthopedics",
]

# A body-mass index outside this range means the height and weight cannot both be right.
BMI_RANGE = (10.0, 70.0)
# Systolic minus diastolic (pulse pressure) outside this range means the pair cannot both be right.
PULSE_PRESSURE_RANGE = (15, 100)
# A note must not carry anything that looks like contact details or an identifier.
NOTE_FORBIDDEN = re.compile(r"@|https?://|www\.|\d{5,}", re.IGNORECASE)


class Patient(BaseModel):
    """One synthetic patient record. Nothing here is real and nothing is clinical advice.

    The v1 fields are required. The v2 and v2.1 fields are optional so the API keeps working
    while an older table (without them) is still being served; the seed always fills them.
    `data_classification` accepts only "synthetic": a record marked anything else is rejected.
    The model checks ranges, allowlists and simple consistency between fields. It does not
    encode clinical relationships (for example lab values against conditions); the generator
    keeps the synthetic values plausible.
    """

    model_config = ConfigDict(extra="forbid")

    patient_id: str
    name: str = Field(min_length=1, max_length=100)
    age: int = Field(ge=0, le=120)
    condition: str = Field(min_length=1, max_length=100)
    date_of_birth: date
    admission_date: date

    height_cm: float | None = Field(default=None, ge=50, le=230)
    weight_kg: float | None = Field(default=None, ge=2, le=300)
    blood_type: BloodType | None = None
    conditions: list[ConditionName] = Field(default_factory=list, max_length=8)
    risk_band: RiskBand | None = None
    status: Status | None = None
    ward: str | None = Field(default=None, min_length=1, max_length=40)
    data_classification: Literal["synthetic"] = "synthetic"

    # v2.1: vitals
    systolic_bp: int | None = Field(default=None, ge=70, le=220)
    diastolic_bp: int | None = Field(default=None, ge=40, le=130)
    heart_rate: int | None = Field(default=None, ge=30, le=200)
    temperature_c: float | None = Field(default=None, ge=34.0, le=42.0)
    # v2.1: labs
    hba1c_percent: float | None = Field(default=None, ge=4.0, le=15.0)
    egfr_ml_min: int | None = Field(default=None, ge=5, le=150)
    # v2.1: lists, visits, care team, note
    medications: list[Medication] = Field(default_factory=list, max_length=8)
    allergies: list[Allergy] = Field(default_factory=list, max_length=5)
    last_visit: date | None = None
    next_visit: date | None = None
    care_team: list[CareRole] = Field(default_factory=list, max_length=6)
    note: str | None = Field(default=None, min_length=1, max_length=280)

    @model_validator(mode="after")
    def check_consistency(self) -> "Patient":
        if self.admission_date < self.date_of_birth:
            raise ValueError("admission_date is before date_of_birth")
        if self.height_cm is not None and self.weight_kg is not None:
            bmi = self.weight_kg / (self.height_cm / 100) ** 2
            if not BMI_RANGE[0] <= bmi <= BMI_RANGE[1]:
                raise ValueError("height_cm and weight_kg are not a plausible pair")
        for field in ("conditions", "medications", "allergies", "care_team"):
            values = getattr(self, field)
            if len(set(values)) != len(values):
                raise ValueError(f"{field} contains duplicates")
        if self.systolic_bp is not None and self.diastolic_bp is not None:
            gap = self.systolic_bp - self.diastolic_bp
            if not PULSE_PRESSURE_RANGE[0] <= gap <= PULSE_PRESSURE_RANGE[1]:
                raise ValueError("systolic_bp and diastolic_bp are not a plausible pair")
        if self.temperature_c is not None and round(self.temperature_c, 1) != self.temperature_c:
            raise ValueError("temperature_c has more than one decimal")
        if set(self.allergies) & set(self.medications):
            raise ValueError("an allergy is also listed as a medication")
        if self.last_visit is not None and self.last_visit < self.date_of_birth:
            raise ValueError("last_visit is before date_of_birth")
        if self.next_visit is not None:
            if self.next_visit < self.date_of_birth:
                raise ValueError("next_visit is before date_of_birth")
            if self.last_visit is not None and self.next_visit < self.last_visit:
                raise ValueError("next_visit is before last_visit")
        if self.note is not None and NOTE_FORBIDDEN.search(self.note):
            raise ValueError("note looks like it contains contact details or an identifier")
        return self
