# Genie

Bare framework setup. Product plans and role assignments are in `docs/`. No product features are implemented.

| Folder | Owner | Stack |
| --- | --- | --- |
| `backend/` | William | Python and FastAPI |
| `extension/` | Ethan | Chrome Manifest V3, React, TypeScript, esbuild |

Each folder has independent dependencies. Use Python 3.10 or newer for the backend and Node 22.12 or newer for the extension (`nvm use` from the root).

## Backend

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
fastapi dev main.py --host 127.0.0.1 --port 8787
```

Starts a bare FastAPI server on port 8787. No application routes are defined yet. Interactive API documentation is available at http://localhost:8787/docs.

## Extension

```sh
cd extension
npm ci
npm run build
```

Open `chrome://extensions`, enable Developer mode, and load `extension/dist` as an unpacked extension. The popup displays Genie. Background and content scripts are empty entry points.

See [backend setup](docs/backend_setup.md), [extension setup](docs/extension_setup.md), and the [planned integration contract](docs/integration_contract.md).
