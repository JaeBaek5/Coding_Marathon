# Mumuk Swarm MVP - 반응형 식당 추천 웹앱 작업 계획

## TL;DR

**목표**: `머먹`을 모바일 우선 반응형 식당 추천 웹앱으로 완성한다. 프론트엔드는 `Vite + Svelte 5`, 백엔드는 `Express`를 유지하되, 백엔드 내부 추천 흐름은 단일 LLM 호출이 아니라 `Orchestrator -> Aleph -> Bet -> Gimel -> Orchestrator` 형태의 bounded multi-agent harness로 정리한다.

**핵심 방향**:

- Orchestrator는 실제 LLM supervisor로 동작한다.
- Aleph는 자연어를 슬롯으로 파싱하고 누락 슬롯 질문만 만든다.
- Bet는 Kakao/Naver provider 호출, 경로 계산, 필터링, 점수화, Top N 선정을 deterministic code로 처리한다.
- Gimel은 sanitized candidate metadata와 실제 리뷰 추출/요약 결과만 사용해 추천 이유를 생성한다.
- 모든 agent I/O는 Zod JSON schema로 검증한다.
- 위치는 프롬프트 문자열에 섞지 않고 `query`와 분리된 structured payload로 전달한다.
- Naver Place visitor review URL은 timestamp를 제거한 canonical URL로 다루고, browser-capable extraction을 1차 경로로 둔다.
- `poc/` Streamlit 구현에서 검증한 Naver Local -> place_id -> Naver Place Apollo hydration -> 리뷰/사진/메뉴판 추출 흐름을 MVP 백엔드 요구사항에 편입한다. 단, Streamlit 자체는 MVP 제품 스택이 아니라 참고 구현이다.

**노력 규모**: Large
**병렬화**: 가능, 4개 wave
**Critical path**: 1 -> 2 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

## Context

### Product Goal

사용자가 “친구랑 지금 점심, 예산 12000원, 한 시간 이내, 도보 가능” 같은 자연어 요청을 입력하면, 앱은 필요한 슬롯이 모두 채워졌는지 확인하고, 부족하면 최대 2번의 follow-up으로 물어본 뒤, 실제 지도/경로/리뷰 근거가 있는 후보 풀 최대 5개를 만든다. 최종 추천은 한 번에 1개만 보여주고, 사용자가 마음에 들지 않는다고 하면 다음 1개를 보여준다. 두 번째도 싫으면 후보 5개 전체를 보여준다.

### Scope Update

이 계획의 기준 아키텍처는 단일 LLM orchestrator가 아니다. 백엔드는 명확히 분리된 내부 swarm runtime을 사용한다.

- **Orchestrator**: client request/session을 받고 agent 호출 순서를 관리하며 최종 API 응답을 조립한다.
- **Aleph**: raw query와 answer payload를 슬롯으로 파싱하고, 누락 필드와 follow-up 질문을 만든다.
- **Bet**: 공식 provider API를 사용해 식당 후보, 경로, 시간, 점수, 순위를 계산한다.
- **Gimel**: Bet의 Top N 결과에 대해 실제 리뷰/평점 추출 결과만 사용해 grounded reason을 생성한다.
- **Orchestrator final pass**: 후보 순서와 사실을 바꾸지 않고 client contract에 맞게 결과를 포장한다.

### Unchanged Stack Decisions

- Frontend: `Vite + Svelte 5`
- Backend: `Express`
- Styling: authored CSS only
- Forbidden: React, Tailwind, Bootstrap, SvelteKit, Streamlit MVP track

## Work Objectives

### Core Objective

자연어 요청과 구조화된 위치 payload에서 map-ready 추천 결과까지 이어지는 완전한 모바일 우선 추천 flow를 구현한다. provider 검색, 경로 계산, 필터링, ranking은 deterministic backend code로 유지하고, LLM은 slot parsing, supervision, explanation generation처럼 제한된 역할만 맡는다.

### Deliverables

- `client/` Vite + Svelte 5 frontend
- `server/` Express backend
- `shared/` contracts and fixtures
- `server/src/llm/` shared OpenAI-compatible client boundary
- `server/src/agents/orchestrator/`
- `server/src/agents/aleph/`
- `server/src/agents/bet/`
- `server/src/agents/gimel/`
- Kakao Local, Kakao Mobility, NAVER route/map adapters
- Naver Place visitor-review extraction tool contract
- Naver Place photo/menu/review summary extraction modeled from `poc/app.py` and `poc/implement/naver_nearby_review_test.py`
- Vitest unit/contract/integration tests
- Playwright E2E coverage
- `.env.example`, live smoke, evidence output conventions

### Definition of Done

