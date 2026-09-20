# Extension setup

Use Node 22.12 or newer. Run `nvm use` from the repository root if using nvm.

```sh
cd extension
npm ci
npm run build
```

Open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select `extension/dist`.

The React popup displays Genie. Background and content scripts are empty entry points. No scanning, status UI, API client, settings, or fixtures are implemented.

## Entry points

1. `src/popup/index.tsx`: React popup.
2. `src/content/index.ts`: Resource Map content script.
3. `src/background/index.ts`: background worker.
4. `public/manifest.json`: extension configuration.

`npm run dev` rebuilds source changes. Reload the extension and refresh the map tab after edits. Restart the build after editing `public/`. `npm run typecheck` checks TypeScript. `npm run build` produces the unpacked extension.
