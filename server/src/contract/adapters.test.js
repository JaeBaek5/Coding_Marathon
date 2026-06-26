import { describe, it, expect, beforeEach } from 'vitest';
import { NaverLocalAdapter } from '../adapters/naverLocalAdapter.js';
import { NaverDirectionsAdapter } from '../adapters/naverDirectionsAdapter.js';
import {
  normalizeNaverLocalItem,
  normalizeNaverKeywordLocation,
  normalizeWalkingRoute,
  normalizeNaverDrivingRoute,
  normalizeNaverWalkingRoute,
  mergeCandidateWithRoute
} from '../adapters/normalization.js';
import { estimateWalkingRoute, estimateDrivingRoute } from '../utils/haversine.js';
import { InMemoryCache, cacheTTLs } from '../utils/cache.js';
import { deduplicateCandidates, getDistanceMeters } from '../utils/dedupe.js';

describe('Provider Adapters & Mocking Fallback', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return mock data from NaverLocalAdapter when search credentials are missing', async () => {
    delete process.env.NAVER_SEARCH_ID;
    delete process.env.NAVER_SEARCH_SECRET;
    const adapter = new NaverLocalAdapter();
    const result = await adapter.searchNearbyRestaurants(
      37.4979,
      127.0276,
      1000
    );
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('든든한국밥');

    const keywordResult = await adapter.searchKeyword('판교역');
    expect(keywordResult).toHaveLength(1);
    expect(keywordResult[0].title).toBe('판교역 신분당선');
  });

  it('should estimate walking routes from coordinates when no mobility API is used', () => {
    const route = estimateWalkingRoute(37.4979, 127.0276, 37.4981, 127.0282);
    expect(route.durationMinutes).toBeGreaterThan(0);
    expect(route.distanceMeters).toBeGreaterThan(0);
    expect(route.path).toHaveLength(2);
  });

  it('should throw when NaverDirectionsAdapter credentials are missing', async () => {
    delete process.env.NAVER_CLIENT_ID;
    delete process.env.NAVER_CLIENT_SECRET;
    const adapter = new NaverDirectionsAdapter();
    await expect(
      adapter.getDrivingRoute(37.4979, 127.0276, 37.4965, 127.0255)
    ).rejects.toThrow('NAVER_CLIENT_ID/SECRET');
  });

  it('should estimate driving routes from actual coordinates when live API is unavailable', async () => {
    const route = estimateDrivingRoute(34.9698, 127.4763, 34.971, 127.478);
    expect(route.durationMinutes).toBeGreaterThan(0);
    expect(route.distanceMeters).toBeGreaterThan(0);
    expect(route.path).toHaveLength(2);
    expect(route.path[0]).toEqual({ lat: 34.9698, lng: 127.4763 });
    expect(route.path[1]).toEqual({ lat: 34.971, lng: 127.478 });
  });
});

