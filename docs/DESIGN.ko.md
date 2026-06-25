---
version: alpha
name: Replicate-design-analysis
description: |
  Replicate's marketing surfaces pair the warm-cream developer-tools aesthetic
  of an indie ML playground with a confident hot-orange brand accent and a
  signature display typeface (rb-freigeist-neue) sized aggressively large at
  72px+. The system reads as "AI lab notebook crossed with print magazine":
  cream and bone surfaces, dark ink type, monospace code wells, irregular
  hand-drawn-feeling diagrams, and a rich orange used scarcely on the most
  consequential CTA. Photography of contributors and example outputs is
  square-ish with mid-radius corners; everything else is borderless or hairline.

colors:
  primary: '#ea2804'
  primary-deep: '#c01f00'
  on-primary: '#ffffff'
  ink: '#202020'
  body: '#3a3a3a'
  charcoal: '#575757'
  mute: '#646464'
  ash: '#8d8d8d'
  stone: '#bbbbbb'
  on-dark: '#fcfcfc'
  on-dark-mute: 'rgba(252,252,252,0.72)'
  canvas: '#f9f7f3'
  surface-bone: '#f3f0e8'
  surface-card: '#ffffff'
  surface-dark: '#202020'
  surface-deep: '#000000'
  hairline: 'rgba(32,32,32,0.12)'
  hairline-strong: '#202020'
  divider-dark: 'rgba(255,255,255,0.2)'
  hero-warm: '#ea2804'
  hero-glow: '#ff6a3d'
  hero-pink: '#f4a8a0'
  badge-success: '#2b9a66'
  link: '#ea2804'
  ring-focus: 'rgba(59,130,246,0.5)'
  github-dark: '#24292e'

typography:
  display-xxl:
    fontFamily: rb-freigeist-neue
    fontSize: 128px
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: -3px
  display-xl:
    fontFamily: rb-freigeist-neue
    fontSize: 72px
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: -1.8px
  display-lg:
    fontFamily: rb-freigeist-neue
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: -1px
  display-md:
    fontFamily: rb-freigeist-neue
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.5px
  heading-lg:
    fontFamily: basier-square
    fontSize: 38.4px
    fontWeight: 600
    lineHeight: 0.83
    letterSpacing: -0.5px
  heading-md:
    fontFamily: basier-square
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: -0.35px
  heading-sm:
    fontFamily: basier-square
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.3px
  subtitle:
    fontFamily: rb-freigeist-neue
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.56
    letterSpacing: 0
  body-lg:
    fontFamily: basier-square
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.56
    letterSpacing: 0
  body-md:
    fontFamily: basier-square
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: basier-square
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: 0
  button-md:
    fontFamily: basier-square
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: 0
  button-sm:
    fontFamily: basier-square
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: 0
  caption:
    fontFamily: basier-square
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: 0
  caption-tight:
    fontFamily: basier-square
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.43
    letterSpacing: -0.35px
  code-md:
    fontFamily: jetbrains-mono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: 0
  code-sm:
    fontFamily: jetbrains-mono
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 10px
  lg: 16px
  full: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  xxxl: 48px
  section: 96px
  band: 160px

components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.button-md}'
    rounded: '{rounded.full}'
    padding: 12px 24px
    height: 44px
  button-primary-pressed:
    backgroundColor: '{colors.primary-deep}'
    textColor: '{colors.on-primary}'
    typography: '{typography.button-md}'
    rounded: '{rounded.full}'
  button-dark:
    backgroundColor: '{colors.surface-dark}'
    textColor: '{colors.on-dark}'
    typography: '{typography.button-md}'
    rounded: '{rounded.full}'
    padding: 12px 24px
    height: 44px
  button-outline:
    backgroundColor: '{colors.surface-card}'
    textColor: '{colors.ink}'
    typography: '{typography.button-md}'
    rounded: '{rounded.full}'
    padding: 11px 23px
    height: 44px
  button-ghost:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    typography: '{typography.button-md}'
    rounded: '{rounded.full}'
    padding: 8px 16px
    height: 36px
  button-icon:
    backgroundColor: '{colors.surface-card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.full}'
    size: 36px
  text-input:
    backgroundColor: '{colors.surface-card}'
    textColor: '{colors.ink}'
    typography: '{typography.body-md}'
    rounded: '{rounded.full}'
    padding: 12px 20px
    height: 44px
  hero-band:
    backgroundColor: '{colors.hero-warm}'
    textColor: '{colors.on-dark}'
    typography: '{typography.display-xl}'
    rounded: '{rounded.none}'
    padding: 96px 32px
  model-card:
    backgroundColor: '{colors.surface-card}'
    textColor: '{colors.ink}'
    typography: '{typography.body-md}'
    rounded: '{rounded.md}'
    padding: 16px
  collection-tile:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    typography: '{typography.heading-md}'
    rounded: '{rounded.md}'
    padding: 24px
  pricing-tier:
    backgroundColor: '{colors.surface-card}'
    textColor: '{colors.ink}'
    typography: '{typography.body-md}'
    rounded: '{rounded.lg}'
    padding: 32px
  pricing-tier-featured:
    backgroundColor: '{colors.surface-dark}'
    textColor: '{colors.on-dark}'
    typography: '{typography.body-md}'
    rounded: '{rounded.lg}'
    padding: 32px
  code-block:
    backgroundColor: '{colors.surface-dark}'
    textColor: '{colors.on-dark}'
    typography: '{typography.code-md}'
    rounded: '{rounded.md}'
    padding: 24px
  code-tab:
    backgroundColor: '{colors.surface-deep}'
    textColor: '{colors.on-dark-mute}'
    typography: '{typography.code-sm}'
    rounded: '{rounded.xs}'
    padding: 6px 12px
  badge-status:
    backgroundColor: '{colors.badge-success}'
    textColor: '{colors.on-dark}'
    typography: '{typography.caption}'
    rounded: '{rounded.full}'
    padding: 4px 10px
  badge-tag:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    typography: '{typography.caption}'
    rounded: '{rounded.full}'
    padding: 4px 10px
  nav-bar:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    typography: '{typography.button-sm}'
    rounded: '{rounded.none}'
    height: 60px
  sub-nav-pill:
    backgroundColor: '{colors.surface-card}'
    textColor: '{colors.ink}'
    typography: '{typography.button-sm}'
    rounded: '{rounded.full}'
    padding: 6px 14px
  contributor-avatar:
    backgroundColor: '{colors.surface-card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.full}'
    size: 40px
  footer:
    backgroundColor: '{colors.surface-deep}'
    textColor: '{colors.on-dark}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.none}'
    padding: 64px 32px
