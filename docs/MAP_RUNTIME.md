# Map Runtime

This document breaks down how the client turns map readiness into a live Naver map.

## Scope

- `server/src/config/publicConfig.js`
- `server/src/routes.js`
- `client/src/lib/components/MapPlaceholder.svelte`
- `client/src/lib/stores/session.svelte.js`

## Runtime Flow

1. The client calls `GET /api/config/public`.
2. The backend returns `mapReady`, `naverClientId`, and the provider readiness flags.
3. `MapPlaceholder.svelte` loads the Naver Maps SDK only when `mapReady` is true and a client ID exists.
4. Normal mode centers the map on `session.userLocation`.
5. Travel mode centers the map on `session.selectedLocation.coords`.
6. Once the map exists, the component renders the origin marker, result markers, and the active route overlay.

## Failure States

- Missing `NAVER_CLIENT_ID` shows an actionable missing-key message.
- SDK load failure shows a direct "SDK load failed" error state.
- Missing origin coordinates prevent map initialization.
- Empty results keep the map idle until data arrives.

## Related Code Paths

- `server/src/config/publicConfig.js`
- `server/src/routes.js`
- `client/src/lib/components/MapPlaceholder.svelte`
- `client/src/lib/stores/session.svelte.js`