describe('Normalization Layer', () => {
  it('should correctly normalize walking route estimates with integer minutes and meters', () => {
    const rawWalkingRoute = estimateWalkingRoute(
      37.4979,
      127.0276,
      37.4981,
      127.0282
    );

    const route = normalizeWalkingRoute(rawWalkingRoute);
    expect(route.durationMinutes).toBeGreaterThan(0);
    expect(route.distanceMeters).toBeGreaterThan(0);
    expect(route.path).toHaveLength(2);
    expect(route.path[0]).toEqual({ lat: 37.4979, lng: 127.0276 });
  });

  it('should correctly normalize walking routes from Naver Directions payload', () => {
    const rawWalkingRoute = {
      code: 0,
      route: {
        traoptimal: [
          {
            summary: {
              distance: 420.2,
              duration: 360000
            },
            path: [
              [127.0276, 37.4979],
              [127.0268, 37.498],
              [127.0282, 37.4981]
            ]
          }
        ]
      }
    };

    const route = normalizeNaverWalkingRoute(rawWalkingRoute);
    expect(route.durationMinutes).toBe(6);
    expect(route.distanceMeters).toBe(420);
    expect(route.path).toHaveLength(3);
  });

  it('should correctly normalize driving routes with integer minutes and meters', () => {
    const rawDrivingRoute = {
      code: 0,
      route: {
        trafast: [
          {
            summary: {
              distance: 650.8,
              duration: 480000
            },
            path: [
              [127.0276, 37.4979],
              [127.0255, 37.4965]
            ]
          }
        ]
      }
    };

    const route = normalizeNaverDrivingRoute(rawDrivingRoute);
    expect(route.durationMinutes).toBe(8);
    expect(route.distanceMeters).toBe(651);
    expect(route.path).toHaveLength(2);
    expect(route.path[0]).toEqual({ lng: 127.0276, lat: 37.4979 });
  });

  it('should normalize and merge candidate and route information', () => {
    const rawItem = {
      title: '맛있는 김치찌개',
      link: 'https://map.naver.com/p/entry/place/123',
      category: '음식점>한식>찌개>김치찌개',
      roadAddress: '서울 강남구 역삼로 1',
      mapx: '1270282000',
      mapy: '374981000'
    };

    const candidate = normalizeNaverLocalItem(rawItem);
    expect(candidate.name).toBe('맛있는 김치찌개');
    expect(candidate.category).toBe('김치찌개');

    const route = {
      durationMinutes: 5,
      distanceMeters: 400,
      path: [{ lat: 37.4979, lng: 127.0276 }]
    };

    const merged = mergeCandidateWithRoute(candidate, route, 'walk');
    expect(merged.oneWayRouteMinutes).toBe(5);
    expect(merged.totalExpectedMinutes).toBe(40);
    expect(merged.transportMode).toBe('walk');
    expect(merged.providerAttribution).toBe(
      'Naver Local Search / Walk estimate'
    );
  });

  it('should parse travel mode search locations', () => {
    const rawItem = {
      title: '판교역 신분당선',
      link: 'https://map.naver.com/p/entry/place/7891011',
      roadAddress: '경기 성남시 분당구 판교역로 지하 160',
      mapx: '1271112000',
      mapy: '373948000'
    };

    const loc = normalizeNaverKeywordLocation(rawItem);
    expect(loc.name).toBe('판교역 신분당선');
    expect(loc.location.lat).toBeCloseTo(37.3948, 4);
  });
});

describe('Deduplication Utility', () => {
  it('should collapse candidates with same name and address within 50m', () => {
    const list = [
      {
        id: '1',
        name: '든든한 국밥',
        address: '서울 강남구 역삼동 123-45',
        location: { lat: 37.4981, lng: 127.0282 }
      },
      {
        id: '2',
        name: '든든한국밥',
        address: '서울 강남구 역삼동 123-45',
        location: { lat: 37.4982, lng: 127.0283 }
      },
      {
        id: '3',
        name: '다른 식당',
        address: '서울 강남구 역삼동 123-45',
        location: { lat: 37.4981, lng: 127.0282 }
      },
      {
        id: '4',
        name: '든든한국밥',
        address: '서울 강남구 역삼동 123-45',
        location: { lat: 37.4995, lng: 127.0299 }
      }
    ];

    const dist12 = getDistanceMeters(37.4981, 127.0282, 37.4982, 127.0283);
    expect(dist12).toBeLessThan(50);

    const dist14 = getDistanceMeters(37.4981, 127.0282, 37.4995, 127.0299);
    expect(dist14).toBeGreaterThan(50);

    const deduped = deduplicateCandidates(list);
    expect(deduped).toHaveLength(3);
    expect(deduped[0].id).toBe('1');
    expect(deduped[1].id).toBe('3');
    expect(deduped[2].id).toBe('4');
  });
});

