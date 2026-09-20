# Extension UI

Assigned to: teammate.

## Context for your AI

Read `docs/genie_context.md` and `docs/integration_contract.md` first. You own the resident facing Chrome extension for the Florida Community Resource Map. William and his AI independently own the backend and Gemini verification. This is a two person hackathon demo due September 20, 2026 at 5 PM.

Scanning must happen automatically, and results must appear beside each listing. Labels are Active, Confirmed closed, and Uncertain. A broken website is not evidence that the actual service closed.

## Owned files

Own `extension/`, its manifest, UI, dependency files and tests, and `docs/extension_setup.md`. Do not modify `backend/`, shared project context, or the API contract. Request shared changes from William. Do not implement independent Gemini calls or service classification in the extension.

## Implementation order

1. Inspect the live Resource Map in a browser. Determine how listings, popups, filters, and navigation render. Do not guess selectors or assume an undocumented API is available.
2. Create a Chrome Manifest V3 extension with permissions limited to the map and configured backend. Use a content script for extraction and annotations, and a background service worker for backend requests.
3. Extract name, website, address, phone, and service type where available. Missing optional fields are null. Generate a stable page identifier. Process rendered listings and opened details, not an invisible full dataset.
4. Scan automatically and observe new listings. Follow contract limits for debounce, concurrency, deduplication, and timeouts. Ignore extension inserted elements to prevent observer loops. Discard stale results if a page element now represents a different listing.
5. Insert a compact Checking indicator beside each listing, then replace it with the status. Use text and icons as well as color. Provide an accessible expandable evidence area beside the listing with reason, sources, check time, and replacement link.
6. Apply verified live replacements to the listing website button according to the integration contract. Label the change “Updated link by Genie”, preserve the original URL and evidence, and provide “Use original link”. Mock or uncertain results must not rewrite real listing links.
7. Connect to the real backend. Render external text safely without inserting it as HTML. Permit only HTTP or HTTPS source links. Show Uncertain on errors. A manual retry is useful, but scanning must not depend on it.
8. Write exact unpacked installation, backend configuration, reload, and demo instructions in `docs/extension_setup.md`.

## Work independently before the backend is ready

Build against local fixtures matching the shared contract for all three statuses, loading, and failure. Fixtures must be explicitly labeled and isolated from live mode. Never silently show fixture data when a live request fails. The backend default is `http://localhost:8787`.

## Required verification

Opening the live map triggers checks beside the correct listings. Filtering and navigation do not duplicate badges or cause request loops. Evidence is readable without losing the listing. A stopped backend produces Uncertain rather than endless loading. Verify the full interface with the real backend, not only fixtures.

## Demo responsibilities

Own browser setup, visual polish, interaction walkthrough, screenshots, the optional demo recording, and library credits for your component. Show how a resident can follow an evidence supported replacement link without researching the service themselves. Flag extraction or rendering limitations early.

## Handoff

Provide extension loading instructions, examples of extracted requests, tested map interactions, and missing fields. Coordinate one full live check with William before submission. Leave time for failure verification and recording.
