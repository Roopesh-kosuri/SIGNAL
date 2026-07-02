"""
SIGNAL - News Feed Route (BYOK Providers)
=========================================
Flow:
  1. Frontend sends provider name, API key, and optional config via headers.
  2. Backend routes request to the specific provider module.
  3. Provider module fetches raw articles and normalizes them.
  4. Backend caches the normalized result (3hr TTL) per key to avoid rate limits.
  5. Category filter + pagination via query params apply to DDG live search.
"""

import os
import json
import time
import logging
import hashlib
import base64
import asyncio
import httpx
from fastapi import APIRouter, Request, Header, Query
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from utils.scraper import scrape_article_text
from duckduckgo_search import DDGS
from pydantic import BaseModel

from providers import (
    newsapi, rss, newsdata, gnews, currents, mediastack, guardian, custom
)

logger = logging.getLogger("signal.feed")
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

_feed_cache: dict = {}

def _get_cache_key(provider: str, api_key: str, config_str: str, category: str, page: int) -> str:
    if provider in ("newsapi", "gnews"):
        raw = f"{provider}:{api_key}:{config_str}:{category}:{page}"
    else:
        raw = f"{provider}:{api_key}:{config_str}:{category}"
    return hashlib.sha256(raw.encode()).hexdigest()

def _is_cache_valid(cache_key: str) -> bool:
    if cache_key not in _feed_cache:
        return False
    entry = _feed_cache[cache_key]
    age = time.time() - entry["timestamp"]
    return age < 10800

FEED_UNAVAILABLE = {
    "error": "feed_unavailable",
    "message": "Intelligence feed is temporarily unavailable. Check your News Source configuration in Settings.",
    "stories": [],
}

FEED_BUSY = {
    "error": "rate_limited",
    "message": "Intelligence feed temporarily busy or rate limited by provider.",
    "stories": [],
}

PROVIDER_MAP = {
    "newsapi": newsapi,
    "rss": rss,
    "newsdata": newsdata,
    "gnews": gnews,
    "currents": currents,
    "mediastack": mediastack,
    "guardian": guardian,
    "custom": custom,
}

def scrape_ddg_lite(query: str, max_results: int = 8) -> list:
    url = "https://lite.duckduckgo.com/lite/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {"q": query}
    try:
        from bs4 import BeautifulSoup
        import urllib.parse
        resp = httpx.post(url, headers=headers, data=data, timeout=10.0, follow_redirects=True)
        if resp.status_code != 200:
            logger.warning(f"DDG Lite search returned status {resp.status_code}")
            return []
            
        soup = BeautifulSoup(resp.text, 'html.parser')
        results = []
        
        snippets = soup.find_all('td', class_='result-snippet')
        for td in snippets:
            snippet = td.get_text(separator=' ', strip=True)
            prev_row = td.parent.find_previous_sibling('tr')
            if prev_row:
                a_tag = prev_row.find('a', class_='result-link')
                if a_tag:
                    title = a_tag.get_text(separator=' ', strip=True)
                    href = a_tag.get('href', '')
                    if href.startswith('/l/?'):
                        try:
                            parsed_url = urllib.parse.urlparse(href)
                            query_params = urllib.parse.parse_qs(parsed_url.query)
                            if 'uddg' in query_params:
                                href = query_params['uddg'][0]
                        except Exception:
                            pass
                    
                    results.append({
                        "title": title,
                        "href": href,
                        "body": snippet
                    })
                    
            if len(results) >= max_results:
                break
                
        return results
    except Exception as e:
        logger.error(f"DDG Lite scrape failed for query '{query}': {e}")
        return []

def scrape_yahoo_search(query: str, max_results: int = 8) -> list:
    import urllib.parse
    url = f"https://search.yahoo.com/search?p={urllib.parse.quote_plus(query)}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
    }
    try:
        from bs4 import BeautifulSoup
        resp = httpx.get(url, headers=headers, timeout=10.0, follow_redirects=True)
        if resp.status_code != 200:
            logger.warning(f"Yahoo search returned status {resp.status_code}")
            return []
            
        soup = BeautifulSoup(resp.text, 'html.parser')
        results = []
        
        items = soup.find_all('div', class_='algo')
        for div in items:
            title_a = div.find('a')
            snippet_span = div.find('div', class_='compText') or div.find('p')
            
            if title_a:
                title = title_a.get_text(strip=True)
                href = title_a.get('href', '')
                snippet = snippet_span.get_text(strip=True) if snippet_span else ""
                
                results.append({
                    "title": title,
                    "href": href,
                    "body": snippet
                })
                
            if len(results) >= max_results:
                break
                
        return results
    except Exception as e:
        logger.error(f"Yahoo search scrape failed for query '{query}': {e}")
        return []

