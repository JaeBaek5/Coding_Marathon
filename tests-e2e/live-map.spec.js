import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

function readServerEnv() {
  const envPath = join(process.cwd(), 'server', '.env');
  if (!existsSync(envPath)) return {};

  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        if (separatorIndex === -1) return [line, ''];
        return [
          line.slice(0, separatorIndex).trim(),
          line.slice(separatorIndex + 1).trim()
        ];
      })
  );
}

const serverEnv = readServerEnv();
const naverClientId = process.env.NAVER_CLIENT_ID || serverEnv.NAVER_CLIENT_ID;

test.describe('live map configuration', () => {
  test('uses the real public config endpoint instead of a mocked map key', async ({
    page
  }) => {
    await page.goto('/');

    const config = await page.evaluate(async () => {
      const response = await fetch('/api/config/public');
      return response.json();
    });

    expect(config.mapProvider).toBe('naver');
    expect(config.naverClientId).not.toBe('mock-client-id');
    expect(config.providerReadiness).toBeDefined();
  });

  test('loads the live NAVER Maps SDK when a real client id is configured', async ({
    page
  }) => {
    test.skip(
      !naverClientId,
      'NAVER_CLIENT_ID is not configured in the environment or server/.env'
    );

    await page.goto('/');
    await expect(page.getByTestId('map-error')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => Boolean(window.naver?.maps)), {
        timeout: 15000
      })
      .toBe(true);
  });

  test('shows an actionable missing-key state when no map key is configured', async ({
    page
  }) => {
    test.skip(
      Boolean(naverClientId),
      'NAVER_CLIENT_ID is configured, so the missing-key branch is not active'
    );

    await page.goto('/');
    await expect(page.getByTestId('map-error')).toContainText(
      'NAVER 지도 API 키가 설정되지 않았습니다.'
    );
  });
});
