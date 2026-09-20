# Backend setup

Use Node 22.12 or newer. Run `nvm use` from the repository root if using nvm.

```sh
cd backend
npm ci
npm run dev
```

The empty Express server listens on `127.0.0.1:8787`. No routes, verification, or Gemini integration are implemented. Requests return Express's default 404 until routes are added.

Start work in `src/server.ts`. Optionally copy `.env.example` to `.env` to configure HOST and PORT. Do not overwrite an existing environment file or commit secrets.

`npm run typecheck` checks TypeScript. `npm run build` compiles to `dist/`. `npm start` runs the compiled server.