- `npm install` succeeds at repo root
- `npm run lint` exits `0`
- `npm run test:unit` exits `0`
- `npm run test:contract` exits `0`
- `npm run test:integration` exits `0`
- `npm run test:e2e` exits `0`
- `npm run smoke` exits `0`
- `GET /api/health` returns `200`
- 전체 추천 flow가 자연어 입력부터 route metadata 포함 결과까지 동작한다.
- 추천 이유는 실제 provider metadata 또는 tool로 추출한 리뷰/요약/평점에 근거한다.
- 후보 풀은 최대 5개지만 첫 응답은 1개 추천만 반환하거나 표시한다.
- 사용자가 "다른 곳" 또는 싫어요를 선택하면 다음 1개 추천으로 진행하고, 두 번째 추천도 싫으면 후보 풀 5개를 모두 표시한다.
- LLM endpoint/model 변경은 env 설정 변경만으로 가능해야 한다.

## Must Have

- Node 20, Vite, Svelte 5, Express, Vitest, Playwright, ESLint, Prettier
- 모든 agent가 공유하는 OpenAI-compatible LLM client boundary
- Env-driven `baseURL`, API key, timeout, model names
- Express backend 내부 in-process supervisor-worker swarm
- Sequential pipeline: `Client -> Orchestrator -> Aleph -> Orchestrator -> Bet -> Gimel -> Orchestrator -> Client`
- Bet 내부 bounded parallelism for route checks/enrichment
- Deterministic ranking in code
- Candidate pool default = 5
- Initial final recommendation count = 1
- Cafes and bars are excluded by default and included only when the user's prompt explicitly asks for cafe, coffee, dessert, bar, pub, alcohol, drinking, or equivalent Korean wording.
- Grounded reason generation using real extracted reviews and review summaries when available
- Review extraction target: collect at least 10 reviews when available, include positive and negative reviews, cap at 20 reviews per candidate.
- Review summary contract: one-line `pros` and one-line `cons` separated explicitly; cons must be allowed to summarize negative reviews instead of filtering them out.
- User feedback controls on each shown recommendation: `좋아요` and `싫어요`. For this MVP plan, buttons can be frontend state only: like marks "can recommend again later", dislike marks "do not recommend in this session"; no database persistence required yet.
- Structured location payload alongside the natural-language query
- Route, coordinates, distance, timing metadata returned to client
- Existing mobile-first UI direction preserved
- Authored CSS only

## Must NOT Have

- No client-side LLM or provider secret usage
- No LLM ranking
- No LLM-based hard-filter relaxation
- No hallucinated review/rating/price/opening-hour claims
- No filtering out negative reviews before summarization
- No cafe or bar recommendations unless the user explicitly asks for them in the prompt or follow-up answer
- No showing all 5 recommendations in the initial result state
- No silent radius or constraint broadening
- No React, Tailwind, Bootstrap, SvelteKit
- No Streamlit implementation path for MVP; `poc/` is reference evidence only, not the production frontend/backend stack.
- No microservice split or distributed queue for MVP
- No frontend-driven direct provider calls
- No mock-only implementation path when valid `.env` keys exist
- No IP-based location as the primary location source
- No concatenating raw latitude/longitude into freeform LLM prompt text

## Architecture Decisions

### Runtime Split

- Frontend owns UI rendering, browser geolocation permission, manual location fallback UI, form flow, and map rendering.
- Backend owns swarm orchestration, session state, provider calls, normalization, filtering, ranking, grounding, and error taxonomy.

### Location Input Contract

The client request must send natural-language intent and location as separate structured fields. This is required because restaurant search and routing depend on user position, but raw coordinates must stay in deterministic provider code instead of becoming freeform LLM prompt text.

Request shape:

```json
{
  "query": "친구랑 지금 점심, 예산 12000원, 도보 가능",
  "location": {
    "lat": 37.5665,
    "lng": 126.978,
    "accuracyMeters": 25,
    "source": "browser-geolocation"
  }
}
```

Rules:

- Normal mode uses browser geolocation as `location.source = "browser-geolocation"` after explicit user permission.
- Travel/manual mode uses the selected place as `location.source = "manual-location"` or `selectedLocation`; it must not silently fall back to browser/IP location.
- If location permission is denied or unavailable, the client must offer manual location input before Bet runs.
- If no usable location is available after fallback, Orchestrator returns deterministic `GEO_REQUIRED`.
- Aleph can receive whether location is present or missing, but it must not invent coordinates from prose.
- Bet is the only agent boundary that receives raw `lat`/`lng` for provider search and route calculation.
- Gimel receives only sanitized route, distance, address/category, and grounding fields; it must not receive or mention raw coordinates.
- Streamlit is not part of the MVP implementation path.
- `poc/` Streamlit code can inform provider extraction and UX decisions, but production implementation must remain in `client/`, `server/`, and `shared/`.

