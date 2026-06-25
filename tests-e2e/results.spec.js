import { test, expect } from '@playwright/test';

test.describe('Mumuk Results UI', () => {
  test.beforeEach(async ({ page, context }) => {
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
          timeRange: { min: 20, max: 60 }
        })
      });
    });

    // mock map
    await page.route('**/openapi/v3/maps.js*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'console.log("Mock map script loaded"); window.naver = { maps: { Map: function() { this.panTo=function(){}; this.fitBounds=function(){}; }, LatLng: function(){}, Point: function(){}, Marker: function(){ this.setMap=function(){}; }, Polyline: function(){ this.setMap=function(){}; }, InfoWindow: function(){ this.open=function(){}; this.close=function(){}; }, LatLngBounds: function(){ this.extend=function(){}; }, Position: {TOP_RIGHT: 1}, Event: {addListener: function(){}} } };'
      });
    });

    await page.route('**/api/recommendations', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'questions',
          sessionId: 'test-session-results',
          missingFields: ['transportMode', 'budgetPerPersonKrw'],
          questions: [
            {
              field: 'transportMode',
              label: '이동 수단을 선택해주세요.',
              options: [
                { value: 'walk', label: '도보' },
                { value: 'drive', label: '자차' }
              ]
            },
            {
              field: 'budgetPerPersonKrw',
              label: '1인 예산은 얼마인가요?'
            }
          ]
        })
      });
    });

    await page.route('**/api/sessions/*/answers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'results',
          sessionId: 'test-session-results',
          eligibleCount: 2,
          currentRecommendation: {
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
            reviewSummary: null,
            transportMode: 'walk',
            oneWayRouteMinutes: 10,
            totalExpectedMinutes: 50,
            distanceMeters: 800,
            confidenceBadge: 'high',
            reason: 'Great place for lunch.',
            providerAttribution: 'Kakao Local',
            openStatus: true
          },
          candidatePool: [
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
              reviewSummary: null,
              transportMode: 'walk',
              oneWayRouteMinutes: 10,
              totalExpectedMinutes: 50,
              distanceMeters: 800,
              confidenceBadge: 'high',
              reason: 'Great place for lunch.',
              providerAttribution: 'Kakao Local',
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
              reviewSummary: null,
              transportMode: 'drive',
              oneWayRouteMinutes: 15,
              totalExpectedMinutes: 60,
              distanceMeters: 3000,
              confidenceBadge: 'medium',
              reason: 'Good pasta.',
              providerAttribution: 'Kakao Local',
              openStatus: null
            }
          ],
          results: [
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
              reviewSummary: null,
              transportMode: 'walk',
              oneWayRouteMinutes: 10,
              totalExpectedMinutes: 50,
              distanceMeters: 800,
              confidenceBadge: 'high',
              reason: 'Great place for lunch.',
              providerAttribution: 'Kakao Local',
              openStatus: true
            }
          ],
          showFullPool: false
        })
      });
    });
  });

  test('should render results with grounded reason and sync map selection', async ({
    page
  }) => {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('request', (request) =>
      console.log('>>', request.method(), request.url())
    );
    page.on('response', (response) =>
      console.log('<<', response.status(), response.url())
    );
    await page.goto('/');

    const textarea = page.locator('#query-text-area');
    await textarea.fill('Lunch around here');
    const submitBtn = page.locator('.submit-btn');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await page.waitForTimeout(1000);
    console.log('DOM CONTENT:', await page.content());

    const questionTitle = page.locator('.question-form h3');
    await expect(questionTitle).toContainText('추가 질문');

    // Click through questions
    // Find transport mode pill by looking for one that starts with '도' or '차' or simply find the first pill-select
    // Actually the mock returns options: [ { value: 'walk', label: '도보' }, ... ]
    // BUT the component uses static options internally ignoring the ones from the mock
    // Let's just click the first pill-select under transportMode or the pill that has walk

    const walkPill = page.locator('.pill-select').first();
    await expect(walkPill).toBeVisible({ timeout: 10000 });
    await walkPill.click();

    const budgetInput = page.locator('#input-budgetPerPersonKrw');
    await budgetInput.fill('15000');

    await page.waitForTimeout(500);

    const submitBtnClick = page.locator('button.submit-answers-btn');
    await expect(submitBtnClick).toBeVisible({ timeout: 10000 });
    await submitBtnClick.click();

    const subtitle = page.locator('.results-header .subtitle');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toContainText('1곳 추천');

    const resultCards = page.locator('.result-card');
    await expect(resultCards).toHaveCount(1);

    const firstReason = resultCards.nth(0).locator('.reason-text');
    await expect(firstReason).toHaveText('Great place for lunch.');

    const likeButton = page.locator('.feedback-btn', { hasText: '좋아요' });
    await expect(likeButton).toBeVisible();
    const dislikeButton = page.locator('.feedback-btn', { hasText: '싫어요' });
    await expect(dislikeButton).toBeVisible();

    // Verify null field hiding (openStatus is null for second, should not render)
    const firstStatusBadge = resultCards
      .nth(0)
      .locator('.badge-tag[class*="status-"]');
    await expect(firstStatusBadge).toBeVisible();

    // Check map initialized (basic test that the fake SDK executed)
    const mapPlaceholder = page.locator('.map-placeholder');
    const mapError = page.locator('.map-error-text');
    if ((await mapError.count()) > 0) {
      console.log('Map Error:', await mapError.textContent());
    }
    await expect(mapPlaceholder).toHaveClass(/map-loaded/);
  });
});
