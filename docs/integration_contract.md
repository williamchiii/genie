# Shared integration contract

This is the single source of truth for the planned API and mock fixtures. The backend implements link checks and a Gemini verification pipeline. Live Gemini verification requires model access and quota. The frontend behavior below remains the integration target. Both components must use this format; the earlier fixture field names are retired.

## Core interaction

Genie automatically checks a rendered listing's original website. If it is broken or demonstrably points to outdated or unrelated service information, the backend searches for and verifies a current destination. The extension then updates that listing's website button in the user's browser and labels it “Updated link by Genie”. The original link and supporting evidence remain accessible beside the listing. FCI's stored records are never changed.

An old visual design or undated page is not enough to declare a website stale. A replacement must resolve to a working page for the same service and location. Prefer a specific service page over a general homepage. Gemini discovers and compares candidates using retrieved or grounded sources; an unsupported model suggestion is not a verified replacement.

Live checks also run on the search results list, one per card currently rendered on the page (the chosen page size), checked top of the page first. The list has no website button to replace, so Genie shows only the status indicator and evidence there; link replacement remains a detail-page behavior. Map popups remain out of scope.

## Ownership

William owns `backend/`, backend dependency files and tests, `docs/backend_setup.md`, this contract, and `docs/genie_context.md`.

The teammate owns `extension/`, its manifest, UI, dependency files and tests, and `docs/extension_setup.md`.

Keep dependency files inside each component. Each person's AI must stay within its owned files. Request changes from the other owner instead of editing their component. Both people must agree before changing the shared schema or status meanings. Shared fixtures in `docs/fixtures/` must stay aligned with this document. No implementation framework is prescribed.

## Transport and limits

Default backend: `http://localhost:8787`. The extension must make this configurable. The content script extracts and annotates listings. A Chrome background service worker sends backend requests. No Gemini key belongs in the extension.

`GET /health` returns HTTP 200 with `{ "ok": true }` for server liveness, not provider availability.

`POST /api/check` takes one listing and returns one result. The extension permits at most two concurrent checks, debounces page changes by 500 ms, and deduplicates unchanged listings within the page session. The backend caches identical normalized listing fields for 30 minutes. Cache hits preserve the original check time. Do not cache transient provider failures for the full normal period.

Target a 20 second backend deadline, including queue time, and a 25 second extension timeout. The backend defaults to two concurrent unique checks and up to 16 queued unique checks per worker. Simultaneous requests with identical substantive listing fields share one verification, but each response echoes its caller's listingId. Shared in-flight work is not a cache hit. If capacity is full, return HTTP 200 with Uncertain, unknown link state, null checkedAt, and a busy explanation. Do not cache busy or timed out results. No automatic retry loops.

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

All fields are present. `listingId` and `name` are nonempty strings. Other values are strings or null when missing. The extension generates the opaque ID and the backend echoes it. `website` always contains the original FCI listing URL, never the URL that Genie inserted. Preserve the original URL before any page modification. Cache by substantive listing fields, not the ID alone. Send public listing details only, never full page HTML, user search queries, resident information, or browsing history.

## Response

```json
{
  "listingId": "page-local-stable-id",
  "mode": "live",
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
  "addressMismatch": false,
  "cached": false
}
```

This fictional example illustrates the schema, not a real finding. All fields shown above are required. The optional additive field `searchAttribution` is described below.

1. `status`: exactly `active`, `closed`, or `uncertain`. UI labels: Active, Confirmed closed, Uncertain.
2. `linkState`: exactly `working`, `redirected`, `broken`, `stale`, or `unknown`, describing the original listing URL. `stale` means retrieved content explicitly shows that the destination no longer represents the listed service, such as a superseded service page or unrelated domain content. `broken` means a confirmed failure such as a 404 or 410, not a transient timeout or blocked fetch. Those unresolved cases use `unknown`. A working redirect to the correct service uses `redirected` and does not need repair. Link health is separate from service status.
3. `reason`: short plain language explanation.
4. `replacementUrl`: verified working HTTP or HTTPS destination for the same service and location, or null. For live responses, only return a value when `status` is `active`, `linkState` is `broken` or `stale`, `checkedAt` is present, and `sources` support both the match and repair. The destination must differ from the original URL. Fetch the candidate and validate its final destination after redirects. Do not expose an unverified candidate through this field.
5. `sources`: array containing the four string fields shown. Empty is allowed for Uncertain. Excerpts must come from retrieved content, not invented quotations.
6. `checkedAt`: UTC ISO 8601 string when a check completed, otherwise null. Mock examples without an actual check use null. Failed live attempts that did not complete a check also use null. Source `retrievedAt` must be a UTC ISO 8601 string for actual retrieved content. Retrieval time alone does not establish that source information is current.
7. `cached`: boolean. Mock fixtures use false.
8. `mode`: exactly `live` or `mock`. This is a data origin marker, not a service status. The UI must visibly label mock results “Demo data, not a live check.” Never silently fall back to mock mode after a live failure.
9. `addressMismatch`: boolean. It is true only when retrieved evidence explicitly gives a conflicting address for a listing with an address. The UI labels that Uncertain result Address mismatch.

For live results, Active and Confirmed closed require supporting sources and a confident match to the specific service and location. Confirmed closed additionally requires explicit permanent closure evidence. Weak or conflicting evidence yields Uncertain.

## Search attribution

Responses may also contain `searchAttribution`, defaulting to null. Older fixtures may omit it. When Google Search returns attribution, the shape is:

```json
{
  "searchAttribution": {
    "renderedContent": "<div>Provider supplied search attribution</div>",
    "queries": ["Example Community Pantry current services"]
  }
}
```