### PoC Reference Implementation Incorporated Into This Plan

The `poc/` folder contains a working reference for Naver-backed enrichment. It is not the production implementation path, but the production MVP must preserve the relevant behavior as backend contracts and tests.

Reference files:

- `poc/app.py`
- `poc/implement/naver_nearby_review_test.py`
- `poc/implement/네이버_맛집_파이프라인_설명.md`

PoC capabilities to carry into the MVP:

- Browser geolocation in Streamlit via `streamlit-geolocation`, with IP/manual fallback as a POC-only convenience. Production remains browser geolocation plus manual selected location; IP is not primary.
- Naver Local search using `NAVER_SEARCH_ID` and `NAVER_SEARCH_SECRET`.
- Reverse geocoding and driving route calls using `NAVER_CLIENT_ID` and `NAVER_CLIENT_SECRET`.
- `m.search.naver.com` place id resolution from `{placeName} {addressPart}`.
- `m.place.naver.com/{biz}/{place_id}/review/visitor` Apollo hydration scan for visitor reviews.
- `m.place.naver.com/{biz}/{place_id}/home` Apollo hydration scan for representative photo, menu board photo, food photos, and registered `Menu` objects.
- Optional OpenRouter Vision extraction for menu board photos, controlled by `OPENROUTER_API_KEY` and `OPENROUTER_VISION_MODEL`.
- Per-place JSON artifact shape under `poc/data/places/{place_id}.json` with `placeId`, `placeUrl`, `name`, `category`, `address`, `mainPhoto`, `menuBoardPhoto`, `menuItems`, `foodPhotos`, `reviews`, and source URLs.

Production adaptation rules:

- Move the provider/enrichment behavior into backend tools used by Bet/Gimel; do not import Streamlit app code into production.
- Preserve POC parsing lessons: force UTF-8 for Naver HTTP responses, parse `__APOLLO_STATE__` with `JSONDecoder.raw_decode`, and try Naver business path variants (`restaurant`, `place`, `hairshop`, `beauty`, `hospital`, `accommodation`, `cafe`).
- Cache or bound expensive calls; Vision LLM must run only when a menu board photo exists.
- POC saved JSON can become fixture/evidence format, not a production persistence requirement.

### LLM Provider Configuration

Use one shared backend LLM client factory based on an OpenAI-compatible SDK.

Required env contract:

- `OPENROUTER_API_KEY` or `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL_ORCHESTRATOR`
- `LLM_MODEL_ALEPH`
- `LLM_MODEL_GIMEL`
- `LLM_TIMEOUT_MS`

Optional env contract:

- `OPENROUTER_MODEL`
- `LLM_MODEL_BET`

Rules:

- All agent modules receive the same client/config boundary.
- `LLM_BASE_URL` must be swappable without code changes.
- OpenRouter default model is `cohere/north-mini-code:free` unless overridden.
- All model responses must be schema-validated.
- Tests mock the shared client boundary, not raw provider HTTP.

### OMO-Style Harness Upgrade

The swarm must behave like a bounded harness, not like four loose prompt calls. The user-facing college-student prompt below is the canonical happy-path fixture:

```text
친구랑 같이 지금 점심 먹으려고 하는 대학생인데, 현재 위치 기준으로 한 시간 이내에 다녀올 수 있는 곳 추천해줘. 도보로 갈 수 있으면 좋겠고, 1인당 예산은 12000원 정도야. 너무 시끄럽지 않고 편하게 오래 얘기할 수 있는 캐주얼한 분위기면 좋겠어. 매운 음식은 빼고 추천해줘.
```

Expected slot bundle:

```json
{
  "mode": "normal",
  "mealPeriod": "lunch",
  "totalTimeMinutes": 60,
  "transportMode": "walk",
  "budgetPerPersonKrw": 12000,
  "partyContext": "친구",
  "vibe": "캐주얼하고 편하게 대화 가능한 분위기",
  "excludedFoods": ["매운 음식"]
}
```

Harness rules:

