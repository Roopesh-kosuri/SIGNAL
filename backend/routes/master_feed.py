import asyncio
import json
import logging
import httpx
from fastapi import APIRouter, Request, Header, Query
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from duckduckgo_search import DDGS
import uuid

from providers import (
    newsapi, rss, newsdata, gnews, currents, mediastack, guardian, custom
)

logger = logging.getLogger("signal.master_feed")
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

PROVIDER_MAP = {
    "newsapi": newsapi,
    "newsdata": newsdata,
    "gnews": gnews,
    "currents": currents,
    "mediastack": mediastack,
    "guardian": guardian,
    "rss": rss,
    "custom": custom,
}

def sync_ddg_search(category: str, page: int = 1) -> list:
    """Synchronous DDG search wrapped to run in thread pool."""
    logger.info(f"Master Feed: Triggering DDG live search for category: {category} | page: {page}")
    search_query = f"latest breaking {category} news" if category and category != "ALL" else "latest breaking news"
    try:
        max_results = page * 10
        results = list(DDGS().text(search_query, max_results=max_results))
        # Return only the items for the current page
        start_idx = (page - 1) * 10
        return results[start_idx : start_idx + 10]
    except Exception as e:
        logger.error(f"Master Feed: DDG search failed: {e}")
        return []

@router.get("/master-feed")
@limiter.limit("15/minute")
async def get_master_feed(
    request: Request,
    x_newsapi_key: str = Header(default=""),
    x_newsdata_key: str = Header(default=""),
    x_gnews_key: str = Header(default=""),
    x_currents_key: str = Header(default=""),
    x_mediastack_key: str = Header(default=""),
    x_guardian_key: str = Header(default=""),
    x_rss_config: str = Header(default=""),
    x_custom_key: str = Header(default=""),
    x_groq_key: str = Header(default=""),
    x_news_topics: str = Header(default=""),
    x_exclude_headlines: str = Header(default=""),
    refresh: bool = Query(False),
    category: str = Query(default=""),
    page: int = Query(1)
):
    print(f"=== INCOMING REQUEST CATEGORY: {category} | PAGE: {page} ===")
    
    # Mapping header inputs to provider modules
    active_keys = {
        "newsapi": x_newsapi_key.strip(),
        "newsdata": x_newsdata_key.strip(),
        "gnews": x_gnews_key.strip(),
        "currents": x_currents_key.strip(),
        "mediastack": x_mediastack_key.strip(),
        "guardian": x_guardian_key.strip(),
        "rss": x_rss_config.strip(), # RSS uses config instead of key
        "custom": x_custom_key.strip()
    }
    
    groq_key = x_groq_key.strip()
    if not groq_key:
        return JSONResponse(
            {"error": "missing_groq_key", "message": "Groq API key is required for Master Agent mode to deduplicate stories.", "stories": []},
            status_code=401
        )
        
    tasks = []
    # Collect all tasks for providers that have a configured key/config
    for provider_name, key_or_config in active_keys.items():
        if key_or_config:
            logger.info(f"Master Feed: Queueing task for {provider_name}")
            module = PROVIDER_MAP[provider_name]
            config = {}
            if provider_name == 'rss':
                import base64
                try:
                    decoded = base64.b64decode(key_or_config).decode('utf-8')
                    config = json.loads(decoded)
                except Exception as e:
                    logger.warning(f"Master Feed: Failed to parse RSS config: {e}")
            if x_news_topics:
                config["topics"] = x_news_topics.split(',')
            config["page"] = page
            # Wrap in timeout of 4 seconds
            tasks.append(asyncio.wait_for(module.fetch_articles(key_or_config, config), timeout=4.0))
            
    # ALWAYS append the dynamic live-search injector
    tasks.append(asyncio.to_thread(sync_ddg_search, category, page))
            
    logger.info(f"Master Feed: Executing {len(tasks)} ingestion sweeps concurrently...")
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    all_raw_stories = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error(f"Master Feed: Task fetch failed with exception: {result}")
        elif isinstance(result, list):
            # The result could be standard FeedResponse objects from APIs or raw DDG dictionaries
            for s in result:
                # Normalize slightly before compression
                if "title" in s and "body" in s: # DDG schema mapping
                    all_raw_stories.append({
                        "headline": s.get("title", ""),
                        "summary": s.get("body", ""),
                        "source": "DuckDuckGo Live Search",
                        "url": s.get("href", ""),
                        "category": category if category else "GENERAL",
                        "confidence": "MEDIUM",
                        "why_it_matters": "",
                        "source_count": 1
                    })
                else:
                    all_raw_stories.append(s)

    logger.info(f"Master Feed: Aggregated {len(all_raw_stories)} raw stories. Beginning Groq unified processing...")
    
    # Compress stories to save tokens
    compressed_stories = []
    for s in all_raw_stories:
        compressed_stories.append({
            "headline": s.get("headline", ""),
            "summary": s.get("summary", "")[:200], # Shorten to save tokens
            "source": s.get("source", ""),
            "category": s.get("category", ""),
            "url": s.get("url", ""),
            "confidence": s.get("confidence", "MEDIUM"),
            "why_it_matters": s.get("why_it_matters", ""),
            "source_count": s.get("source_count", 1)
        })
        
    active_category = category if category else (x_news_topics if x_news_topics else 'ALL')
    
    prompt = f"""
You are the Principal Intelligence Director for the SIGNAL terminal. 
Target Category Filter: {active_category}
You are processing Page {page} of the news feed. Curate these results as usual.

Your task is to analyze the raw, multi-source ingestion pool and synthesize the ultimate intelligence feed.
Execute these actions:
1. STRICTION: If a specific category (e.g., SPACE, CYBER) is requested, ruthlessly discard any story that does not directly pertain to that domain. Never return generic world news in a specialized channel.
2. DEDUPLICATION: Merge identical breaking events reported by different vendors into a single authoritative card.
3. EXCLUSION: You MUST NOT return any stories that are substantially similar to these existing headlines:
{x_exclude_headlines.replace('|||', ', ')}
4. SYNTHESIS: For the top 7 highest-priority stories, write a clean title, a 3-line analytical brief, calculate a true multi-source confidence metric, and generate a 'Why It Matters' strategic defense/tech impact bullet.
5. Format your output strictly as a JSON array matching the FeedResponse schema. Ensure raw HTML tags are entirely stripped out. Fail-Safe Response: If the array returned is completely empty because an API failed, return a beautifully structured backup feed synthesized purely from the DuckDuckGo live stream results passed through Groq.

Ensure each object in the array has EXACTLY these keys:
"id" (string, generate a short uuid),
"headline" (string),
"summary" (string),
"source" (string, list multiple sources if deduplicated),
"url" (string, pick one primary url),
"category" (string, strictly categorized),
"confidence" (string, 'HIGH', 'MEDIUM', 'LOW'),
"source_count" (integer, combine counts if deduplicated),
"why_it_matters" (string)

Raw Stories Pool:
{json.dumps(compressed_stories)}
"""

    headers = {
        "Authorization": f"Bearer {groq_key}",
        "Content-Type": "application/json"
    }
    
    body = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": "You are a JSON-only API. You output ONLY valid JSON matching: { \"stories\": [...] } and no other text."},
            {"role": "user", "content": prompt + "\nReturn a JSON object with a single key 'stories' containing the array."}
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"}
    }
    
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
            
            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            final_stories = parsed.get("stories", [])
            
            logger.info(f"Master Feed: Successfully curated {len(final_stories)} stories via unified agent.")
            
            return JSONResponse({
                "stories": final_stories,
                "cached": False,
                "cache_age_minutes": 0,
                "source": "unified_agent"
            })
            
    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        body_text = e.response.text[:500]
        logger.error(f"Master Feed: Groq HTTP {status}: {body_text}")
        if status == 401:
            return JSONResponse(
                {"error": "invalid_groq_key", "message": f"Groq API key is invalid (HTTP 401). Check your key in Settings.", "stories": []},
                status_code=401
            )
        if status == 429:
            return JSONResponse(
                {"error": "rate_limited", "message": "Groq rate limit reached. Returning raw stories as fallback.", "stories": all_raw_stories[:10]},
                status_code=200
            )
        return JSONResponse(
            {"error": "groq_error", "message": f"Groq API error (HTTP {status}): {body_text[:200]}", "stories": all_raw_stories[:10]},
            status_code=200
        )
    except json.JSONDecodeError as e:
        logger.error(f"Master Feed: Failed to parse Groq JSON response: {e}")
        return JSONResponse(
            {"error": "parse_error", "message": "Intelligence engine returned malformed data. Showing raw stories.", "stories": all_raw_stories[:10]},
            status_code=200
        )
    except Exception as e:
        logger.error(f"Master Feed: Unexpected error in synthesis: {type(e).__name__}: {e}")
        return JSONResponse(
            {"error": "agent_failed", "message": f"Intelligence engine error: {type(e).__name__}: {str(e)[:200]}", "stories": all_raw_stories[:10]},
            status_code=200
        )


