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

`main.py` creates the app, defines routes, and registers the error handler. `GET /health` returns `{"ok": true}`. `POST /api/check` validates a listing and returns an Uncertain placeholder. Invalid requests return HTTP 400 in the agreed error format. Website verification and Gemini integration are not implemented. Opening `/` returns 404. FastAPI provides interactive API documentation at http://localhost:8787/docs and the schema at http://localhost:8787/openapi.json.

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
  errors.py           Request validation error handler
  schemas/
    listing.py        ListingRequest validation model
  requirements.txt    Python dependencies
```

Run commands from `backend/` so these module imports resolve. Keep routes in `main.py`, API data models in `schemas/`, and error handling in `errors.py`.
