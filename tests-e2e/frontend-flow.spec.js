import { test, expect } from '@playwright/test';

test.describe('Mumuk Frontend Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 37.4979, longitude: 127.0276 });

    await page.route('**/api/config/public', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mapProvider: 'naver',
          defaultLocale: 'ko-KR',
          supportedTransportModes: ['walk', 'drive'],
          timeRange: { min: 20, max: 60 }
        })
      });
    });

    await page.route('**/api/recommendations', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'questions',
          sessionId: 'test-session-123',
          missingFields: ['transportMode', 'budgetPerPersonKrw'],
          questions: [
            { field: 'transportMode', label: '도보로 갈까요, 차로 갈까요?' },
            { field: 'budgetPerPersonKrw', label: '1인 예산은 얼마인가요?' }
          ]
        })
      });
    });

    await page.route(
      '**/api/sessions/test-session-123/answers',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'results',
            sessionId: 'test-session-123',
            eligibleCount: 1,
            results: [
              {
                id: '1',
                name: '맛있는 식당',
                category: '한식',
                address: '경기 성남시 분당구 판교역로 152',
                location: { lat: 37.4979, lng: 127.0276 },
                priceLevel: null,
                openingHours: null,
                rating: null,
                reviewCount: null,
                reviewSummary: null,
                transportMode: 'walk',
                oneWayRouteMinutes: 5,
                totalExpectedMinutes: 40,
                distanceMeters: 350,
                confidenceBadge: 'high',
                reason: '한식이 먹고 싶을 때 가기 좋은 정갈한 밥집입니다.',
                providerAttribution: 'Kakao Local / Kakao Mobility',
                openStatus: true
              }
            ]
          })
        });
      }
    );
  });

  test('should render mobile layout and handle the natural-language question flow to results', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const mainHeader = page.locator('header h1');
    await expect(mainHeader).toContainText('머먹');

    const textarea = page.locator('#query-text-area');
    await expect(textarea).toBeVisible();
    await textarea.fill('회사 상사랑 점심 식사할 곳 추천해줘');

    const submitBtn = page.locator('.submit-btn');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    const questionTitle = page.locator('.question-form h3');
    await expect(questionTitle).toContainText('추가 질문');

    const transportLabel = page.locator('text=도보로 갈까요, 차로 갈까요?');
    await expect(transportLabel).toBeVisible();

    const walkPill = page.locator('button:has-text("도보")');
    await expect(walkPill).toBeVisible();
    await walkPill.click();

    const budgetLabel = page.locator('text=1인 예산은 얼마인가요?');
    await expect(budgetLabel).toBeVisible();

    const budgetInput = page.locator('#input-budgetPerPersonKrw');
    await budgetInput.fill('15000');

    const submitAnswersBtn = page.locator('.submit-answers-btn');
    await expect(submitAnswersBtn).toBeVisible();
    await submitAnswersBtn.click();

    const resultsTitle = page.locator('.results-list-container h2');
    await expect(resultsTitle).toContainText('추천 식당');

    const restaurantName = page.locator('.restaurant-name');
    await expect(restaurantName).toContainText('맛있는 식당');

    const resetBtn = page.locator('.reset-btn');
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue('');
  });

  test('should reset state cleanly on page reload', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const textarea = page.locator('#query-text-area');
    await textarea.fill('회사 상사랑 점심 식사할 곳 추천해줘');

    const submitBtn = page.locator('.submit-btn');
    await submitBtn.click();

    const questionTitle = page.locator('.question-form h3');
    await expect(questionTitle).toContainText('추가 질문');

    await page.reload();

    const newTextarea = page.locator('#query-text-area');
    await expect(newTextarea).toBeVisible();
    await expect(newTextarea).toHaveValue('');
  });

  test('should display switch-to-travel CTA when geolocation is denied in normal mode', async ({
    page,
    context
  }) => {
    await context.grantPermissions([]);
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (success, error) => {
        error({
          code: 1,
          message: 'User denied Geolocation',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3
        });
      };
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const textarea = page.locator('#query-text-area');
    await textarea.fill('회사 상사랑 점심 식사할 곳 추천해줘');

    const submitBtn = page.locator('.submit-btn');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    const ctaBtn = page.locator('button:has-text("출장/여행 모드로 전환")');
    await expect(ctaBtn).toBeVisible();

    await ctaBtn.click();

    const travelSearchInput = page.locator('#location-search-input');
    await expect(travelSearchInput).toBeVisible();
  });

  test('travel mode should not allow submission without selecting a validated place', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const travelModeBtn = page.locator('button:has-text("출장/여행 모드")');
    await travelModeBtn.click();

    const travelSearchInput = page.locator('#location-search-input');
    await expect(travelSearchInput).toBeVisible();

    const textarea = page.locator('#query-text-area');
    await textarea.fill('회사 상사랑 점심 식사할 곳 추천해줘');

    const submitBtn = page.locator('.submit-btn');
    await expect(submitBtn).toBeDisabled();

    await page.route('**/api/location-search?q=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            name: '판교역',
            address: '경기 성남시 분당구 판교역로 152',
            coords: { lat: 37.4979, lng: 127.0276 }
          }
        ])
      });
    });

    await travelSearchInput.fill('판교역');

    const resultItem = page.locator('.search-result-item');
    await expect(resultItem).toBeVisible();
    await resultItem.click();

    await expect(submitBtn).toBeEnabled();
  });
});
