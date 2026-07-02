import asyncio
import httpx
import json

BASE_URL = "http://localhost:8000"

async def test_phase_1():
    print("Testing Phase 1 (Extraction)...")
    url = f"{BASE_URL}/api/extract?url=https://en.wikipedia.org/wiki/Artificial_intelligence"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200 and "text" in resp.json():
                print("  [PASS] Phase 1: /api/extract returned 200 OK and contains 'text'.")
                return True
            else:
                print(f"  [FAIL] Phase 1: Unexpected response: {resp.status_code} {resp.text}")
                return False
    except Exception as e:
        print(f"  [FAIL] Phase 1: Exception: {e}")
        return False

async def test_phase_2_topic():
    print("Testing Phase 2 (Topic Feed)...")
    url = f"{BASE_URL}/api/feed"
    headers = {"x-news-topics": "TECH"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=headers)
            # It might require keys, so 401/400 is acceptable, but 500 is failure.
            if resp.status_code < 500:
                print(f"  [PASS] Phase 2 (Topic): /api/feed returned gracefully with {resp.status_code}.")
                return True
            else:
                print(f"  [FAIL] Phase 2 (Topic): /api/feed crashed with {resp.status_code}.")
                return False
    except Exception as e:
        print(f"  [FAIL] Phase 2 (Topic): Exception: {e}")
        return False

async def test_phase_2_chat():
    print("Testing Phase 2 (Chat Proxy)...")
    url = f"{BASE_URL}/api/chat"
    headers = {"x-ai-provider": "openai", "x-ai-key": "dummy_key"}
    body = {"messages": [{"role": "user", "content": "hi"}]}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=body)
            if resp.status_code in [401, 400, 403]:
                print(f"  [PASS] Phase 2 (Chat Proxy): /api/chat caught invalid key safely with {resp.status_code}.")
                return True
            else:
                print(f"  [FAIL] Phase 2 (Chat Proxy): /api/chat returned {resp.status_code}.")
                return False
    except Exception as e:
        print(f"  [FAIL] Phase 2 (Chat Proxy): Exception: {e}")
        return False

async def test_phase_3():
    print("Testing Phase 3 (SSE Agent)...")
    url = f"{BASE_URL}/api/agent"
    body = {"claim": "Dummy claim", "geminiKey": "dummy_key"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            async with client.stream("POST", url, json=body) as response:
                if response.status_code == 200 or response.status_code == 401:
                    # Just read the first line to verify stream works
                    try:
                        async for chunk in response.aiter_lines():
                            if chunk.strip():
                                print(f"  [PASS] Phase 3: /api/agent stream opened and returned a chunk: {chunk[:50]}...")
                                return True
                    except Exception as e:
                        print(f"  [FAIL] Phase 3: Stream read error: {e}")
                        return False
                print(f"  [FAIL] Phase 3: /api/agent returned {response.status_code}")
                return False
    except Exception as e:
        print(f"  [FAIL] Phase 3: Exception: {e}")
        return False

async def test_phase_4():
    print("Testing Phase 4 (Master Agent)...")
    url = f"{BASE_URL}/api/master-feed"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            if resp.status_code < 500 and resp.status_code != 404:
                print(f"  [PASS] Phase 4: /api/master-feed is alive (Status: {resp.status_code}).")
                return True
            else:
                print(f"  [FAIL] Phase 4: /api/master-feed returned {resp.status_code}.")
                return False
    except Exception as e:
        print(f"  [FAIL] Phase 4: Exception: {e}")
        return False

async def main():
    print("="*50)
    print("SIGNAL SYSTEM DIAGNOSTIC REPORT")
    print("="*50)
    await test_phase_1()
    await test_phase_2_topic()
    await test_phase_2_chat()
    await test_phase_3()
    await test_phase_4()
    print("="*50)
    print("Diagnostic Complete.")

if __name__ == "__main__":
    asyncio.run(main())
