from src.models import Patient
from src.store import DynamoStore, MemoryStore

ROW = {
    "patient_id": "P1",
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


def test_write_methods_are_not_allowed(client, auth):
    assert client.post("/patients", json=ROW, headers=auth).status_code == 405
    assert client.delete("/patients/P001", headers=auth).status_code == 405
    assert client.put("/patients/P001", json=ROW, headers=auth).status_code == 405


def test_index_served_with_csp(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "default-src 'none'" in r.headers["content-security-policy"]


def test_memory_store_loads_seed_file():
    store = MemoryStore.from_file("data/patients.json")
    assert len(store.list()) == 30
    assert store.get("P001").patient_id == "P001"
    assert store.get("missing") is None


class FakeTable:
    """Read side of a boto3 DynamoDB Table, with two scan pages."""

    def __init__(self, rows):
        self.rows = {r["patient_id"]: r for r in rows}

    def scan(self, **kwargs):
        rows = sorted(self.rows.values(), key=lambda r: r["patient_id"])
        if "ExclusiveStartKey" not in kwargs:
            return {"Items": rows[:1], "LastEvaluatedKey": {"patient_id": rows[0]["patient_id"]}}
        return {"Items": rows[1:]}

    def get_item(self, Key):
        row = self.rows.get(Key["patient_id"])
        return {"Item": row} if row else {}


def test_dynamo_store_reads_all_pages_and_items():
    second = {**ROW, "patient_id": "P2"}
    store = DynamoStore(FakeTable([ROW, second]))
    assert [p.patient_id for p in store.list()] == ["P1", "P2"]
    assert store.get("P1") == Patient(**ROW)
    assert store.get("nope") is None


def test_dynamo_store_has_no_write_methods():
    assert not hasattr(DynamoStore, "put")
    assert not hasattr(DynamoStore, "delete")