def sync_ddg_search(query: str, page: int = 1) -> list:
    max_results = page * 9
    
    # 1. Try DuckDuckGo Lite HTML Scraper
    results = scrape_ddg_lite(query, max_results)
    if results:
        start_idx = (page - 1) * 9
        return results[start_idx: start_idx + 9]
        
    # 2. Fallback to Yahoo Search Scraper (immune to DDG rate-limit blocks)
    logger.info(f"DDG Lite returned 0 results. Falling back to Yahoo Search Scraper for: '{query}'")
    results = scrape_yahoo_search(query, max_results)
    if results:
        start_idx = (page - 1) * 9
        return results[start_idx: start_idx + 9]
        
    # 3. Last-ditch fallback to duckduckgo_search library
    try:
        logger.info(f"Yahoo search also empty. Falling back to library search for: '{query}'")
        res = list(DDGS().text(query, max_results=max_results))
        start_idx = (page - 1) * 9
        # Map library search results to uniform structure
        mapped = []
        for r in res[start_idx: start_idx + 9]:
            mapped.append({
                "title": r.get("title", ""),
                "href": r.get("href", ""),
                "body": r.get("body", "")
            })
        return mapped
    except Exception as e:
        logger.warning(f"Fallback DDG search library failed: {e}")
        return []

def normalize_ddg(results: list, category: str) -> list:
    stories = []
    for r in results:
        stories.append({
            "id": hashlib.md5(r.get("href", r.get("title", "")).encode()).hexdigest()[:12],
            "headline": r.get("title", ""),
            "summary": r.get("body", ""),
            "source": r.get("source", "DuckDuckGo Live Search"),
            "url": r.get("href", ""),
            "category": category.upper() if category else "GENERAL",
            "confidence": "MEDIUM",
            "why_it_matters": "",
            "source_count": 1,
        })
    return stories

async def generate_ai_news(category: str, page: int, groq_key: str = "", gemini_key: str = "") -> list:
    category_str = category.upper() if category else "GENERAL"
    prompt = f"""You are the SIGNAL Intelligence Generation Engine. The primary news feeds are temporarily unavailable.
Generate exactly 9 unique, highly realistic, analytical, and professional intelligence news articles for the category '{category_str}' (page {page}).
These should look like top-tier geopolitical and macroeconomic intelligence briefings (e.g. from Stratfor, Janes, Bloomberg).
Do NOT include any markdown blocks, explanations, or text outside the JSON. Return a raw valid JSON array of objects matching this schema:
[
  {{
    "id": "ai-{category_str.lower()}-{page}-01",
    "headline": "Analytical, compelling headline about a recent event",
    "summary": "1-2 paragraphs of structured analytical summary, containing names, dates, and background context",
    "category": "{category_str}",
    "confidence": "HIGH",
    "why_it_matters": "One sentence explaining the strategic, geopolitical, or market implications",
    "source_name": "SIGNAL AI Synthesis",
    "url": "https://signal-intelligence.app/intel/ai-{category_str.lower()}-{page}-01",
    "publishedAt": "2026-07-01T20:16:00Z",
    "entities": ["Country1", "Organization1", "Person1"]
  }}
]
Provide exactly 9 objects in the array. Make them highly specific, diverse, and relevant to the category '{category_str}'.
"""
    if groq_key:
        logger.info("Generating synthetic news via Groq...")
        headers = {"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"}
        body = {
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": "You are a professional intelligence analyst. Output strictly raw JSON array matching the schema, with no wrapping or commentary."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=body)
                if resp.status_code == 200:
                    data = resp.json()
                    content = data["choices"][0]["message"]["content"]
                    import re
                    match = re.search(r"\[\s*\{[\s\S]*\}\s*\]", content)
                    if match:
                        return json.loads(match.group(0))
                    else:
                        return json.loads(content)
        except Exception as e:
            logger.error(f"Failed to generate synthetic news via Groq: {e}")

    if gemini_key:
        logger.info("Generating synthetic news via Gemini...")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini_key}"
        headers = {"Content-Type": "application/json"}
        body = {
            "contents": [{
                "parts": [{
                    "text": prompt
                }]
            }],
            "generationConfig": {
                "responseMimeType": "application/json"
            }
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, headers=headers, json=body)
                if resp.status_code == 200:
                    data = resp.json()
                    content = data["candidates"][0]["content"]["parts"][0]["text"]
                    import re
                    match = re.search(r"\[\s*\{[\s\S]*\}\s*\]", content)
                    if match:
                        return json.loads(match.group(0))
                    else:
                        return json.loads(content)
        except Exception as e:
            logger.error(f"Failed to generate synthetic news via Gemini: {e}")

    return []

