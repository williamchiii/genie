# Genie

Implementation handoff: [team tasks and role split](team_tasks.md), [proposed API contract](review_api_contract.md), and [S4P fixtures](fixtures/s4p-listing.json).

## What Genie is

Genie is a Gemini powered link health layer for the Florida Community Resource Map.

Its purpose is simple: people looking for food, housing, health care, or other help should not waste time on a resource listing that sends them to a broken website.

## The problem

The Florida Community Resource Map helps residents and social workers find essential local resources. Some listings have websites that are outdated, moved, or broken. A 404 page can become a real barrier for someone trying to find help.

However, a broken website link does **not** mean the organization or service is closed. Genie must never make that claim from a failed link alone.

## The core idea

Genie checks a Resource Map listing and gives it a clear, evidence backed status:

| Status | Meaning |
| --- | --- |
| Verified link | The listed website works and contains current service information. |
| Broken link, service likely active | The listed website failed, but current credible sources point to an active matching service. |
| Needs human review | The listed website failed and Genie could not find enough reliable evidence to determine what changed. |
| Information may be stale | The website works, but there is not enough current service information to verify the listing. |

Genie does not automatically edit the Resource Map. It gives FCI staff or nonprofit partners evidence they can use to review and update a listing.

## Real example that inspired Genie

The Florida Community Resource Map listing for **S4P Synergy, Inc.** displayed this website:

`https://www.strivinghome.org/synergy/home-synergy`

That link returns a 404 page. But the organization and service appear to still be active:

1. A current Synergy page exists at https://www.strivinghome.org/departments/synergy
2. Florida corporate records list S4P Synergy as active, with a reinstatement filed in March 2026.
3. Feeding the Gulf Coast still lists S4P Synergy food distribution information.

The correct Genie result is not “service dead.” It is:

> **Broken link, service likely active**

> The listed website returned 404. Genie found matching current sources for the organization and its food support services. A reviewer should confirm the updated details before publishing.

## How Gemini fits

Regular code checks whether a website responds, redirects, times out, or returns an error.

Gemini handles the harder comparison work:

1. Compare the Resource Map listing with current public sources.
2. Decide whether the organization name, address, phone number, and service type are likely a match.
3. Extract proposed updates from the public source.
4. Return the evidence and uncertainty in a structured format.

Gemini is not the final authority. It helps turn messy public webpages into an evidence backed review suggestion.

## Who Genie helps

1. **Residents:** fewer dead ends when looking for urgent help.
2. **Social workers:** more dependable referrals.
3. **FCI staff:** a faster way to find and review stale listings.
4. **Nonprofits:** a clearer path to correcting their public information.

## Why it matters

The Florida Community Resource Map already solves discovery: it helps people find relevant organizations. Genie focuses on the next moment: whether the link still takes a person somewhere useful.

## Sources

1. Florida Community Resource Map: https://www.floridaresourcemap.org/
2. FCI Resource Map project: https://floridainnovation.org/projects/the-florida-community-resource-map/
3. S4P Synergy current page: https://www.strivinghome.org/departments/synergy
4. Florida Division of Corporations record: https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?Detail=FL.DOS.Corporations.Shared.Contracts.FilingRecord&InquiryDirectionType=PreviousRecord&InquiryType=EntityName&ListNameOrder=S4PSYNERGY+N000000073080&SearchNameOrder=S4PVERTICALLYWRITTENWITHACROSS+T000000011110&SearchTerm=S4+DESIGN+AND+DEVELOPMENT%2C+LLC
5. Feeding the Gulf Coast pantry listing: https://www.feedingthegulfcoast.org/find-help/find-a-pantry/results?address=32504