---

> 🌐 English version: [DESIGN.md](DESIGN.md)
>
> ※ 위 YAML 프론트매터는 기계가 읽는 디자인 토큰 정의이므로 원문 그대로 유지합니다. 아래 설명 본문만 번역되어 있습니다. 토큰 참조(`{colors.primary}` 등)와 코드도 원문을 유지합니다.

## 개요 (Overview)

Replicate는 아트 진(art zine)의 감성을 지닌 개발자 도구 플랫폼입니다. 공개
마케팅 화면은 전형적인 AI 인프라 사이트의 흰색 또는 거의 검정에 가까운 기본값
대신 따뜻한 크림색 캔버스(`{colors.canvas}` — `#f9f7f3`) 위에 놓이며, 이 단
하나의 결정이 나머지 모든 것을 물들입니다. 사진은 에디토리얼처럼 읽히고, 코드
웰(code well)은 인쇄된 발췌 인용구처럼 읽히며, 브랜드 오렌지(`{colors.primary}`
— `#ea2804`)는 알림이 아니라 도장(stamp)처럼 느껴집니다.

타이포그래피가 핵심 장식입니다. **rb-freigeist-neue** — 묵직하고 약간 압축된
그로테스크 — 는 히어로 밴드에서 최대 128px 크기로 등장하며, 빡빡한
`lineHeight: 1.0`과 음수 자간(letter-spacing)으로 여러 줄 헤드라인을 기하학적
블록으로 압축합니다. 동반 서체인 **basier-square**는 14–18px 범위에서 본문,
버튼 라벨, 메타데이터를 담당합니다. **JetBrains Mono**는 모든 코드 웰, 명령어,
예시를 책임집니다. 세 서체, 세 가지 역할, 겹침 없음.

페이지 리듬은 기본 크림 캔버스, 굵은 풀블리드(full-bleed) 오렌지 히어로 밴드,
그리고 코드 스토리("작동 방식" 안내)를 담는 `{colors.surface-dark}` (`#202020`)
섹션 사이를 순환합니다. 곡선은 의도적이고 부드럽습니다. 모든 인터랙티브 표면
(버튼, 입력, 태그, 아바타)은 `{rounded.full}`을 사용하고, 콘텐츠 카드와 코드 웰은
`{rounded.md}` 또는 `{rounded.lg}`로 한 단계 올라갑니다. Replicate에는 날카로운
모서리가 없으며, 시스템은 친근한 정밀함으로 읽힙니다.

**핵심 특징:**

- 따뜻한 크림 캔버스(`{colors.canvas}` — `#f9f7f3`)가 전형적인 흰색 배경을 대체하며, 인셋 카드에는 `{colors.surface-bone}`을 함께 씁니다.
- 핫 오렌지(`{colors.primary}` — `#ea2804`)는 주요 CTA, 히어로 밴드, 인라인 링크 색상에만 한정됩니다. 절대 장식용이 아닙니다.
- 디스플레이 헤드라인은 거대합니다 — 히어로 밴드의 `{typography.display-xxl}` 128px, 섹션 오프너의 `{typography.display-xl}` 72px — 빡빡한 `lineHeight: 1.0`과 음수 자간을 동반합니다.
- 3개 서체 스택: 디스플레이용 `rb-freigeist-neue`, UI/본문용 `basier-square`, 코드용 `jetbrains-mono`.
- 모든 인터랙티브 요소는 완전히 둥글게(`{rounded.full}` 9999px) — 버튼, 입력, 배지, 아바타 — 처리하고, 콘텐츠 카드는 `{rounded.md}` 10px로 올립니다.
- 어두운 코드 웰(`{colors.surface-dark}` 배경)이 크림 캔버스 안에 풀블리드 읽기 표면으로 자리하며 인쇄 발췌 인용구를 모방합니다.
- 섹션 리듬: 크림 → 오렌지 히어로 → 크림 → 어두운 코드 스토리 밴드 → 크림 → 검은 푸터.

