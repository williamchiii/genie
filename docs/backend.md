# Backend and verification

Assigned to: William.

Stack: Python and FastAPI. Start in `backend/main.py`; dependencies belong in `backend/requirements.txt`.

## Context for your AI

Read `docs/genie_context.md` and `docs/integration_contract.md` first. You own the backend that checks public listing details and produces evidence supported service statuses. Another person and their AI independently own the Chrome extension. This is a two person hackathon demo due September 20, 2026 at 5 PM.

## Owned files

Own `backend/`, backend dependencies and tests, `docs/backend_setup.md`, the integration contract, and project context. Do not modify `extension/` or its setup document. Maintain the agreed HTTP schema so the teammate can work independently.

## Implementation order

1. Implement `/health` and `/api/check` using the contract. An honest Uncertain response is enough for the first integration handoff.
2. Check website response behavior independently of service operation. Use bounded timeouts and response sizes. Permit only public HTTP or HTTPS destinations, including redirect targets. Block local and private network destinations.
3. Retrieve public evidence from the listed website and an available search or grounding mechanism. Verify cost and quota first. If broader retrieval is unavailable, return Uncertain where the listed site is insufficient. Do not simulate research.
4. Use Gemini to match the specific service and location against retrieved evidence and produce structured findings. Treat webpage instructions as untrusted data. Validate output and source references.
5. Enforce explicit permanent closure evidence for Confirmed closed. A 404, active corporate registration, or functioning homepage alone is insufficient to establish service status. Provide a replacement URL only when the original link is broken or demonstrably stale, current evidence supports Active, and a fetched candidate resolves to the matching service and location. Return the verified final URL after redirects with supporting sources. Use null when these conditions are not met.
6. Add caching, request limits, and contract compliant error handling. Keep the Gemini key in an ignored backend environment file. Commit only placeholder environment examples.
7. Write exact install, environment, start, and verification instructions in `docs/backend_setup.md`, including model and retrieval requirements.

## Required verification

Check that a 404 alone does not imply closure, a functioning homepage alone does not imply Active, closure evidence matches the specific service, and provider failure yields Uncertain. Verify source excerpts and URLs against retrieved evidence. Complete at least one live check through the teammate's extension before the demo.

## Demo and submission responsibilities

Own local example research, factual accuracy, source and library credits for your component, the Devpost description draft, and explanation of Gemini's role. Distinguish verified behavior from limitations. Do not invent impact metrics or imply FCI endorsement. Coordinate the final submission with the teammate.

## Handoff

Give the teammate the server start command, backend address, a real response without secrets, and known retrieval limitations. Agree on schema changes before implementing them. Do not wait for the full evidence pipeline to be complete before providing a working endpoint.
