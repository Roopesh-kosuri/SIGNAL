import httpx
from fastapi import APIRouter, Header, HTTPException
from typing import Optional, List
from pydantic import BaseModel
import logging
from skyfield.api import EarthSatellite, load
import datetime
import json
import time

logger = logging.getLogger("signal.orbital")

router = APIRouter(prefix="/orbital", tags=["orbital"])

# ─── TLE Cache (Persistent Disk Cache, 2-hour TTL) ───────────────────────────
import os
_tle_cache: dict = {}
TLE_FILE_PATH = os.path.join(os.path.dirname(__file__), "..", "tle_cache.txt")
TLE_CACHE_TTL = 7200  # 2 hours

def _get_cached_tle() -> str | None:
    # Check memory cache first
    if "data" in _tle_cache and (time.time() - _tle_cache.get("ts", 0)) < TLE_CACHE_TTL:
        return _tle_cache["data"]
    # Check disk cache
    if os.path.exists(TLE_FILE_PATH):
        try:
            mtime = os.path.getmtime(TLE_FILE_PATH)
            if (time.time() - mtime) < TLE_CACHE_TTL:
                with open(TLE_FILE_PATH, "r", encoding="utf-8") as f:
                    data = f.read()
                if data.strip():
                    _tle_cache["data"] = data
                    _tle_cache["ts"] = mtime
                    return data
        except Exception as e:
            logger.error(f"Failed to read disk TLE cache: {e}")
    return None

def _cache_tle(text: str):
    _tle_cache["data"] = text
    _tle_cache["ts"] = time.time()
    try:
        with open(TLE_FILE_PATH, "w", encoding="utf-8") as f:
            f.write(text)
    except Exception as e:
        logger.error(f"Failed to write disk TLE cache: {e}")

class SatPosition(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    alt: float

class IntelRequest(BaseModel):
    satellite_id: str

@router.get("/track", response_model=List[SatPosition])
async def get_orbital_track():
    tle_text = _get_cached_tle()
    
    if not tle_text:
        url = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"
        async with httpx.AsyncClient(follow_redirects=True) as client:
            try:
                response = await client.get(url, timeout=20.0)
                if response.status_code == 200:
                    tle_text = response.text
                    _cache_tle(tle_text)
                    logger.info("TLE data fetched and cached from Celestrak")
                elif response.status_code == 403 and os.path.exists(TLE_FILE_PATH):
                    logger.info("Celestrak returned 403 (unchanged). Serving cached TLE data.")
                    with open(TLE_FILE_PATH, "r", encoding="utf-8") as f:
                        tle_text = f.read()
                    # Touch file to reset modified time so we wait another 2 hours
                    try:
                        os.utime(TLE_FILE_PATH, None)
                    except Exception:
                        pass
                else:
                    response.raise_for_status()
            except Exception as e:
                logger.error(f"Failed to fetch TLE data: {e}")
                # Fallback to expired cache on query errors if present
                if os.path.exists(TLE_FILE_PATH):
                    logger.info("Celestrak fetch failed. Serving expired disk TLE cache.")
                    with open(TLE_FILE_PATH, "r", encoding="utf-8") as f:
                        tle_text = f.read()
                
                if not tle_text:
                    raise HTTPException(status_code=503, detail="Celestrak TLE feed unavailable. Try again in a moment.")

    lines = [l for l in tle_text.strip().split('\n') if l.strip()]
    sats = []

    ts = load.timescale()
    t = ts.now()

    # First pass: always grab ISS/Zarya
    iss_sat = None
    for i in range(0, len(lines) - 2, 3):
        name = lines[i].strip()
        if "ISS" in name.upper() or "ZARYA" in name.upper():
            try:
                satellite = EarthSatellite(lines[i+1].strip(), lines[i+2].strip(), name, ts)
                geocentric = satellite.at(t)
                subpoint = geocentric.subpoint()
                iss_sat = SatPosition(
                    id=lines[i+1][2:7].strip(),
                    name=name,
                    lat=subpoint.latitude.degrees,
                    lon=subpoint.longitude.degrees,
                    alt=subpoint.elevation.m
                )
                break
            except Exception:
                pass

    # Second pass: collect up to 149 more satellites
    limit_triples = 149 * 3
    for i in range(0, min(len(lines) - 2, limit_triples), 3):
        name = lines[i].strip()
        if not name or (iss_sat and ("ISS" in name.upper() or "ZARYA" in name.upper())):
            continue
        line1 = lines[i+1].strip() if i+1 < len(lines) else ""
        line2 = lines[i+2].strip() if i+2 < len(lines) else ""
        if not line1.startswith("1 ") or not line2.startswith("2 "):
            continue
        try:
            satellite = EarthSatellite(line1, line2, name, ts)
            geocentric = satellite.at(t)
            subpoint = geocentric.subpoint()
            sats.append(SatPosition(
                id=line1[2:7].strip(),
                name=name,
                lat=subpoint.latitude.degrees,
                lon=subpoint.longitude.degrees,
                alt=subpoint.elevation.m
            ))
        except Exception as e:
            logger.debug(f"Skipping satellite {name}: {e}")
            continue

    # Insert ISS at front
    if iss_sat:
        sats.insert(0, iss_sat)

    logger.info(f"Returning {len(sats)} satellite positions")
    return sats

@router.post("/intel")
async def get_orbital_intel(
    req: IntelRequest,
    x_groq_key: Optional[str] = Header(None)
):
    if not x_groq_key:
        raise HTTPException(status_code=401, detail="Groq API key required for orbital intelligence")

    prompt = (
        f"You are the Orbital Intelligence Director for SIGNAL. "
        f"Analyze this satellite (ID/Name: {req.satellite_id}). "
        f"Explain its strategic role, mission profile, and whether it is an observational, "
        f"communication, or military asset. Return the intel in our strict JSON FeedResponse schema "
        f"like so: {{ \"title\": \"...\", \"summary\": \"...\", \"content\": \"...\", \"source\": \"...\", \"category\": \"ORBITAL\" }}"
    )

    headers = {
        "Authorization": f"Bearer {x_groq_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": "You are a tactical AI. Always respond in pure JSON without markdown blocks."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"}
    }

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post("https://api.groq.com/openai/v1/chat/completions", json=payload, headers=headers, timeout=20.0)
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            
            parsed_content = json.loads(content)
            
            return {
                "id": f"orbital-{req.satellite_id}",
                "title": parsed_content.get("title", f"Intel: {req.satellite_id}"),
                "summary": parsed_content.get("summary", "Analysis complete."),
                "content": parsed_content.get("content", content),
                "source": parsed_content.get("source", "Groq AI"),
                "category": parsed_content.get("category", "ORBITAL"),
                "timestamp": datetime.datetime.utcnow().isoformat() + "Z"
            }
        except Exception as e:
            logger.error(f"Groq API error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
