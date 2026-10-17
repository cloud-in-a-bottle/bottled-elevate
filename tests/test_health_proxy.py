from collections.abc import Iterator

import httpx
import pytest
from litestar import Litestar
from litestar.datastructures import State
from litestar.di import Provide
from litestar.testing import TestClient

from server.config import Config
from server.health_proxy import HealthProxyController
from server.health_proxy import provide_config
from server.health_proxy import provide_http_client

ROUTER = "http://router"

PROVIDERS = [
    {"app_id": "apple", "app_name": "apple-health", "status": "running", "is_default": True},
    {"app_id": "oura", "app_name": "oura", "status": "running", "is_default": False},
    {"app_id": "gone", "app_name": "old", "status": "stopped", "is_default": False},
]

WORKOUTS = {
    "apple": [
        {"id": "a1", "source": "apple-health", "start": "2026-10-01T10:00:00+00:00"},
        {"id": "a2", "source": "apple-health", "start": "2026-10-12T10:00:00+00:00"},
    ],
    "oura": [{"id": "o1", "source": "oura", "start": "2026-10-10T00:57:00+00:00"}],
}


def _router(request: httpx.Request) -> httpx.Response:
    assert request.headers["Authorization"] == "Bearer tok"
    if request.url.path == "/api/services/v2/providers":
        return httpx.Response(200, json={"providers": PROVIDERS})
    provider = request.headers.get("X-OpenHost-Provider")
    assert provider in WORKOUTS, f"unexpected provider {provider}"
    rest = request.url.path.removeprefix("/api/services/v2/call/health")
    if rest == "/v1/workouts":
        return httpx.Response(200, json={"count": len(WORKOUTS[provider]), "data": WORKOUTS[provider]})
    workout_id = rest.removeprefix("/v1/workouts/")
    for w in WORKOUTS[provider]:
        if w["id"] == workout_id:
            return httpx.Response(200, json={**w, "detail": True})
    return httpx.Response(404, json={"error": "not found"})


@pytest.fixture
def client() -> Iterator[TestClient[Litestar]]:
    config = Config(static_dir="", sqlite_path="", router_url=ROUTER, app_token="tok", health_shortname="health")
    app = Litestar(
        route_handlers=[HealthProxyController],
        state=State({"config": config, "http_client": httpx.AsyncClient(transport=httpx.MockTransport(_router))}),
        dependencies={
            "http_client": Provide(provide_http_client, sync_to_thread=False),
            "config": Provide(provide_config, sync_to_thread=False),
        },
    )
    with TestClient(app=app) as test_client:
        yield test_client


def test_workouts_merges_every_running_provider_oldest_first(client: TestClient[Litestar]) -> None:
    body = client.get("/api/workouts?limit=5000").json()
    assert [w["id"] for w in body["data"]] == ["a1", "o1", "a2"]
    assert body["count"] == 3


def test_workout_detail_found_on_non_default_provider(client: TestClient[Litestar]) -> None:
    resp = client.get("/api/workouts/o1")
    assert resp.status_code == 200
    assert resp.json() == {**WORKOUTS["oura"][0], "detail": True}


def test_workout_detail_missing_everywhere_is_404(client: TestClient[Litestar]) -> None:
    assert client.get("/api/workouts/nope").status_code == 404
