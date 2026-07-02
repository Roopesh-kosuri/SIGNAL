# SIGNAL — Privacy-First Intelligence Engine & Autonomous Fact-Checking Agent

![SIGNAL Banner](./frontend/public/favicon.ico) *(Imagine a beautiful banner here)*

## The Problem
Modern news aggregation applications are plagued by black-box algorithms that optimize for engagement over truth, lacking transparency in how content is curated or ranked. Simultaneously, developers building advanced AI applications face a different problem: **cost**. Routing thousands of tokens through premium LLMs (like GPT-4o, Claude 3.5, or Gemini 1.5 Pro) rapidly drains developer API credits, making scale financially prohibitive.

## The Solution: Bring Your Own Key (BYOK)
**SIGNAL** completely sidesteps the developer cost bottleneck through a pure **BYOK (Bring Your Own Key) architecture**. 
- The backend stores **zero** API keys. 
- Users securely enter their personal API keys (OpenAI, Anthropic, Gemini, Groq, NewsAPI, etc.) directly in the frontend Settings page. 
- These keys are stored *exclusively* in the browser's `localStorage` and passed to the backend securely on a per-request basis.

This allows SIGNAL to provide enterprise-grade, multi-model intelligence analysis at **zero operational cost** to the platform itself.

---

## Engineering Highlights

### 1. Master News Aggregator (Concurrent Multi-Provider Pipeline)
Instead of relying on a single news source, SIGNAL allows users to configure multiple intelligence feeds simultaneously (e.g., NewsAPI, GNews, RSS). 
When **Master Agent Mode** is activated, the backend FastAPI server uses Python's `asyncio.gather()` to fetch raw intelligence from all configured endpoints *concurrently*. 
This raw, noisy pool of global data is then compressed and routed through a high-speed inference model (Llama-3.3-70B via **Groq**) to deduplicate stories, rank them by geopolitical/technological importance, and curate a clean "Top 7" intelligence brief.

### 2. Autonomous Deep Dive Agent (ReAct Loop via SSE)
Clicking "Deep Dive" on any story initializes an autonomous AI Agent to fact-check and expand on the context.
- The agent utilizes a **ReAct (Reasoning and Acting)** loop on the backend.
- It is equipped with tools like live **DuckDuckGo web search** and targeted **URL scraping** (via `BeautifulSoup4`).
- Rather than waiting for the entire loop to finish, the backend streams the agent's internal thoughts, actions, and observations in real-time to the React frontend using **Server-Sent Events (SSE)**.

### 3. FastAPI CORS Reverse Proxy
Browsers strictly prohibit frontends from calling external APIs (like Anthropic or NewsAPI) directly if those APIs restrict CORS. 
SIGNAL solves this elegantly via a **FastAPI Reverse Proxy**. The frontend passes the user's BYOK credentials in custom headers (`x-ai-provider`, `x-ai-key`). The backend proxy strips these headers, authenticates with the requested external service using `httpx`, and pipes the response back to the client. This bypasses CORS securely without ever saving the user's key to a database.

### 4. Tactical Design System & Motion Engine
SIGNAL isn't just functionally advanced; it's visually striking.
- **Custom CSS Custom Properties Motion Engine**: All micro-interactions (150ms), component transitions (250ms), and page routes (300ms) are mathematically synchronized using a central CSS variable system deeply integrated with Tailwind.
- **Multiple Theming**: Supports complex color maps including Dark, Light, Crimson, and System modes.

---

## Tech Stack
- **Frontend**: React (Vite), TailwindCSS, Web Speech API (TTS)
- **Backend**: FastAPI (Python), httpx, asyncio, BeautifulSoup4, DuckDuckGo-Search
- **Authentication**: Firebase Auth (The *only* centralized piece of architecture)
- **AI Integration**: Native BYOK support for OpenAI, Anthropic, Google Gemini, Groq, NVIDIA NIM, Kimi, and DeepSeek.

---

## Local Setup & Development

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/signal.git
cd signal
```

### 2. Backend Setup (FastAPI)
```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate | Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --reload
```
The API will start at `http://localhost:8000`.

### 3. Frontend Setup (React/Vite)
```bash
cd frontend
npm install
```

### 4. Firebase Configuration
Rename `frontend/.env.example` to `frontend/.env` and add your Firebase config keys.
```env
VITE_FIREBASE_API_KEY="your_api_key"
VITE_FIREBASE_AUTH_DOMAIN="your_project_id.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your_project_id"
```

### 5. Run the Frontend
```bash
npm run dev
```
The application will start at `http://localhost:5173`.

---

*SIGNAL — Intelligence curation, redefined by AI.*
