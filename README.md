# SIGNAL — Privacy-First News Intelligence Platform & Autonomous Fact-Checking Agent

SIGNAL is a full-stack open-source intelligence (OSINT) workstation designed to aggregate global news and analyze geopolitical and technological events without algorithmic bias. It features a stateless architecture, asynchronous multi-provider news fetching, a real-time 3D satellite tracking dashboard, and an autonomous, streaming fact-checking agent loop.

---

## 💡 The Core Philosophy: True BYOK Architecture

Most modern AI tools run on a SaaS subscription model or require data-logging middleware. SIGNAL sidesteps this entirely by using a strict **Bring Your Own Key (BYOK)** setup.

* **Complete Privacy:** The platform has no central database storing user credentials. 
* **Local Isolation:** Your API keys (OpenAI, Anthropic, Gemini, Groq, NewsAPI, etc.) are saved directly in your browser's secure `localStorage`.
* **Transient API Transit:** Keys are passed through the backend server solely inside secure request headers. They are never cached, written to a disk, or logged, giving you 100% control over your data and API usage limits.

---

## 🚀 Engineering Highlights

### 1. Concurrent Multi-Provider Aggregator
Instead of relying on a single news source, SIGNAL aggregates concurrent feeds from premium news platforms, custom scrapers, and RSS arrays. When **Master Agent Mode** is activated, the FastAPI backend utilizes Python's `asyncio.gather()` to query all endpoints simultaneously. The raw data is then processed and filtered using high-speed Llama-3.3-70B inference via Groq to deduplicate headlines and output a clean, highly curated strategic summary.

### 2. Autonomous Fact-Checking Agent (Streaming ReAct Loop)
Clicking "Deep Dive" on any news item initiates a multi-turn **ReAct (Reason + Act)** autonomous agent loop. Equipped with live DuckDuckGo search access and web-scraping utilities (`BeautifulSoup4`), the agent crawls source material to evaluate claims. The backend streams the agent’s intermediate thoughts, tool selections, and final observations to the frontend in real time using Server-Sent Events (SSE).

### 3. FastAPI CORS Reverse Proxy
Browsers block direct frontend requests to external services like Anthropic or NewsAPI when those endpoints restrict cross-origin resource sharing. SIGNAL resolves this cleanly by running an internal reverse proxy using FastAPI and `httpx`. The frontend securely injects the client's local API keys into transient headers, which the backend proxy leverages to fetch data, stripping out the tokens before transmitting data streams back to the browser.

### 4. Custom Token-Driven Motion Engine
The interface uses a bespoke CSS configuration integrated into a clean, minimalist layout. It completely avoids bloated UI libraries in favor of explicit, micro-synchronized transition delays (150ms for micro-actions, 250ms for layout changes) to create a highly responsive terminal experience across multiple visual themes (Dark, Light, Crimson).

---

## 📦 System Architecture & Stack

### Frontend
* **Core:** React 18, Vite 5, TailwindCSS
* **Geospatial Analytics:** CesiumJS & React Resium (3D satellite telemetry visualization using local `skyfield` and `sgp4` calculations)
* **Voice & Audio:** Web Speech API (continuous Speech-to-Text and interactive text response reading) and Web Audio API (tactile interface click feedback tones)
* **Auth System:** Firebase Authentication with a built-in stateless client-side Demo Mode fallback

### Backend
* **Core Framework:** Async Python FastAPI (v0.111.0) running under Uvicorn ASGI
* **Scraping Pipeline:** `BeautifulSoup4` & `feedparser`
* **Telemetry Mechanics:** `skyfield` & `sgp4` propagating NORAD Two-Line Element (TLE) positional data for satellites
* **Security Layer:** SlowAPI rate-limiting headers, secure CSP configurations, and custom metadata signature shielding

---

## 🔧 Local Installation & Setup

Ensure you have **Node.js (v18+)** and **Python (v3.10+)** initialized on your system.

### 1. Clone the Project
```bash
git clone [https://github.com/Roopesh-kosuri/SIGNAL.git](https://github.com/Roopesh-kosuri/SIGNAL.git)
cd SIGNAL
2. Backend Environment Setup
Bash
cd backend

# Create and activate a virtual environment
python -m venv venv

# On Windows:
.\venv\Scripts\activate

# On Mac/Linux:
source venv/bin/activate

# Install requirements and start the application server
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
The backend API will run live at: http://localhost:8000

3. Frontend App Compilation & Launch
Open a second terminal window and execute:

Bash
cd frontend

# Install client packages
npm install

# Start the application interface
npm run dev
The interface client is now active at: http://localhost:5173

⚙️ Initial Configuration
Once the workstation launches, you can immediately access the workspace via the Demo Mode Gateway node. Head directly to the [SETTINGS] section to mount your processing infrastructure:

API Setup: Input your personal workspace tokens for Gemini, Groq, Claude, or OpenAI.

Search Grounding: Activating your Gemini core turns on real-time Google Search grounding parameters automatically across verification layers.

Orbital Uplink: Paste a free personal Cesium ION token to activate the rendering matrix inside the 3D Satellite Globe interface.
