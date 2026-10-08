import os
from dataclasses import dataclass

import boto3


@dataclass(frozen=True)
class Settings:
    api_key: str  # local/test fallback only; in AWS the key comes from Secrets Manager
    api_key_secret_name: str
    aws_region: str
    dynamodb_table: str  # empty = in-memory store (local dev and tests)
    seed_file: str  # in-memory store data for local runs and tests (never written to DynamoDB)


def load_settings() -> Settings:
    return Settings(
        api_key=os.environ.get("API_KEY", ""),
        api_key_secret_name=os.environ.get("API_KEY_SECRET_NAME", ""),
        aws_region=os.environ.get("AWS_REGION", "us-east-2"),
        dynamodb_table=os.environ.get("DYNAMODB_TABLE", ""),
        seed_file=os.environ.get("SEED_FILE", "data/patients.json"),
    )


def fetch_api_key(settings: Settings) -> str:
    """Env fallback first (local/tests), else Secrets Manager via the pod's IRSA role."""
    if settings.api_key:
        return settings.api_key
    if not settings.api_key_secret_name:
        return ""
    client = boto3.client("secretsmanager", region_name=settings.aws_region)
    return client.get_secret_value(SecretId=settings.api_key_secret_name)["SecretString"]
