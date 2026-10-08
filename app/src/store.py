"""Patient storage: DynamoDB in AWS, in-memory for local dev and tests."""

import json
from pathlib import Path
from typing import Protocol

import boto3

from .models import Patient


class Store(Protocol):
    def list(self) -> list[Patient]: ...
    def get(self, patient_id: str) -> Patient | None: ...
    def put(self, patient: Patient) -> None: ...
    def delete(self, patient_id: str) -> bool: ...


class MemoryStore:
    def __init__(self) -> None:
        self._items: dict[str, Patient] = {}

    def list(self) -> list[Patient]:
        return sorted(self._items.values(), key=lambda p: p.patient_id)

    def get(self, patient_id: str) -> Patient | None:
        return self._items.get(patient_id)

    def put(self, patient: Patient) -> None:
        self._items[patient.patient_id] = patient

    def delete(self, patient_id: str) -> bool:
        return self._items.pop(patient_id, None) is not None


class DynamoStore:
    """Credentials come from the pod's IAM role (IRSA); nothing is configured here."""

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

    def put(self, patient: Patient) -> None:
        self._table.put_item(Item=patient.model_dump(mode="json"))

    def delete(self, patient_id: str) -> bool:
        resp = self._table.delete_item(Key={"patient_id": patient_id}, ReturnValues="ALL_OLD")
        return "Attributes" in resp


def seed_if_empty(store: Store, seed_file: str) -> None:
    if store.list():
        return
    for item in json.loads(Path(seed_file).read_text()):
        store.put(Patient(**item))