## 색상 (Colors)

### 브랜드 & 액센트

- **Replicate Orange** (`{colors.primary}` — `#ea2804`): 브랜드 액센트. 주요 CTA, 히어로 밴드 배경, 인라인 링크 색상에 한정. 도장처럼 다루세요 — 뷰포트당 오렌지 요소는 최대 하나.
- **Orange Pressed** (`{colors.primary-deep}` — `#c01f00`): `{colors.primary}`의 활성/눌림 상태 — `{component.button-primary-pressed}`에 사용.
- **Hero Glow** (`{colors.hero-glow}` — `#ff6a3d`): 히어로 카피 뒤의 방사형 대기 메시에 나타나는 밝은 오렌지.
- **Hero Pink** (`{colors.hero-pink}` — `#f4a8a0`): 히어로 밴드가 크림으로 전환되기 전 하단 가장자리를 부드럽게 하는 따뜻한 핑크 워시.
- **On-Primary** (`{colors.on-primary}` — `#ffffff`): `{colors.primary}` 표면 위 라벨 색상.

### 표면 (Surface)

- **Canvas** (`{colors.canvas}` — `#f9f7f3`): 기본 페이지 배경. 따뜻한 크림, 순백은 절대 아님.
- **Surface Bone** (`{colors.surface-bone}` — `#f3f0e8`): 인셋 카드 그룹과 피처 밴드에 쓰이는 반 단계 더 깊은 크림.
- **Surface Card** (`{colors.surface-card}` — `#ffffff`): 개별 모델 카드, 검색 입력, 가격 티어용 순백 — 흰색이 등장하는 유일한 곳.
- **Surface Dark** (`{colors.surface-dark}` — `#202020`): 코드 웰, 추천 가격 티어, "작동 방식" 안내 밴드.
- **Surface Deep** (`{colors.surface-deep}` — `#000000`): 푸터 캔버스 및 `{component.code-block}` 내부의 인셋 코드 탭 스트립.
- **Hairline** (`{colors.hairline}` — `rgba(32,32,32,0.12)`): 크림 표면의 저대비 1px 디바이더.
- **Hairline Strong** (`{colors.hairline-strong}` — `#202020`): 버튼 외곽선, 포커스된 입력, 구조적 구분선.

### 텍스트 (Text)

- **Ink** (`{colors.ink}` — `#202020`): 기본 텍스트 색상. `#000000`보다 눈에 띄게 따뜻하여 크림 캔버스와 어울림.
- **Body** (`{colors.body}` — `#3a3a3a`): 18px+ 행 길이에서 ink가 너무 무거울 때의 장문 본문.
- **Charcoal** (`{colors.charcoal}` — `#575757`): 캡션, 메타데이터, 보조 내비게이션.
- **Mute** (`{colors.mute}` — `#646464`): 보조 텍스트와 비활성 라벨.
- **Ash** (`{colors.ash}` — `#8d8d8d`): 3차 텍스트, 플레이스홀더 카피.
- **Stone** (`{colors.stone}` — `#bbbbbb`): 비활성 전경, 중립 아이콘 외곽선.
- **On-Dark** (`{colors.on-dark}` — `#fcfcfc`): `{colors.surface-dark}` 및 `{colors.surface-deep}` 위 기본 텍스트.
- **On-Dark Mute** (`{colors.on-dark-mute}` — `rgba(252,252,252,0.72)`): 어두운 영역의 보조 텍스트. 순백의 튐 없이 오프화이트 느낌 유지.

### 시맨틱 (Semantic)

- **Success** (`{colors.badge-success}` — `#2b9a66`): 인라인 성공 배지와 모델 카드의 "running" 상태 알약(pill).
- **Link** (`{colors.link}` — `#ea2804`): 인라인 링크 색상 — 주요 오렌지와 동일하며, 의도적으로 링크를 브랜드 액센트로 끌어들임.
- **Focus Ring** (`{colors.ring-focus}` — `rgba(59,130,246,0.5)`): 인터랙티브 요소의 기본 포커스 링.
- **GitHub Dark** (`{colors.github-dark}` — `#24292e`): GitHub 브랜드 버튼 표면(GitHub 자체 토큰에 맞추기 위해 의도적으로 브랜드 외 색상 유지).

## 타이포그래피 (Typography)

### 서체 (Font Family)

Replicate는 의도적인 3개 서체 스택을 제공합니다.

- **rb-freigeist-neue** — 모든 디스플레이 크기(30px+)에 쓰이는 독점 헤비 그로테스크. 빡빡한 `lineHeight: 1.0`과 음수 자간으로 에디토리얼-매거진 개성을 전달.
- **basier-square** — 본문, 버튼 라벨, 캡션, 메타데이터에 쓰이는 독점 휴머니스트 산세리프.
- **jetbrains-mono** — 모든 코드 웰과 인라인 명령어에 쓰이는 오픈소스 모노스페이스.

