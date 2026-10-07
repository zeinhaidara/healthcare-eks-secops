import pytest
from fastapi.testclient import TestClient

from src.main import app

KEY = "test-key"


@pytest.fixture
def make_client(monkeypatch):
    def _make(api_key: str = KEY, secret_name: str = ""):
        monkeypatch.setenv("API_KEY", api_key)
        monkeypatch.delenv("DYNAMODB_TABLE", raising=False)
        if secret_name:
            monkeypatch.setenv("API_KEY_SECRET_NAME", secret_name)
        else:
            monkeypatch.delenv("API_KEY_SECRET_NAME", raising=False)
        return TestClient(app)

    return _make


@pytest.fixture
def client(make_client):
    with make_client() as c:
        yield c


@pytest.fixture
def auth():
    return {"x-api-key": KEY}
