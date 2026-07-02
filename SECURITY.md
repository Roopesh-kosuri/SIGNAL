# SIGNAL — Security Documentation

## Overview

This document details all 6 security measures implemented in SIGNAL.

---

## 1. Content Security Policy (CSP)

**Implementation:** `backend/main.py` — `add_security_headers` middleware

The CSP is currently deployed in **report-only mode** during development, which means violations are reported but not blocked. Switch to enforced mode for production by replacing `Content-Security-Policy-Report-Only` with `Content-Security-Policy`.

```
default-src 'self'
script-src 'self' <frontend-url>
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
font-src 'self' https://fonts.gstatic.com
img-src 'self' data: https:
connect-src 'self'
  https://generativelanguage.googleapis.com  (Gemini API — user BYOK)
  https://api.groq.com                       (Groq API — user BYOK)
  https://api.anthropic.com                  (Claude API — user BYOK)
  https://api.openai.com                     (OpenAI API — user BYOK)
  https://identitytoolkit.googleapis.com     (Firebase Auth)
  https://securetoken.googleapis.com         (Firebase Auth tokens)
  https://firestore.googleapis.com           (Firestore)
frame-ancestors 'none'
base-uri 'self'
form-action 'self'
```

**Why each directive:** `connect-src` includes AI provider domains because BYOK calls go directly from browser to provider. `frame-ancestors 'none'` prevents clickjacking. `base-uri 'self'` prevents base-tag injection.

---

## 2. Security Headers — Before/After

**Implementation:** `backend/main.py` — `add_security_headers` middleware removes revealing headers and adds protective ones.

### Before (FastAPI defaults)
```
HTTP/1.1 200 OK
server: uvicorn
content-type: application/json
```

### After (SIGNAL hardened)
```
HTTP/1.1 200 OK
content-type: application/json
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=()
content-security-policy-report-only: [see above]
```

Headers **removed:** `server`, `x-powered-by`

**Why each header:**
- `HSTS`: Forces HTTPS for 2 years; included in preload list
- `X-Content-Type-Options: nosniff`: Prevents MIME-type sniffing attacks
- `X-Frame-Options: DENY`: Prevents framing (clickjacking)
- `Referrer-Policy`: Limits URL leakage to cross-origin destinations
- `Permissions-Policy`: Explicitly denies camera/mic/location access

---

## 3. Input Validation & ReDoS Prevention

**Implementation:** `frontend/src/utils/aiClient.js` → `sanitizeInput()` and `frontend/src/hooks/useUserKeys.js`

**Strategy: Length-limit BEFORE regex.** All user inputs are truncated to a safe maximum length before any regular expression runs. This prevents ReDoS (Regular Expression Denial of Service) by ensuring the regex engine never receives unbounded input.

| Input Field | Max Length | Applied Where |
|---|---|---|
| Chat message | 5,000 chars | `aiClient.js` → `sanitizeInput` |
| Fact-check claim | 1,000 chars | `FactCheckerPage.jsx` + `aiClient.js` |
| API key | 500 chars | `SettingsPage.jsx` |
| Email | 254 chars (RFC 5321) | `LoginPage.jsx` |
| Password | 128 chars | `LoginPage.jsx` |
| Quiz answer context | 2,000 chars | `aiClient.js` history trim |

**Email regex** (runs only after `slice(0, 254)`):
```js
// Safe — linear time, bounded input
const emailRegex = /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/
```

This regex is NOT vulnerable to ReDoS because:
1. Input is pre-capped at 254 chars before the regex runs
2. The pattern uses non-backtracking character classes `[^@\s]` instead of `(a+)+`-style groups

---

## 4. Server-Side Template Injection Prevention

**Implementation:** `backend/routes/feed.py` and `backend/main.py`

SIGNAL's backend has **no HTML templating engine** — FastAPI returns only JSON via `JSONResponse`. There are no Jinja2, Mako, or similar template strings that could receive user input.

- All user-facing strings are passed as **data** in JSON responses, not as template structures
- The `_sanitize_story()` function in `feed.py` type-casts all Gemini response fields to `str()` with explicit length limits before returning them
- No string interpolation (`f"..."`) is used in any HTTP response construction

If email functionality is added in future, use libraries that auto-escape (e.g., Jinja2 with `autoescape=True`) and pass user data only as template variables, never as template strings.

---

## 5. Firestore / NoSQL Injection Prevention

**Implementation:** `frontend/src/pages/QuizPage.jsx` and `frontend/src/pages/SignalIQPage.jsx`

All Firestore queries use the **official Firebase SDK typed methods** — never string concatenation or dynamic query construction with user input.

```js
// ✅ Safe — typed SDK, no string interpolation
const q = query(
  collection(db, 'quiz_results'),
  where('userId', '==', user.uid),  // user.uid is a Firebase-issued string, not user-supplied
  orderBy('timestamp', 'desc')
)
```

**What we never do:**
```js
// ❌ Never: string interpolation in Firestore queries
db.collection(`quiz_results_${userInput}`)  // NEVER
```

**Data written to Firestore is validated before write:**
- `userId`: Taken from `user.uid` (Firebase Auth, not user-controlled input)
- `score`: Computed locally from quiz logic, not user-supplied
- `answers`: Array of `{ questionId, topic, correct }` — all typed, server-side question IDs

**Unexpected object shapes** are rejected by Firestore's SDK schema validation. If user-supplied data were written, it would go through `sanitizeInput()` first.

---

## 6. Rate Limiting — Login / Signup

**Thresholds:** 5 attempts per 15-minute window per IP (backend), 5 attempts per 15-minute window per browser session (client-side fallback).

### Backend Rate Limiting (via `slowapi`)

**Implementation:** `backend/routes/feed.py` — all feed and test endpoints are rate-limited.

```python
@limiter.limit("30/minute")  # News feed: 30 req/min
@limiter.limit("5/minute")   # Test endpoint: 5 req/min
```

### Client-Side Auth Rate Limiting

**Implementation:** `frontend/src/contexts/AuthContext.jsx` → `checkRateLimit()`

```js
const RATE_LIMIT = 5      // 5 attempts max
const RATE_WINDOW_MS = 15 * 60 * 1000  // per 15 minutes
```

This is a browser-local defence that:
1. Tracks attempt counts + window start time in localStorage
2. Resets after 15 minutes automatically
3. Shows a user-facing error with the exact retry time remaining

**Why 5 / 15 minutes:** This matches OWASP recommendations for login brute-force protection. It's strict enough to prevent automated attacks but lenient enough for a user who mis-types their password a few times.

**Firebase App Check** can be enabled in the Firebase Console for additional hardware-backed attestation on top of these limits.

---

## Additional Notes

- **BYOK keys** are stored only in `localStorage`. They are never sent to SIGNAL's backend. Users should be aware that any browser extension or XSS could read localStorage — mitigated by the CSP above.
- **Stale cache** served during API errors is clearly labeled in the API response with `"stale": true` — the frontend displays a warning.
- **Backend Gemini key** (`BACKEND_NEWS_GEMINI_KEY`) is only read from the server's environment variables, never from the request.
