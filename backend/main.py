"""
SIGNAL Backend — FastAPI Application
=====================================
Security Headers + Rate Limiting + CORS
"""

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv

from routes.feed import router as feed_router
from routes.health import router as health_router
from routes.chat import router as chat_router
from routes.agent import router as agent_router
from routes.master_feed import router as master_feed_router
from routes.orbital import router as orbital_router

# ─── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("signal")

# ─── Load env ───────────────────────────────────────────────────────────────
load_dotenv()

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# ─── Startup validation ──────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("✅ SIGNAL Backend started in BYOK mode — no provider keys are stored on the backend.")

    yield

# ─── Rate Limiter ────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

# ─── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="SIGNAL Intelligence API",
    version="1.1.0",
    docs_url=None,       # Hide /docs in production
    redoc_url=None,      # Hide /redoc in production
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── CORS ────────────────────────────────────────────────────────────────────
allowed_origins = [FRONTEND_URL]
# Allow Vercel preview URLs in production
if os.getenv("ENVIRONMENT") == "production":
    allowed_origins.append("https://*.vercel.app")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization", "x-news-provider", "x-news-key", "x-groq-key", "x-ai-key", "x-ai-provider", "x-cesium-token"],
)

# ─── Security Headers Middleware ─────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)

    # Strip revealing headers
    if "server" in response.headers:
        del response.headers["server"]
    if "x-powered-by" in response.headers:
        del response.headers["x-powered-by"]

    # Security headers
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

    # Content Security Policy — updated for FIX 3 new model API domains
    # Note: newsapi.org is backend-only (server-side httpx calls), not a browser connect target
    csp_directives = [
        "default-src 'self'",
        f"script-src 'self' {FRONTEND_URL}",
        f"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        # FIX 3: Added new AI provider domains for client-side BYOK calls
        " ".join([
            "connect-src 'self'",
            "https://generativelanguage.googleapis.com",  # Gemini
            "https://api.groq.com",                       # Groq
            "https://api.anthropic.com",                  # Claude
            "https://api.openai.com",                     # OpenAI
            "https://integrate.api.nvidia.com",           # NVIDIA NIM (FIX 3)
            "https://api.moonshot.cn",                    # Kimi/Moonshot (FIX 3)
            "https://api.deepseek.com",                   # DeepSeek (FIX 3)
            "https://dashscope.aliyuncs.com",             # Qwen/DashScope (FIX 3)
            "https://identitytoolkit.googleapis.com",     # Firebase Auth
            "https://securetoken.googleapis.com",         # Firebase tokens
            "https://firestore.googleapis.com",           # Firestore
        ]),
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ]
    response.headers["Content-Security-Policy-Report-Only"] = "; ".join(csp_directives)

    return response

# ─── Routes ──────────────────────────────────────────────────────────────────
app.include_router(feed_router, prefix="/api")
app.include_router(health_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(agent_router, prefix="/api")
app.include_router(master_feed_router, prefix="/api")
app.include_router(orbital_router, prefix="/api")

@app.get("/")
async def root():
    return {"service": "SIGNAL Intelligence API", "status": "operational", "version": "1.1.0"}
#Copyright (c) 2026 Roopesh Kosuri
#Licensed under CC BY-NC-SA 4.0
