"""
SIGNAL — Chat AI Proxy Route
==============================
Bypasses browser CORS restrictions for OpenAI, Anthropic, etc.
Passes x-ai-provider and x-ai-key headers directly.
"""

import httpx
import logging
from fastapi import APIRouter, Request, Header, HTTPException
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger("signal.chat")
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

@router.post("/chat")
@limiter.limit("20/minute")
async def proxy_chat(
    request: Request,
    x_ai_provider: str = Header(...),
    x_ai_key: str = Header(...)
):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid_json", "message": "Invalid JSON body"}, status_code=400)

    provider = x_ai_provider.lower().strip()
    key = x_ai_key.strip()
    
    if not key:
        return JSONResponse({"error": "unauthorized", "message": "Missing API key."}, status_code=401)

    url = ""
    headers = {"Content-Type": "application/json"}
    
    if provider == "openai" or provider == "gpt":
        url = "https://api.openai.com/v1/chat/completions"
        headers["Authorization"] = f"Bearer {key}"
    elif provider == "claude" or provider == "anthropic":
        url = "https://api.anthropic.com/v1/messages"
        headers["x-api-key"] = key
        headers["anthropic-version"] = "2023-06-01"
    elif provider == "groq":
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers["Authorization"] = f"Bearer {key}"
    elif provider == "nvidia":
        url = "https://integrate.api.nvidia.com/v1/chat/completions"
        headers["Authorization"] = f"Bearer {key}"
    elif provider == "kimi":
        url = "https://api.moonshot.cn/v1/chat/completions"
        headers["Authorization"] = f"Bearer {key}"
    elif provider == "deepseek":
        url = "https://api.deepseek.com/chat/completions"
        headers["Authorization"] = f"Bearer {key}"
    elif provider == "qwen":
        url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
        headers["Authorization"] = f"Bearer {key}"
    elif provider == "gemini":
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}"
    else:
        return JSONResponse({"error": "invalid_provider", "message": f"Unsupported provider: {provider}"}, status_code=400)

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(url, headers=headers, json=body)
            
            if res.status_code == 429:
                return JSONResponse({"error": "rate_limited", "message": f"{provider.capitalize()} rate limit reached."}, status_code=429)
            elif res.status_code in (401, 403):
                return JSONResponse({"error": "invalid_key", "message": f"Invalid API key for {provider.capitalize()}."}, status_code=401)
                
            res.raise_for_status()
            data = res.json()
            return JSONResponse(data)
            
    except httpx.HTTPStatusError as e:
        err_msg = ""
        try:
            err_msg = e.response.json().get("error", {}).get("message", "")
        except:
            err_msg = e.response.text
        logger.error(f"Chat proxy HTTP error {e.response.status_code} for {provider}: {err_msg}")
        return JSONResponse(
            {"error": "api_error", "message": err_msg or f"Provider {provider} returned status {e.response.status_code}"}, 
            status_code=e.response.status_code
        )
    except Exception as e:
        logger.error(f"Chat proxy network error for {provider}: {e}")
        return JSONResponse(
            {"error": "network_error", "message": f"Failed to connect to {provider.capitalize()}."}, 
            status_code=500
        )
