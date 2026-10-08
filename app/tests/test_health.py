import time

from botocore.exceptions import NoCredentialsError


def test_health_always_ok(make_client):
    with make_client(api_key="") as c:
        assert c.get("/health").json() == {"status": "healthy"}


def test_ready_503_without_api_key(make_client):
    with make_client(api_key="") as c:
        assert c.get("/ready").status_code == 503


def test_ready_200_after_startup(client):
    r = client.get("/ready")
    assert r.status_code == 200
    assert r.json() == {"status": "ready"}


def test_ready_after_key_fetched_from_secrets_manager(make_client, monkeypatch):
    class FakeSecrets:
        def get_secret_value(self, SecretId):
            assert SecretId == "my-secret"
            return {"SecretString": "from-secret"}

    monkeypatch.setattr("src.config.boto3.client", lambda *a, **k: FakeSecrets())
    with make_client(api_key="", secret_name="my-secret") as c:
        for _ in range(50):
            if c.get("/ready").status_code == 200:
                break
            time.sleep(0.02)
        assert c.get("/ready").status_code == 200
        assert c.get("/patients", headers={"x-api-key": "from-secret"}).status_code == 200


def test_stays_not_ready_when_secret_unavailable(make_client, monkeypatch):
    def boom(*a, **k):
        raise NoCredentialsError()

    monkeypatch.setattr("src.config.boto3.client", boom)
    with make_client(api_key="", secret_name="my-secret") as c:
        time.sleep(0.1)
        assert c.get("/health").status_code == 200
        assert c.get("/ready").status_code == 503


def test_metrics_exposes_request_counts(client):
    client.get("/health")
    body = client.get("/metrics").text
    assert 'http_requests_total{method="GET",path="/health",status="200"}' in body
