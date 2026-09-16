"""
Internal ML API Gateway (Task-00029).
Lightweight routing and facade layer proxying requests to AutoFlip and TalkNet.
"""

import asyncio
import logging
import os
from typing import Any, Dict

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
                if isinstance(data, dict):
                    status_val = data.get("status")
                    if status_val == "ok":
                        return "healthy"
                    if status_val == "degraded":
                        return "degraded"
                    if status_val in ("unhealthy", "error"):
                        return f"unhealthy ({status_val})"
            except Exception:
                pass
            return "healthy"
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

    all_healthy = autoflip_status == "healthy" and talknet_status == "healthy"
    status_str = "ok" if all_healthy else "degraded"
    status_code = 200 if all_healthy else 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": status_str,
            "services": {
                "autoflip": autoflip_status,
                "talknet": talknet_status,
            },
        },
    )


@app.post("/reframe")
async def reframe(request: Request) -> JSONResponse:
    """Proxies reframe request unchanged to AutoFlip service /reframe."""
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
