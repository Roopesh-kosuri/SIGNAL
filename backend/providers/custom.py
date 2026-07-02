import httpx
import logging
import json
from bs4 import BeautifulSoup
import urllib.parse
from functools import reduce
import operator

logger = logging.getLogger("signal.providers.custom")

def _get_from_dict(data, keys):
    try:
        if isinstance(keys, str):
            keys = keys.split('.')
        return reduce(operator.getitem, keys, data)
    except (KeyError, TypeError, IndexError):
        return None

async def fetch_articles(api_key: str = None, config: dict = None) -> list[dict]:
    if not config:
        config = {}
        
    endpoints = config.get("endpoints", [])
    single_endpoint = config.get("endpoint")
    
    if not endpoints and single_endpoint:
        endpoints = [single_endpoint]
        
    # If the user passed the URL directly in the key field (e.g. in Master Agent mode)
    if not endpoints and api_key:
        split_endpoints = [x.strip() for x in api_key.split(",") if x.strip().startswith("http://") or x.strip().startswith("https://")]
        if split_endpoints:
            endpoints = split_endpoints
        
    if not endpoints:
        logger.warning("Custom news provider call missing endpoint URLs")
        return []
        
    # Configuration parsing
    headers = config.get("headers", {})
    if api_key and config.get("apiKeyHeader") and not (api_key.startswith("http://") or api_key.startswith("https://")):
        headers[config.get("apiKeyHeader")] = api_key
        
    params = config.get("params", {})
    
    mapping = config.get("mapping", {})
    list_path = mapping.get("listPath", "")
    title_path = mapping.get("titlePath", "title")
    desc_path = mapping.get("descPath", "description")
    url_path = mapping.get("urlPath", "url")
    date_path = mapping.get("datePath", "publishedAt")
    source_path = mapping.get("sourcePath", "source.name")
    
    all_articles = []
    seen_urls = set()
    seen_headlines = set()

    for idx_end, endpoint in enumerate(endpoints):
        logger.info(f"Custom provider: Ingesting from endpoint {endpoint}")
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                resp = await client.get(endpoint, params=params, headers=headers)
            
            resp.raise_for_status()
            
            # 1. Try to parse as JSON first
            try:
                data = resp.json()
                # Navigate to the list of articles
                if list_path:
                    articles = _get_from_dict(data, list_path)
                else:
                    articles = data
                    
                if not isinstance(articles, list):
                    # Fallback if listPath was wrong
                    if isinstance(data, dict):
                        for k, v in data.items():
                            if isinstance(v, list):
                                articles = v
                                break
                    if not isinstance(articles, list):
                         raise ValueError("CUSTOM_PROVIDER_NO_LIST_FOUND")
                         
                logger.info(f"Custom provider (JSON) returned {len(articles)} articles from {endpoint}")
                
                for i, a in enumerate(articles[:10]):
                    if not isinstance(a, dict):
                        continue
                        
                    title = _get_from_dict(a, title_path) or "Untitled"
                    desc = _get_from_dict(a, desc_path) or "See full article for details."
                    source = _get_from_dict(a, source_path) or "Custom Source"
                    url = _get_from_dict(a, url_path) or ""
                    published_at = _get_from_dict(a, date_path) or ""
                    
                    norm_url = str(url).strip()
                    norm_headline = str(title).strip().lower()
                    if norm_url and norm_url in seen_urls:
                        continue
                    if norm_headline in seen_headlines:
                        continue
                        
                    seen_urls.add(norm_url)
                    seen_headlines.add(norm_headline)
                    
                    all_articles.append({
                        "id": f"custom-{idx_end}-{i}-{published_at}",
                        "headline": str(title)[:200],
                        "summary": str(desc)[:1000],
                        "category": "GEOPOLITICS",
                        "confidence": "MEDIUM",
                        "source_count": 1,
                        "why_it_matters": "Live news story — click for full context.",
                        "entities": [],
                        "escalation_context": "",
                        "dissenting_view": "",
                        "source_name": str(source),
                        "url": str(url),
                        "publishedAt": str(published_at),
                    })
                
            except (ValueError, json.JSONDecodeError):
                # 2. Fallback: Parse HTML news page (e.g. BBC News)
                logger.info(f"Custom provider: Decoding {endpoint} as HTML news website")
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                parsed_base = urllib.parse.urlparse(endpoint)
                
                articles_scraped = 0
                for a in soup.find_all('a', href=True):
                    href = a['href'].strip()
                    if href.startswith('#') or href.startswith('javascript:'):
                        continue
                        
                    # Resolve relative links
                    if not (href.startswith('http://') or href.startswith('https://')):
                        href = urllib.parse.urljoin(endpoint, href)
                        
                    title = a.get_text(separator=' ', strip=True)
                    # Standard news headlines are between 20 and 200 characters
                    if len(title) < 20 or len(title) > 200:
                        continue
                        
                    # Filter out navigational links
                    if any(x in title.lower() for x in [
                        "terms of use", "privacy policy", "accessibility help", 
                        "contact the bbc", "cookie settings", "sign in", "home", 
                        "news", "sport", "weather", "iplayer", "advertise with us",
                        "register", "sign in"
                    ]):
                        continue
                        
                    norm_url = href.strip()
                    norm_headline = title.lower()
                    if norm_url in seen_urls:
                        continue
                    if norm_headline in seen_headlines:
                        continue
                        
                    seen_urls.add(norm_url)
                    seen_headlines.add(norm_headline)
                    
                    all_articles.append({
                        "id": f"custom-html-{idx_end}-{articles_scraped}",
                        "headline": title,
                        "summary": f"Live article from {parsed_base.netloc}. Click link to view full report.",
                        "category": "GEOPOLITICS",
                        "confidence": "HIGH",
                        "source_count": 1,
                        "why_it_matters": "Extracted from custom news website.",
                        "entities": [],
                        "escalation_context": "",
                        "dissenting_view": "",
                        "source_name": parsed_base.netloc.replace("www.", ""),
                        "url": href,
                        "publishedAt": ""
                    })
                    articles_scraped += 1
                    if articles_scraped >= 10:
                        break
                        
                logger.info(f"Custom provider (HTML) extracted {articles_scraped} articles from {endpoint}")
                
        except Exception as e:
            logger.error(f"Custom provider fetch failed for {endpoint}: {e}")
            
    return all_articles
