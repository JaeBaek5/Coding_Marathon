# 무먹 POC — LLM 모델 선택 이유와 역할 규칙

> **대상**: `poc/app.py` Streamlit 웹 POC  
> **설정 소스**: `poc/llm_roles.py`, `poc/.env`  
> **관련 코드**: `reason_llm()`, `extract_menu_from_photo()`, `_openrouter_chat()`

---

## TL;DR

POC는 OpenRouter로 LLM을 **두 가지 역할**에만 씁니다. 역할마다 **다른 모델**을 고정하고, 호출 횟수·토큰·폴백 규칙을 코드로 강제합니다.

| 역할 | 모델 (현재) | 왜 이 모델? |
|------|-------------|-------------|
| `reason` | `google/gemini-2.5-flash-lite` | 짧은 한국어 문장, 저비용·고속 |
| `vision_menu` | `google/gemini-2.5-flash` | 메뉴판 이미지 이해(멀티모달) 필요 |

---

## 1. 왜 역할을 나눴나

POC 파이프라인에서 LLM이 하는 일은 성격이 완전히 다릅니다.

| 작업 | 입력 | 출력 | 요구 사항 |
|------|------|------|-----------|
| 추천 이유 | JSON 텍스트 (식당·경로·리뷰 일부) | 한국어 1~2문장 | 빠르고, 싸고, 사실 기반 |
| 메뉴판 읽기 | **이미지 URL** | `[{name, price}]` JSON | 멀티모달, OCR 수준 정확도 |

한 모델에 모두 맡기면:

- Vision에 맞는 비싼 모델을 추천 이유에도 쓰게 되어 **비용 폭증**
- text-only 모델을 Vision에 쓰면 **메뉴판 읽기 실패**
- 호출 지점이 흩어지면 **어떤 모델이 어디서 쓰였는지 추적 불가**

그래서 `poc/llm_roles.py`에서 **역할(role) → 모델·토큰·temperature**를 한곳에 정의하고, 실제 API 호출은 `_openrouter_chat(role_name, ...)` 한 경로로만 보냅니다.

---

## 2. 현재 모델 선택 이유

### 2.1 `reason` — `google/gemini-2.5-flash-lite`

**역할**: 랭킹된 각 식당에 대해 추천 이유 1~2문장 생성.

**이 모델을 고른 이유**:

- 출력이 짧음 (max 200 토큰) → 고성능 Opus/Pro급 모델 불필요
- 한국어 짧은 문장 생성에 flash-lite 계열이 **속도·비용 대비 충분**
- 추천 5곳이면 LLM이 **최대 5회** 호출됨 → 싼 모델이 필수
- 실패 시 `reason_fallback()` 템플릿 문구로 대체 가능 → 품질 리스크 낮음

**파라미터**:

| 항목 | 값 | 이유 |
|------|-----|------|
| `max_tokens` | 200 | 1~2문장이면 충분 |
| `temperature` | 0.3 | 사실 기반 문장, 환각 최소화 |
| `timeout` | 30초 | 웹 UI 응답성 |

### 2.2 `vision_menu` — `google/gemini-2.5-flash`

**역할**: 네이버 플레이스에서 가져온 **메뉴판 사진 URL**을 읽어 메뉴명·가격 JSON 추출.

**이 모델을 고른 이유**:

- **이미지 입력 필수** → `flash-lite` 같은 text-only 모델 사용 불가
- `gemini-2.5-flash`는 OpenRouter에서 멀티모달 지원, Vision/OCR 작업에 적합
- `claude-sonnet-4.5` 등 상위 Vision 모델보다 **POC 테스트 비용이 낮음**
- 메뉴판이 없는 가게는 호출 자체를 스킵 → 비용이 통제 가능

**파라미터**:

| 항목 | 값 | 이유 |
|------|-----|------|
| `max_tokens` | 512 | 메뉴 JSON 배열에 여유 |
| `temperature` | 0.1 | OCR/추출 작업 — 결정론적에 가깝게 |
| `timeout` | 45초 | 이미지 처리는 텍스트보다 느림 |

---

## 3. 역할 규칙 (코드 계약)

### 3.1 역할 정의

```
역할 ID       | env 키 (우선순위)                         | 함수
--------------|-------------------------------------------|---------------------------
reason        | LLM_ROLE_REASON_MODEL → OPENROUTER_MODEL  | reason_llm()
vision_menu   | LLM_ROLE_VISION_MODEL → OPENROUTER_VISION_MODEL → MODEL | extract_menu_from_photo()
```

- env 키는 **왼쪽이 우선**. `LLM_ROLE_*`가 없으면 `OPENROUTER_*`로 폴백.
- 모든 OpenRouter 호출은 `_openrouter_chat(role_name, messages)`를 통해서만 발생.

### 3.2 금지 사항

| 규칙 | 설명 |
|------|------|
| 역할 혼용 금지 | `reason`에 Vision 모델, `vision_menu`에 text-only 모델 사용 금지 |
| 직접 `requests.post` 금지 | `app.py`에서 OpenRouter URL을 역할 밖에서 직접 호출하지 않음 |
| 같은 모델 권장 안 함 | `reason`과 `vision_menu`가 동일 모델이면 UI에 경고 표시 |
| text-only Vision 경고 | `flash-lite`, `north-mini` 등이 vision 역할에 들어가면 경고 |

### 3.3 호출 조건 (언제 LLM이 실제로 돌아가나)

