"""
Internal ML API Gateway (Task-00029).
Lightweight routing and facade layer proxying requests to AutoFlip and TalkNet.
"""

import asyncio
import hmac
import logging
import os
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ml-gateway")

AUTOFILP_SERVICE_URL = os.environ.get(
    "AUTOFILP_SERVICE_URL", "http://autoflip:8000"
).rstrip("/")
TALKNET_SERVICE_URL = os.environ.get(
    "TALKNET_SERVICE_URL", "http://talknet:8000"
).rstrip("/")

DOWNSTREAM_TIMEOUT_SEC = float(os.environ.get("GATEWAY_TIMEOUT_SEC", "180.0"))
HEALTH_CHECK_TIMEOUT_SEC = float(
    os.environ.get("GATEWAY_HEALTH_TIMEOUT_SEC", "5.0")
)

# Shared-secret auth for /reframe + /talknet (mirrors the CALLBACK_SECRET
# precedent: the reframe worker sends X-Gateway-Token from ML_GATEWAY_TOKEN).
#
# Reachability finding: docker-compose publishes the gateway as 8000:8000 and
# the worker reaches it via REFRAME_ML_SERVICE_URL (default
# http://localhost:8000), so it is NOT confined to the docker network — a
# shared-secret header is required instead of a loopback bind.
#
# Authentication fails CLOSED. If ML_GATEWAY_TOKEN is unset, /reframe and
# /talknet return 503 until the operator configures a token. The only
# exception is the explicit ML_GATEWAY_ALLOW_INSECURE=1 (or "true") local-dev
# escape hatch, which logs a loud warning.
GATEWAY_TOKEN_HEADER = "x-gateway-token"
GATEWAY_TOKEN_ENV = "ML_GATEWAY_TOKEN"
GATEWAY_ALLOW_INSECURE_ENV = "ML_GATEWAY_ALLOW_INSECURE"
_INSECURE_TRUE_VALUES = {"1", "true"}


def _expected_gateway_token() -> str:
    return os.environ.get(GATEWAY_TOKEN_ENV, "").strip()


def _insecure_gateway_allowed() -> bool:
    return (
        os.environ.get(GATEWAY_ALLOW_INSECURE_ENV, "").strip().lower()
        in _INSECURE_TRUE_VALUES
    )


def _log_auth_startup() -> None:
    """Logs the effective authentication mode at process startup."""
    if _expected_gateway_token():
        logger.info(
            "%s is set; /reframe and /talknet require X-Gateway-Token",
            GATEWAY_TOKEN_ENV,
        )
    elif _insecure_gateway_allowed():
        logger.warning(
            "SECURITY WARNING: %s is unset and %s is enabled; "
            "/reframe and /talknet are UNAUTHENTICATED. Local development only — "
            "never expose this gateway to an untrusted network.",
            GATEWAY_TOKEN_ENV,
            GATEWAY_ALLOW_INSECURE_ENV,
        )
    else:
        logger.error(
            "SECURITY: %s is not set; failing closed. /reframe and /talknet will "
            "return 503 until it is configured. For local development only, set "
            "%s=1 to explicitly allow unauthenticated access.",
            GATEWAY_TOKEN_ENV,
            GATEWAY_ALLOW_INSECURE_ENV,
        )


_log_auth_startup()


async def require_gateway_auth(request: Request) -> Optional[JSONResponse]:
    """Return an error response when the gateway token check fails, else None.

    Fail-closed: a missing server token is a configuration error (503) unless
    the explicit insecure dev flag is set. A configured token must match the
    supplied header in constant time (401 otherwise).
    """
    expected = _expected_gateway_token()
    if not expected:
        if _insecure_gateway_allowed():
            return None
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "error": (
                    "Gateway authentication is not configured; refusing request"
                ),
            },
        )

    provided = request.headers.get(GATEWAY_TOKEN_HEADER, "")
    # Encode before comparing: hmac.compare_digest rejects non-ASCII str
    # values, and a client-controlled header can contain them.
    if not provided or not hmac.compare_digest(
        provided.encode("utf-8"), expected.encode("utf-8")
    ):
        return JSONResponse(
            status_code=401,
            content={"ok": False, "error": "Unauthorized: invalid or missing gateway token"},
        )
    return None

app = FastAPI(
    title="Marvedge Internal ML API Gateway",
    description="Stateless internal gateway routing requests to AutoFlip and TalkNet services",
    version="1.0.0",
)


