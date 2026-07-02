# 🛰️ SIGNAL // Privacy-First Intelligence Engine & Autonomous Fact-Checking Agent

> **Tactical OSINT curation and multi-model AI analysis workstation, driven by a strict zero-cost stateless architecture.**

---

## 🛑 The Problem
Modern news aggregation applications are plagued by black-box algorithms that optimize for engagement over truth, completely lacking transparency in how content is curated, filtered, or ranked. 

Simultaneously, developers building advanced AI applications face a massive financial bottleneck: routing thousands of tokens through premium LLMs (like GPT-4o, Claude 3.5, or Gemini 1.5 Pro) rapidly drains developer API credits, making scale financially prohibitive for open-source independent builds.

## ⚡ The Solution: Bring Your Own Key (BYOK)
SIGNAL completely sidesteps the developer cost bottleneck through a pure, highly secure **Bring Your Own Key (BYOK)** architecture.

* **Absolute Core Privacy:** The backend database stores exactly zero API keys.
* **Local Security Sandbox:** Operators securely enter their personal API keys (OpenAI, Anthropic, Gemini, Groq, NewsAPI, etc.) directly within the interface Settings page.
* **Stateless Persistence:** These credentials are saved exclusively inside the host browser's sandboxed `localStorage` and passed to the backend proxy securely on a per-request transient basis. 

This enables SIGNAL to deliver enterprise-grade, multi-model intelligence analysis at zero operational cost to the platform itself.

---

🧠 Core Engineering Highlights

1. Master News Aggregator (Concurrent Multi-Provider Pipeline)
Instead of relying on a single isolated news source, SIGNAL allows users to configure multiple intelligence feeds simultaneously (e.g., NewsAPI, GNews, RSS arrays). When **Master Agent Mode** is engaged, the backend FastAPI server utilizes Python's asynchronous `asyncio.gather()` matrix to fetch raw intelligence streams from all configured endpoints concurrently. 

This raw, noisy pool of global telemetry data is then compressed and routed through a high-speed inference engine (Llama-3.3-70B via Groq) to deduplicate stories, rank them by geopolitical/technological priority weights, and synthesize a clean, hyper-focused "Top 7" tactical intelligence brief.

2. Autonomous Deep Dive Agent (ReAct Loop via SSE)
Triggering a "Deep Dive" assessment on any target story initializes an autonomous AI Agent tasked with fact-checking and expanding regional context.
* **Reasoning and Acting:** The agent coordinates an internal **ReAct loop (Reason + Act)** on the backend processing core.
* **Live Toolsets:** It is fully equipped with live DuckDuckGo web search nodes and target HTML scrapers built on `BeautifulSoup4`.
* **Real-Time Streaming:** Rather than blocking the user thread until execution terminates, the backend streams the agent's internal thoughts, actions, and empirical observations live to the React frontend using Server-Sent Events (SSE).

3. FastAPI CORS Reverse Proxy
Web browsers strictly prohibit client frontends from calling external endpoints (like Anthropic or NewsAPI) directly if those providers restrict cross-origin resource sharing. SIGNAL addresses this seamlessly via a custom FastAPI Reverse Proxy layout. 

The frontend passes the operator's BYOK credentials inside hidden, non-logged headers (`x-ai-provider`, `x-ai-key`). The backend proxy strips these headers, authenticates with the target external service via `httpx`, and pipes the raw data stream back to the client. This completely bypasses CORS restrictions without ever exposing or saving credentials to a persistent disk.

4. Tactical Design System & Motion Engine
* **Synchronized Frames:** All micro-interactions (150ms), component transitions (250ms), and system page routes (300ms) are mathematically bound using a centralized CSS variable tokens engine deeply integrated into the custom stylesheet architecture.
* **Multi-Theme Arrays:** Features fully mapped custom tactical skins including Dark, Light, Crimson, and native System modes.

---

🛠️ System Technology Stack

| Architecture Layer | Technologies Utilized |
| :--- | :--- |
| **Frontend UI Suite** | React 18 (Vite), TailwindCSS, Web Speech API (TTS Responses) |
| **Backend Processing** | Async FastAPI (Python), `httpx`, `asyncio`, `BeautifulSoup4`, `duckduckgo-search` |
| **Identity & Access** | Firebase Authentication (The only centralized architectural sync point) |
| **Inference Routing** | Native BYOK bindings for OpenAI, Anthropic, Google Gemini, Groq, NVIDIA NIM, Kimi, and DeepSeek |

---

🚀 Local Installation & Deployment Matrix

Follow these precise execution parameters to initialize your personal instance of SIGNAL locally.

📥 1. Clone the Architecture Root
```bash
git clone [https://github.com/Roopesh-kosuri/SIGNAL.git](https://github.com/Roopesh-kosuri/SIGNAL.git)
cd SIGNAL
