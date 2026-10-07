from src.models import Patient
from src.store import DynamoStore

NEW = {
    "name": "Test Person",
    "age": 40,
    "condition": "Asthma",
    "date_of_birth": "1986-01-01",
    "admission_date": "2026-01-01",
}


def test_patients_requires_key(client):
    assert client.get("/patients").status_code == 403


def test_invalid_key_rejected(client):
    assert client.get("/patients", headers={"x-api-key": "wrong"}).status_code == 403


def test_list_patients(client, auth):
    r = client.get("/patients", headers=auth)
    assert r.status_code == 200
    assert len(r.json()) == 30


def test_get_patient(client, auth):
    r = client.get("/patients/P001", headers=auth)
    assert r.status_code == 200
    assert r.json()["patient_id"] == "P001"


def test_get_unknown_patient_404(client, auth):
    assert client.get("/patients/nope", headers=auth).status_code == 404


def test_create_then_delete(client, auth):
    created = client.post("/patients", json=NEW, headers=auth)
    assert created.status_code == 201
    pid = created.json()["patient_id"]
    assert client.get(f"/patients/{pid}", headers=auth).status_code == 200
    assert client.delete(f"/patients/{pid}", headers=auth).status_code == 204
    assert client.get(f"/patients/{pid}", headers=auth).status_code == 404


def test_delete_unknown_404(client, auth):
    assert client.delete("/patients/nope", headers=auth).status_code == 404


def test_create_rejects_extra_and_invalid_fields(client, auth):
    assert client.post("/patients", json={**NEW, "ssn": "x"}, headers=auth).status_code == 422
    assert client.post("/patients", json={**NEW, "age": 500}, headers=auth).status_code == 422


def test_write_requires_key(client):
    assert client.post("/patients", json=NEW).status_code == 403
    assert client.delete("/patients/P001").status_code == 403


def test_index_served_with_csp(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "default-src 'none'" in r.headers["content-security-policy"]


class FakeTable:
    """Just enough of a boto3 DynamoDB Table for DynamoStore."""

    def __init__(self):
        self.items = {}

    def scan(self, **_):
        return {"Items": list(self.items.values())}

    def get_item(self, Key):
        item = self.items.get(Key["patient_id"])
        return {"Item": item} if item else {}

    def put_item(self, Item):
        self.items[Item["patient_id"]] = Item

    def delete_item(self, Key, ReturnValues):
        old = self.items.pop(Key["patient_id"], None)
        return {"Attributes": old} if old else {}


def test_dynamo_store_roundtrip():
    store = DynamoStore(FakeTable())
    patient = Patient(patient_id="P1", **NEW)
    store.put(patient)
    assert store.get("P1") == patient
    assert store.list() == [patient]
    assert store.delete("P1") is True
    assert store.delete("P1") is False
    assert store.get("P1") is None
