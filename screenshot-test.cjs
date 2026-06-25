const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.4979, longitude: 127.0276 });
  const page = await context.newPage();
  page.on('console', (msg) => console.log(msg.text()));
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
            label: '�̵� ������ �������ּ���.',
            options: [
              { value: 'walk', label: '����' },
              { value: 'drive', label: '����' }
            ]
          },
          { field: 'budgetPerPersonKrw', label: '1�� ������ ���ΰ���?' }
        ]
      })
    });
  });
  await page.goto('http://localhost:5173/');
  const textarea = page.locator('#query-text-area');
  await textarea.fill('Lunch around here');
  const submitBtn = page.locator('.submit-btn');
  await submitBtn.waitFor({ state: 'visible' });
  await submitBtn.click();
  await page.waitForTimeout(2000);
  console.log('HTML after click:', await page.content());
  await browser.close();
})();
