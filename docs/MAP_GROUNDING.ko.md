# 지도 근거 기반 (Map Grounding)

> 🌐 English version: [MAP_GROUNDING.md](MAP_GROUNDING.md)

이 문서는 지도 관련 추론이 어떻게 프로바이더 증거(evidence)에 근거를 두고 유지되는지 설명합니다.

## 범위 (Scope)

- `server/src/agents/gimel/index.js`
- `server/src/integration/gimel.test.js`
- `server/src/routes.js`

## 표준 리뷰 URL (Canonical Review URLs)

네이버 플레이스 방문자 리뷰 URL은 캐시 조회나 로깅 전에 정규화되어야 합니다.

전체 장소 URL은 유지하되, 변동성이 큰 `timestamp` 쿼리 파라미터는 제거합니다.

표준 형식 예시:

```text
https://pcmap.place.naver.com/restaurant/1301083778/review/visitor?additionalHeight=76&fromPanelNum=1&locale=ko&svcName=map_pcv5
```

## 근거 기반 규칙 (Grounding Rules)

- Gimel은 정제된 후보 메타데이터와 추출된 리뷰 사실(fact)만 사용할 수 있습니다.
- 좌표, 평점, 리뷰 수, 가격, 인기도, 영업시간을 지어내서는 안 됩니다.
- 추출이 실패하면 Gimel은 추측하지 않고 미지원 사실을 생략합니다.
- 후보 순서는 고정으로 유지됩니다.

## 추출 계약 (Extraction Contract)

- 페이지를 사용할 수 있을 때는 브라우저 기반 추출을 우선합니다.
- 렌더링 경로를 사용할 수 없을 때는 정적 하이드레이션 스캔(static hydration scan)으로 폴백합니다.
- 페이지에 근거를 둘 수 없을 때는 `reviewSnippets: []`와 명시적 오류를 반환합니다.
- 타임스탬프가 붙은 원본이 아니라 표준 URL을 로깅합니다.

## 관련 코드 경로 (Related Code Paths)

- `server/src/agents/gimel/index.js`
- `server/src/integration/gimel.test.js`
- `server/src/routes.js`