- **Orchestrator is a real LLM supervisor**: request state를 판단하고 fixed agent chain의 다음 단계를 선택할 수 있다. 단, 슬롯 파싱, 식당 검색, 순위 결정, 리뷰 추출, 추천 사실 생성은 직접 하지 않는다.
- **Aleph is slot-only**: raw prompt와 current slot state를 받아 schema-valid slot proposal, missing fields, follow-up questions만 반환한다. 위치, route time, budget, provider metadata를 지어내지 않는다.
- **Bet is deterministic/tool-first**: 공식 provider 호출, route fan-out, hard filters, time math, scoring, tie-breakers, Top N clipping을 담당한다. LLM 판단은 ranking과 constraint relaxation에 들어오면 안 된다.
- **Gimel is explanation-only**: sanitized candidate metadata와 approved review-tool output만 받아 짧은 grounded reason을 만든다. 후보 순서를 바꾸거나 좌표를 말하거나 평점/리뷰/가격/영업시간/인기도를 지어내지 않는다.
- **Agent I/O is Zod JSON**: 모든 hop은 schema를 갖고, invalid output은 deterministic error 또는 retry policy로 처리한다.
- **Trace every hop**: `{ sessionId, agent, phase, inputSchema, outputSchema, model, durationMs, status }` 형태의 lightweight hop ledger를 남긴다. secrets와 raw provider payload는 기록하지 않는다.

Implementation impact:

- `server/src/agents/orchestrator/index.js`는 re-export가 아니라 실제 orchestrator agent module이 되어야 한다.
- `server/src/services/orchestrator.js` 안의 중복 search/route/ranking logic은 `server/src/agents/bet/index.js` 호출로 이동한다.
- Grounded reason generation은 `server/src/agents/gimel/index.js`를 통해 수행한다.
- `server/src/services/orchestrator.js`는 HTTP/session coordinator 역할로 축소한다.

### Swarm Layout

**Orchestrator**

- Receives initial request and answer submissions
- Creates or resumes backend session state
- Delegates raw query to Aleph
- Delegates validated slot bundle to Bet
- Delegates ranked Top N payload to Gimel
- Produces final `questions`, `results`, or `error` response
- May polish wording, but may not reorder candidates or invent facts

**Aleph**

- Parses natural language into slot proposals
- Detects missing required slots
- Returns bundled follow-up questions
- Re-validates answer-form submissions
- Rejects invalid or out-of-range slot values
- Stops after 2 rounds max

**Bet**

- Calls Kakao Local for nearby search and travel/manual location lookup
- Calls Kakao Mobility and NAVER route APIs as needed
- Normalizes provider payloads
- Deduplicates candidates
- Applies venue-type gating: restaurants by default; cafes/bars only when explicitly requested.
- Computes route times and total expected time
- Applies hard filters
- Applies deterministic ranking
- Returns sorted candidate pool Top 5 with metadata and score breakdown

**Gimel**

- Receives sanitized candidate metadata from Bet
- Uses review extraction tools for Kakao/Naver place URLs and Naver place id resolution when a place URL is unavailable.
- Collects 10-20 reviews when available, including negative reviews.
- Produces structured review summary: one-line `pros`, one-line `cons`, plus representative snippets.
- Generates short grounded reasons based on extracted review summary/data and provider metadata
- Must not fabricate reviews
- Must not mention precise coordinates
- Must not change candidate order

### Naver Place Review Extraction Contract

Gimel review tooling must support timestamp-free Naver Place visitor-review URLs such as:

```text
https://pcmap.place.naver.com/restaurant/1301083778/review/visitor?additionalHeight=76&fromPanelNum=1&locale=ko&svcName=map_pcv5
```

The original timestamped URL shape is equivalent input, but `timestamp` must be ignored for cache keys and fixture stability:

```text
https://pcmap.place.naver.com/restaurant/1301083778/review/visitor?additionalHeight=76&fromPanelNum=1&locale=ko&svcName=map_pcv5&timestamp=202606251628
```

Tool contract:

- Input: `{ placeUrl?, placeName, address? }`
- Normalize: remove `timestamp` before cache lookup and logging.
- If `placeUrl` is absent, resolve `place_id` through `m.search.naver.com` using `{placeName} {addressPart}`.
- First attempt: browser-capable extraction because Naver Place visitor reviews are dynamic.
- Fallback: static HTTP fetch and hydration scan.
- Review target: collect at least 10 reviews when page data has enough reviews; cap at 20.
- Negative reviews must remain in the extracted review corpus and feed the `cons` summary.
- Output: `{ provider, placeUrl, placeId, rating, reviewCount, reviews, reviewSummary, reviewSnippets, extractionMethod, fetchedAt, error }`
- `reviewSummary` shape: `{ pros: string | null, cons: string | null }`, each at most one line and grounded in extracted reviews.
- If reviews are blocked, absent, or unavailable, return `reviews: []`, `reviewSnippets: []`, `reviewSummary: { pros: null, cons: null }`, and explicit `error`; Gimel must omit review claims.

Naver place enrichment contract modeled from `poc/`:

