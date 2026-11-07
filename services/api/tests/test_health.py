from fastapi.testclient import TestClient

from ecopulse_api.main import app


def test_health() -> None:
    # Sem o "with", o lifespan não roda e o teste não precisa do RabbitMQ.
    client = TestClient(app)
    assert client.get("/health").json() == {"status": "ok"}
