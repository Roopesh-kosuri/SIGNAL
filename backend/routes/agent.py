import json
import logging
import httpx
import re
import asyncio
from fastapi import APIRouter, Request, Header
from fastapi.responses import StreamingResponse, JSONResponse
from duckduckgo_search import DDGS
from bs4 import BeautifulSoup
from routes.feed import sync_ddg_search

logger = logging.getLogger("signal.agent")
router = APIRouter()

SYSTEM_PROMPT = """You are a rigorous intelligence analyst agent investigating a claim.
You MUST use the provided tools to research before reaching a conclusion. Do not guess.

TOOLS:
1. search(query): Searches the web for information. Use this first.
2. scrape(url): Reads the full text content of a webpage.

FORMAT — follow this loop EXACTLY:
Thought: I need to find information about X.
Action: search("specific search query")

...Wait for Observation...

Thought: I found useful information. Let me check another source.
Action: scrape("https://example.com/article")

...Wait for Observation...

Thought: I now have enough evidence to form a verdict.
Final Answer: {"verdict": "VERIFIED|MISLEADING|UNVERIFIED|DISPUTED", "confidence": 75, "summary": "Detailed 3-5 sentence explanation of your findings and why you reached this verdict.", "supporting_sources": ["source1", "source2"], "contradicting_sources": ["source3"]}

CRITICAL RULES:
- ALWAYS do at least 2 searches before writing Final Answer.
- Output exactly ONE Action OR one Final Answer per turn.
- The Final Answer JSON MUST include: verdict, confidence (0-100), summary, supporting_sources, contradicting_sources.
- 'summary' must be a detailed multi-sentence explanation — not one word.
- Do NOT output Observation yourself — wait for the system to provide it.
- If the claim cannot be verified, say UNVERIFIED with confidence 0-30.
"""

def _parse_model_response(text: str):
    thought = ""
    action_name = None
    action_arg = None
    
    thought_match = re.search(r'Thought:\s*(.*?)(?:Action:|FinalAnswer:|Final Answer:|$)', text, re.IGNORECASE | re.DOTALL)
    if thought_match:
        thought = thought_match.group(1).strip()
    
    # Check for Action: tool(args) — use greedy match for args to handle nested parens/quotes
    action_match = re.search(r'Action:\s*(\w+)\((.+)\)\s*$', text, re.IGNORECASE | re.MULTILINE)
    if not action_match:
        # Fallback: try lazy match for simpler cases
        action_match = re.search(r'Action:\s*(\w+)\(([^)]+)\)', text, re.IGNORECASE)
    if action_match:
        action_name = action_match.group(1).strip()
        action_arg = action_match.group(2).strip().strip('"').strip("'")
        return thought, action_name, action_arg
    
    # Check for FinalAnswer: or Final Answer: (with or without space)
    final_match = re.search(r'(?:FinalAnswer|Final Answer)\s*:\s*(.*)', text, re.IGNORECASE | re.DOTALL)
    if final_match:
        raw_answer = final_match.group(1).strip()
        # Strip markdown code fences if present
        raw_answer = re.sub(r'^```(?:json)?\s*', '', raw_answer, flags=re.MULTILINE)
        raw_answer = re.sub(r'\s*```\s*$', '', raw_answer, flags=re.MULTILINE)
        # Extract JSON object
        json_match = re.search(r'\{[\s\S]*\}', raw_answer)
        if json_match:
            return thought, "FinalAnswer", json_match.group(0).strip()
    
    # Last resort: check if the entire text contains a JSON object with "verdict" key
    # (model may have skipped the FinalAnswer: prefix)
    json_fallback = re.search(r'\{[^{}]*"verdict"[^{}]*\}', text, re.IGNORECASE | re.DOTALL)
    if json_fallback:
        return thought, "FinalAnswer", json_fallback.group(0).strip()
        
    return thought, None, None

def map_messages_to_openai(gemini_messages):
    openai_messages = []
    for msg in gemini_messages:
        role = msg["role"]
        if role == "model":
            role = "assistant"
        text = msg["parts"][0]["text"]
        if msg == gemini_messages[0] and role == "user":
            openai_messages.append({"role": "system", "content": SYSTEM_PROMPT})
            text = text.replace(f"{SYSTEM_PROMPT}\n\n", "")
        openai_messages.append({"role": role, "content": text})
    return openai_messages

