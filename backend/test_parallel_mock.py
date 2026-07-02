import asyncio
import logging
import json

# Setup logging
logging.basicConfig(level=logging.INFO, format='INFO:%(name)s:%(message)s')
logger = logging.getLogger("signal.providers.newsapi")

# Mock httpx to intercept calls
class MockResponse:
    def __init__(self, json_data, status_code=200):
        self.json_data = json_data
        self.status_code = status_code
    def json(self):
        return self.json_data
    def raise_for_status(self):
        pass

class MockAsyncClient:
    def __init__(self, **kwargs): pass

    async def __aenter__(self): return self
    async def __aexit__(self, exc_type, exc, tb): pass
    async def get(self, url, params=None, headers=None):
        q = params.get("q", "")
        if "geopolitics" in q:
            logger.info("MOCK: Intercepted request for Q1 (GeoTech)")
            return MockResponse({"articles": [
                {"title": "Global Defense Summit Outlines Cyber Threats", "url": "url1", "publishedAt": "2026-06-26T12:00:00Z"},
                {"title": "NATO Sanctions Unveiled", "url": "url2", "publishedAt": "2026-06-25T12:00:00Z"}
            ]})
        elif "stock market" in q:
            logger.info("MOCK: Intercepted request for Q2 (MarketSpace)")
            return MockResponse({"articles": [
                {"title": "Crypto Markets Rally Behind New Bitcoin ETF", "url": "url3", "publishedAt": "2026-06-26T13:00:00Z"},
                {"title": "NASA Satellite Captures Deep Space Anomaly", "url": "url4", "publishedAt": "2026-06-24T12:00:00Z"}
            ]})
        return MockResponse({"articles": []})

import httpx
httpx.AsyncClient = MockAsyncClient

from providers import newsapi

async def run_test():
    articles = await newsapi.fetch_articles("dummy_key")
    print("\n--- Final Merged Output ---")
    for a in articles:
        print(f"[{a['publishedAt']}] {a['headline']} (from {a['url']})")

asyncio.run(run_test())
