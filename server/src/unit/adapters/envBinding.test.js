import { afterEach, describe, expect, it, vi } from 'vitest';
import { NaverLocalAdapter } from '../../adapters/naverLocalAdapter.js';
import { NaverDirectionsAdapter } from '../../adapters/naverDirectionsAdapter.js';

describe('provider adapter environment binding', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('uses NAVER Local Search credentials set after adapter construction', async () => {
    delete process.env.NAVER_SEARCH_ID;
    delete process.env.NAVER_SEARCH_SECRET;
    const adapter = new NaverLocalAdapter();
    process.env.NAVER_SEARCH_ID = 'live-search-id';
    process.env.NAVER_SEARCH_SECRET = 'live-search-secret';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: [] })
    }));
    globalThis.fetch = fetchMock;

    await adapter.searchKeyword('강남역 맛집');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'X-Naver-Client-Id': 'live-search-id',
      'X-Naver-Client-Secret': 'live-search-secret'
    });
  });

  it('uses NAVER reverse geocoding credentials set after adapter construction', async () => {
    delete process.env.NAVER_CLIENT_ID;
    delete process.env.NAVER_CLIENT_SECRET;
    const adapter = new NaverLocalAdapter();
    process.env.NAVER_CLIENT_ID = 'live-map-id';
    process.env.NAVER_CLIENT_SECRET = 'live-map-secret';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            region: {
              area2: { name: '강남구' },
              area3: { name: '역삼동' }
            }
          }
        ]
      })
    }));
    globalThis.fetch = fetchMock;

    await adapter.reverseGeocode(37.4979, 127.0276);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'X-NCP-APIGW-API-KEY-ID': 'live-map-id',
      'X-NCP-APIGW-API-KEY': 'live-map-secret'
    });
  });

  it('uses NAVER Directions credentials set after adapter construction', async () => {
    delete process.env.NAVER_CLIENT_ID;
    delete process.env.NAVER_CLIENT_SECRET;
    const adapter = new NaverDirectionsAdapter();
    process.env.NAVER_CLIENT_ID = 'live-naver-id';
    process.env.NAVER_CLIENT_SECRET = 'live-naver-secret';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ route: { trafast: [] } })
    }));
    globalThis.fetch = fetchMock;

    await adapter.getDrivingRoute(37.4979, 127.0276, 37.4965, 127.0255);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'X-NCP-APIGW-API-KEY-ID': 'live-naver-id',
      'X-NCP-APIGW-API-KEY': 'live-naver-secret'
    });
  });
});
