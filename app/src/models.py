from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class Patient(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_id: str
    name: str = Field(min_length=1, max_length=100)
    age: int = Field(ge=0, le=120)
    condition: str = Field(min_length=1, max_length=100)
    date_of_birth: date
    admission_date: date
