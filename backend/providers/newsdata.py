import httpx
import logging

logger = logging.getLogger("signal.providers.newsdata")

# https://newsdata.io/docs
NEWSDATA_URL = "https://newsdata.io/api/1/news"

async def fetch_articles(api_key: str, config: dict = None) -> list[dict]:
    if not api_key:
        raise ValueError("NEWSDATA_KEY_REQUIRED")

    params = {
        "apikey": api_key,
        "q": "geopolitics OR defense OR technology OR crypto OR bitcoin OR \"stock market\" OR space OR satellite",
        "language": "en",
    }
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(NEWSDATA_URL, params=params)
        
    if resp.status_code == 429:
        raise Exception("NEWSDATA_RATE_LIMITED")
    if resp.status_code in (401, 403):
        raise Exception("NEWSDATA_INVALID_KEY")
    resp.raise_for_status()

    data = resp.json()
    articles = data.get("results", [])
    logger.info(f"NewsData returned {len(articles)} articles")

    normalized = []
    for i, a in enumerate(articles[:30]):
        title = a.get("title") or "Untitled"
        desc = a.get("description") or a.get("content") or "See full article for details."
        source = a.get("source_id", "Unknown Source")
        url = a.get("link", "")
        published_at = a.get("pubDate", "")
        
        normalized.append({
            "id": f"newsdata-{i}-{published_at}",
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