describe('Cache TTL Correctness', () => {
  it('should respect exact expiration times', () => {
    let mockTime = 1000;
    const timeProvider = () => mockTime;
    const cache = new InMemoryCache(timeProvider);

    cache.set('key1', 'val1', cacheTTLs.ROUTE);
    expect(cache.get('key1')).toBe('val1');

    mockTime += cacheTTLs.ROUTE - 1;
    expect(cache.get('key1')).toBe('val1');

    mockTime += 2;
    expect(cache.get('key1')).toBeNull();
  });

  it('should wrap async functions and cache their results', async () => {
    let mockTime = 1000;
    const timeProvider = () => mockTime;
    const cache = new InMemoryCache(timeProvider);

    let callCount = 0;
    const task = async () => {
      callCount++;
      return 'data';
    };

    const res1 = await cache.wrap('task1', cacheTTLs.NEARBY, task);
    expect(res1).toBe('data');
    expect(callCount).toBe(1);

    const res2 = await cache.wrap('task1', cacheTTLs.NEARBY, task);
    expect(res2).toBe('data');
    expect(callCount).toBe(1);

    mockTime += cacheTTLs.NEARBY + 1;

    const res3 = await cache.wrap('task1', cacheTTLs.NEARBY, task);
    expect(res3).toBe('data');
    expect(callCount).toBe(2);
  });
});

describe('Task 4 hardening: normalization edges and contract fidelity', () => {
  it('should carry Naver link into placeUrl so Gimel review extraction can resolve it', () => {
    const rawItem = {
      title: '든든한국밥',
      link: 'https://map.naver.com/p/entry/place/111111',
      category: '음식점>한식>국밥>순대국',
      address: '서울 강남구 역삼동 123-45',
      roadAddress: '서울 강남구 테헤란로 123',
      mapx: '1270282000',
      mapy: '374981000'
    };

    const candidate = normalizeNaverLocalItem(rawItem);
    expect(candidate.placeUrl).toBe(
      'https://map.naver.com/p/entry/place/111111'
    );
  });

  it('should set placeUrl to null when Naver omits link', () => {
    const rawItem = {
      title: '깔끔초밥',
      category: '음식점>일식>초밥>일식집',
      roadAddress: '서울 강남구 강남대로 543',
      mapx: '1270255000',
      mapy: '374965000'
    };

    const candidate = normalizeNaverLocalItem(rawItem);
    expect(candidate.placeUrl).toBeNull();
  });

  it('should preserve placeUrl through mergeCandidateWithRoute into a schema-valid candidate', () => {
    const rawItem = {
      title: '든든한국밥',
      link: 'https://map.naver.com/p/entry/place/111111',
      category: '음식점>한식>국밥>순대국',
      roadAddress: '서울 강남구 테헤란로 123',
      mapx: '1270282000',
      mapy: '374981000'
    };
    const candidate = normalizeNaverLocalItem(rawItem);
    const route = {
      durationMinutes: 5,
      distanceMeters: 400,
      path: [{ lat: 37.4979, lng: 127.0276 }]
    };

    const merged = mergeCandidateWithRoute(candidate, route, 'walk');
    expect(merged.placeUrl).toBe(
      'https://map.naver.com/p/entry/place/111111'
    );
  });

  it('should throw a deterministic error when NAVER driving payload has a non-zero code', () => {
    expect(() =>
      normalizeNaverDrivingRoute({ code: 1, message: 'fail' })
    ).toThrow('No driving routes found');
  });

  it('should keep same-name candidates that sit farther than 50m apart', () => {
    const list = [
      {
        id: 'a',
        name: '든든한국밥',
        address: '서울 강남구 역삼동 123-45',
        location: { lat: 37.4981, lng: 127.0282 }
      },
      {
        id: 'b',
        name: '든든한국밥',
        address: '서울 강남구 역삼동 999-99',
        location: { lat: 37.5099, lng: 127.0399 }
      }
    ];

    const deduped = deduplicateCandidates(list);
    expect(deduped).toHaveLength(2);
  });

  it('should isolate cache entries by key so different radii do not collide', () => {
    let mockTime = 1000;
    const cache = new InMemoryCache(() => mockTime);

    cache.set('nearby:37.5:127.0:500', ['a'], cacheTTLs.NEARBY);
    cache.set('nearby:37.5:127.0:1000', ['b'], cacheTTLs.NEARBY);

    expect(cache.get('nearby:37.5:127.0:500')).toEqual(['a']);
    expect(cache.get('nearby:37.5:127.0:1000')).toEqual(['b']);
  });
});
