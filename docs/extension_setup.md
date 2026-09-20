# Extension setup

Use Node 22.12 or newer. Run `nvm use` from the repository root if using nvm.

```sh
cd extension
npm ci
npm run build
```

Open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select `extension/dist`.

The content script reads resource detail pages (`/resource/<id>`) and inserts a compact labeled demo below the Website link. Expand **Genie details** to see the explanation and extracted request payload. The toolbar popup still only displays Genie.

This is a detail-page mock: no backend request or verification runs, and no link destinations are replaced. S4P's original website appears muted and crossed out with a pale-red **Link unreachable** badge, matching the supplied broken-link reference. It is visibly labeled **Demo data, not a live check.** Service status remains **Uncertain · Not checked** in the expandable details. Other listings show **Link not checked**, without the broken-link styling. The mock is limited to detail pages; search-result cards and map popups are outside the current scope. Live integration and verified link repair remain separate work.

## Try the detail-page preview

1. Build and load the extension, or click Reload on its Chrome extensions card if already loaded.
2. Refresh an FCI resource detail page. S4P is `https://www.floridaresourcemap.org/resource/6731049ac332c8ac3a1c250f?distance=`.
3. On S4P, the original Website link should appear crossed out with **Link unreachable** beneath it. The URL remains clickable and its destination is unchanged. Expand **Genie details** and compare the extracted fields with the page. The phone link must not receive the crossed-out styling.
4. S4P should show `Soup Kitchen, Food Pantry`. The supplied Released listing has no Services section, so `serviceType` should be null; its Food/Education/Legal tags are not substituted.
5. Open another detail page and check that the card updates without duplicates. Confirm that original website links remain unchanged.

Extraction is based on user-supplied S4P and Released HTML. The title row is identified by its Print button; contact sections use visible labels. Phone is read from visible text because both samples incorrectly use a website destination for the phone anchor. Missing optional fields are null. The request ID comes from the page URL at runtime; no Released ID is hardcoded. Trust badges and visitor reviews are not extracted.

Browser navigation and the live website still require manual verification. The pasted HTML does not establish how search cards or partial page transitions behave.

## Released uncertain-link mock

On the supplied Released detail page (`Released` with website `https://releasedreentry.org`), Genie now previews the uncertain screenshot: an amber title dot, **GENIE · UNCERTAIN** pill beside Website, and a pale-amber explanation panel. The website remains clickable with its original destination. The explanation is a simulated scenario, visibly labeled **Demo data, not a live check.** S4P retains the red broken-link preview. Other listings remain unclassified.

Reload the extension and refresh Released to try it. **Suggest a link** opens a labeled HTTP(S) URL form. **Save in preview** only acknowledges the value locally; it sends nothing and changes no links. **Dismiss** hides the explanation and actions; **Show Genie details** restores them. Refreshing resets this local preview. The previous repaired-link rendering is retained in code, but Released currently selects the uncertain design.

## Extraction checks

From `extension/`, run `node tests/extraction.mjs`. It bundles the extractor and runs six assertions in headless Chrome against the supplied HTML snapshots, including missing contact fields, missing Services, unsafe links, and incomplete pages. It defaults to the standard Windows Chrome install; set `CHROME_PATH` to use another Chrome executable. The test creates a temporary browser profile and HTML page under the OS temporary directory.

## Entry points

1. `src/popup/index.tsx`: React popup.
2. `src/content/index.ts`: Resource Map content script.
3. `src/background/index.ts`: background worker.
4. `public/manifest.json`: extension configuration.

`npm run dev` rebuilds source changes. Reload the extension and refresh the map tab after edits. Restart the build after editing `public/`. `npm run typecheck` checks TypeScript. `npm run build` produces the unpacked extension.
