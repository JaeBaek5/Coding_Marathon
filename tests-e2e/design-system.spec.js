import { expect, test } from '@playwright/test';

async function mockMapConfig(page) {
  await page.route('**/api/config/public', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        naverClientId: 'design-test-client',
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
      body: 'window.naver = { maps: { Map: function() { this.panTo=function(){}; this.fitBounds=function(){}; }, LatLng: function(){}, Point: function(){}, Marker: function(){ this.setMap=function(){}; }, Polyline: function(){ this.setMap=function(){}; }, InfoWindow: function(){ this.open=function(){}; this.close=function(){}; }, LatLngBounds: function(){ this.extend=function(){}; }, Position: { TOP_RIGHT: 1 }, Event: { addListener: function(){} } } };'
    });
  });
}

test.describe('shadcn design system', () => {
  test('renders initial mobile surface with shadcn preset tokens', async ({
    page
  }) => {
    await mockMapConfig(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.locator('header h1')).toContainText('머먹');
    await expect(page.locator('#query-text-area')).toBeVisible();

    const tokenState = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const submit = getComputedStyle(document.querySelector('.submit-btn'));
      const card = getComputedStyle(
        document.querySelector('.query-form-container')
      );

      return {
        background: root.getPropertyValue('--background').trim(),
        foreground: root.getPropertyValue('--foreground').trim(),
        primary: root.getPropertyValue('--primary').trim(),
        card: root.getPropertyValue('--card').trim(),
        radius: root.getPropertyValue('--radius').trim(),
        submitRadius: submit.borderRadius,
        submitBackground: submit.backgroundColor,
        cardBackground: card.backgroundColor
      };
    });

    expect(tokenState.background).not.toBe('');
    expect(tokenState.foreground).not.toBe('');
    expect(tokenState.primary).not.toBe('');
    expect(tokenState.card).not.toBe('');
    expect(tokenState.radius).not.toBe('');
    expect(Number.parseFloat(tokenState.submitRadius)).toBeLessThan(24);
    expect(tokenState.submitBackground).not.toBe(tokenState.cardBackground);
  });
});
