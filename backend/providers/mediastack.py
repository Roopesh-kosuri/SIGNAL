import httpx
import logging

logger = logging.getLogger("signal.providers.mediastack")

# https://mediastack.com/documentation
MEDIASTACK_URL = "http://api.mediastack.com/v1/news"

async def fetch_articles(api_key: str, config: dict = None) -> list[dict]:
    if not api_key:
        raise ValueError("MEDIASTACK_KEY_REQUIRED")

    params = {
        "access_key": api_key,
        "languages": "en",
        "keywords": "geopolitics defense technology crypto stock market space",
        "limit": 30,
    }
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Mediastack free tier does not support HTTPS!
        resp = await client.get(MEDIASTACK_URL, params=params)
        
    if resp.status_code == 429:
        raise Exception("MEDIASTACK_RATE_LIMITED")
    if resp.status_code in (401, 403):
        raise Exception("MEDIASTACK_INVALID_KEY")
    resp.raise_for_status()

    data = resp.json()
    articles = data.get("data", [])
    logger.info(f"Mediastack returned {len(articles)} articles")

    normalized = []
    for i, a in enumerate(articles):
        title = a.get("title") or "Untitled"
        desc = a.get("description") or "See full article for details."
        source = a.get("source", "Unknown Source")
        url = a.get("url", "")
        published_at = a.get("published_at", "")
        
        normalized.append({
            "id": f"mediastack-{i}-{published_at}",
            "headline": title[:200],
            "summary": desc[:1000],
            "category": "GEOPOLITICS",
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