- Fetch home page Apollo hydration for `mainPhoto`, `menuBoardPhoto`, `foodPhotos`, and registered `menuItems`.
- If a menu board photo exists and `OPENROUTER_API_KEY` is configured, run Vision extraction through `OPENROUTER_VISION_MODEL`; otherwise use registered `Menu` objects only.
- Enrichment output must be nullable and fail closed per candidate. One failed place enrichment must not fail the whole recommendation request.
- Store source URL metadata for evidence/debugging, but never expose secrets or raw provider payloads to the client.

Verified probe result from 2026-06-25:

- Static HTTP fetch returned `200 text/html`, body length about `690k`.
- Static hydration scan extracted 5 Korean review snippets.
- Headless Chromium rendered the page and extracted 5 review-like snippets.
- Evidence: `.omo/evidence/naver-review-extraction-probe.json`
- Screenshot: `.omo/evidence/naver-review-browser.png`

### Session and Slot Rules

Required slots before Bet can run:

- `mode`
- `location`
- `mealPeriod`
- `totalTimeMinutes`
- `transportMode`
- `budgetPerPersonKrw`
- `partyContext`
- `vibe`
- `excludedFoods`

Optional slots:

- `jobContext`
- `ageGroup`

Rules:

- Session TTL: 30 minutes in backend memory
- Max follow-up rounds: 2
- Slot priority order: `mode/location -> mealPeriod -> totalTimeMinutes -> transportMode -> budgetPerPersonKrw -> partyContext -> vibe -> excludedFoods`
- User total time must stay in the `20-60` minute range
- `totalExpectedMinutes = (oneWayRouteMinutes * 2) + 30`
- `location` must be a validated structured payload, not natural-language-only text.
- `location.source` must be one of `browser-geolocation`, `manual-location`, or `selected-location`.

### Grounding Rules

Gimel may use:

- `name`
- `category`
- `address`
- `transportMode`
- `oneWayRouteMinutes`
- `totalExpectedMinutes`
- `distanceMeters`
- `openStatus` if known
- deterministic fit signals from Bet
- real reviews and ratings extracted by tools
- one-line review summary `pros` and `cons`
- extracted menu items and photos only when directly obtained from Naver Place hydration or Vision menu-board extraction
- provider attribution

Gimel may not use:

- raw coordinates
- hallucinated ratings
- hallucinated reviews
- guessed price
- guessed menu items
- guessed popularity
- guessed opening hours

If a field is `null` or unavailable and extraction fails, Gimel must omit it. If negative reviews exist, Gimel can mention the `cons` line neutrally, but it must not hide the existence of downsides in review summary data.

### Recommendation Presentation and Feedback Flow

The backend may compute a Top 5 candidate pool, but the user-facing recommendation flow is sequential:

1. Initial result state shows exactly 1 recommendation: the highest-ranked candidate not blocked by session dislikes.
2. The recommendation card exposes `좋아요` and `싫어요`.
3. `좋아요` marks the candidate as acceptable for future recommendation logic. For MVP this can be client/session state only; no database persistence is required.
4. First `싫어요` advances to the next candidate and shows exactly 1 replacement recommendation.
5. Second `싫어요` advances to the next candidate if available and also reveals the full Top 5 candidate pool, so the user can choose manually.
6. A disliked candidate must not be shown again within the current session.

API/client contract impact:

- Orchestrator response can include a `candidatePool` of up to 5 plus `currentRecommendation`.
- Client renders `currentRecommendation` first, not the full pool.
- Client state tracks liked/disliked ids for the current session; database persistence is explicitly out of scope for this plan revision.
- E2E tests must prove the first screen has one card, the first dislike has one different card, and the second dislike reveals the full pool.
- Acceptance wording for QA: second dislike reveals the full Top 5 candidate pool.

## Verification Strategy

- TDD is mandatory for behavior-changing work.
- Start from schemas and fixtures, not prompt prose.
- Unit tests cover slot parsing helpers, ranking, time budget, and grounding validators.
- Contract tests cover public API and agent I/O shapes.
- Integration tests cover Aleph, Bet, Gimel, and Orchestrator composition.
- Playwright covers mobile and desktop UX flows, including granted, denied, manual location paths, one-at-a-time recommendations, feedback buttons, and the full-pool reveal after repeated dislikes.
- Live smoke tests run only when valid env values are present.
- Evidence path convention: `.omo/evidence/task-{N}-{slug}.{ext}`

## Execution Waves

### Wave 1: Foundation, Contracts, Swarm Boundaries

- Task 1: Bootstrap shared LLM runtime and env contract
- Task 2: Define swarm contracts, fixtures, and prompt/output schemas
- Task 3: Implement Aleph slot parsing and follow-up validation
- Task 4: Implement provider adapter boundaries and normalization for Bet inputs

