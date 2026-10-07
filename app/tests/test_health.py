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


def test_metrics_exposes_request_counts(client):
    client.get("/health")
    body = client.get("/metrics").text
    assert 'http_requests_total{method="GET",path="/health",status="200"}' in body
