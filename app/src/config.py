import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    api_key: str
    aws_region: str
    dynamodb_table: str  # empty = in-memory store (local dev and tests)
    seed_file: str


def load_settings() -> Settings:
    return Settings(
        api_key=os.environ.get("API_KEY", ""),
        aws_region=os.environ.get("AWS_REGION", "us-east-2"),
        dynamodb_table=os.environ.get("DYNAMODB_TABLE", ""),
        seed_file=os.environ.get("SEED_FILE", "data/patients.json"),
    )
