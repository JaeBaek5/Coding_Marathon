import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchNearbyCandidates } from '../../adapters/index.js';
import { cache } from '../../utils/cache.js';

describe('candidate provider selection', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    cache.clear();
    vi.restoreAllMocks();
  });

  it('uses NAVER Local Search instead of fixture candidates at runtime', async () => {
    process.env.NAVER_SEARCH_ID = 'naver-search-id';
    process.env.NAVER_SEARCH_SECRET = 'naver-search-secret';
    process.env.NAVER_CLIENT_ID = 'naver-map-id';
    process.env.NAVER_CLIENT_SECRET = 'naver-map-secret';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              title: '<b>실제네이버식당</b>',
              category: '음식점>백반',
              roadAddress: '서울특별시 강남구 테헤란로 1',
              mapx: '1270276000',
              mapy: '374979000',
              link: 'https://m.place.naver.com/restaurant/123456/home'
            }
          ]
        })
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] })
      });
    globalThis.fetch = fetchMock;

    const candidates = await searchNearbyCandidates(37.4979, 127.0276, 1000);

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toBe('실제네이버식당');
    expect(candidates[0].placeUrl).toBe(
      'https://m.place.naver.com/restaurant/123456/home'
    );
  });
});
