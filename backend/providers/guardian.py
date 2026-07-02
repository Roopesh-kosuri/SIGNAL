import httpx
import logging

logger = logging.getLogger("signal.providers.guardian")

# https://open-platform.theguardian.com/documentation/
GUARDIAN_URL = "https://content.guardianapis.com/search"

async def fetch_articles(api_key: str, config: dict = None) -> list[dict]:
    if not api_key:
        raise ValueError("GUARDIAN_KEY_REQUIRED")

    params = {
        "api-key": api_key,
        "q": "geopolitics OR defense OR technology OR crypto OR \"stock market\" OR space",
        "show-fields": "trailText,headline",
        "page-size": 30,
        "order-by": "newest",
    }
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(GUARDIAN_URL, params=params)
        
    if resp.status_code == 429:
        raise Exception("GUARDIAN_RATE_LIMITED")
    if resp.status_code in (401, 403):
        raise Exception("GUARDIAN_INVALID_KEY")
    resp.raise_for_status()

    data = resp.json()
    articles = data.get("response", {}).get("results", [])
    logger.info(f"Guardian returned {len(articles)} articles")

    normalized = []
    for i, a in enumerate(articles):
        fields = a.get("fields", {})
        title = fields.get("headline") or a.get("webTitle") or "Untitled"
        desc = fields.get("trailText") or "See full article for details."
        source = "The Guardian"
        url = a.get("webUrl", "")
        published_at = a.get("webPublicationDate", "")
        
        normalized.append({
            "id": f"guardian-{a.get('id', i)}-{published_at}",
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
