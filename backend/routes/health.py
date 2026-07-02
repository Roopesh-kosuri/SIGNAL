import time
import os
from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()

_start_time = time.time()

@router.get("/health")
async def health():
    return JSONResponse({
        "status": "operational",
        "service": "SIGNAL Intelligence API",
        "uptime_seconds": int(time.time() - _start_time),
        "news_key_configured": bool(os.getenv("BACKEND_NEWS_GEMINI_KEY")),
        "version": "1.0.0",
    })