### Wave 2: Backend Swarm Core

- Task 5: Implement Bet deterministic search/routing/ranking pipeline
- Task 6: Implement Gimel grounded reason generation and Naver review extraction
- Task 7: Implement Orchestrator supervisor flow, session control, and HTTP API wiring

### Wave 3: Frontend UX and Integration

- Task 8: Implement frontend natural-language request and follow-up form flow
- Task 9: Implement results UI, grounded reasons, map sync, and metadata rendering

### Wave 4: Hardening and Release Verification

- Task 10: Implement smoke coverage, observability, compatibility checks, and final compliance hardening

## Dependency Matrix

| Task | Depends On        | Blocks             |
| ---- | ----------------- | ------------------ |
| 1    | -                 | 2,3,4,5,6,7,8,9,10 |
| 2    | 1                 | 3,4,5,6,7,8,9,10   |
| 3    | 1,2               | 7,8,10             |
| 4    | 1,2               | 5,7,9,10           |
| 5    | 1,2,4             | 6,7,9,10           |
| 6    | 1,2,5             | 7,9,10             |
| 7    | 1,2,3,5,6         | 8,9,10             |
| 8    | 1,2,3,7           | 9,10               |
| 9    | 1,2,4,5,6,7,8     | 10                 |
| 10   | 1,2,3,4,5,6,7,8,9 | F1,F2,F3,F4        |

## Task Plan

### 1. Bootstrap shared LLM runtime and env contract

Tests first:

- Add failing unit tests for env parsing, defaults, missing config, timeout handling, `baseURL` injection, and public non-secret harness metadata.

Implement:

- Create or finish `server/src/llm/` single client factory and config loader.
- Centralize `baseURL`, API key, model names, reasoning settings, and timeout values.
- Ensure all agent modules depend on this boundary.

Verify:

- `npm run test:unit -- --run server/src/unit/llm/config.test.js server/src/unit/llm/client.test.js`
- `npm run test:integration -- --run server/src/integration/api.test.js`

Commit:

- `chore(server): bootstrap swarm llm runtime`

### 2. Define swarm contracts, fixtures, and prompt/output schemas

Tests first:

- Add failing contract tests for Orchestrator decision output, Aleph parse output, Aleph missing-slot output, location payload shape, Bet search output, Gimel input allowlist, Gimel reason output, review extraction output, and final API response states.

Implement:

- Extend shared schemas for all agent boundaries.
- Add location schema with `lat`, `lng`, `accuracyMeters`, and `source`.
- Add canonical college-student prompt fixture and expected slot bundle.
- Lock review extraction schema before Gimel prompt work expands.

Verify:

- `npm run test:contract`

Commit:

- `test(domain): add swarm contracts and fixtures`

### 3. Implement Aleph slot parsing and follow-up validation

Tests first:

- Add failing unit tests for complete query parsing, partial query parsing, invalid time detection, round limit enforcement, and answer re-validation.
- Include the canonical college-student prompt as a complete-slot happy path.
- Add failing tests proving Aleph reports missing location state without inventing coordinates.

Implement:

- Build Aleph as slot-only agent.
- Parse raw query into slot proposals.
- Detect missing fields in priority order.
- Return bundled follow-up questions.
- Re-validate answer submissions.

Verify:

- `npm run test:unit`
- `npm run test:integration`

Commit:

- `feat(server): add aleph slot agent`

### 4. Implement provider adapter boundaries and normalization for Bet

Tests first:

- Add failing contract tests for Kakao Local normalization, Kakao Mobility route normalization, NAVER route normalization, TTL cache policy, and dedupe behavior.

Implement:

- Keep official provider adapters behind stable interfaces.
- Normalize raw place and route payloads into shared candidate/route shapes.
- Add cache wrappers and dedupe rules Bet will depend on.

Verify:

- `npm run test:contract`
- `npm run test:integration`

Commit:

- `feat(server): add bet adapter normalization layer`

### 5. Implement Bet deterministic search, route, filter, and ranking pipeline

Tests first:

- Add failing unit tests for score calculation, time budget math, hard filters, tie-breakers, and Top N clipping.
- Add failing integration tests for route fan-out, no-results, provider failure, and fewer-than-5 result scenarios.
- Add failing tests that cafes and bars are excluded by default.
- Add failing tests that cafes/bars are included only when the prompt or slot state explicitly requests cafe, coffee, dessert, bar, pub, alcohol, 술집, 카페, or equivalent terms.

Implement:

