# Development fixtures

These JSON files follow [the integration contract](../integration_contract.md). They are local mock data, not a live API implementation.

1. `s4p-listing.json`: example request for the S4P listing.
2. `s4p-review.json`: matching mock response, explicitly marked `mode: "mock"`.

The response is Uncertain because no current sources have been fetched or verified. The original fixture reported a 404 and identified https://www.strivinghome.org/departments/synergy as a possible replacement. Those remain unverified research leads. Do not show that URL as a verified replacement until a real check establishes the match.

Display “Demo data, not a live check” for mock responses and “Not checked” for null check times. Do not insert a current timestamp or fabricated evidence. Fixtures never replace failed live requests automatically.