독점 서체를 라이선스할 수 없을 때, rb-freigeist-neue의 대체로는 **Bricolage Grotesque** 또는 **Migra**가, basier-square의 대체로는 **Geist** 또는 **Inter**가 적합합니다. JetBrains Mono는 오픈소스이므로 항상 그대로 사용하세요.

### 계층 (Hierarchy)

| 토큰                        | 크기   | 굵기 | 행간 | 자간 | 용도                                                                             |
| ---------------------------- | ------ | ------ | ----------- | -------------- | ------------------------------------------------------------------------------- |
| `{typography.display-xxl}`   | 128px  | 700    | 1.0         | -3px           | 유일한 히어로 헤드라인("Run AI" / "Imagine what you can build"). 페이지당 하나. |
| `{typography.display-xl}`    | 72px   | 700    | 1.0         | -1.8px         | 섹션 오프너("How it works", "Scale on Replicate").                         |
| `{typography.display-lg}`    | 48px   | 700    | 1.0         | -1px           | 하위 섹션 제목, 가격 티어 이름.                                         |
| `{typography.display-md}`    | 30px   | 600    | 1.2         | -0.5px         | 피처 카드 제목.                                                            |
| `{typography.heading-lg}`    | 38.4px | 600    | 0.83        | -0.5px         | 빡빡하게 쌓인 basier-square 헤드라인. 가격/엔터프라이즈 히어로에 사용.   |
| `{typography.heading-md}`    | 24px   | 600    | 1.33        | -0.35px        | 카드 제목, 모델 상세 헤더.                                              |
| `{typography.heading-sm}`    | 20px   | 600    | 1.4         | -0.3px         | 리스트 섹션 헤더.                                                         |
| `{typography.subtitle}`      | 18px   | 600    | 1.56        | 0              | 디스플레이 섹션의 리드 문단.                                            |
| `{typography.body-lg}`       | 18px   | 400    | 1.56        | 0              | 마케팅 산문.                                                                |
| `{typography.body-md}`       | 16px   | 400    | 1.5         | 0              | 기본 본문.                                                                   |
| `{typography.body-sm}`       | 14px   | 400    | 1.43        | 0              | 캡션, 메타데이터.                                                            |
| `{typography.button-md}`     | 16px   | 600    | 1.0         | 0              | 기본 버튼 라벨.                                                           |
| `{typography.button-sm}`     | 14px   | 600    | 1.0         | 0              | 컴팩트 버튼 라벨, 서브 내비 알약.                                            |
| `{typography.caption}`       | 12px   | 400    | 1.33        | 0              | 푸터 고지, 저작권.                                                       |
| `{typography.caption-tight}` | 14px   | 600    | 1.43        | -0.35px        | 가격 티어 행에 쓰이는 강조 소형 캡션.                                       |
| `{typography.code-md}`       | 14px   | 400    | 1.43        | 0              | 코드 블록과 인라인 코드.                                                  |
| `{typography.code-sm}`       | 11px   | 400    | 1.5         | 0              | 코드 탭 라벨과 작은 인라인 토큰.                                            |

### 원칙 (Principles)

- 디스플레이 크기는 `lineHeight: 1.0`(또는 `{typography.heading-lg}`의 0.83)을 유지해 여러 줄 스택이 단일 타이포 블록으로 읽히게 합니다.
- 음수 자간은 크기에 비례해 조정됩니다 — 큰 글자일수록 더 조입니다(128px의 -3px에서 20px의 -0.3px까지). 본문은 0을 유지합니다.
- 본문 굵기는 `{typography.body-lg}`와 `{typography.body-md}` 전반에서 400 — 강조를 위해 500으로 올리지 않습니다. 강조는 굵기가 아니라 서체 전환(basier-square → rb-freigeist-neue)에서 옵니다.
- 코드는 작은 크기에서도 절대 basier-square로 조판하지 않습니다 — 모든 리터럴 명령어, 모델 슬러그, API 호출은 JetBrains Mono가 담당합니다.

### 서체 대체에 관한 참고

독점 서체를 사용할 수 없을 때는 디스플레이 `lineHeight`를 명시적으로 1.0으로 고정하고, display-xxl / display-xl에 -3% 자간을 적용해 원본의 빡빡함을 맞추세요. 대체 서체는 기본적으로 더 느슨한 트래킹으로 렌더링되는 경향이 있습니다.

## 레이아웃 (Layout)

### 간격 시스템 (Spacing System)

- **기본 단위**: 4px, 작업 스케일은 4 / 8 / 16의 배수.
- **토큰**: `{spacing.xxs}` 2px · `{spacing.xs}` 4px · `{spacing.sm}` 8px · `{spacing.md}` 12px · `{spacing.lg}` 16px · `{spacing.xl}` 24px · `{spacing.xxl}` 32px · `{spacing.xxxl}` 48px · `{spacing.section}` 96px · `{spacing.band}` 160px.
- 섹션 패딩: 전체 너비 밴드 사이 수직으로 `{spacing.section}`(96px); 밴드에 에디토리얼 여백이 더 필요할 때(히어로, 마무리 "Imagine what you can build" 스트라이프) `{spacing.band}`(160px).
- 카드 내부 패딩: `{component.model-card}`에 `{spacing.lg}`(16px), `{component.pricing-tier}`에 `{spacing.xxl}`(32px).

