# Genie

Implementation handoff: [team tasks and role split](team_tasks.md), [proposed API contract](review_api_contract.md), and [S4P fixtures](fixtures/s4p-listing.json).

## Goal

Build a competitive, working demo for the CityCamp Gainesville Hack Day General Civic Tech track. Submission is due September 20, 2026 at 5 PM. The team has two people, a Gemini API key, and a preference for no spending.

Genie is a Chrome extension for general users of the Florida Community Resource Map. It automatically checks public listings rendered on the user's current page and displays a service status beside each listing. When evidence supports a replacement for a broken website, Genie provides that link.

The team is independent of Florida Community Innovation (FCI). Do not imply a partnership, private data access, or endorsement. The extension annotates the user's browser view and does not edit FCI records.

## Confirmed decisions

1. Audience: general users, including residents seeking food, housing, health care, and other help.
2. Surface: a Chrome extension on https://www.floridaresourcemap.org/.
3. Trigger: scanning happens automatically, including newly rendered listings as users browse.
4. Placement: results appear beside each listing.
5. Exactly three service statuses: Active, Confirmed closed, and Uncertain.
6. A broken website never proves that the actual service has closed.

| Status | Meaning |
| --- | --- |
| Active | Current credible evidence supports that the matching service operates. |
| Confirmed closed | Explicit credible evidence establishes that the matching service has permanently closed or ended. |
| Uncertain | Evidence is missing, conflicting, stale, or insufficient for a confident match. |

Match the specific service and location, not just the parent organization. A functioning website or active corporate registration alone does not establish that a service operates. A timeout, 404, missing search result, or temporary closure cannot establish permanent closure. Active is not a guarantee of availability today.

Checking is an interface state, not a fourth service status. Failed checks display Uncertain with an explanation.

## Demo scope

Show one complete interaction: a user browses resources, Genie checks automatically, and a result beside the listing explains the evidence and offers an updated website when supported. Show source links and the check time in an expandable area beside the listing.

Prioritize a real Gainesville or Alachua County example. Do not invent a closure just to demonstrate all three states. Explicitly labeled fixtures can demonstrate interface states separately from live results.

No accounts, staff dashboard, full map crawl, record editing, or Chrome Web Store publication are required. Use an unpacked extension for the demo.

## Gemini and evidence

Ordinary code checks links and retrieves public evidence. Gemini compares names, addresses, phone numbers, and services across retrieved evidence, then returns structured findings. Asking Gemini to recall an organization is not verification.

Keep the key in backend environment variables, never in the extension or repository. Cache repeated checks and handle missing quota honestly. Verify search or grounding availability and cost before relying on it. No paid dependency should be assumed.

## Original motivating example

The original notes identified an S4P Synergy listing pointing to https://www.strivinghome.org/synergy/home-synergy and a possible replacement at https://www.strivinghome.org/departments/synergy, with corporate and pantry records as supporting leads. Reverify these claims before using them in the demo. This example is outside Gainesville, so seek a local example as well.

## Team documents

Read this context, then [the integration contract](integration_contract.md), then your role:

1. [Backend and verification](backend.md)
2. [Extension UI](extension_ui.md)

Product decisions above are user confirmed. Role assignments, directory ownership, API shape, and operational limits are working defaults selected to enable independent implementation. Coordinate changes to shared decisions before implementing them.

## Sources and submission

1. Resource Map: https://www.floridaresourcemap.org/
2. FCI project: https://floridainnovation.org/projects/the-florida-community-resource-map/
3. Hackathon: https://citycamp-hack-day.devpost.com/
4. Possible Synergy replacement: https://www.strivinghome.org/departments/synergy
5. Corporate records: https://search.sunbiz.org/
6. Pantry directory: https://www.feedingthegulfcoast.org/find-help/find-a-pantry/results?address=32504

Submit an interactive artifact, project name, track, description of what it does and whom it helps, repository or project link, and team members. Credit sources and libraries and explain continuation after Hack Day. A demo video is encouraged. Judging covers problem and impact, execution, design and usability, and clarity. Best use of Google Gemini is an optional additional award.
