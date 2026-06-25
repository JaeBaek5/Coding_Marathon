# Map Data Flow

This document breaks down the server-side path that prepares map-ready restaurant results.

## Scope

- `server/src/routes.js`
- `server/src/adapters/kakaoLocalAdapter.js`
- `server/src/adapters/kakaoMobilityAdapter.js`
- `server/src/adapters/naverDirectionsAdapter.js`
- `server/src/adapters/normalization.js`
- `server/src/services/ranking.js`

## Flow

1. `GET /api/location-search` searches for candidate places and normalizes the provider payload.
2. `POST /api/recommendations` and `POST /api/sessions/:sessionId/answers` push the request through the orchestrator.
3. Bet resolves the candidate set, then fans out route checks through the transport-specific provider adapter.
4. Raw provider responses are normalized before they reach the client.
5. Deterministic filters and ranking happen in backend code, not in the LLM.
6. The final response already contains the route and timing metadata needed for the map and results list.

## Rules

- The frontend does not call provider APIs directly.
- Route failures drop the affected candidate instead of broadening constraints.
- If all route checks fail, the backend returns `ROUTE_UNAVAILABLE`.
- Candidate ordering is deterministic and must not depend on a model.

## Related Code Paths

- `server/src/routes.js`
- `server/src/adapters/kakaoLocalAdapter.js`
- `server/src/adapters/kakaoMobilityAdapter.js`
- `server/src/adapters/naverDirectionsAdapter.js`
- `server/src/adapters/normalization.js`
- `server/src/services/ranking.js`