This is provider metadata, not retrieved evidence and not a service classification. Keep the Google Search attribution with the result. The extension owner must implement its display alongside grounded results according to Google's current display requirements. Treat the HTML as untrusted provider content and isolate it in a sandboxed frame with scripts and same origin access disabled, rather than inserting it into the Resource Map DOM. Source excerpts remain exact snippets from independently fetched pages; model summaries and search suggestions are not quotations.

The backend uses search to discover source URLs, fetches those destinations with the same public network checks as original links, and asks Gemini to assess the retrieved text in a separate structured request. A returned replacement is the fetched final URL of a cited official service page, not an arbitrary URL from model output.

## Extension behavior

| Backend result | Website button behavior |
| --- | --- |
| Live Active, broken or stale original URL, verified replacement, check time and supporting sources | Replace the button destination and show “Updated link by Genie”. |
| Working or correctly redirected original URL | Preserve the original button. Show service status separately. |
| Uncertain, Confirmed closed, or null replacement | Preserve the original button. Explain the result beside it. |
| Timeout, invalid response, mismatched listing, or request failure | Do not apply a replacement. Show Uncertain and explain the failed check. |
| Mock response | Only simulate replacement in an explicitly labeled fixture preview. Do not change a real listing's destination from mock data. |

Before applying a result, confirm that the card still represents the submitted listing and original website. A reused card must not receive a previous listing's replacement. Reject inconsistent responses such as a replacement paired with Uncertain or missing evidence.

Keep the original URL, replacement URL, reason, source links, and check time accessible in the listing's evidence area. Offer “Use original link” to undo the local change for that listing during the current page session. Do not automatically navigate the user. If the site rerenders a card, preserve the original URL and avoid treating Genie changes as fresh input or triggering request loops.

If a later check cannot support an already applied repair, restore the original destination and explain the new result. Cached live results may apply within the agreed cache lifetime and must retain their original check time. No backend response directly modifies FCI records.

### Listing indicators

Use red only for Confirmed closed, based on explicit permanent closure evidence. Never color a listing red on link health alone: a dead link with no verified replacement is Uncertain, not Confirmed closed. A broken website never proves that the actual service has closed.

Use green for an Active service with a working original link. A correctly redirected link may be green only when its destination matches the verified service.

Use purple for an Active service whose broken or stale link received a verified replacement, labeled "Updated by Genie". This is the only case where Genie has changed what the user sees.

Use yellow for Uncertain, including a broken or unknown link without a verified repair, missing or conflicting evidence, and a mismatched address, phone, or service. Yellow is the neutral state, not a warning that the service is inactive.

Color must be accompanied by readable status text in all cases.

## Mock fixtures

Use [s4p-listing.json](fixtures/s4p-listing.json) as the exact request shape and [s4p-review.json](fixtures/s4p-review.json) as the exact response shape. `listingId` must match across the pair. The frontend can load these locally for development; no fixture endpoint or mock implementation is required yet.

The S4P fixture uses Uncertain, unknown link state, null check time, null replacement URL, and no retrieved sources. Its project notes are research leads, not evidence from a completed check. The possible replacement remains documented in [the fixture notes](fixtures/README.md).

Render null `checkedAt` as “Not checked”, never the current time. Do not fabricate source excerpts or retrieval timestamps to fill the schema. Future fictional examples may exercise Active and Confirmed closed UI states only when clearly labeled mock data and not presented as findings about real services.

### Migration from the original fixtures

| Original field | Canonical field or treatment |
| --- | --- |
| `listingName` | `name` |
| `websiteUrl` | `website` |
| `listingUrl` | Not part of the request; use `listingId` to associate the result with its card. |
| `services` | `serviceType`, one display string or null. Multiple known labels may be joined with a comma. |
| `summary` | `reason` |
| `suggestedUrl` | `replacementUrl`, only when supported by verified matching evidence. |
| `originalLinkResult` | `linkState` and `checkedAt`; no HTTP check details in this minimal response. |
| `evidence` | `sources`, but only actually retrieved content can supply excerpts and retrieval times. |
| `confidence`, `fieldsToUpdate`, `reviewNote` | Not separate fields in this contract. Use `reason` and `mode` for the explanation and demo label. |
| `broken_link_service_likely_active` | Retired. Choose `active`, `closed`, or `uncertain` based on service evidence. |

## Errors

Missing evidence, inaccessible sources, exhausted quota, and provider failures return HTTP 200 with Uncertain, an honest reason, and available evidence. Never silently substitute fixture data.

Invalid requests return HTTP 400 with `{ "error": { "code": "INVALID_REQUEST", "message": "Description" } }`. Unexpected server failures return HTTP 500 with the same shape and code `INTERNAL_ERROR`. Never expose secrets or raw provider errors.

On non-200 responses, invalid response data, network failure, or timeout, the extension displays Uncertain with “Could not complete this check.” It must not remain stuck loading or display Confirmed closed.

## Joint acceptance check

1. Opening the map triggers checks and places results beside the correct listings.
2. Filtering or opening new listings checks newly rendered content without duplicate badges or repeated unchanged requests.
3. A live verified replacement for a broken or stale listing updates the correct website button, displays “Updated link by Genie”, and exposes the original URL, reason, sources, and check time. “Use original link” restores the original destination.
4. A 404 alone never produces Confirmed closed.
5. Stopping the backend produces a useful Uncertain state.
6. Both components run from their setup documents, and the extension contains no API key.

7. Unverified, mock, failed, or mismatched responses never change a real listing destination. Working original links remain unchanged.
8. Rerendering a repaired card does not feed the inserted URL back into checks or create a request loop.