### 그리드 & 컨테이너 (Grid & Container)

- **최대 콘텐츠 너비** ≈ 본문 섹션 1280px, 풀블리드로 흐르는 히어로 밴드 1440px.
- **모델 그리드**(컬렉션): 데스크톱 4열, 태블릿 라지 3열, 태블릿 2열, 모바일 1열.
- **가격**: 데스크톱에서 가운데 정렬된 3티어 그리드, 1024px 미만에서 수직 스택; 가운데 티어는 추천 옵션으로 `{component.pricing-tier-featured}`(다크 반전)로 전환.
- **코드 스토리 섹션**: 2단 분할 — 왼쪽 서술 카피, 오른쪽 코드 웰 — 1024px 미만에서 스택으로 접힘.

### 여백 철학 (Whitespace Philosophy)

- 크림 위의 여백은 넉넉하고 에디토리얼합니다 — 섹션은 96px에서 숨 쉬고, 핵심 밴드는 160px에서 열려 타이포가 답답함 없이 커질 수 있게 합니다.
- 카드 내부에서는 16–32px로 조여, 모델 썸네일, 상태, 메타데이터가 컴팩트한 카드 리스트 리듬에 놓입니다.
- 크림 표면에서는 헤어라인 `{colors.hairline}` 디바이더가 그림자를 대체하고, 어두운 표면에서는 `{colors.divider-dark}`가 동일한 역할을 합니다.

## 입체감 & 깊이 (Elevation & Depth)

| 레벨              | 처리                                                                       | 용도                                                                               |
| ------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 0 — 평면           | 그림자 없음, 테두리 없음                                                            | 기본 크림 캔버스, 풀블리드 밴드.                                           |
| 1 — 외곽선        | 1px 솔리드 `{colors.hairline}` 또는 `{colors.hairline-strong}`                     | 모델 카드, 가격 티어, 컬렉션 타일.                                     |
| 2 — 본(bone) 인셋     | `{colors.canvas}` 밴드 안에서 표면 색을 `{colors.surface-bone}`으로 전환 | 피처 그룹 컨테이너, "작동 방식" 안내.                             |
| 3 — 다크 반전 | 카드가 크림 위에서 `{colors.surface-dark}`로 전환                                     | 코드 웰, 추천 가격 티어, "Scale on Replicate" 히어로 카드.                |
| 4 — 부드러운 드롭      | `0 8px 24px rgba(32,32,32,0.08)`                                                | 호버 고정 모델 썸네일(시각 효과만 — 인터랙션 상태로는 문서화되지 않음). |

추출된 토큰에 드롭 섀도가 존재하지만 절제되어 있습니다 — 사진 썸네일을 크림 캔버스에서 한 단계 들어올리는 데에만 드물게 사용됩니다. 지배적인 입체 언어는 색상 블로킹(colour-blocking)입니다.

### 장식적 깊이 (Decorative Depth)

- **히어로 대기 메시** — 홈 히어로를 받치는 오렌지-핑크 그라데이션은 레이어드 방사형 메시입니다: `{colors.primary}` 코어 → `{colors.hero-glow}` 중간 → `{colors.hero-pink}` 외곽 워시. 홈 히어로 밴드에만 한정.
- **코드 스토리 다크 밴드** — "작동 방식" 섹션은 `{colors.surface-dark}` 풀블리드에 서술 카피와 코드 웰을 가르는 단일 헤어라인 `{colors.divider-dark}`을 사용.
- **기여자 모자이크** — 홈 페이지에는 질감 있는 크림 캔버스 위로 원형 아바타(`{component.contributor-avatar}`)가 가로 스크롤되는 밴드가 있으며, 브랜드 레벨에서 아바타가 등장하는 유일한 곳입니다.

## 형태 (Shapes)

### 테두리 반경 스케일 (Border Radius Scale)

| 토큰            | 값  | 용도                                        |
| ---------------- | ------ | ------------------------------------------ |
| `{rounded.none}` | 0px    | 히어로 밴드, 풀블리드 섹션, 푸터.   |
| `{rounded.xs}`   | 4px    | 코드 탭, 코드 웰 내부 인라인 태그.  |
| `{rounded.sm}`   | 6px    | 중간 반경 콜아웃, 작은 인셋 칩.    |
| `{rounded.md}`   | 10px   | 모델 카드, 컬렉션 타일, 코드 웰. |
| `{rounded.lg}`   | 16px   | 가격 티어, 큰 피처 카드.       |
| `{rounded.full}` | 9999px | 버튼, 입력, 배지, 아바타, 알약.   |

### 사진 기하 (Photography Geometry)

- 모델 썸네일: 정사각(1:1)에 `{rounded.md}` 모서리, 카드 가장자리까지 풀블리드 이미지.
- 히어로 예시 출력: 4:3 또는 16:9에 `{rounded.md}` 모서리.
- 기여자 아바타: 원형(`{rounded.full}`), 홈 40px, 카드 메타데이터 32px.
- 히어로 밴드는 사진 대용으로 양식화된 검은 잉크 일러스트("작업대의 땜장이")를 사용하며, 크림 위에 겹치지 않고 오렌지 밴드 안에 둡니다.

