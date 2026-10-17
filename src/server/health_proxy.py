import asyncio
import json
from datetime import UTC
from datetime import datetime
from typing import Any
from typing import cast

import httpx
from litestar import Controller
from litestar import Request
from litestar import Response
from litestar import get
from litestar.datastructures import State
from loguru import logger

from server.config import Config

# The router authenticates requests; this app reads only query params, so the user/auth/state
# slots of the generic Request are unconstrained here.
AppRequest = Request[Any, Any, Any]

HEALTH_SERVICE_URL = "github.com/imbue-openhost/health-data-service-spec"


def provide_config(state: State) -> Config:
    return cast(Config, state.config)


def provide_http_client(state: State) -> httpx.AsyncClient:
    return cast(httpx.AsyncClient, state.http_client)


def _auth_headers(config: Config) -> dict[str, str]:
    return {"Authorization": f"Bearer {config.app_token}"}


async def _proxy_get(
    client: httpx.AsyncClient, config: Config, path: str, params: dict[str, str] | None = None
) -> Response[str]:
    resp = await client.get(f"{config.health_service_base_url}{path}", params=params, headers=_auth_headers(config))
    return Response(content=resp.text, media_type="application/json", status_code=resp.status_code)


async def _running_provider_ids(client: httpx.AsyncClient, config: Config) -> list[str]:
    """App ids of every running provider of the health-data service. A plain service call only reaches the
    owner's default provider, so with several installed (e.g. apple-health + oura) the rest are never read."""
    try:
        resp = await client.get(
            f"{config.router_url.rstrip('/')}/api/services/v2/providers",
            params={"service": HEALTH_SERVICE_URL},
            headers=_auth_headers(config),
        )
    except httpx.HTTPError:
        logger.exception("Health provider discovery failed")
        return []
    if resp.status_code != 200:
        logger.warning("Health provider discovery returned {}", resp.status_code)
        return []
    data = resp.json()
    # The router returns a bare list; older routers wrapped it as {"providers": [...]}.
    providers = data if isinstance(data, list) else data.get("providers", [])
    return [p["app_id"] for p in providers if p.get("status") == "running"]


async def _fan_out(
    client: httpx.AsyncClient, config: Config, provider_ids: list[str], path: str, params: dict[str, str] | None
) -> list[httpx.Response | None]:
    """GET `path` from each provider in parallel; None marks a provider that couldn't be reached."""

    async def call(provider_id: str) -> httpx.Response | None:
        try:
            return await client.get(
                f"{config.health_service_base_url}{path}",
                params=params,
                headers={**_auth_headers(config), "X-OpenHost-Provider": provider_id},
            )
        except httpx.HTTPError:
            logger.exception("Health provider {} call to {} failed", provider_id, path)
            return None

    return list(await asyncio.gather(*(call(p) for p in provider_ids)))


def _start_key(workout: dict[str, Any]) -> datetime:
    start = workout.get("start")
    if not start:
        return datetime.min.replace(tzinfo=UTC)
    parsed = datetime.fromisoformat(start)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _json_response(body: object, status_code: int = 200) -> Response[str]:
    return Response(content=json.dumps(body), media_type="application/json", status_code=status_code)


class HealthProxyController(Controller):
    """Forwards the browser app's data reads to the health-data service, injecting the app token so
    the browser never handles cross-app credentials (same pattern as the health-dashboard app).
    Workout reads fan out to every running provider and merge, also like health-dashboard."""

    path = "/api"

    @get("/workouts")
    async def workouts(self, request: AppRequest, http_client: httpx.AsyncClient, config: Config) -> Response[str]:
        params = dict(request.query_params)
        provider_ids = await _running_provider_ids(http_client, config)
        if not provider_ids:
            return await _proxy_get(http_client, config, "/v1/workouts", params)

        responses = await _fan_out(http_client, config, provider_ids, "/v1/workouts", params)
        merged: list[dict[str, Any]] = []
        succeeded = 0
        for provider_id, resp in zip(provider_ids, responses, strict=True):
            if resp is None:
                continue
            if resp.status_code != 200:
                logger.warning(
                    "Health provider {} listed workouts with {}: {}", provider_id, resp.status_code, resp.text
                )
                continue
            succeeded += 1
            merged.extend(resp.json().get("data", []))
        if not succeeded:
            return _json_response({"error": "no health-data provider answered"}, status_code=502)
        # Each provider lists ascending (oldest first); keep that order across the merge.
        merged.sort(key=_start_key)
        return _json_response({"count": len(merged), "data": merged})

    @get("/workouts/{workout_id:str}")
    async def workout_detail(self, workout_id: str, http_client: httpx.AsyncClient, config: Config) -> Response[str]:
        path = f"/v1/workouts/{workout_id}"
        provider_ids = await _running_provider_ids(http_client, config)
        if not provider_ids:
            return await _proxy_get(http_client, config, path)

        # Workout ids are provider-unique, so the one provider that has it answers 200 and the rest 404.
        responses = await _fan_out(http_client, config, provider_ids, path, None)
        for resp in responses:
            if resp is not None and resp.status_code == 200:
                return Response(content=resp.text, media_type="application/json")
        if all(resp is not None and resp.status_code == 404 for resp in responses):
            return _json_response({"error": "workout not found"}, status_code=404)
        return _json_response({"error": "no health-data provider answered"}, status_code=502)

    @get("/metrics")
    async def metrics(self, http_client: httpx.AsyncClient, config: Config) -> Response[str]:
        return await _proxy_get(http_client, config, "/v1/metrics")

    @get("/time-series")
    async def time_series(self, request: AppRequest, http_client: httpx.AsyncClient, config: Config) -> Response[str]:
        return await _proxy_get(http_client, config, "/v1/time-series", dict(request.query_params))
