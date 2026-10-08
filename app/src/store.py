"""Read-only patient storage: DynamoDB in AWS, in-memory for local dev and tests.

The app never writes. In AWS the table is seeded by Terraform (terraform/modules/dynamodb).
"""

import json
from pathlib import Path
from typing import Protocol

import boto3

from .models import Patient


class Store(Protocol):
    def list(self) -> list[Patient]: ...
    def get(self, patient_id: str) -> Patient | None: ...


class MemoryStore:
    """Local dev and tests only, loaded from the same JSON file Terraform seeds the table with."""

    def __init__(self, patients: list[Patient]) -> None:
        self._items = {p.patient_id: p for p in patients}

    @classmethod
    def from_file(cls, path: str) -> "MemoryStore":
        return cls([Patient(**item) for item in json.loads(Path(path).read_text())])

    def list(self) -> list[Patient]:
        return sorted(self._items.values(), key=lambda p: p.patient_id)

    def get(self, patient_id: str) -> Patient | None:
        return self._items.get(patient_id)


class DynamoStore:
    """Credentials come from the pod's IAM role (IRSA): GetItem, Query and Scan only."""

    def __init__(self, table) -> None:
        self._table = table

    @classmethod
    def from_env(cls, table_name: str, region: str) -> "DynamoStore":
        return cls(boto3.resource("dynamodb", region_name=region).Table(table_name))

    def list(self) -> list[Patient]:
        items, kwargs = [], {}
        while True:
            page = self._table.scan(**kwargs)
            items += page["Items"]
            if "LastEvaluatedKey" not in page:
                break
            kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
        return sorted((Patient(**i) for i in items), key=lambda p: p.patient_id)

    def get(self, patient_id: str) -> Patient | None:
        item = self._table.get_item(Key={"patient_id": patient_id}).get("Item")
        return Patient(**item) if item else None