| 역할 | 호출 조건 | 호출 안 할 때 |
|------|-----------|---------------|
| `reason` | `OPENROUTER_API_KEY` 있음 **AND** UI에서 "추천 이유 LLM 생성" 체크 | 키 없음 → `reason_fallback()` / 체크 해제 |
| `vision_menu` | 키 있음 **AND** `POC_ENABLE_VISION=true` **AND** 메뉴판 사진 URL 존재 **AND** 랭킹 순위 ≤ `POC_MAX_VISION_CALLS` | 메뉴판 없음, Vision OFF, 순위 초과 → 스킵 |

### 3.4 파이프라인 호출 제한

| env | 기본값 | 의미 |
|-----|--------|------|
| `POC_MAX_ROUTE_CALLS` | 4 | Naver/도보 경로 API를 계산할 후보 상한 |
| `POC_MAX_VISION_CALLS` | 1 | Vision LLM을 쓸 식당 수 (1위만) |
| `POC_ENABLE_VISION` | true | false면 Vision 전체 OFF |
| `OPENROUTER_MAX_TOKENS_LLM` | 200 | `reason` 토큰 상한 |
| `OPENROUTER_MAX_TOKENS_VISION` | 512 | `vision_menu` 토큰 상한 |

**1회 "추천 실행"당 LLM 호출 상한 (최악의 경우)**:

- `reason`: `top_n`회 (UI 슬라이더, 최대 10)
- `vision_menu`: `POC_MAX_VISION_CALLS`회 (기본 1)

---

## 4. 파이프라인에서의 위치

```
위치 확정 (GPS / IP / 수동)
    ↓
식당 검색 (naver | overpass)
    ↓
경로 계산 (상위 POC_MAX_ROUTE_CALLS개)
    ↓
랭킹 + 예산 필터 → top_n
    ↓
각 식당 enrich_with_naver_place()
    ├─ 네이버 리뷰·사진 (코드/API, LLM 아님)
    └─ [vision_menu] 메뉴판 있고 순위 허용 시만
    ↓
[reason] use_llm=true면 추천 이유 생성
    ↓
결과 카드 + 단계별 로그
```

LLM이 없어도 POC는 동작합니다. 키가 없거나 체크를 끄면 **결정론적 폴백**으로 결과를 보여줍니다.

---

## 5. 환경 변수 예시 (`poc/.env`)

```env
OPENROUTER_API_KEY=sk-or-v1-...

# 역할별 모델 (권장 — 명시적)
LLM_ROLE_REASON_MODEL=google/gemini-2.5-flash-lite
LLM_ROLE_VISION_MODEL=google/gemini-2.5-flash

# 토큰·호출 제한
OPENROUTER_MAX_TOKENS_LLM=200
OPENROUTER_MAX_TOKENS_VISION=512
POC_MAX_ROUTE_CALLS=4
POC_MAX_VISION_CALLS=1
POC_ENABLE_VISION=true
```

`.env.example`을 복사해 `poc/.env`로 저장한 뒤 키만 채우면 됩니다.

---

## 6. 웹 UI에서 확인하는 법

1. `python -m streamlit run poc/app.py` 실행
2. 상단 **「🤖 모델 역할 규칙」** expander 펼치기
3. 역할별 `model`, `max_tokens`, `temperature` 확인
4. 추천 실행 후 **「단계별 로그」**에서 다음 패턴 확인:
   - `역할=reason · 추천 이유 [reason] → google/gemini-2.5-flash-lite ...`
   - `역할=vision_menu · 메뉴판 Vision [vision_menu] → google/gemini-2.5-flash ...`

OpenRouter 사용 여부는 [openrouter.ai/activity](https://openrouter.ai/activity)에서 요청 기록으로 확인합니다.

---

## 7. 모델을 바꿀 때

1. **역할 env만 수정** — `LLM_ROLE_REASON_MODEL` 또는 `LLM_ROLE_VISION_MODEL`
2. OpenRouter [모델 목록](https://openrouter.ai/models)에서 `tools` / 이미지 지원 여부 확인
3. `vision_menu`는 반드시 **멀티모달** 모델
4. Streamlit 재시작 후 UI expander에서 경고 없는지 확인
5. Activity 대시보드에서 비용·호출 수 모니터링

### 모델 변경 예시

| 목적 | `reason` 후보 | `vision_menu` 후보 |
|------|---------------|-------------------|
| 더 저렴하게 | `cohere/north-mini-code:free` | (Vision은 무료 멀티모달 제한적 — 주의) |
| 품질 올리기 | `google/gemini-2.5-flash` | `anthropic/claude-sonnet-4` |
| Vision 끄기 | — | `POC_ENABLE_VISION=false` |

---

## 8. 본 프로덕션 앱(`server/`)과의 관계

이 문서는 **POC(`poc/`) 전용** 규칙입니다.

| 구분 | POC (`poc/`) | 프로덕션 (`server/`) |
|------|--------------|----------------------|
| 슬롯 파싱 (Aleph) | 없음 | `orchestrator.parseQueryToSlotsLLM` |
| 추천 이유 (Gimel) | `reason` 역할 | `generateGroundedExplanationLLM` |
| 메뉴판 Vision | `vision_menu` 역할 | POC 전용 (프로덕션 미연동) |
| 설정 파일 | `poc/.env` | `server/.env` |

프로덕션으로 옮길 때는 `llm_roles.py` 패턴(역할 단일 진입점 + env 분리)을 `server/src/llm/`에 맞게 확장하는 것을 권장합니다.

---

## 9. 관련 파일

| 파일 | 역할 |
|------|------|
| `poc/llm_roles.py` | 역할 정의·env 로드·검증 |
| `poc/app.py` | 파이프라인·UI·`_openrouter_chat()` |
| `poc/.env.example` | env 템플릿 |
| `poc/loop_test.py` | 헤드리스 검증 (`use_llm=False` 기본) |