# ─── Trending Chips Endpoint ──────────────────────────────────────────────────
_trending_cache = {"chips": [], "timestamp": 0}

@router.get("/trending-chips")
@limiter.limit("10/minute")
async def get_trending_chips(
    request: Request,
    x_groq_key: str = Header(default=""),
):
    import time
    groq_key = x_groq_key.strip()
    
    # Return cached chips if less than 10 minutes old
    if _trending_cache["chips"] and (time.time() - _trending_cache["timestamp"]) < 600:
        return JSONResponse({"chips": _trending_cache["chips"], "cached": True})
    
    # Fetch fresh DDG headlines for context
    try:
        ddg_results = await asyncio.to_thread(lambda: list(DDGS().text("breaking world news today", max_results=5)))
        headlines = [r.get("title", "") for r in ddg_results if r.get("title")]
    except Exception as e:
        logger.warning(f"Trending chips: DDG fetch failed: {e}")
        headlines = []
    
    if not groq_key:
        # Without Groq, return simple chips derived from headlines
        simple_chips = []
        for h in headlines[:3]:
            words = h.split()[:5]
            simple_chips.append(" ".join(words))
        return JSONResponse({"chips": simple_chips or ["Global Security Briefing", "Market Analysis Today", "Technology Disruptions"], "cached": False})
    
    headline_context = "\n".join([f"- {h}" for h in headlines]) if headlines else "No live headlines available."
    
    prompt = f"""Based on these current breaking headlines:
{headline_context}

Generate exactly 3 short, compelling search prompts (5-8 words each) that an intelligence analyst would want to investigate right now. Make them specific, timely, and actionable — not generic topics.

Return ONLY a JSON object: {{"chips": ["chip1", "chip2", "chip3"]}}"""
    
    headers = {
        "Authorization": f"Bearer {groq_key}",
        "Content-Type": "application/json"
    }
    body = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": "You are a JSON-only API. Output ONLY valid JSON."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7,
        "response_format": {"type": "json_object"}
    }
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            chips = parsed.get("chips", [])[:3]
            
            # Cache the result
            _trending_cache["chips"] = chips
            _trending_cache["timestamp"] = time.time()
            
            return JSONResponse({"chips": chips, "cached": False})
    except Exception as e:
        logger.error(f"Trending chips: Groq generation failed: {e}")
        return JSONResponse({"chips": ["Global Security Briefing", "Market Analysis Today", "Technology Disruptions"], "cached": False})

