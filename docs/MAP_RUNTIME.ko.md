# 지도 런타임 (Map Runtime)

> 🌐 English version: [MAP_RUNTIME.md](MAP_RUNTIME.md)

이 문서는 클라이언트가 지도 준비 상태(map readiness)를 어떻게 실제 네이버 지도로 전환하는지 설명합니다.

## 범위 (Scope)

- `server/src/config/publicConfig.js`
- `server/src/routes.js`
- `client/src/lib/components/MapPlaceholder.svelte`
- `client/src/lib/stores/session.svelte.js`

## 런타임 흐름 (Runtime Flow)

1. 클라이언트가 `GET /api/config/public`을 호출합니다.
2. 백엔드가 `mapReady`, `naverClientId`, 그리고 프로바이더 준비 상태 플래그를 반환합니다.
3. `MapPlaceholder.svelte`는 `mapReady`가 true이고 클라이언트 ID가 존재할 때만 네이버 지도 SDK를 로드합니다.
4. 일반 모드(Normal mode)에서는 지도를 `session.userLocation` 기준으로 중앙 정렬합니다.
5. 여행 모드(Travel mode)에서는 지도를 `session.selectedLocation.coords` 기준으로 중앙 정렬합니다.
6. 지도가 생성되면 컴포넌트가 출발지 마커, 결과 마커, 활성 경로 오버레이를 렌더링합니다.

## 실패 상태 (Failure States)

- `NAVER_CLIENT_ID`가 없으면 조치 가능한 키 누락 메시지를 표시합니다.
- SDK 로드 실패 시 직접적인 "SDK load failed" 오류 상태를 표시합니다.
- 출발지 좌표가 없으면 지도 초기화를 막습니다.
- 결과가 비어 있으면 데이터가 도착할 때까지 지도를 유휴(idle) 상태로 유지합니다.

## 관련 코드 경로 (Related Code Paths)

- `server/src/config/publicConfig.js`
- `server/src/routes.js`
- `client/src/lib/components/MapPlaceholder.svelte`
- `client/src/lib/stores/session.svelte.js`