## 컴포넌트 (Components)

### 버튼 (Buttons)

**`button-primary`** — 오렌지 CTA

- 배경 `{colors.primary}`, 라벨 `{colors.on-primary}`, 타입 `{typography.button-md}`, 패딩 `12px 24px`, `rounded: {rounded.full}`, 높이 44px.
- 페이지에서 가장 중요한 단일 액션(예: "Sign in with GitHub", "Try a model").
- 눌림 상태는 `button-primary-pressed`(배경 `{colors.primary-deep}`)에 존재.

**`button-dark`** — 다크 CTA

- 배경 `{colors.surface-dark}`, 라벨 `{colors.on-dark}`, 타입 `{typography.button-md}`, `rounded: {rounded.full}`.
- `{component.button-primary}`와 짝지어진 동등 비중의 2차 액션, 또는 오렌지가 너무 강할 때 크림 위 주요 액션.

**`button-outline`** — 외곽선 CTA

- 배경 `{colors.surface-card}`, 라벨 `{colors.ink}`, 1px 솔리드 `{colors.hairline-strong}`, 타입 `{typography.button-md}`, `rounded: {rounded.full}`.
- 3차 액션; 주요/다크와 함께 "View docs", "Read more"에 등장.

**`button-ghost`** — 인라인 버튼

- 배경 `{colors.canvas}`, 라벨 `{colors.ink}`, 테두리 없음, 타입 `{typography.button-md}`, `rounded: {rounded.full}`, 패딩 `8px 16px`.
- 카드 내부 및 본문과 인라인된 보조 액션.

**`button-icon`** — 아이콘 버튼

- 배경 `{colors.surface-card}`, 라벨 `{colors.ink}`, 1px 솔리드 `{colors.hairline}`, `rounded: {rounded.full}`, 36×36px 원형.
- 캐러셀 화살표, 클립보드 복사, GitHub 링크 아이콘.

### 카드 & 컨테이너 (Cards & Containers)

**`model-card`** — 모델 목록 카드

- 배경 `{colors.surface-card}`, 텍스트 `{colors.ink}`, 타입 `{typography.body-md}`, `rounded: {rounded.md}`, 패딩 `{spacing.lg}`(16px).
- 상단 정사각 썸네일, 그 아래 `{typography.body-sm}`로 모델 소유자 + 이름, `{colors.charcoal}`의 한 줄 설명, 좌측 하단 상태 알약 `{component.badge-status}`.

**`collection-tile`** — 모델 컬렉션 타일

- 배경 `{colors.canvas}`, 텍스트 `{colors.ink}`, 타입 `{typography.heading-md}`, `rounded: {rounded.md}`, 패딩 `{spacing.xl}`(24px).
- `{colors.surface-bone}` 밴드 안의 크림-온-크림 타일로, 모델 카테고리 탐색에 사용.

**`pricing-tier`** — 가격 티어 카드

- 배경 `{colors.surface-card}`, 텍스트 `{colors.ink}`, 타입 `{typography.body-md}`, `rounded: {rounded.lg}`, 패딩 `{spacing.xxl}`(32px).
- 3단 그리드; 티어 이름은 `{typography.display-lg}`("Free", "Pro", "Enterprise"), 가격은 `{typography.display-md}`.

**`pricing-tier-featured`** — 추천 가격 티어

- 배경 `{colors.surface-dark}`, 텍스트 `{colors.on-dark}`, 타입 `{typography.body-md}`, `rounded: {rounded.lg}`, 패딩 `{spacing.xxl}`.
- 가운데 티어를 다크 반전으로 전환해 "추천"을 표시.

**`code-block`** — 코드 웰

- 배경 `{colors.surface-dark}`, 텍스트 `{colors.on-dark}`, 타입 `{typography.code-md}`, `rounded: {rounded.md}`, 패딩 `{spacing.xl}`(24px).
- 상단에 언어 전환(Python, Node.js, cURL, HTTP)용 `{component.code-tab}` 탭 스트립.

**`code-tab`** — 코드 탭 칩

- 배경 `{colors.surface-deep}`, 텍스트 `{colors.on-dark-mute}`, 타입 `{typography.code-sm}`, `rounded: {rounded.xs}`, 패딩 `6px 12px`.
- 활성 탭은 텍스트 색을 `{colors.on-dark}`로 바꾸고 `{colors.primary}`의 2px 하단 밑줄을 추가.

**`hero-band`** — 풀블리드 히어로

- 배경 `{colors.hero-warm}`(입체감 섹션에 상술된 대기 메시 포함), 텍스트 `{colors.on-dark}`, 제목 타입 `{typography.display-xxl}`.
- 홈 페이지에만 사용; 보조 페이지는 크림 + `{typography.display-xl}`로 시작.

### 입력 & 폼 (Inputs & Forms)

**`text-input`** — 기본 입력

