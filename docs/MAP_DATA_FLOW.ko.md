# 지도 데이터 흐름 (Map Data Flow)

> 🌐 English version: [MAP_DATA_FLOW.md](MAP_DATA_FLOW.md)

이 문서는 지도 표시가 가능한 음식점 결과를 준비하는 서버 측 경로를 설명합니다.

## 범위 (Scope)

- `server/src/routes.js`
- `server/src/adapters/kakaoLocalAdapter.js`
- `server/src/adapters/kakaoMobilityAdapter.js`
- `server/src/adapters/naverDirectionsAdapter.js`
- `server/src/adapters/normalization.js`
- `server/src/services/ranking.js`

## 흐름 (Flow)

1. `GET /api/location-search`가 후보 장소를 검색하고 프로바이더 페이로드를 정규화(normalize)합니다.
2. `POST /api/recommendations`와 `POST /api/sessions/:sessionId/answers`가 요청을 오케스트레이터로 전달합니다.
3. Bet이 후보 집합을 결정한 뒤, 교통수단별 프로바이더 어댑터를 통해 경로 검사를 분산(fan out) 수행합니다.
4. 원시(raw) 프로바이더 응답은 클라이언트에 도달하기 전에 정규화됩니다.
5. 결정론적 필터링과 랭킹은 LLM이 아니라 백엔드 코드에서 일어납니다.
6. 최종 응답에는 지도와 결과 목록에 필요한 경로 및 시간(timing) 메타데이터가 이미 포함되어 있습니다.

## 규칙 (Rules)

- 프론트엔드는 프로바이더 API를 직접 호출하지 않습니다.
- 경로 탐색 실패 시 제약 조건을 넓히는 대신 해당 후보를 제외합니다.
- 모든 경로 검사가 실패하면 백엔드는 `ROUTE_UNAVAILABLE`을 반환합니다.
- 후보 정렬 순서는 결정론적이어야 하며 모델에 의존해서는 안 됩니다.

## 관련 코드 경로 (Related Code Paths)

- `server/src/routes.js`
- `server/src/adapters/kakaoLocalAdapter.js`
- `server/src/adapters/kakaoMobilityAdapter.js`
- `server/src/adapters/naverDirectionsAdapter.js`
- `server/src/adapters/normalization.js`
- `server/src/services/ranking.js`
