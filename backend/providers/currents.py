import httpx
import logging

logger = logging.getLogger("signal.providers.currents")

# https://currentsapi.services/en/docs/
CURRENTS_URL = "https://api.currentsapi.services/v1/search"

async def fetch_articles(api_key: str, config: dict = None) -> list[dict]:
    if not api_key:
        raise ValueError("CURRENTS_KEY_REQUIRED")

    params = {
        "apiKey": api_key,
        "keywords": "geopolitics defense technology crypto stock market space satellite",
        "language": "en",
        "limit": 30,
    }
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(CURRENTS_URL, params=params)
        
    if resp.status_code == 429:
        raise Exception("CURRENTS_RATE_LIMITED")
    if resp.status_code in (401, 403):
        raise Exception("CURRENTS_INVALID_KEY")
    resp.raise_for_status()

    data = resp.json()
    articles = data.get("news", [])
    logger.info(f"Currents returned {len(articles)} articles")

    normalized = []
    for i, a in enumerate(articles):
        title = a.get("title") or "Untitled"
        desc = a.get("description") or "See full article for details."
        source = "Currents" # Currents API sometimes provides author, but source requires additional mapping
        url = a.get("url", "")
        published_at = a.get("published", "")
        
        normalized.append({
            "id": f"currents-{a.get('id', i)}-{published_at}",
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