- 배경 `{colors.surface-card}`, 텍스트 `{colors.ink}`, 타입 `{typography.body-md}`, 1px 솔리드 `{colors.hairline}`, `rounded: {rounded.full}`, 패딩 `12px 20px`, 높이 44px.
- 알약 모양 검색/이메일 필드. 포커스 상태는 `{colors.ring-focus}` 3px 링을 추가.

### 내비게이션 (Navigation)

**`nav-bar`** — 상단 내비(데스크톱)

- 배경 `{colors.canvas}`, 타입 `{typography.button-sm}`, 높이 60px, 단일 헤어라인 `{colors.hairline}` 하단 테두리.
- 왼쪽: 워드마크 로고. 가운데: 최상위 내비("Explore", "Pricing", "Docs", "Blog"). 오른쪽: GitHub 아이콘 + "Sign in" 링크 + `{component.button-primary}`.

**`nav-bar`** (모바일)

- 동일한 높이 60px, 가운데 내비를 햄버거 아이콘으로 접음. 로고는 왼쪽, 로그인 CTA는 오른쪽 유지.

**`sub-nav-pill`** — 서브 내비 칩

- 콘텐츠 위 가로 행에 놓이는 알약 칩(예: "All", "Featured", "Image generation", "Audio"), `{component.sub-nav-pill}` 스타일.

### 시그니처 컴포넌트 (Signature Components)

**`badge-status`** — 모델 상태 배지

- 배경 `{colors.badge-success}`, 라벨 `{colors.on-dark}`, 타입 `{typography.caption}`, `rounded: {rounded.full}`, 패딩 `4px 10px`.
- 모델 카드 좌측 하단에 고정되어 "running" 또는 "deployed"를 표시.

**`badge-tag`** — 중립 태그

- 배경 `{colors.canvas}`, 라벨 `{colors.ink}`, 1px 솔리드 `{colors.hairline}`, 타입 `{typography.caption}`, `rounded: {rounded.full}`, 패딩 `4px 10px`.
- 모델 카드의 기능 태그("text-to-image", "video", "audio").

**`contributor-avatar`** — 커뮤니티 기여자

- 1:1 사진 뒤에 `{colors.surface-card}` 플레이스홀더, `rounded: {rounded.full}`, 40×40px(메타데이터 맥락 32px).
- 홈 페이지 기여자 모자이크에 사용.

**`footer`** — 전역 푸터

- 배경 `{colors.surface-deep}`, 텍스트 `{colors.on-dark}`, 타입 `{typography.body-sm}`, `rounded: {rounded.none}`, 패딩 `64px 32px`.
- `{colors.divider-dark}`로 구분된 저작권 행 위에 다단 퀵링크 그리드.

## 해야 할 것 & 하지 말 것 (Do's and Don'ts)

### 해야 할 것 (Do)

- `{colors.canvas}`(크림)를 기본 페이지 배경으로 사용. 흰색(`{colors.surface-card}`)은 개별 카드, 입력, 히어로 일러스트 배경에만 등장.
- `{colors.primary}`는 주요 CTA, 홈 히어로 밴드, 인라인 링크에만 한정 — 세 가지 역할, 그 외 없음.
- 모든 인터랙티브 요소는 `{rounded.full}`로 — 버튼, 입력, 배지, 아바타, 알약.
- 콘텐츠 카드는 `{rounded.md}`(10px) 또는 `{rounded.lg}`(16px)로 올림 — 날카로운 모서리는 절대 금지.
- 히어로 밴드는 `{typography.display-xxl}`(128px)와 `{typography.display-xl}`(72px)로, `lineHeight: 1.0`과 음수 자간으로 시작.
- 디스플레이는 `rb-freigeist-neue`, UI/본문은 `basier-square`, 코드는 `jetbrains-mono`. 차선(lane)을 엄격히 유지.
- 코드는 `{colors.surface-dark}` 배경의 `{component.code-block}`에 렌더링 — 코드는 인쇄물이지 인라인 회색 박스가 아님.
- 사진은 `{rounded.md}` 모서리와 카드 내부 풀블리드 크롭으로 짝지음.

### 하지 말 것 (Don't)

- 페이지 레벨에서 크림을 순백으로 대체하지 말 것. 브랜드 온도는 `{colors.canvas}`에서 옴.
- 2차 브랜드 색을 도입하지 말 것. 오렌지가 유일한 액센트; 시맨틱 그린과 포커스 블루는 장식이 아니라 기능.
- 디스플레이 `lineHeight`를 1.0 이상으로 느슨하게 하지 말 것. 빡빡한 스택은 구조적임.
- 강조를 위해 본문 굵기를 500으로 올리지 말 것 — 대신 서체를 바꿀 것(`basier-square` → `rb-freigeist-neue`).
- 콘텐츠 카드에 `{rounded.full}`을 적용하지 말 것. 알약 모양 카드는 리듬을 깸.
- 코드를 밝은 회색 박스에 넣지 말 것. 코드 웰은 항상 `{colors.surface-dark}` 또는 `{colors.surface-deep}`.
- 본문 텍스트나 큰 표면에 오렌지를 쓰지 말 것 — 즉시 도장 효과를 잃음.
- 크림 표면에 드롭 섀도를 추가하지 말 것. 입체감은 색상 블로킹이며, 그림자는 떠 있는 썸네일에만 한정.

