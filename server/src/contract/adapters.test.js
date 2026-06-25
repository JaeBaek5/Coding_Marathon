import { describe, it, expect, beforeEach } from 'vitest';
import { KakaoLocalAdapter } from '../adapters/kakaoLocalAdapter.js';
import { KakaoMobilityAdapter } from '../adapters/kakaoMobilityAdapter.js';
import { NaverDirectionsAdapter } from '../adapters/naverDirectionsAdapter.js';
import {
  normalizeKakaoLocalCandidate,
  normalizeKakaoKeywordLocation,
  normalizeKakaoWalkingRoute,
  normalizeNaverDrivingRoute,
  mergeCandidateWithRoute
} from '../adapters/normalization.js';
import { InMemoryCache, cacheTTLs } from '../utils/cache.js';
import { deduplicateCandidates, getDistanceMeters } from '../utils/dedupe.js';

describe('Provider Adapters & Mocking Fallback', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return mock data from KakaoLocalAdapter when API key is missing', async () => {
    delete process.env.KAKAO_API_KEY;
    const adapter = new KakaoLocalAdapter();
    const result = await adapter.searchNearbyRestaurants(
      37.4979,
      127.0276,
      1000
    );
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0].place_name).toBe('든든한국밥');

    const keywordResult = await adapter.searchKeyword('판교역');
    expect(keywordResult.documents).toHaveLength(1);
    expect(keywordResult.documents[0].place_name).toBe('판교역 신분당선');
  });

  it('should return mock data from KakaoMobilityAdapter when API key is missing', async () => {
    delete process.env.KAKAO_API_KEY;
    const adapter = new KakaoMobilityAdapter();
    const result = await adapter.getWalkingRoute(
      37.4979,
      127.0276,
      37.4981,
      127.0282
    );
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].summary.distance).toBe(400);
  });

  it('should return mock data from NaverDirectionsAdapter when credentials are missing', async () => {
    delete process.env.NAVER_CLIENT_ID;
    delete process.env.NAVER_CLIENT_SECRET;
    const adapter = new NaverDirectionsAdapter();
    const result = await adapter.getDrivingRoute(
      37.4979,
      127.0276,
      37.4965,
      127.0255
    );
    expect(result.route.trafast).toHaveLength(1);
    expect(result.route.trafast[0].summary.distance).toBe(650);
  });
});

describe('Normalization Layer', () => {
  it('should correctly normalize walking routes with integer minutes and meters', () => {
    const rawWalkingRoute = {
      routes: [
        {
          summary: {
            distance: 400.3,
            duration: 300
          },
          sections: [
            {
              roads: [
                {
                  vertexes: [127.0276, 37.4979, 127.0282, 37.4981]
                }
              ]
            }
          ]
        }
      ]
    };

    const route = normalizeKakaoWalkingRoute(rawWalkingRoute);
    expect(route.durationMinutes).toBe(5);
    expect(route.distanceMeters).toBe(400);
    expect(route.path).toHaveLength(2);
    expect(route.path[0]).toEqual({ lng: 127.0276, lat: 37.4979 });
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
    const rawDoc = {
      id: '123',
      place_name: '맛있는 김치찌개',
      category_name: '음식점 > 한식 > 찌개 > 김치찌개',
      road_address_name: '서울 강남구 역삼로 1',
      x: '127.0282',
      y: '37.4981'
    };

    const candidate = normalizeKakaoLocalCandidate(rawDoc);
    expect(candidate.name).toBe('맛있는 김치찌개');
    expect(candidate.category).toBe('한식');

    const route = {
      durationMinutes: 5,
      distanceMeters: 400,
      path: [{ lat: 37.4979, lng: 127.0276 }]
    };

    const merged = mergeCandidateWithRoute(candidate, route, 'walk');
    expect(merged.oneWayRouteMinutes).toBe(5);
    expect(merged.totalExpectedMinutes).toBe(40);
    expect(merged.transportMode).toBe('walk');
    expect(merged.providerAttribution).toBe('Kakao Local / Kakao Mobility');
  });

  it('should parse travel mode search locations', () => {
    const rawDoc = {
      id: '123',
      place_name: '판교역 신분당선',
      road_address_name: '경기 성남시 분당구 판교역로 지하 160',
      x: '127.1112',
      y: '37.3948'
    };

    const loc = normalizeKakaoKeywordLocation(rawDoc);
    expect(loc.name).toBe('판교역 신분당선');
    expect(loc.location.lat).toBe(37.3948);
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
  it('should carry Kakao place_url into placeUrl so Gimel review extraction can resolve it', () => {
    const rawDoc = {
      id: '111111',
      place_name: '든든한국밥',
      category_name: '음식점 > 한식 > 국밥 > 순대국',
      address_name: '서울 강남구 역삼동 123-45',
      road_address_name: '서울 강남구 테헤란로 123',
      x: '127.0282',
      y: '37.4981',
      place_url: 'http://place.map.kakao.com/111111'
    };

    const candidate = normalizeKakaoLocalCandidate(rawDoc);
    expect(candidate.placeUrl).toBe('http://place.map.kakao.com/111111');
  });

  it('should set placeUrl to null when Kakao omits place_url', () => {
    const rawDoc = {
      id: '222222',
      place_name: '깔끔초밥',
      category_name: '음식점 > 일식 > 초밥 > 일식집',
      road_address_name: '서울 강남구 강남대로 543',
      x: '127.0255',
      y: '37.4965'
    };

    const candidate = normalizeKakaoLocalCandidate(rawDoc);
    expect(candidate.placeUrl).toBeNull();
  });

  it('should preserve placeUrl through mergeCandidateWithRoute into a schema-valid candidate', () => {
    const rawDoc = {
      id: '111111',
      place_name: '든든한국밥',
      category_name: '음식점 > 한식 > 국밥 > 순대국',
      road_address_name: '서울 강남구 테헤란로 123',
      x: '127.0282',
      y: '37.4981',
      place_url: 'http://place.map.kakao.com/111111'
    };
    const candidate = normalizeKakaoLocalCandidate(rawDoc);
    const route = {
      durationMinutes: 5,
      distanceMeters: 400,
      path: [{ lat: 37.4979, lng: 127.0276 }]
    };

    const merged = mergeCandidateWithRoute(candidate, route, 'walk');
    expect(merged.placeUrl).toBe('http://place.map.kakao.com/111111');
  });

  it('should throw a deterministic error when Kakao walking payload has zero routes', () => {
    expect(() => normalizeKakaoWalkingRoute({ routes: [] })).toThrow(
      'No walking routes found'
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