@router.get("/feed")
@limiter.limit("30/minute")
async def get_feed(
    request: Request,
    x_news_provider: str = Header("rss"),
    x_news_key: str = Header(""),
    x_news_config: str = Header(""),
    x_news_topics: str = Header(""),
    x_groq_key: str = Header(""),
    x_ai_key: str = Header(""),
    refresh: bool = Query(False),
    category: str = Query(default=""),
    page: int = Query(default=1),
):
    try:
        provider_name = x_news_provider.lower().strip() if x_news_provider else "rss"
        api_key = x_news_key.strip() if x_news_key else ""
        config = {}

        logger.info(f"Feed request: provider={provider_name} category={category!r} page={page} refresh={refresh}")

        if x_news_config:
            try:
                decoded = base64.b64decode(x_news_config).decode("utf-8")
                config = json.loads(decoded)
            except Exception as e:
                logger.error(f"Failed to parse x-news-config: {e}")

        active_category = category.strip().upper() if category.strip() else ""
        if not active_category and x_news_topics:
            active_category = x_news_topics.split(",")[0].strip().upper()

        if x_news_topics:
            config["topics"] = x_news_topics.split(",")
        if active_category:
            config["category"] = active_category
        config["page"] = page

        if provider_name not in PROVIDER_MAP:
            return JSONResponse(
                {"error": "invalid_provider", "message": f"Provider '{provider_name}' is not supported.", "stories": []},
                status_code=400
            )

        cache_key = _get_cache_key(provider_name, api_key, x_news_config or "", active_category, page)

        if not refresh and _is_cache_valid(cache_key):
            entry = _feed_cache[cache_key]
            age_minutes = int((time.time() - entry["timestamp"]) / 60)
            logger.info(f"Serving cached feed: {provider_name} cat={active_category} page={page} age={age_minutes}m")
            if provider_name not in ("newsapi", "gnews"):
                cached_stories = entry["data"]
                start_idx = (page - 1) * 9
                end_idx = start_idx + 9
                stories_slice = cached_stories[start_idx:end_idx]
                
                # If slice is empty or small, try to augment with DDG
                if len(stories_slice) < 3:
                    logger.info(f"Cached slice for page {page} has only {len(stories_slice)} stories — augmenting with DDG.")
                    search_query = f"latest {active_category.lower()} news today" if active_category else "breaking news today"
                    ddg_raw = await asyncio.to_thread(sync_ddg_search, search_query, page)
                    ddg_stories = normalize_ddg(ddg_raw, active_category)
                    
                    existing_urls = {s.get("url") for s in cached_stories if s.get("url")}
                    new_added = 0
                    for s in ddg_stories:
                        if s["url"] not in existing_urls:
                            cached_stories.append(s)
                            new_added += 1
                    
                    if new_added > 0:
                        _feed_cache[cache_key]["data"] = cached_stories
                    
                    stories_slice = cached_stories[start_idx:end_idx]
                
                # If slice is STILL empty or small, fall back to AI news generation
                if len(stories_slice) < 3:
                    logger.info(f"Cached slice for page {page} is still too small ({len(stories_slice)}) — generating via AI.")
                    ai_stories = await generate_ai_news(active_category, page, x_groq_key, x_ai_key)
                    if ai_stories:
                        existing_ids = {s.get("id") for s in cached_stories}
                        new_added = 0
                        for s in ai_stories:
                            if s.get("id") not in existing_ids:
                                cached_stories.append(s)
                                new_added += 1
                        if new_added > 0:
                            _feed_cache[cache_key]["data"] = cached_stories
                        stories_slice = cached_stories[start_idx:end_idx]

                return JSONResponse({
                    "stories": stories_slice,
                    "cached": True,
                    "cache_age_minutes": age_minutes,
                    "source": provider_name,
                })
            else:
                return JSONResponse({
                    "stories": entry["data"],
                    "cached": True,
                    "cache_age_minutes": age_minutes,
                    "source": provider_name,
                })

        logger.info(f"Fetching fresh feed from: {provider_name}")
        if provider_name not in ("newsapi", "gnews"):
            provider_module = PROVIDER_MAP[provider_name]
            try:
                cached_stories = await provider_module.fetch_articles(api_key, config)
            except Exception as e:
                logger.warning(f"Provider {provider_name} fetch failed: {e}. Falling back to search.")
                cached_stories = []
            
            if not cached_stories:
                logger.warning(f"Provider {provider_name} returned 0 articles - falling back to DDG")
                search_query = f"latest {active_category.lower()} news today" if active_category else "breaking news today"
                ddg_raw = await asyncio.to_thread(sync_ddg_search, search_query, 1)
                cached_stories = normalize_ddg(ddg_raw, active_category)
            
            if active_category and active_category != "ALL":
                cat_lower = active_category.lower()
                filtered = [
                    s for s in cached_stories
                    if cat_lower in str(s.get("category", "")).lower()
                       or cat_lower in str(s.get("headline", "")).lower()
                       or cat_lower in str(s.get("summary", "")).lower()
                ]
                if len(filtered) < 3:
                    logger.info(f"Category '{active_category}' filter yielded {len(filtered)} - augmenting with DDG")
                    search_query = f"latest {cat_lower} news today"
                    ddg_raw = await asyncio.to_thread(sync_ddg_search, search_query, 1)
                    ddg_stories = normalize_ddg(ddg_raw, active_category)
                    existing_urls = {s.get("url") for s in filtered}
                    for s in ddg_stories:
                        if s["url"] not in existing_urls:
                            filtered.append(s)
                cached_stories = filtered
            
            _feed_cache[cache_key] = {"data": cached_stories, "timestamp": time.time()}
            
            start_idx = (page - 1) * 9
            end_idx = start_idx + 9
            stories = cached_stories[start_idx:end_idx]
            
            if len(stories) < 3:
                logger.info(f"Fresh slice for page {page} has only {len(stories)} stories — augmenting with DDG.")
                search_query = f"latest {active_category.lower()} news today" if active_category else "breaking news today"
                ddg_raw = await asyncio.to_thread(sync_ddg_search, search_query, page)
                ddg_stories = normalize_ddg(ddg_raw, active_category)
                
                existing_urls = {s.get("url") for s in cached_stories if s.get("url")}
                new_added = 0
                for s in ddg_stories:
                    if s["url"] not in existing_urls:
                        cached_stories.append(s)
                        new_added += 1
                
                if new_added > 0:
                    _feed_cache[cache_key]["data"] = cached_stories
                
                stories = cached_stories[start_idx:end_idx]

            # If fresh slice is STILL empty or small, fall back to AI news generation
            if len(stories) < 3:
                logger.info(f"Fresh slice for page {page} is still too small ({len(stories)}) — generating via AI.")
                ai_stories = await generate_ai_news(active_category, page, x_groq_key, x_ai_key)
                if ai_stories:
                    existing_ids = {s.get("id") for s in cached_stories}
                    new_added = 0
                    for s in ai_stories:
                        if s.get("id") not in existing_ids:
                            cached_stories.append(s)
                            new_added += 1
                    if new_added > 0:
                        _feed_cache[cache_key]["data"] = cached_stories
                    stories = cached_stories[start_idx:end_idx]
        else:
            provider_module = PROVIDER_MAP[provider_name]
            try:
                stories = await provider_module.fetch_articles(api_key, config)
            except Exception as e:
                logger.warning(f"Provider {provider_name} fetch failed: {e}. Falling back to search.")
                stories = []
            
            if not stories:
                logger.warning(f"Provider {provider_name} returned 0 articles - falling back to DDG")
                search_query = f"latest {active_category.lower()} news today" if active_category else "breaking news today"
                ddg_raw = await asyncio.to_thread(sync_ddg_search, search_query, page)
                stories = normalize_ddg(ddg_raw, active_category)
            
            if active_category and active_category != "ALL":
                cat_lower = active_category.lower()
                filtered = [
                    s for s in stories
                    if cat_lower in str(s.get("category", "")).lower()
                       or cat_lower in str(s.get("headline", "")).lower()
                       or cat_lower in str(s.get("summary", "")).lower()
                ]
                if len(filtered) < 3:
                    logger.info(f"Category '{active_category}' filter yielded {len(filtered)} - augmenting with DDG")
                    search_query = f"latest {cat_lower} news today"
                    ddg_raw = await asyncio.to_thread(sync_ddg_search, search_query, page)
                    ddg_stories = normalize_ddg(ddg_raw, active_category)
                    existing_urls = {s.get("url") for s in filtered}
                    for s in ddg_stories:
                        if s["url"] not in existing_urls:
                            filtered.append(s)
                stories = filtered
            
            _feed_cache[cache_key] = {"data": stories, "timestamp": time.time()}

        if len(stories) < 3:
            # Fallback to AI-generated news
            logger.info("Fewer than 3 stories found via standard sources or DDG. Invoking AI News Generation...")
            ai_stories = await generate_ai_news(active_category, page, x_groq_key, x_ai_key)
            if ai_stories:
                logger.info(f"Successfully generated {len(ai_stories)} synthetic stories via AI.")
                if provider_name not in ("newsapi", "gnews"):
                    if cache_key in _feed_cache:
                        cached_stories = _feed_cache[cache_key]["data"]
                    else:
                        cached_stories = []
                    existing_ids = {s.get("id") for s in cached_stories}
                    new_added = 0
                    for s in ai_stories:
                        if s.get("id") not in existing_ids:
                            cached_stories.append(s)
                            new_added += 1
                    _feed_cache[cache_key] = {"data": cached_stories, "timestamp": time.time()}
                    stories = cached_stories[start_idx:end_idx]
                else:
                    existing_urls = {s.get("url") for s in stories if s.get("url")}
                    new_stories = list(stories)
                    for s in ai_stories:
                        if s.get("url") not in existing_urls:
                            new_stories.append(s)
                    stories = new_stories
                    _feed_cache[cache_key] = {"data": stories, "timestamp": time.time()}

        if not stories:
            if cache_key in _feed_cache:
                return _serve_stale_cache(cache_key)
            return JSONResponse(FEED_UNAVAILABLE, status_code=503)

        return JSONResponse({
            "stories": stories,
            "cached": False,
            "cache_age_minutes": 0,
            "source": provider_name,
        })

    except Exception as e:
        import traceback
        logger.error(f"FATAL ERROR in get_feed:\n{traceback.format_exc()}")
        err_str = str(e).lower()

        if "rate_limited" in err_str or "429" in err_str:
            if "cache_key" in locals() and cache_key in _feed_cache:
                return _serve_stale_cache(cache_key)
            return JSONResponse(FEED_BUSY, status_code=429)

        if "invalid_key" in err_str or "401" in err_str or "403" in err_str:
            return JSONResponse({
                "error": "invalid_key",
                "message": f"Invalid API key for {x_news_provider}. Please check your Settings.",
                "stories": []
            }, status_code=401)

        if "cache_key" in locals() and cache_key in _feed_cache:
            return _serve_stale_cache(cache_key)

        return JSONResponse(
            {"error": "fetch_failed", "message": f"Failed to fetch intelligence feed from {x_news_provider}.", "stories": []},
            status_code=500,
        )

