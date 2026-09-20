# Genie

Bare framework setup. Product plans and role assignments are in `docs/`. No product features are implemented.

| Folder | Owner | Stack |
| --- | --- | --- |
| `backend/` | William | Express and TypeScript |
| `extension/` | Teammate | Chrome Manifest V3, React, TypeScript, esbuild |

Each folder has independent dependencies and build commands. Use Node 22.12 or newer (`nvm use` from the root).

## Backend

```sh
cd backend
npm ci
npm run dev
```

Starts an empty Express server on port 8787. No routes are defined yet.

## Extension

```sh
cd extension
npm ci
npm run build
```

Open `chrome://extensions`, enable Developer mode, and load `extension/dist` as an unpacked extension. The popup displays Genie. Background and content scripts are empty entry points.

See [backend setup](docs/backend_setup.md), [extension setup](docs/extension_setup.md), and the [planned integration contract](docs/integration_contract.md).
