from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

BloodType = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
# Illustrative only. These are display labels for the demo, not a clinical score or advice.
RiskBand = Literal["low", "moderate", "elevated", "high"]
Status = Literal["stable", "watch", "review"]
ConditionName = Annotated[str, StringConstraints(min_length=1, max_length=60)]

# A body-mass index outside this range means the height and weight cannot both be right.
BMI_RANGE = (10.0, 70.0)


class Patient(BaseModel):
    """One synthetic patient record. Nothing here is real and nothing is clinical advice.

    The v1 fields are required. The v2 display fields are optional so the API keeps working
    while an older table (without them) is still being served; the seed always fills them.
    `data_classification` accepts only "synthetic": a record marked anything else is rejected.
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

    @model_validator(mode="after")
    def check_consistency(self) -> "Patient":
        if self.admission_date < self.date_of_birth:
            raise ValueError("admission_date is before date_of_birth")
        if self.height_cm is not None and self.weight_kg is not None:
            bmi = self.weight_kg / (self.height_cm / 100) ** 2
            if not BMI_RANGE[0] <= bmi <= BMI_RANGE[1]:
                raise ValueError("height_cm and weight_kg are not a plausible pair")
        if len(set(self.conditions)) != len(self.conditions):
            raise ValueError("conditions contains duplicates")
        return self
