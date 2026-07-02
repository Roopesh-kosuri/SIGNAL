import httpx
import logging

logger = logging.getLogger("signal.providers.gnews")

# https://gnews.io/docs/v4
GNEWS_URL = "https://gnews.io/api/v4/search"

async def fetch_articles(api_key: str, config: dict = None) -> list[dict]:
    if not api_key:
        raise ValueError("GNEWS_KEY_REQUIRED")

    page = config.get("page", 1) if config else 1
    params = {
        "apikey": api_key,
        "q": config.get("topics", ["geopolitics OR defense OR technology OR crypto OR \"stock market\" OR space OR NASA"])[0] if config and config.get("topics") else "geopolitics OR defense OR technology OR crypto OR \"stock market\" OR space OR NASA",
        "lang": "en",
        "max": 10,
        "page": page
    }
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(GNEWS_URL, params=params)
        
    if resp.status_code == 429:
        raise Exception("GNEWS_RATE_LIMITED")
    if resp.status_code in (401, 403):
        raise Exception("GNEWS_INVALID_KEY")
    resp.raise_for_status()

    data = resp.json()
    articles = data.get("articles", [])
    logger.info(f"GNews returned {len(articles)} articles")

    normalized = []
    for i, a in enumerate(articles):
        title = a.get("title") or "Untitled"
        desc = a.get("description") or a.get("content") or "See full article for details."
        source = a.get("source", {}).get("name", "Unknown Source")
        url = a.get("url", "")
        published_at = a.get("publishedAt", "")
        
        normalized.append({
            "id": f"gnews-{i}-{published_at}",
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
