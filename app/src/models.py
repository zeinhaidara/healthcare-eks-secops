from datetime import date
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class PatientCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    age: int = Field(ge=0, le=120)
    condition: str = Field(min_length=1, max_length=100)
    date_of_birth: date
    admission_date: date


class Patient(PatientCreate):
    patient_id: str

    @classmethod
    def new(cls, data: PatientCreate) -> "Patient":
        return cls(patient_id=f"P{uuid4().hex[:8]}", **data.model_dump())
