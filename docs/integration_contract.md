# Shared integration contract

This is the planned contract for future implementation. The bare framework does not implement these endpoints or behaviors yet.

## Ownership

William owns `backend/`, backend dependency files and tests, `docs/backend_setup.md`, this contract, and `docs/genie_context.md`.

The teammate owns `extension/`, its manifest, UI, dependency files and tests, and `docs/extension_setup.md`.

Keep dependency files inside each component. Each person's AI must stay within its owned files. Request changes from the other owner instead of editing their component. Both people must agree before changing the shared schema or status meanings. No implementation framework is prescribed.

## Transport and limits

Default backend: `http://localhost:8787`. The extension must make this configurable. The content script extracts and annotates listings. A Chrome background service worker sends backend requests. No Gemini key belongs in the extension.

`GET /health` returns HTTP 200 with `{ "ok": true }` for server liveness, not provider availability.

`POST /api/check` takes one listing and returns one result. The extension permits at most two concurrent checks, debounces page changes by 500 ms, and deduplicates unchanged listings within the page session. The backend caches identical normalized listing fields for 30 minutes. Cache hits preserve the original check time. Do not cache transient provider failures for the full normal period.

Target a 20 second backend deadline and a 25 second extension timeout. No automatic retry loops.

## Request

```json
{
  "listingId": "page-local-stable-id",
  "name": "Example Community Pantry",
  "website": "https://example.org/pantry",
  "address": "123 Example Street, Gainesville, FL",
  "phone": null,
  "serviceType": "Food assistance"
}
```

All fields are present. `listingId` and `name` are nonempty strings. Other values are strings or null when missing. The extension generates the opaque ID and the backend echoes it. Cache by substantive listing fields, not the ID alone. Send public listing details only, never full page HTML, user search queries, resident information, or browsing history.

## Response

```json
{
  "listingId": "page-local-stable-id",
  "status": "active",
  "reason": "An official service page describes the pantry at the matching address.",
  "checkedAt": "2026-09-20T16:00:00Z",
  "linkState": "broken",
  "replacementUrl": "https://example.org/new-pantry-page",
  "sources": [
    {
      "title": "Example pantry service page",
      "url": "https://example.org/new-pantry-page",
      "excerpt": "Food assistance is available at 123 Example Street.",
      "retrievedAt": "2026-09-20T16:00:00Z"
    }
  ],
  "cached": false
}
```

This fictional example illustrates the schema, not a real finding. All fields are required.

1. `status`: exactly `active`, `closed`, or `uncertain`. UI labels: Active, Confirmed closed, Uncertain.
2. `linkState`: exactly `working`, `redirected`, `broken`, or `unknown`. Link health is separate from service status.
3. `reason`: short plain language explanation.
4. `replacementUrl`: evidence supported matching HTTP or HTTPS URL, or null.
5. `sources`: array containing the four string fields shown. Empty is allowed for Uncertain. Excerpts must come from retrieved content, not invented quotations.
6. Timestamps: UTC ISO 8601 strings. Retrieval time alone does not establish that source information is current.
7. `cached`: boolean.

Active and Confirmed closed require supporting sources and a confident match to the specific service and location. Confirmed closed additionally requires explicit permanent closure evidence. Weak or conflicting evidence yields Uncertain.

## Errors

Missing evidence, inaccessible sources, exhausted quota, and provider failures return HTTP 200 with Uncertain, an honest reason, and available evidence. Never silently substitute fixture data.

Invalid requests return HTTP 400 with `{ "error": { "code": "INVALID_REQUEST", "message": "Description" } }`. Unexpected server failures return HTTP 500 with the same shape and code `INTERNAL_ERROR`. Never expose secrets or raw provider errors.

On non-200 responses, invalid response data, network failure, or timeout, the extension displays Uncertain with “Could not complete this check.” It must not remain stuck loading or display Confirmed closed.

## Joint acceptance check

1. Opening the map triggers checks and places results beside the correct listings.
2. Filtering or opening new listings checks newly rendered content without duplicate badges or repeated unchanged requests.
3. Each result exposes reason, source links, time checked, and a replacement link when supported.
4. A 404 alone never produces Confirmed closed.
5. Stopping the backend produces a useful Uncertain state.
6. Both components run from their setup documents, and the extension contains no API key.