## 반응형 동작 (Responsive Behavior)

### 브레이크포인트 (Breakpoints)

| 이름         | 너비       | 주요 변화                                                                                            |
| ------------ | ----------- | ------------------------------------------------------------------------------------------------------ |
| Desktop XL   | ≥ 1440px    | 전체 최대 너비 1280 본문, 히어로 밴드 풀블리드, 4단 모델 그리드.                                  |
| Desktop      | 1280–1439px | 컨테이너 축소; 좌우 패딩 `{spacing.xl}`(24px).                                                |
| Tablet Large | 1024–1279px | 모델 그리드 3단, 코드 스토리 분할 2단 유지.                                                        |
| Tablet       | 768–1023px  | 모델 그리드 2단, 코드 스토리 스택(서술 위, 코드 아래), 가격 수직 스택.          |
| Mobile Large | 426–767px   | 480px+에서 모델 그리드 1단, 내비 햄버거로 접힘, 히어로 `{typography.display-xxl}` 64px로 클램프. |
| Mobile       | ≤ 425px     | 모든 그리드 1단, 히어로 48px로 클램프, 섹션 패딩 `{spacing.section}` 64px로 축소.            |

### 터치 타겟 (Touch Targets)

- 모든 버튼은 모바일에서 최소 44px 높이로 제공; 기본 `{component.button-primary}`는 44px — WCAG AAA를 여유 있게 통과.
- `{component.button-icon}`(36px)는 패딩 증가로 모바일에서 44px로 확대.
- `{component.sub-nav-pill}`는 데스크톱 36px 유지, 수직 패딩 조정으로 모바일 40px로 확대.

### 접힘 전략 (Collapsing Strategy)

- 최상위 내비는 1024px 미만에서 햄버거로 접힘; 워드마크와 `{component.button-primary}`는 고정 유지.
- 히어로 `{typography.display-xxl}` 클램프: 브레이크포인트 사다리를 따라 128px → 96px → 64px → 48px.
- 가격 3단 그리드는 1024px 미만에서 수직 스택, 추천 티어는 가운데 스택 유지.
- 코드 스토리 분할은 1024px 미만에서 좌우 배치에서 스택으로 전환, 코드 웰은 항상 두 번째.
- 서브 내비 알약은 768px 미만에서 줄바꿈 행에서 가로 스크롤 레일로 전환.

### 이미지 동작 (Image Behavior)

- 모델 썸네일은 1.5× 및 2× DPR로 제공; 768px 미만에서는 1200×1200 대신 600×600 익스포트로 전환.
- 히어로 대기 메시는 CSS 그라데이션으로 렌더링 — 에셋 비용 없음, 브레이크포인트 변형 없음.
- 코드 블록 내용은 1024px 미만에서 부드럽게 줄바꿈(가로 스크롤 없음); 긴 줄은 연속 표시(continuation marker)와 함께 끊김.

## 반복 가이드 (Iteration Guide)

1. 한 번에 하나의 컴포넌트에 집중하세요. 대부분의 인터랙티브 요소는 `{rounded.full}`과 `{colors.canvas}` / `{colors.surface-card}` 쌍을 공유하며 — 변형 간에는 역할별 토큰(`{colors.primary}`, `{component.code-block}`)만 달라집니다.
2. 컴포넌트 이름과 토큰을 직접 참조하세요(`{colors.primary}`, `{component.button-primary-pressed}`, `{rounded.lg}`) — 풀어쓰지 마세요.
3. 편집 후 `npx @google/design.md lint DESIGN.md`를 실행하세요; 고아 토큰(orphaned-tokens) 경고가 미사용 항목을 잡아줍니다.
4. 새 변형은 별도 항목(`-pressed`, `-disabled`, `-featured`)으로 추가하세요 — 산문 안에 묻지 마세요.
5. 본문 타입은 기본 `{typography.body-md}`; `{typography.subtitle}`은 히어로 부제에만 사용하세요.
6. `{colors.primary}`는 희소하게 유지하세요 — 뷰포트당 오렌지 요소가 둘 이상 나타나면 하나를 `{colors.surface-dark}`로 내릴지 자문하세요.

## 알려진 공백 (Known Gaps)

- 활성/눌림 시각 상태는 `button-primary-pressed`에 대해서만 문서화되어 있으며; 다른 컴포넌트는 포커스 링(`{colors.ring-focus}`)에 의존하는데, 이는 컴포넌트별 변형으로 추출되지 않았습니다.
- 모델 플레이그라운드 / try-this-model 인터랙티브 화면(로그인 기능)은 범위 밖이며; 공개 마케팅 캔버스만 문서화되어 있습니다.
- 대시보드 / 결제 / API 키 관리 화면은 추출되지 않았습니다 — 인증 뒤에 존재합니다.
- 홈 히어로 일러스트("작업대의 땜장이")는 시스템 컴포넌트가 아니라 장식 아트워크로 취급되며; 이를 재현하려면 토큰이 아니라 맞춤 일러스트가 필요합니다.