def _serve_stale_cache(cache_key: str):
    entry = _feed_cache[cache_key]
    return JSONResponse({
        "stories": entry["data"],
        "cached": True,
        "stale": True,
        "cache_age_minutes": int((time.time() - entry["timestamp"]) / 60),
        "warning": "Serving cached data - live refresh temporarily unavailable.",
    })

@router.get("/extract")
@limiter.limit("20/minute")
async def extract_article_text(
    request: Request,
    url: str = Query(..., description="URL of the article to extract text from"),
    x_groq_key: str = Header(""),
    x_ai_key: str = Header(""),
):
    try:
        full_text = None
        is_synthetic = "signal-intelligence.app" in url or "/ai-" in url
        
        if not is_synthetic:
            try:
                full_text = await scrape_article_text(url)
            except Exception as e:
                logger.warning(f"Scraper failed for {url}: {e} — falling back to AI synthesis.")
                
        if not full_text or full_text == "Could not extract readable text from this page.":
            # Search the cache for this story to get context
            story = None
            for cache_entry in _feed_cache.values():
                if "data" in cache_entry:
                    for s in cache_entry["data"]:
                        if s.get("url") == url:
                            story = s
                            break
                if story:
                    break
            
            if story:
                headline = story.get("headline", "Geopolitical Intel Report")
                summary = story.get("summary", "")
                why_it_matters = story.get("why_it_matters", "")
                category = story.get("category", "GEOPOLITICS")
                
                logger.info(f"Synthesizing full brief for: {headline}")
                
                prompt = f"""You are SIGNAL's Senior Geopolitical & Strategic Intelligence Analyst.
Write a highly detailed, comprehensive, 600-word intelligence briefing about this event.
Headline: {headline}
Summary: {summary}
Why It Matters: {why_it_matters}
Category: {category}

Structure the briefing into clear, professional sections:
1. EXECUTIVE SUMMARY & TIMELINE
2. STRATEGIC & GEOPOLITICAL IMPACT
3. KEY ENTITIES & MOTIVATIONS
4. RISK ASSESSMENT & FUTURE OUTLOOK

Stay objective, analytical, and write in the voice of a professional intelligence service. Provide deep analytical depth.
"""
                
                if x_groq_key:
                    logger.info("Synthesizing context via Groq...")
                    headers = {"Authorization": f"Bearer {x_groq_key}", "Content-Type": "application/json"}
                    body = {
                        "model": "llama-3.3-70b-versatile",
                        "messages": [
                            {"role": "system", "content": "You are a professional intelligence analyst. Provide a deeply detailed, structured briefing."},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.5
                    }
                    try:
                        async with httpx.AsyncClient(timeout=30.0) as client:
                            resp = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=body)
                            if resp.status_code == 200:
                                full_text = resp.json()["choices"][0]["message"]["content"]
                    except Exception as e:
                        logger.error(f"AI Synthesis via Groq failed: {e}")
                        
                if (not full_text) and x_ai_key:
                    logger.info("Synthesizing context via Gemini...")
                    gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={x_ai_key}"
                    headers = {"Content-Type": "application/json"}
                    body = {
                        "contents": [{
                            "parts": [{
                                "text": prompt
                            }]
                        }]
                    }
                    try:
                        async with httpx.AsyncClient(timeout=30.0) as client:
                            resp = await client.post(gemini_url, headers=headers, json=body)
                            if resp.status_code == 200:
                                full_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                    except Exception as e:
                        logger.error(f"AI Synthesis via Gemini failed: {e}")

            if not full_text:
                if is_synthetic and story:
                    full_text = f"ANALYSIS PRECIS:\n\n{story.get('summary')}\n\nWHY IT MATTERS:\n{story.get('why_it_matters')}"
                else:
                    full_text = "Could not extract readable text from this page, and no AI keys were available to synthesize the brief."

        return {"text": full_text, "url": url}
    except Exception as e:
        logger.error(f"Extraction failed for {url}: {e}")
        return JSONResponse(
            {"error": "extraction_failed", "message": "Failed to fetch or parse the article text."},
            status_code=500
        )

