# Extension setup

Use Node 22.12 or newer. Run `nvm use` from the repository root if using nvm.

```sh
cd extension
npm ci
npm run build
```

Open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select `extension/dist`.

The content script now reads resource detail pages (`/resource/<id>`) and automatically displays a labeled demo card above the right-hand contact column. Expand **View extracted listing details** to see the request payload. The toolbar popup still only displays Genie.

This is an extraction milestone: no backend request or verification runs, no links are replaced, and the card displays **Uncertain · Not checked** with **Demo data, not a live check.** Search-result cards and map popups are not supported yet. Live integration, backend configuration, evidence rendering, and verified link repair remain to be implemented.

## Try the detail-page preview

1. Build and load the extension, or click Reload on its Chrome extensions card if already loaded.
2. Refresh an FCI resource detail page. S4P is `https://www.floridaresourcemap.org/resource/6731049ac332c8ac3a1c250f?distance=`.
3. A Genie demo card should appear above Website. Expand its details and compare the extracted name, website, address, phone, and service type with the page.
4. S4P should show `Soup Kitchen, Food Pantry`. The supplied Released listing has no Services section, so `serviceType` should be null; its Food/Education/Legal tags are not substituted.
5. Open another detail page and check that the card updates without duplicates. Confirm that original website links remain unchanged.

Extraction is based on user-supplied S4P and Released HTML. The title row is identified by its Print button; contact sections use visible labels. Phone is read from visible text because both samples incorrectly use a website destination for the phone anchor. Missing optional fields are null. The request ID comes from the page URL at runtime; no Released ID is hardcoded. Trust badges and visitor reviews are not extracted.

Browser navigation and the live website still require manual verification. The pasted HTML does not establish how search cards or partial page transitions behave.

## Extraction checks

From `extension/`, run `node tests/extraction.mjs`. It bundles the extractor and runs six assertions in headless Chrome against the supplied HTML snapshots, including missing contact fields, missing Services, unsafe links, and incomplete pages. It defaults to the standard Windows Chrome install; set `CHROME_PATH` to use another Chrome executable. The test creates a temporary browser profile and HTML page under the OS temporary directory.

## Entry points

1. `src/popup/index.tsx`: React popup.
2. `src/content/index.ts`: Resource Map content script.
3. `src/background/index.ts`: background worker.
4. `public/manifest.json`: extension configuration.

`npm run dev` rebuilds source changes. Reload the extension and refresh the map tab after edits. Restart the build after editing `public/`. `npm run typecheck` checks TypeScript. `npm run build` produces the unpacked extension.
