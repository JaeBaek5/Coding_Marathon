import { test, expect } from '@playwright/test';

test.describe('Mumuk Results UI', () => {
  let answerCallCount = 0;

  const questionPayload = {
    status: 'questions',
    sessionId: 'test-session-results',
    missingFields: ['transportMode', 'budgetPerPersonKrw'],
    questions: [
      {
        field: 'transportMode',
        label: '이동 수단을 선택해주세요.',
        options: [
          { value: 'walk', label: '도보' },
          { value: 'drive', label: '차량' }
        ]
      },
      {
        field: 'budgetPerPersonKrw',
        label: '1인 예산은 얼마인가요?'
      }
    ]
  };

  const candidatePool = [
    {
      id: '1',
      name: 'First Restaurant',
      category: 'Korean',
      address: 'Address 1',
      location: { lat: 37.5, lng: 127.1 },
      path: [
        { lat: 37.4979, lng: 127.0276 },
        { lat: 37.5, lng: 127.1 }
      ],
      priceLevel: null,
      openingHours: null,
      rating: null,
      reviewCount: null,
      reviewSummary: {
        pros: 'Great for lunch with short walk.',
        cons: 'Noisy at night.'
      },
      transportMode: 'walk',
      oneWayRouteMinutes: 10,
      totalExpectedMinutes: 50,
      distanceMeters: 800,
      confidenceBadge: 'high',
      reason: 'Great place for lunch.',
      providerAttribution: 'Naver Local Search',
      openStatus: true
    },
    {
      id: '2',
      name: 'Second Restaurant',
      category: 'Italian',
      address: 'Address 2',
      location: { lat: 37.51, lng: 127.11 },
      path: [
        { lat: 37.4979, lng: 127.0276 },
        { lat: 37.51, lng: 127.11 }
      ],
      priceLevel: null,
      openingHours: null,
      rating: null,
      reviewCount: null,
      reviewSummary: {
        pros: 'Calm interior and good service.',
        cons: 'Price is slightly high.'
      },
      transportMode: 'drive',
      oneWayRouteMinutes: 15,
      totalExpectedMinutes: 60,
      distanceMeters: 3000,
      confidenceBadge: 'medium',
      reason: 'Good pasta.',
      providerAttribution: 'Naver Local Search',
      openStatus: null
    },
    {
      id: '3',
      name: 'Third Restaurant',
      category: 'Japanese',
      address: 'Address 3',
      location: { lat: 37.51, lng: 127.12 },
      path: [
        { lat: 37.4979, lng: 127.0276 },
        { lat: 37.51, lng: 127.12 }
      ],
      priceLevel: null,
      openingHours: null,
      rating: null,
      reviewCount: null,
      reviewSummary: {
        pros: 'Popular with students nearby.',
        cons: 'Parking is limited.'
      },
      transportMode: 'walk',
      oneWayRouteMinutes: 12,
      totalExpectedMinutes: 55,
      distanceMeters: 1200,
      confidenceBadge: 'medium',
      reason: 'Nice ramen.',
      providerAttribution: 'Naver Local Search',
      openStatus: true
    }
  ];

  function createResultsPayload(results) {
    return {
      status: 'results',
      sessionId: 'test-session-results',
      eligibleCount: results.length,
      results,
      currentRecommendation: results[0] || null,
      candidatePool: results
    };
  }

  test.beforeEach(async ({ page, context }) => {
    answerCallCount = 0;
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 37.4979, longitude: 127.0276 });

    await page.route('**/api/config/public', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          naverClientId: 'dummy_client_id',
          mapProvider: 'naver',
          defaultLocale: 'ko-KR',
          supportedTransportModes: ['walk', 'drive'],
          timeRange: { min: 20, max: null }
        })
      });
    });

    await page.route('**/openapi/v3/maps.js*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body:
          'console.log("Mock map script loaded"); window.naver = { maps: { Map: function() { this.panTo=function(){}; this.fitBounds=function(){}; }, LatLng: function(){}, Point: function(){}, Marker: function(){ this.setMap=function(){}; }, Polyline: function(){ this.setMap=function(){}; }, InfoWindow: function(){ this.open=function(){}; this.close=function(){}; }, LatLngBounds: function(){ this.extend=function(){}; }, Position: {TOP_RIGHT: 1}, Event: {addListener: function(){}} } };'
      });
    });

    await page.route('**/api/recommendations', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(questionPayload)
      });
    });

    await page.route('**/api/sessions/*/answers', async (route) => {
      const requestBody = await route.request().postDataJSON();
      const answers = requestBody?.answers || {};
      if (answers.action === 'dislike') {
        answerCallCount += 1;
        if (answerCallCount === 1) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(createResultsPayload(candidatePool.slice(1)))
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(createResultsPayload(candidatePool.slice(2)))
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createResultsPayload(candidatePool))
      });
    });
  });

  test('should render full result pool and remove disliked cards', async ({
    page
  }) => {
    await page.goto('/');

    const textarea = page.locator('#query-text-area');
    await textarea.fill('Lunch around here');
    const submitBtn = page.locator('.submit-btn');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    const questionTitle = page.locator('.question-form h3');
    await expect(questionTitle).toBeVisible();

    const walkPill = page.locator('.pill-select').first();
    await expect(walkPill).toBeVisible({ timeout: 10000 });
    await walkPill.click();

    const budgetInput = page.locator('#input-budgetPerPersonKrw');
    await budgetInput.fill('15000');
    const submitBtnClick = page.locator('button.submit-answers-btn');
    await expect(submitBtnClick).toBeVisible({ timeout: 10000 });
    await submitBtnClick.click();

    const subtitle = page.locator('.results-header .subtitle');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toContainText('3곳');

    const resultCards = page.locator('.result-card');
    await expect(resultCards).toHaveCount(3);

    await expect(page.locator('.restaurant-name').first()).toHaveText('First Restaurant');
    await expect(page.locator('.reason-text')).toHaveText('Great place for lunch.');
    await expect(page.locator('.review-line')).toHaveCount(2);
    await expect(page.locator('.review-line')).toHaveText([
      '장점Great for lunch with short walk.',
      '단점Noisy at night.'
    ]);

    const firstDislike = resultCards.nth(0).locator('.feedback-btn').first();
    await firstDislike.click();

    await expect(resultCards).toHaveCount(2);
    await expect(page.locator('.results-list-container')).not.toContainText(
      'First Restaurant'
    );
    await expect(subtitle).toContainText('2곳');

    const secondDislike = page.locator('.result-card').nth(0).locator('.feedback-btn').first();
    await secondDislike.click();

    await expect(resultCards).toHaveCount(1);
    await expect(resultCards.nth(0).locator('.restaurant-name')).toHaveText(
      'Third Restaurant'
    );
    await expect(subtitle).toContainText('1곳');

    await resultCards.nth(0).click();
    await expect(resultCards.nth(0)).toHaveClass(/active/);

    await expect(page.locator('.map-container')).toBeVisible();
  });
});