@router.get("/search-grounding")
@limiter.limit("20/minute")
async def get_search_grounding(
    request: Request,
    query: str = Query(..., description="The query to search the internet for")
):
    try:
        results = await asyncio.to_thread(sync_ddg_search, query, 1)
        return {"results": results}
    except Exception as e:
        logger.error(f"Search grounding failed for {query}: {e}")
        return JSONResponse({"results": [], "error": str(e)}, status_code=500)

class DeepDiveRequest(BaseModel):
    text: str

@router.post("/extract-for-deepdive")
@limiter.limit("10/minute")
async def extract_for_deepdive(
    request: Request,
    payload: DeepDiveRequest,
    x_groq_key: str = Header(default="")
):
    groq_key = x_groq_key.strip()
    if not groq_key:
        return JSONResponse(
            {"error": "missing_groq_key", "message": "Groq API key is required for DeepDive Optimizer."},
            status_code=401
        )

    prompt = f"""You are the Fact-Check Preparation Engine for the SIGNAL DeepDive Agent. Analyze this full news article text and isolate exactly 3 to 5 clear, falsifiable, verifiable claims or core points.
Format your output EXACTLY as a structured prompt that the user can feed directly into an autonomous search agent.
Structure:
---
[DEEPDIVE AGENT SEARCH PROMPT]
Please verify the following core claims extracted from recent intel:
1. [Specific Claim 1 with names/dates/numbers]
2. [Specific Claim 2]
3. [Specific Claim 3]
Provide a final cross-referenced veracity verdict.
---
Keep the total output strictly under 800 words.

Article Text:
{payload.text}"""

    headers = {"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"}
    body = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": "You are a prompt engineer for an autonomous fact-checking agent."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            return {"prompt": content}
    except Exception as e:
        logger.error(f"DeepDive optimizer failed: {e}")
        return JSONResponse(
            {"error": "deepdive_failed", "message": "Failed to optimize text for DeepDive."},
            status_code=500
        )
