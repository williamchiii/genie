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

The bare app is in `main.py`. No application routes, verification, or Gemini integration are implemented. Opening `/` returns 404. FastAPI provides interactive API documentation at http://localhost:8787/docs and the schema at http://localhost:8787/openapi.json.

Dependencies are recorded in `requirements.txt`. Keep environment files and API keys out of Git. The future API contract still uses port 8787 and the same request and response shapes.

For a server without automatic reload:

```sh
python -m uvicorn main:app --host 127.0.0.1 --port 8787
```

Reference: [FastAPI first steps](https://fastapi.tiangolo.com/tutorial/first-steps/).
