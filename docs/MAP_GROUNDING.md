# Map Grounding

This document breaks down how map-adjacent reasoning stays grounded in provider evidence.

## Scope

- `server/src/agents/gimel/index.js`
- `server/src/integration/gimel.test.js`
- `server/src/routes.js`

## Canonical Review URLs

Naver Place visitor-review URLs should be normalized before cache lookup or logging.

Keep the full place URL, but remove volatile `timestamp` query parameters.

Example canonical form:

```text
https://pcmap.place.naver.com/restaurant/1301083778/review/visitor?additionalHeight=76&fromPanelNum=1&locale=ko&svcName=map_pcv5
```

## Grounding Rules

- Gimel may only use sanitized candidate metadata and extracted review facts.
- It must not invent coordinates, ratings, review counts, prices, popularity, or opening hours.
- If extraction fails, Gimel omits unsupported facts instead of guessing.
- Candidate order stays fixed.

## Extraction Contract

- Prefer browser-capable extraction when the page is available.
- Fall back to a static hydration scan when the rendered path is not available.
- Return `reviewSnippets: []` and an explicit error when the page cannot be grounded.
- Log the canonical URL, not the timestamped original.

## Related Code Paths

- `server/src/agents/gimel/index.js`
- `server/src/integration/gimel.test.js`
- `server/src/routes.js`
