import { test, expect } from '@playwright/test';

function createResultsPayload(overrides = {}) {
  return {
    status: 'results',
    sessionId: 'smoke-session',
    eligibleCount: 1,
    results: [
      {
        id: 'smoke-1',
        name: '든든한국밥',
        category: '한식',
        address: '경기 성남시 분당구 판교역로 152',
        location: { lat: 37.4979, lng: 127.0276 },
        path: [
          { lat: 37.4979, lng: 127.0276 },
          { lat: 37.4984, lng: 127.0281 }
        ],
        priceLevel: null,
        openingHours: null,
        rating: null,
        reviewCount: null,
        reviewSummary: null,
        transportMode: 'walk',
        oneWayRouteMinutes: 6,
        totalExpectedMinutes: 42,
        distanceMeters: 420,
        confidenceBadge: 'high',
        reason: '실제 리뷰 기준으로 빠르게 점심을 해결하기 좋습니다.',
        providerAttribution: 'Kakao Local / Kakao Mobility',
        openStatus: true
      }
    ],
    ...overrides
  };
}

async function mockPublicConfig(page) {
  await page.route('**/api/config/public', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        naverClientId: 'smoke-naver-client',
        mapProvider: 'naver',
        defaultLocale: 'ko-KR',
        supportedTransportModes: ['walk', 'drive'],
        timeRange: { min: 20, max: 60 }
      })
    });
  });

  await page.route('**/openapi/v3/maps.js*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.naver = { maps: { Map: function() { this.panTo=function(){}; this.fitBounds=function(){}; }, LatLng: function(){}, Point: function(){}, Marker: function(){ this.setMap=function(){}; }, Polyline: function(){ this.setMap=function(){}; }, InfoWindow: function(){ this.open=function(){}; this.close=function(){}; }, LatLngBounds: function(){ this.extend=function(){}; }, Position: { TOP_RIGHT: 1 }, Event: { addListener: function(){} } } };'
    });
  });
}

async function openRecommendationFlow(page, context, finalResponse) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.4979, longitude: 127.0276 });
  await mockPublicConfig(page);

  await page.route('**/api/recommendations', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'questions',
        sessionId: 'smoke-session',
        missingFields: ['transportMode', 'budgetPerPersonKrw'],
        questions: [
          { field: 'transportMode', label: '도보로 갈까요, 차로 갈까요?' },
          { field: 'budgetPerPersonKrw', label: '1인 예산은 얼마인가요?' }
        ]
      })
    });
  });

  await page.route('**/api/sessions/smoke-session/answers', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(finalResponse)
    });
  });

  await page.goto('/');
  await page
    .locator('#query-text-area')
    .fill('회사 상사와 점심 먹을 곳 추천해줘');
  await page.locator('.submit-btn').click();
  await expect(page.locator('.question-form h3')).toContainText('추가 질문');
  await page.locator('button:has-text("도보")').click();
  await page.locator('#input-budgetPerPersonKrw').fill('15000');
  await page.locator('.submit-answers-btn').click();
}

test.describe('smoke verification matrix', () => {
  test('proves the main swarm happy path renders results', async ({
    page,
    context
  }) => {
    await openRecommendationFlow(page, context, createResultsPayload());

    await expect(page.locator('.results-list-container h2')).toContainText(
      '추천 식당'
    );
    await expect(page.locator('.restaurant-name')).toContainText('든든한국밥');
    await expect(page.locator('.reason-text')).toContainText('실제 리뷰 기준');
  });

  test('shows provider outage fallback state without crashing the app', async ({
    page,
    context
  }) => {
    await openRecommendationFlow(page, context, {
      status: 'error',
      code: 'PROVIDER_ERROR',
      message: '식당 검색에 실패했습니다.',
      missingFields: []
    });

    await expect(page.locator('.error-title')).toContainText(
      '서비스 일시 장애'
    );
    await expect(page.locator('.error-message')).toContainText(
      '식당 검색에 실패했습니다.'
    );
    await expect(
      page.locator('button:has-text("다시 시도하기")')
    ).toBeVisible();
  });

  test('shows the no-results recovery path', async ({ page, context }) => {
    await openRecommendationFlow(page, context, {
      status: 'error',
      code: 'NO_RESULTS',
      message: '조건에 맞는 식당을 찾지 못했습니다.',
      missingFields: []
    });

    await expect(page.locator('.error-title')).toContainText(
      '추천할 식당이 없습니다'
    );
    await expect(
      page.locator('button:has-text("조건 수정하기")')
    ).toBeVisible();
    await expect(
      page.locator('button:has-text("출장/여행 모드로 전환")')
    ).toBeVisible();
  });

  test('shows the route failure recovery path', async ({ page, context }) => {
    await openRecommendationFlow(page, context, {
      status: 'error',
      code: 'ROUTE_UNAVAILABLE',
      message: '경로 탐색에 실패했습니다.',
      missingFields: []
    });

    await expect(page.locator('.error-title')).toContainText(
      '경로를 찾을 수 없습니다'
    );
    await expect(page.locator('.error-message')).toContainText(
      '경로 탐색에 실패했습니다.'
    );
  });

  test('shows unsupported browser handling when geolocation is unavailable', async ({
    page,
    context
  }) => {
    await context.grantPermissions([]);
    await mockPublicConfig(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: undefined
      });
    });

    await page.goto('/');
    await page.locator('#query-text-area').fill('지금 점심 먹을 곳 추천해줘');
    await page.locator('.submit-btn').click();

    await expect(page.locator('.error-title')).toContainText(
      '지원하지 않는 브라우저입니다'
    );
    await expect(page.locator('.error-message')).toContainText(
      '이 브라우저는 위치 정보를 지원하지 않습니다.'
    );
  });
});
