import feedparser
import logging
from datetime import datetime

logger = logging.getLogger("signal.providers.rss")

async def fetch_articles(api_key: str = None, config: dict = None) -> list[dict]:
    # RSS doesn't strictly need an API key
    feed_urls = config.get("urls", []) if config else []
    if not feed_urls and api_key:
        feed_urls = [u.strip() for u in api_key.split(",") if u.strip()]
        
    if not feed_urls:
        feed_urls = [
            "http://feeds.bbci.co.uk/news/world/rss.xml",
            "https://www.aljazeera.com/xml/rss/all.xml",
            "https://moxie.foxnews.com/google-publisher/world.xml",
            "https://www.space.com/feeds/all",
            "https://www.coindesk.com/arc/outboundfeeds/rss/"
        ]

    normalized = []
    
    for url in feed_urls[:3]: # Max 3 feeds to avoid long blocking
        try:
            feed = feedparser.parse(url)
            source_name = feed.feed.get("title", "RSS Feed")
            
            for i, entry in enumerate(feed.entries[:15]): # Top 15 from each
                title = entry.get("title", "Untitled")
                desc = entry.get("summary", "")
                link = entry.get("link", "")
                published_at = entry.get("published", "")
                
                normalized.append({
                    "id": f"rss-{source_name}-{i}-{published_at}",
                    "headline": title[:200],
                    "summary": desc[:1000] or "No summary available.",
                    "category": "GEOPOLITICS",
                    "confidence": "MEDIUM",
                    "source_count": 1,
                    "why_it_matters": "Live news story — click for full context.",
                    "entities": [],
                    "escalation_context": "",
                    "dissenting_view": "",
                    "source_name": source_name,
                    "url": link,
                    "publishedAt": published_at,
                })
        except Exception as e:
            logger.error(f"Error parsing RSS feed {url}: {e}")
            
    # Sort by date (rough approximation, feedparser returns varied date formats, so we just return them)
    # Since RSS feeds are usually chronological, we just take the first N
    return normalized[:40]
