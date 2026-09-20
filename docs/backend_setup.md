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

`main.py` creates the app, defines routes, and registers the error handler. `GET /health` returns `{"ok": true}`. `POST /api/check` validates a listing and checks its original website over HTTP. It reports working, redirected, broken, or unknown link state. Service status remains Uncertain until evidence verification is implemented. Invalid requests return HTTP 400 in the agreed error format. Page content analysis, replacement discovery, and Gemini integration are not implemented. HTTP success alone does not verify a service. Opening `/` returns 404. FastAPI provides interactive API documentation at http://localhost:8787/docs and the schema at http://localhost:8787/openapi.json.

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
    checks.py         Listing checks and bounded memory cache
  tests/
    test_checks.py    HTTP, cache, validation, and safety checks
  requirements.txt    Python dependencies
```

Run commands from `backend/` so these module imports resolve. Keep routes in `main.py`, API data models in `schemas/`, and error handling in `errors.py`.

## Link checker behavior

The checker sends a streamed GET and closes the response without downloading its body. HTTP 404 and 410 produce `broken`; 2xx produces `working` or `redirected`. Redirect status describes HTTP behavior only, not a verified service match. Other HTTP statuses, timeouts, DNS failures, and blocked destinations produce `unknown`. No check at this stage can mark a service Active or Confirmed closed, detect stale page content, or supply a replacement URL.

Only public HTTP or HTTPS destinations on ports 80 and 443 are fetched. Every redirect is validated, and the connection uses the validated IP while preserving the original Host header and TLS hostname. Local and private destinations, credentials in URLs, and unsafe DNS results are blocked. TLS verification stays enabled. Proxy environment variables are ignored for these requests.

Successful link observations, including 404 and 410, are cached in memory for 30 minutes. The cache excludes listingId from its key, echoes the current request ID, and preserves the original check time. Unknown results are not cached. Restarting the server clears the cache.

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