- Build Bet as tool-first deterministic agent.
- Search restaurants, calculate routes, compute total expected time, filter, rank, and select Top N.
- Add bounded parallel execution for route checks and enrichment.
- Add venue-type classification/gating before final ranking. Default allowed type is restaurant-like places only; cafe/bar-like places require explicit user intent.
- Return a sorted candidate pool of up to 5 candidates for Orchestrator presentation flow.

Verify:

- `npm run test:unit`
- `npm run test:integration`

Commit:

- `feat(server): add bet search pipeline`

### 6. Implement Gimel grounded reason generation and review extraction

Tests first:

- Add failing tests that reject hallucinated review/rating content.
- Add failing tests that confirm coordinates are stripped before prompt assembly.
- Add failing integration tests for timestamp-free Naver Place URL extraction.
- Add failing integration tests for POC-derived place id resolution through `m.search.naver.com`.
- Add failing tests that review extraction keeps negative review bodies and collects 10-20 reviews when available.
- Add failing tests for review summary shape: one-line `pros`, one-line `cons`, both grounded in extracted reviews.
- Add failing tests for Naver home hydration photo/menu extraction: `mainPhoto`, `menuBoardPhoto`, `foodPhotos`, registered `menuItems`.
- Add failing tests that Vision menu extraction is skipped when no menu board photo exists or no OpenRouter key is configured.

Implement:

- Build Gimel as explanation-only agent.
- Implement review extraction tool with browser-capable extraction first and static hydration scan fallback.
- Normalize Naver URL by removing `timestamp`.
- Implement POC-derived Naver Local/Place enrichment: place id resolution, visitor-review Apollo parsing, home Apollo parsing for photos/menu data, optional Vision menu-board extraction.
- Collect at least 10 reviews when available and at most 20 reviews per candidate.
- Include negative review text in the collected corpus and in the `cons` summary when relevant.
- Generate reasons only from sanitized candidate metadata, review summary, and tool output.

Verify:

- `npm run test:integration`
- Browser/HTTP probe against the timestamp-free Naver URL, saving evidence to `.omo/evidence/naver-review-extraction-probe.json`
- Synthetic Apollo hydration fixture test modeled from `poc/implement/naver_nearby_review_test.py`, saving evidence to `.omo/evidence/task-6-poc-naver-hydration.json`

Commit:

- `feat(server): add gimel review extraction and grounded reasons`

### 7. Implement Orchestrator supervisor flow and backend HTTP wiring

Tests first:

- Add failing integration tests for `/api/recommendations`, `/api/sessions/:sessionId/answers`, structured location payload validation, `questions`, `results`, `GEO_REQUIRED`, `SESSION_EXPIRED`, `INVALID_TOTAL_TIME`, `NO_RESULTS`, and `ROUTE_UNAVAILABLE`.
- Add failing integration tests for sequential recommendation presentation: initial response has one `currentRecommendation`, first dislike advances to one new recommendation, second dislike reveals full candidate pool.
- Add failing tests that liked/disliked candidate ids are tracked in session state only and disliked ids are not recommended again in the same session.

Implement:

- Build Orchestrator as real supervisor agent module.
- Own session state, round limits, and agent delegation.
- Require validated structured location before calling Bet.
- Preserve map-ready metadata in final response.
- Keep response statuses: `questions`, `results`, `error`.
- Preserve Bet's Top 5 candidate pool internally and expose one `currentRecommendation` first.
- Add session-scoped feedback actions for `like` and `dislike`; no database persistence.
- On first dislike, select the next non-disliked candidate. On second dislike, expose the full Top 5 pool.

Verify:

- `npm run test:integration`
- `curl http://localhost:8787/api/health`

Commit:

- `feat(api): add orchestrator supervisor flow`

### 8. Implement frontend natural-language request and follow-up form flow

Tests first:

- Add failing Playwright coverage for mobile query submission, geolocation permission grant, permission denial/manual location fallback, follow-up form rendering, answer submission, and session reset behavior.
- Add failing Playwright coverage that cafe/bar prompts change venue gating only when explicit.

Implement:

- Update Svelte client flow to consume Aleph question states and Orchestrator answer endpoints.
- Capture browser geolocation into structured request payload.
- Provide manual location input when browser geolocation is unavailable or denied.
- Render form UI for missing slots.
- Preserve explicit cafe/bar intent in the request/slot state; do not silently infer cafe/bar from generic "맛집".
- Preserve mobile-first layout and authored CSS.

Verify:

- `npm run test:e2e`

Commit:

- `feat(client): add query and follow-up flow`

### 9. Implement results UI, grounded reasons, and map metadata rendering

Tests first:

