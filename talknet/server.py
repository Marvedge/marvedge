"""
FastAPI HTTP server for TalkNet Active Speaker Detection (Task-00029).
Stateless microservice exposing GET /health and POST /detect.
"""

import logging
from typing import Any, Dict, Optional

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import torch

from service import (
    DEFAULT_MODEL_WEIGHTS,
    DEFAULT_PROCESS_TIMEOUT_SEC,
    DEFAULT_S3FD_WEIGHTS,
    TalkNetError,
    check_weights_available,
    get_inference_device,
    process_detect,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("talknet-server")

app = FastAPI(
    title="Marvedge TalkNet ML Service",
    description="Stateless pure inference service for Active Speaker Detection",
    version="1.0.0",
)


class DetectRequest(BaseModel):
    videoUrl: str = Field(..., description="Remote or accessible URL of input video")
    minTrackFrames: Optional[int] = Field(
        10, description="Minimum frames required to constitute a valid speaker track"
    )
    confidenceThreshold: Optional[float] = Field(
        0.0, description="Classification threshold for active speaking"
    )


@app.get("/health")
def health() -> JSONResponse:
    device = get_inference_device()
    weights = check_weights_available(DEFAULT_S3FD_WEIGHTS, DEFAULT_MODEL_WEIGHTS)
    status_str = "ok" if weights["all_ready"] else "degraded"

    return JSONResponse(
        status_code=200,
        content={
            "status": status_str,
            "device": device,
            "cuda_available": torch.cuda.is_available(),
            "weights": {
                "s3fd": weights["s3fd"],
                "model": weights["model"],
            },
        },
    )


@app.post("/detect")
async def detect(req: DetectRequest) -> JSONResponse:
    try:
        result = process_detect(
            video_url=req.videoUrl,
            min_track_frames=req.minTrackFrames,
            confidence_threshold=req.confidenceThreshold,
            s3fd_weights=DEFAULT_S3FD_WEIGHTS,
            model_weights=DEFAULT_MODEL_WEIGHTS,
            timeout_sec=DEFAULT_PROCESS_TIMEOUT_SEC,
        )
        return JSONResponse(status_code=200, content=result)
    except TalkNetError as e:
        logger.warning("TalkNet error (%d): %s", e.status_code, e.message)
        return JSONResponse(
            status_code=e.status_code,
            content={"ok": False, "error": e.message},
        )
    except Exception as e:
        logger.exception("Unhandled error during TalkNet detection: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": f"Internal server error: {str(e)}"},
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
