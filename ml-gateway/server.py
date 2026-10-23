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




@app.post("/reframe-combined")
async def reframe_combined(request: Request) -> JSONResponse:
    """Run AutoFlip and TalkNet together and fuse their crop targets."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={
            "ok": False, "error": "Invalid JSON request body"
        })

    if not isinstance(body, dict):
        return JSONResponse(status_code=400, content={
            "ok": False, "error": "Request body must be a JSON object"
        })

    video_url = body.get("videoUrl")
    if not isinstance(video_url, str) or not video_url.strip():
        return JSONResponse(status_code=400, content={
            "ok": False, "error": "videoUrl is required"
        })

    talknet_body = {
        "videoUrl": video_url,
        "minTrackFrames": body.get("minTrackFrames", 10),
        "confidenceThreshold": body.get("confidenceThreshold", 0.0),
    }

    try:
        async with httpx.AsyncClient(timeout=DOWNSTREAM_TIMEOUT_SEC) as client:
            autoflip_task = client.post(
                f"{AUTOFILP_SERVICE_URL}/reframe", json=body
            )
            talknet_task = client.post(
                f"{TALKNET_SERVICE_URL}/detect", json=talknet_body
            )
            autoflip_resp, talknet_resp = await asyncio.gather(
                autoflip_task, talknet_task
            )

        if autoflip_resp.status_code >= 400:
            return JSONResponse(status_code=autoflip_resp.status_code, content={
                "ok": False, "error": "AutoFlip processing failed"
            })
        if talknet_resp.status_code >= 400:
            return JSONResponse(status_code=talknet_resp.status_code, content={
                "ok": False, "error": "TalkNet processing failed"
            })

        try:
            autoflip_data = autoflip_resp.json()
            talknet_data = talknet_resp.json()
        except Exception:
            return JSONResponse(status_code=502, content={
                "ok": False, "error": "Malformed downstream JSON response"
            })

        crop_data = autoflip_data.get("crop_targets") if isinstance(autoflip_data, dict) else None
        if not isinstance(crop_data, dict):
            return JSONResponse(status_code=502, content={
                "ok": False, "error": "Invalid AutoFlip crop-target response"
            })
        if not isinstance(talknet_data, dict) or not isinstance(talknet_data.get("speakers"), list):
            return JSONResponse(status_code=502, content={
                "ok": False, "error": "Invalid TalkNet speaker response"
            })

        try:
            from crop_fusion import fuse_crop_targets
            fused = fuse_crop_targets(crop_data, talknet_data)
        except (ValueError, TypeError) as exc:
            logger.warning("Crop fusion rejected downstream data: %s", exc)
            return JSONResponse(status_code=502, content={
                "ok": False, "error": "Could not combine crop-target data"
            })

        return JSONResponse(status_code=200, content={
            "ok": True,
            "crop_targets": fused,
            "processing": {"autoflip": True, "talknet": True},
        })

    except httpx.TimeoutException:
        logger.error("Combined AutoFlip/TalkNet request timed out")
        return JSONResponse(status_code=504, content={
            "ok": False, "error": "Combined ML processing timed out"
        })
    except httpx.RequestError:
        logger.exception("Combined AutoFlip/TalkNet downstream connection failed")
        return JSONResponse(status_code=502, content={
            "ok": False, "error": "Could not connect to ML services"
        })

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
