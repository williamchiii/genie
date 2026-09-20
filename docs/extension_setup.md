# Extension setup

Use Node 22.12 or newer. Run `nvm use` from the repository root if using nvm.

```sh
cd extension
npm ci
npm run build
```

Open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select `extension/dist`.

The content script reads resource detail pages (`/resource/<id>`) and automatically asks the local backend to check each newly opened listing. It inserts a compact checking status below the Website link, then shows the live result and expandable evidence. The toolbar popup still only displays Genie.

Start the backend from `backend/` before loading the extension:

```sh
python -m uvicorn main:app --host 127.0.0.1 --port 8787
```

Keep `GEMINI_API_KEY` in `backend/.env`; the extension never reads it. The current live integration is limited to detail pages; search-result cards and map popups are outside the current scope.

## Try a live detail-page check

1. Start the backend from `backend/` with `python -m uvicorn main:app --host 127.0.0.1 --port 8787`, then confirm `http://127.0.0.1:8787/health` returns `{"ok":true}`.
2. Build and load the extension, or click Reload on its Chrome extensions card if already loaded.
3. Refresh an FCI resource detail page. S4P is `https://www.floridaresourcemap.org/resource/6731049ac332c8ac3a1c250f?distance=`.
4. Genie should show a checking status and then a live result. Expand **Genie details** to inspect the link state, check time, original website, and validated sources. The phone link must not be modified.
5. A live Active result with a verified repair updates only that listing's Website destination, labels it **Updated link by Genie**, and exposes **Use original link**. Uncertain, closed, mock, failed, and mismatched results leave the original destination unchanged.
6. Open another detail page and check that the card updates without duplicates. Reloading a repaired detail page preserves the original URL used for future checks.

Extraction is based on user-supplied S4P and Released HTML. The title row is identified by its Print button; contact sections use visible labels. Phone is read from visible text because both samples incorrectly use a website destination for the phone anchor. Missing optional fields are null. The request ID comes from the page URL at runtime; no Released ID is hardcoded. Trust badges and visitor reviews are not extracted.

Browser navigation and the live website still require manual verification. The pasted HTML does not establish how search cards or partial page transitions behave.

## Live result safety

The content script automatically sends each resource-detail listing to the local backend. Keep `GEMINI_API_KEY` in `backend/.env`; the extension never reads it. If the backend is unavailable, invalid, or exceeds the extension's 25 second request limit, Genie displays **Uncertain** with **Could not complete this check.** The current live integration is limited to resource detail pages; search-result cards and map popups are outside the current scope.

The extension only applies a replacement when the response is live, Active, has a broken or stale original link, a check time, supporting sources, and an HTTP(S) replacement URL. It stores the original URL on the page and uses it for later checks, so its own local change cannot cause a request loop. Source text is rendered as text. Provider-supplied Google Search attribution HTML, when returned, is isolated in a sandboxed iframe with scripts and same-origin access disabled.

## Extraction checks

From `extension/`, run `node tests/extraction.mjs`. It bundles the extractor and runs six assertions in headless Chrome against the supplied HTML snapshots, including missing contact fields, missing Services, unsafe links, and incomplete pages. It defaults to the standard Windows Chrome install; set `CHROME_PATH` to use another Chrome executable. The test creates a temporary browser profile and HTML page under the OS temporary directory.

## Entry points

1. `src/popup/index.tsx`: React popup.
2. `src/content/index.ts`: Resource Map content script.
3. `src/background/index.ts`: background worker.
4. `public/manifest.json`: extension configuration.

`npm run dev` rebuilds source changes. Reload the extension and refresh the map tab after edits. Restart the build after editing `public/`. `npm run typecheck` checks TypeScript. `npm run build` produces the unpacked extension.
