# Backend setup

Use Python 3.10 or newer. The backend uses FastAPI and is independent of the extension's Node setup.

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
fastapi dev main.py --host 127.0.0.1 --port 8787
```

On subsequent runs, activate `.venv` and run the final command. The development server reloads when Python files change. Stop it with Ctrl+C.

`main.py` creates the app, defines routes, and registers the error handler. `GET /health` returns `{"ok": true}`. `POST /api/check` validates a listing and checks its original website over HTTP. It reports working, redirected, broken, or unknown link state. With an available Gemini key and quota, grounded search discovers sources and a structured assessment evaluates independently fetched evidence. Invalid requests return HTTP 400 in the agreed error format. Missing configuration, quota errors, unsupported evidence, and timeouts return Uncertain. HTTP success alone does not verify a service. Opening `/` returns 404. FastAPI provides interactive API documentation at http://localhost:8787/docs and the schema at http://localhost:8787/openapi.json.

Dependencies are recorded in `requirements.txt`. Keep environment files and API keys out of Git. The future API contract still uses port 8787 and the same request and response shapes.

For a server without automatic reload:

```sh
python -m uvicorn main:app --host 127.0.0.1 --port 8787
```

Reference: [FastAPI first steps](https://fastapi.tiangolo.com/tutorial/first-steps/).

## File layout

```text
backend/
  main.py             App setup and routes
  config.py           Validated settings loaded from .env
  errors.py           Request validation and internal error handlers
  schemas/
    listing.py        ListingRequest validation model
    result.py         CheckResult and source validation models
  services/
    link_checker.py   Public website HTTP checks
    checks.py         Full verification pipeline and bounded cache
    gemini.py         Grounded discovery and evidence assessment
  tests/
    test_checks.py    HTTP, cache, validation, and safety checks
    test_gemini.py    Provider, evidence, repair, and timeout tests
  requirements.txt    Python dependencies
```

Run commands from `backend/` so these module imports resolve. Keep routes in `main.py`, API data models in `schemas/`, and error handling in `errors.py`.

## Link checker behavior

The checker sends a streamed GET. When evidence is requested, it reads at most 256 KiB of uncompressed HTML or plain text, strips script and style content, and passes at most 14,000 characters per page to the assessment. Unsupported formats and compressed bodies are not used as evidence. HTTP 404 and 410 produce `broken`; 2xx produces `working` or `redirected`. Redirect status describes HTTP behavior only, not a verified service match. Other HTTP statuses, timeouts, DNS failures, and blocked destinations produce `unknown`. HTTP checks alone never establish activity or closure. Those classifications require the Gemini evidence stage and validated source quotations.

Only public HTTP or HTTPS destinations on ports 80 and 443 are fetched. Every redirect is validated, and the connection uses the validated IP while preserving the original Host header and TLS hostname. Local and private destinations, credentials in URLs, and unsafe DNS results are blocked. TLS verification stays enabled. Proxy environment variables are ignored for these requests.

Completed evidence assessments are cached in memory for 30 minutes, including a completed Uncertain assessment. Link observations alone and failed provider requests are not cached. The cache excludes listingId from its key, echoes the current request ID, and preserves the original check time. Incomplete checks, missing keys, quota errors, malformed model output, and inaccessible evidence are not cached. Restarting the server clears the cache.

Optional `.env` settings:

```text
LINK_TIMEOUT_SECONDS=12
MAX_REDIRECTS=5
CACHE_TTL_SECONDS=1800
CACHE_MAX_ENTRIES=256
```

The timeout covers the whole link check, including DNS and redirects. Settings are read when the backend starts. HOST and PORT remain application settings; the server still uses its explicit command line flags.

Run verification from `backend/`:

```sh
python -m unittest discover -s tests -v
```

Test the endpoint with the shared listing fixture, from the repository root while the server is running:

```sh
curl http://localhost:8787/api/check -H 'Content-Type: application/json' --data-binary @docs/fixtures/s4p-listing.json
```

Network behavior is implemented using [HTTPX streaming](https://www.python-httpx.org/async/) and its documented [TLS hostname extension](https://www.python-httpx.org/advanced/extensions/).

## Gemini verification

Set `GEMINI_API_KEY` locally in `backend/.env`. No additional SDK is required: the backend uses the existing HTTPX dependency and the documented Gemini REST API. Restart the backend after settings change.

```text
GEMINI_ENABLED=true
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_TIMEOUT_SECONDS=10
CHECK_TIMEOUT_SECONDS=20
EVIDENCE_MAX_PAGES=3
EVIDENCE_MAX_BYTES=262144
EVIDENCE_MAX_CHARS=14000
```

Set `GEMINI_ENABLED=false` to disable model requests and use link observations only. It is enabled by default. HOST and PORT values in `.env` do not override the server command line.

Each uncached check makes at most two model calls: grounded discovery and structured assessment. There are no automatic retries or model fallbacks. The first call can execute multiple Google searches, which the provider may bill separately. The backend fetches at most three search source pages, plus the original listing page. The 20 second deadline includes original link checking, discovery, page retrieval, and assessment. A slow source or model can cause an honest Uncertain result.

The model may classify a service only with a confident match, current evidence, and quotations that are exact substrings of the fetched text. Confirmed closed also requires explicit permanent closure wording. This additional wording check currently recognizes a conservative set of English phrases; other phrasing can remain Uncertain. Semantic interpretation still relies on Gemini and can be wrong. Grounding is not a guarantee of truth.

A replacement must be an independently fetched official page with operation evidence for the matched active service. Its final URL must differ from the original, and the original must be broken or have supported stale content. Unverified suggestions are never returned as replacementUrl. The optional `searchAttribution` response field preserves provider attribution for frontend display; see the integration contract.

## Live verification status

On September 20, 2026, live requests using the configured project rejected Gemini 2.5 Flash and Flash-Lite as unavailable to new users of those models. The selected newer model initially returned HTTP 429 quota unavailable. After the user added prepaid credit, a live check succeeded on September 20, 2026 in 6.2 seconds: the original S4P URL returned HTTP 404, Gemini search discovered https://www.strivinghome.org/departments/synergy, and the backend fetched that official page and validated quotations describing its food services and recurring schedule. The API returned Active, broken link state, and that replacement URL. This was a successful backend verification, not a test of the Chrome UI. Automated tests use controlled provider and webpage responses and do not spend API quota.

Check the key's Google AI Studio project billing and quota before retrying. Small API charges were authorized, but this code does not enable billing or change cloud quotas. A 429 alone does not establish whether the cause is billing, rate limits, or exhausted quota.

Current [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) lists Gemini 3.5 Flash-Lite at $0.30 per million input tokens and $2.50 per million output tokens on the paid tier. Search grounding is paid-tier only, with 5,000 included monthly search requests shared across Gemini 3 models, then $14 per 1,000 search requests. These are published rates, not a measurement of this project's charges.

References: [grounded search](https://ai.google.dev/gemini-api/docs/google-search), [Gemini REST API](https://ai.google.dev/api/generate-content), and [model capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).