async def agent_generator(claim: str, api_key: str = "", groq_key: str = ""):
    messages = [
        {"role": "user", "parts": [{"text": f"{SYSTEM_PROMPT}\n\nInvestigate this claim: \"{claim}\""}]}
    ]
    
    yield f"data: {json.dumps({'type': 'system', 'text': 'Agent initialized.'})}\n\n"
    
    loop_count = 0
    MAX_LOOPS = 10
    
    while loop_count < MAX_LOOPS:
        loop_count += 1
        
        body = {
            "contents": messages,
            "generationConfig": {"temperature": 0.2}
        }
        
        use_groq = not api_key
        part = None
        
        if not use_groq:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    res = await client.post(url, json=body)
                    res.raise_for_status()
                    data = res.json()
                    part = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            except Exception as e:
                logger.warning(f"Gemini API failed or rate-limited: {e} — falling back to Groq.")
                use_groq = True
                yield f"data: {json.dumps({'type': 'system', 'text': 'Gemini rate-limit or error. Switching to Groq fallback.'})}\n\n"

        if use_groq:
            if not groq_key:
                yield f"data: {json.dumps({'type': 'error', 'text': 'Both Gemini and Groq keys are missing or rate limited. Cannot proceed.'})}\n\n"
                break
                
            openai_messages = map_messages_to_openai(messages)
            headers = {"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"}
            groq_body = {
                "model": "llama-3.3-70b-versatile",
                "messages": openai_messages,
                "temperature": 0.2
            }
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    res = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=groq_body)
                    res.raise_for_status()
                    data = res.json()
                    part = data["choices"][0]["message"]["content"]
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'text': f'Groq Fallback API Error: {str(e)}'})}\n\n"
                break
            
        messages.append({"role": "model", "parts": [{"text": part}]})
        
        thought, action, arg = _parse_model_response(part)
        
        if thought:
            yield f"data: {json.dumps({'type': 'thought', 'text': thought})}\n\n"
            
        if action == "FinalAnswer":
            yield f"data: {json.dumps({'type': 'final', 'result': arg})}\n\n"
            break
        elif action == "search":
            yield f"data: {json.dumps({'type': 'tool', 'name': 'search', 'args': arg})}\n\n"
            try:
                cleaned_query = re.sub(r'["\'()]', '', arg.strip())
                def do_search():
                    return sync_ddg_search(cleaned_query, 1)
                search_results = await asyncio.to_thread(do_search)
                obs = json.dumps(search_results)
            except Exception as e:
                obs = f"Search failed: {e}"
            yield f"data: {json.dumps({'type': 'observation', 'text': obs})}\n\n"
            messages.append({"role": "user", "parts": [{"text": f"Observation: {obs}"}]})
            
        elif action == "scrape":
            yield f"data: {json.dumps({'type': 'tool', 'name': 'scrape', 'args': arg})}\n\n"
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    html_res = await client.get(arg)
                    soup = BeautifulSoup(html_res.text, "html.parser")
                    paragraphs = soup.find_all("p")
                    text = " ".join([p.get_text() for p in paragraphs])
                    words = text.split()
                    if len(words) > 1000:
                        text = " ".join(words[:1000]) + "..."
                    obs = text
            except Exception as e:
                obs = f"Scrape failed: {e}"
            yield f"data: {json.dumps({'type': 'observation', 'text': f'{obs[:2000]}...'})}\n\n"
            messages.append({"role": "user", "parts": [{"text": f"Observation: {obs[:2000]}"}]})
        else:
            obs = "Error: You must output a valid Action like search(\"query\") or FinalAnswer: {...}"
            messages.append({"role": "user", "parts": [{"text": f"Observation: {obs}"}]})
            
    if loop_count >= MAX_LOOPS:
        yield f"data: {json.dumps({'type': 'system', 'text': 'Forcing final verdict due to step limit.'})}\n\n"
        messages.append({"role": "user", "parts": [{"text": "SYSTEM: You have reached the maximum allowed search steps. You MUST immediately use the final_verdict tool based on the evidence you have gathered so far. Do not search again."}]})
        
        use_groq = not api_key
        part = None
        
        if not use_groq:
            body = {
                "contents": messages,
                "generationConfig": {"temperature": 0.2}
            }
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    res = await client.post(url, json=body)
                    res.raise_for_status()
                    data = res.json()
                    part = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            except Exception as e:
                logger.warning(f"Gemini API timeout handler failed: {e} — falling back to Groq.")
                use_groq = True

        if use_groq and groq_key:
            openai_messages = map_messages_to_openai(messages)
            headers = {"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"}
            groq_body = {
                "model": "llama-3.3-70b-versatile",
                "messages": openai_messages,
                "temperature": 0.2
            }
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    res = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=groq_body)
                    res.raise_for_status()
                    data = res.json()
                    part = data["choices"][0]["message"]["content"]
            except Exception as e:
                logger.error(f"Groq final verdict fallback failed: {e}")

        if part:
            thought, action, arg = _parse_model_response(part)
            if thought:
                yield f"data: {json.dumps({'type': 'thought', 'text': thought})}\n\n"
            if action == "FinalAnswer" and arg:
                yield f"data: {json.dumps({'type': 'final', 'result': arg})}\n\n"
            else:
                fallback_json = json.dumps({
                    "verdict": "UNVERIFIED",
                    "confidence": 0,
                    "summary": "Agent exhausted all search steps without reaching a concrete conclusion. The claim could not be independently verified with available information.",
                    "supporting_sources": [],
                    "contradicting_sources": []
                })
                yield f"data: {json.dumps({'type': 'final', 'result': fallback_json})}\n\n"
        else:
            fallback_json = json.dumps({
                "verdict": "UNVERIFIED",
                "confidence": 0,
                "summary": "Agent failed to connect or generate a final answer. Geopolitical claim remains unverified.",
                "supporting_sources": [],
                "contradicting_sources": []
            })
            yield f"data: {json.dumps({'type': 'final', 'result': fallback_json})}\n\n"

@router.post("/agent")
async def run_agent(request: Request, x_ai_key: str = Header(None), x_groq_key: str = Header(None)):
    try:
        data = await request.json()
    except:
        return JSONResponse({"error": "invalid_json"}, status_code=400)
        
    claim = data.get("claim", "")
    api_key = data.get("geminiKey") or x_ai_key
    groq_key = data.get("groqKey") or x_groq_key
    
    if not api_key and not groq_key:
        return JSONResponse({"error": "Missing API keys. Please configure Gemini or Groq key in Settings."}, status_code=401)
        
    return StreamingResponse(agent_generator(claim, api_key, groq_key), media_type="text/event-stream")
