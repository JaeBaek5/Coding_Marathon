# Mumuk (무먹)

Svelte 클라이언트와 Express 백엔드로 구성된 멀티 에이전트 음식점 추천 웹 앱입니다.

> 🌐 English version: [README.md](README.md)

## 문서

| 문서 | 다루는 내용 |
| --- | --- |
| [docs/CLAUDE.ko.md](docs/CLAUDE.ko.md) | 에이전트 행동 지침 및 저장소 규칙. |
| [docs/DESIGN.ko.md](docs/DESIGN.ko.md) | UI 토큰, 레이아웃 시스템, 디자인 제약. |
| [docs/MAP_RUNTIME.ko.md](docs/MAP_RUNTIME.ko.md) | 지도 준비 상태, 공개 설정, SDK 로딩, 클라이언트 지도 상태. |
| [docs/MAP_DATA_FLOW.ko.md](docs/MAP_DATA_FLOW.ko.md) | 위치 검색, 프로바이더 어댑터, 경로 흐름, 랭킹 입력값. |
| [docs/MAP_GROUNDING.ko.md](docs/MAP_GROUNDING.ko.md) | 표준 리뷰 URL, 추출 규칙, 근거 기반(grounded) 사유 제약. |

## 검증 명령어

- `npm run lint`
- `npm run test:unit`
- `npm run test:contract`
- `npm run test:integration`
- `npm run test:e2e`
- `npm run smoke`

## 스웜(Swarm) 관찰성

백엔드는 다음 항목에 대해 구조화된 JSON 로그를 출력합니다.

- HTTP 요청 라이프사이클
- 오케스트레이터, Aleph, Bet, Gimel 에이전트 홉(hop)
- 프로바이더 호출 시작/성공/실패
- 캐시 히트/미스/설정/채움/만료 동작

이 로그는 백엔드 아키텍처를 변경하지 않고도 스모크 검증과 장애 분류(triage)를 수행할 수 있도록 하는 것이 목적입니다.

## 환경 변수 계약

저장소에 픽스처 기반 폴백(fallback)이 포함되어 있으므로, 로컬 검증 시 프로바이더 자격 증명은 선택 사항입니다.

OpenAI 호환 런타임 공유 변수:

- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL_ORCHESTRATOR`
- `LLM_MODEL_ALEPH`
- `LLM_MODEL_GIMEL`
- `LLM_MODEL_BET` (선택)
- `LLM_TIMEOUT_MS`

호환성 규칙: 다른 OpenAI 호환 엔드포인트로 전환할 때는 환경 변수만 변경하면 되어야 합니다.

## 근거 기반(Grounding) 및 미지원 필드

Gimel은 정제된 후보 메타데이터와 스크래핑된 리뷰 사실(fact)만 사용할 수 있습니다. 다음 항목은 언급해서는 안 됩니다.

- 좌표, 위도, 경도
- 조작된 평점 또는 리뷰 수
- 추측한 가격 또는 인기도
- `null`이거나 사용할 수 없는 미지원 프로바이더 필드

스크래핑이 실패하면 Gimel은 미지원 사실을 생략하고, 대신 결정론적(deterministic) 폴백 문구를 사용해야 합니다.

## 스모크 매트릭스

스모크 스위트가 다루는 범위:

- 메인 스웜 해피 패스(happy path)
- 프로바이더 장애 처리
- 결과 없음 처리
- 경로 탐색 실패 처리
- 미지원 브라우저/위치정보(geolocation) 실패 경로