async def check_service_health(client: httpx.AsyncClient, name: str, url: str) -> str:
    """Checks GET /health on a downstream service."""
    try:
        resp = await client.get(f"{url}/health", timeout=HEALTH_CHECK_TIMEOUT_SEC)
        if resp.status_code == 200:
            try:
                data = resp.json()
            except Exception:
                return "unhealthy (invalid response)"
            if not isinstance(data, dict):
                return "unhealthy (invalid response)"
            status_val = data.get("status")
            if status_val == "ok":
                return "healthy"
            if status_val == "degraded":
                return "degraded"
            if status_val in ("unhealthy", "error"):
                return f"unhealthy ({status_val})"
            return "unhealthy (invalid response)"
        return f"unhealthy (status {resp.status_code})"
    except httpx.TimeoutException:
        return "unhealthy (timeout)"
    except Exception as e:
        logger.debug("Health check failed for %s: %s", name, str(e))
        return "unhealthy (connection error)"


@app.get("/health")
async def health() -> JSONResponse:
    """Aggregated health check across downstream AutoFlip and TalkNet services."""
    async with httpx.AsyncClient() as client:
        autoflip_task = check_service_health(client, "autoflip", AUTOFILP_SERVICE_URL)
        talknet_task = check_service_health(client, "talknet", TALKNET_SERVICE_URL)

        autoflip_status, talknet_status = await asyncio.gather(
            autoflip_task, talknet_task
        )

    autoflip_ready = autoflip_status == "healthy"
    talknet_ready = talknet_status == "healthy"

    all_healthy = autoflip_ready and talknet_ready
    status_str = "ok" if all_healthy else "degraded"
    # HTTP 200 is returned whenever standalone AutoFlip reframe is healthy,
    # even if secondary TalkNet is degraded or unavailable. HTTP 503 is returned
    # only when AutoFlip reframe itself cannot be served.
    status_code = 200 if autoflip_ready else 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": status_str,
            "services": {
                "autoflip": autoflip_status,
                "talknet": talknet_status,
            },
            "ready": {
                "reframe": autoflip_ready,
                "talknet": talknet_ready,
            },
        },
    )


@app.post("/reframe")
async def reframe(request: Request) -> JSONResponse:
    """Proxies reframe request unchanged to AutoFlip service /reframe."""
    auth_error = await require_gateway_auth(request)
    if auth_error is not None:
        return auth_error
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "Invalid JSON request body"},
        )

    target_url = f"{AUTOFILP_SERVICE_URL}/reframe"
    try:
        async with httpx.AsyncClient(timeout=DOWNSTREAM_TIMEOUT_SEC) as client:
            resp = await client.post(target_url, json=body)
            try:
                content = resp.json()
            except Exception:
                content = {"ok": False, "error": "Malformed response from AutoFlip service"}
            return JSONResponse(status_code=resp.status_code, content=content)
    except httpx.TimeoutException:
        logger.error("AutoFlip service timed out after %ss", DOWNSTREAM_TIMEOUT_SEC)
        return JSONResponse(
            status_code=504,
            content={"ok": False, "error": "AutoFlip service request timed out"},
        )
    except (httpx.ConnectError, httpx.NetworkError) as e:
        logger.error("AutoFlip connection failure: %s", str(e))
        return JSONResponse(
            status_code=502,
            content={"ok": False, "error": "AutoFlip service is unavailable"},
        )
    except Exception as e:
        logger.exception("Unexpected error proxying to AutoFlip: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": "Internal gateway error proxying to AutoFlip"},
        )


@app.post("/talknet")
async def talknet(request: Request) -> JSONResponse:
    """Proxies active speaker detection request to TalkNet service /detect."""
    auth_error = await require_gateway_auth(request)
    if auth_error is not None:
        return auth_error
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "Invalid JSON request body"},
        )

    target_url = f"{TALKNET_SERVICE_URL}/detect"
    try:
        async with httpx.AsyncClient(timeout=DOWNSTREAM_TIMEOUT_SEC) as client:
            resp = await client.post(target_url, json=body)
            try:
                content = resp.json()
            except Exception:
                content = {"ok": False, "error": "Malformed response from TalkNet service"}
            return JSONResponse(status_code=resp.status_code, content=content)
    except httpx.TimeoutException:
        logger.error("TalkNet service timed out after %ss", DOWNSTREAM_TIMEOUT_SEC)
        return JSONResponse(
            status_code=504,
            content={"ok": False, "error": "TalkNet service request timed out"},
        )
    except (httpx.ConnectError, httpx.NetworkError) as e:
        logger.error("TalkNet connection failure: %s", str(e))
        return JSONResponse(
            status_code=502,
            content={"ok": False, "error": "TalkNet service is unavailable"},
        )
    except Exception as e:
        logger.exception("Unexpected error proxying to TalkNet: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": "Internal gateway error proxying to TalkNet"},
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
