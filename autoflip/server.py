"""
FastAPI HTTP server for AutoFlip ML inference (Task-00023).
Stateless microservice exposing POST /reframe.
"""

import logging
from typing import Any, Dict, Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from service import (
    DEFAULT_AUTOFILP_BINARY,
    DEFAULT_GRAPH_CONFIG,
    DEFAULT_PROCESS_TIMEOUT_SEC,
    ReframeError,
    process_reframe,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("reframe-server")

app = FastAPI(
    title="Marvedge AutoFlip ML Service",
    description="Stateless pure inference service for video reframing",
    version="1.0.0",
)


class ReframeRequest(BaseModel):
    videoUrl: str = Field(..., description="Remote or accessible URL of input video")
    targetAspectRatio: str = Field("9:16", description="Target aspect ratio (e.g. 9:16, 1:1)")
    source: Optional[Dict[str, Any]] = Field(
        None, description="Optional metadata about source dimensions and FPS"
    )


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/reframe")
async def reframe(req: ReframeRequest) -> JSONResponse:
    try:
        result = process_reframe(
            video_url=req.videoUrl,
            target_aspect_ratio=req.targetAspectRatio,
            binary_path=DEFAULT_AUTOFILP_BINARY,
            graph_path=DEFAULT_GRAPH_CONFIG,
            timeout_sec=DEFAULT_PROCESS_TIMEOUT_SEC,
        )
        return JSONResponse(status_code=200, content=result)
    except ReframeError as e:
        logger.warning("Reframe error (%d): %s", e.status_code, e.message)
        return JSONResponse(
            status_code=e.status_code,
            content={"ok": False, "error": e.message},
        )
    except Exception as e:
        logger.exception("Unhandled error during reframe processing: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": f"Internal server error: {str(e)}"},
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
