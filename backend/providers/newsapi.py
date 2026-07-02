import httpx
import logging
import asyncio
import os
import json
from datetime import datetime

logger = logging.getLogger("signal.providers.newsapi")

NEWSAPI_URL = "https://newsapi.org/v2/everything"
USAGE_FILE = os.path.join(os.path.dirname(__file__), "newsapi_usage.json")

# Two queries, each under 100 characters to fit the Developer Plan limits
NEWSAPI_QUERY_1 = "geopolitics OR NATO OR sanctions OR military OR cyber OR tech"
NEWSAPI_QUERY_2 = '"stock market" OR crypto OR bitcoin OR space OR NASA OR satellite'

def _increment_usage(count=1):
    today = datetime.now().strftime("%Y-%m-%d")
    usage = {"date": today, "count": 0}
    
    if os.path.exists(USAGE_FILE):
        try:
            with open(USAGE_FILE, "r") as f:
                usage = json.load(f)
            if usage.get("date") != today:
                usage = {"date": today, "count": 0}
        except Exception as e:
            logger.warning(f"Could not read NewsAPI usage file: {e}")
            
    usage["count"] += count
    
    try:
        with open(USAGE_FILE, "w") as f:
            json.dump(usage, f)
    except Exception as e:
        logger.warning(f"Could not write NewsAPI usage file: {e}")
        
    logger.info(f"NewsAPI Daily Call Count Tracker: {usage['count']}/100 requests consumed today.")

async def _fetch_single_query(client, api_key, query, query_id, page=1):
    params = {
        "q": query,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": 10,
        "page": page
    }
    headers = {"X-Api-Key": api_key}
    
    logger.info(f"NewsAPI Request {query_id} Params: {params}")
    resp = await client.get(NEWSAPI_URL, params=params, headers=headers)
    
    if resp.status_code == 429:
        raise Exception("NEWSAPI_RATE_LIMITED")
    if resp.status_code == 401:
        raise Exception("NEWSAPI_INVALID_KEY")
    resp.raise_for_status()
    
    return resp.json().get("articles", [])

async def fetch_articles(api_key: str, config: dict = None) -> list[dict]:
    if not api_key:
        raise ValueError("NEWSAPI_KEY_REQUIRED")
        
    config = config or {}
    topics = config.get("topics", [])
    page = config.get("page", 1)
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        if topics:
            # Dynamically fetch based on passed topics
            query = " OR ".join(topics)
            results = await asyncio.gather(
                _fetch_single_query(client, api_key, query, f"Q_Dynamic_{topics[0]}", page),
                return_exceptions=True
            )
            _increment_usage(count=1)
        else:
            # Default fallback queries
            results = await asyncio.gather(
                _fetch_single_query(client, api_key, NEWSAPI_QUERY_1, "Q1_GeoTech", page),
                _fetch_single_query(client, api_key, NEWSAPI_QUERY_2, "Q2_MarketSpace", page),
                return_exceptions=True
            )
            _increment_usage(count=2)

    all_articles = []
    failed_count = 0
    
    for i, res in enumerate(results):
        if isinstance(res, Exception):
            failed_count += 1
            logger.error(f"NewsAPI query {i+1} failed: {res}")
        else:
            all_articles.extend(res)
            
    if failed_count == len(results) and len(results) > 0:
        logger.error("All NewsAPI queries failed.")
        # Re-raise the first exception so the upstream feed.py handles it
        raise results[0]

    logger.info(f"NewsAPI returned {len(all_articles)} total articles before deduplication.")

    # Deduplicate by URL and normalize
    seen_urls = set()
    unique_articles = []
    
    # Sort raw articles by publishedAt descending before truncating
    all_articles.sort(key=lambda x: x.get("publishedAt", ""), reverse=True)

    for a in all_articles:
        url = a.get("url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            unique_articles.append(a)
            
    normalized = []
    for i, a in enumerate(unique_articles[:10]):  # Take top 10 merged results
        title = a.get("title") or "Untitled"
        desc = a.get("description") or "See full article for details."
        source = a.get("source", {}).get("name", "Unknown Source")
        url = a.get("url", "")
        published_at = a.get("publishedAt", "")
        
        normalized.append({
            "id": f"newsapi-{i}-{published_at}",
            "headline": title[:200],
            "summary": desc[:1000],
            "category": topics[0].upper() if topics else "GEOPOLITICS",
            "confidence": "MEDIUM",
            "source_count": 1,
            "why_it_matters": "Live news story — click for full context.",
            "entities": [],
            "escalation_context": "",
            "dissenting_view": "",
            "source_name": source,
            "url": url,
            "publishedAt": published_at,
        })
        
    return normalized
