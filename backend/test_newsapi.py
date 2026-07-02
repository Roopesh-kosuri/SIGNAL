import asyncio
import httpx

async def test():
    r = await httpx.AsyncClient().get('https://newsapi.org/v2/everything', params={'q': 'geopolitics OR NATO OR sanctions OR nuclear OR defense OR military OR semiconductor OR cyber OR "stock market" OR crypto OR bitcoin OR satellite OR NASA'}, headers={'X-Api-Key': 'dummy'})
    print(r.status_code, r.text)

asyncio.run(test())