- Add failing Playwright tests for result count, pin count, selected route sync, null-field hiding, and grounded reason rendering.
- Add failing Playwright tests for one-at-a-time recommendation display and feedback controls.
- Add failing Playwright tests for the sequence: initial one recommendation -> dislike shows next one -> second dislike reveals full pool.
- Add failing Playwright tests that review summary renders separate 장점 and 단점 one-line fields.

Implement:

- Render final result cards from Orchestrator output.
- Keep map/list synchronization.
- Display route/time/distance metadata, provider attribution, Naver photo/menu data when present, and separate review summary lines for 장점 and 단점.
- Render `좋아요` and `싫어요` buttons on the currently shown recommendation.
- Keep feedback state local/session-backed for MVP; no database writes.
- Show exactly one recommendation on initial result state, then follow the dislike reveal sequence before showing the full candidate pool.
- Never fabricate unsupported fields in UI.

Verify:

- `npm run test:e2e`

Commit:

- `feat(client): add results and map sync`

### 10. Harden smoke coverage, observability, and compatibility checks

Tests first:

- Add failing smoke/E2E checks for provider outage, no-results, unsupported browser path, denied geolocation/manual fallback, route failure, and missing map key state.
- Add failing integration tests for alternate OpenAI-compatible `baseURL` behavior.
- Add final smoke evidence for sequential recommendation display and feedback button state.

Implement:

- Add structured logs for agent hops, provider calls, cache behavior, and review extraction method.
- Add documentation for env variables, grounding rules, unsupported fields, and Naver review extraction limitations.
- Document PoC-derived Naver Place extraction behavior, review summary constraints, cafe/bar gating, and non-persistent MVP feedback buttons.
- Add smoke coverage for the main swarm path and primary unhappy paths.

Verify:

- `npm run lint`
- `npm run test:unit`
- `npm run test:contract`
- `npm run test:integration`
- `npm run test:e2e`
- `npm run smoke`

Commit:

- `chore(qa): harden swarm verification`

## Final Verification Wave

### F1. Plan Compliance Audit

Audit implementation against this plan, including harness boundaries and forbidden LLM behaviors.

### F2. Code Quality Review

Review client, server, agent boundaries, tests, and review extraction code for duplication, oversized modules, and AI-slop patterns.

### F3. End-to-End QA Sweep

Run full browser-driven happy-path and unhappy-path verification. Include missing API key state and live provider path when keys are present.

### F4. Scope Fidelity Check

Confirm implementation includes MVP scope and does not add forbidden tech, frontend secrets, distributed workers, or mock-only behavior.

## Atomic Commit Strategy

Use one atomic commit per numbered task. Do not combine LLM runtime setup, Bet pipeline work, Gimel review extraction, and frontend work in one commit.

Suggested commit order:

1. `chore(server): bootstrap swarm llm runtime`
2. `test(domain): add swarm contracts and fixtures`
3. `feat(server): add aleph slot agent`
4. `feat(server): add bet adapter normalization layer`
5. `feat(server): add bet search pipeline`
6. `feat(server): add gimel review extraction and grounded reasons`
7. `feat(api): add orchestrator supervisor flow`
8. `feat(client): add query and follow-up flow`
9. `feat(client): add results and map sync`
10. `chore(qa): harden swarm verification`

## Success Criteria

- A user can complete a recommendation flow from natural-language query to map-ready results without manual intervention.
- Recommendation requests carry location as structured data alongside the prompt, not as raw coordinate prose.
- Browser geolocation denial falls back to manual location input or deterministic `GEO_REQUIRED`.
- Missing information is resolved within two follow-up rounds or deterministic error state.
- Bet returns up to 5 recommendations and never fabricates candidates.
- Bet excludes cafes and bars unless the user explicitly asks for cafe/bar/alcohol-style venues.
- Orchestrator initially presents exactly 1 recommendation from the candidate pool.
- The first dislike presents the next non-disliked recommendation as a single card.
- A second dislike reveals the full candidate pool of up to 5 cards.
- Like/dislike controls exist; disliked candidates are not repeated in the current session; persistence beyond the current session is out of scope.
- Gimel reasons are grounded only in normalized metadata, extracted review data, and one-line pros/cons summaries.
- Review extraction collects 10-20 reviews when available, includes negative reviews, and separates 장점 and 단점 summaries.
- Naver Place enrichment includes POC-derived place id resolution, visitor-review parsing, home-photo/menu parsing, and optional Vision menu extraction.
- Naver Place review extraction works with timestamp-free URLs when page access is available, and fails closed when blocked.
- The swarm stays internal to Express backend and externally simple for the client.
- Changing only OpenAI-compatible endpoint configuration is enough to redirect model traffic.
