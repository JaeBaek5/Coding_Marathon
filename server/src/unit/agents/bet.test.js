import { describe, it, expect, vi } from 'vitest';
import {
  BetAgent,
  rankBetCandidates,
  validateBetTimeBudget,
  RankingValidationError
} from '../../../src/agents/bet/index.js';

function createCandidate(overrides = {}) {
  return {
    id: overrides.id ?? 'candidate-1',
    name: overrides.name ?? '조용한 한식집',
    category: overrides.category ?? '한식',
    address: overrides.address ?? '서울 강남구 테헤란로 1',
    location: overrides.location ?? { lat: 37.501, lng: 127.031 },
    priceLevel: null,
    openingHours: null,
    rating: null,
    reviewCount: null,
    reviewSummary: null,
    openStatus: null,
    ...overrides
  };
}

function createRoute(durationMinutes, distanceMeters = 400) {
  return {
    durationMinutes,
    distanceMeters,
    path: []
  };
}

function createSlots(overrides = {}) {
  return {
    mode: 'normal',
    location: { lat: 37.4979, lng: 127.0276 },
    mealPeriod: 'lunch',
    totalTimeMinutes: 45,
    transportMode: 'walk',
    budgetPerPersonKrw: 10000,
    partyContext: '상사',
    vibe: '조용한',
    excludedFoods: [],
    ...overrides
  };
}

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn()
  };
}

describe('Bet Agent Unit', () => {
  it('calculates totalExpectedMinutes and score breakdown from routed candidates', async () => {
    const logger = createLogger();
    const agent = new BetAgent({
      searchNearbyCandidates: vi
        .fn()
        .mockResolvedValue([
          createCandidate({ id: 'candidate-1', distanceMeters: 500 })
        ]),
      getWalkingRoute: vi.fn().mockResolvedValue(createRoute(6, 500)),
      logger
    });

    const result = await agent.search(createSlots(), {
      now: '2026-05-20T12:00:00+09:00'
    });

    expect(result.status).toBe('results');
    expect(result.results[0].oneWayRouteMinutes).toBe(6);
    expect(result.results[0].totalExpectedMinutes).toBe(42);
    expect(result.results[0].scoreTotal).toBeGreaterThan(0);
    expect(result.results[0].scoreComponents.timeFit).toBeCloseTo(4.2, 1);
    expect(result.results[0].scoreComponents.distanceFit).toBeCloseTo(11.25, 2);
  });

  it('validates totalTimeMinutes strictly within the supported range', () => {
    expect(() => validateBetTimeBudget(20)).not.toThrow();
    expect(() => validateBetTimeBudget(60)).not.toThrow();
    expect(() => validateBetTimeBudget(19)).toThrow(RankingValidationError);
    expect(() => validateBetTimeBudget(61)).toThrow(RankingValidationError);
  });

  it('applies hard filters for invalid route time, budget overflow, and excluded foods', () => {
    const slots = createSlots({ excludedFoods: ['고기'] });
    const ranked = rankBetCandidates(
      [
        {
          ...createCandidate({
            id: 'keep',
            name: '깔끔초밥',
            category: '일식'
          }),
          oneWayRouteMinutes: 5,
          totalExpectedMinutes: 40,
          distanceMeters: 400,
          transportMode: 'walk',
          confidenceBadge: 'high',
          reason: '',
          providerAttribution: 'Kakao Local / Kakao Mobility',
          path: []
        },
        {
          ...createCandidate({
            id: 'slow',
            name: '멀고 먼 식당',
            category: '한식'
          }),
          oneWayRouteMinutes: 10,
          totalExpectedMinutes: 50,
          distanceMeters: 900,
          transportMode: 'walk',
          confidenceBadge: 'high',
          reason: '',
          providerAttribution: 'Kakao Local / Kakao Mobility',
          path: []
        },
        {
          ...createCandidate({
            id: 'excluded',
            name: '마포 고기구이',
            category: '육류,고기'
          }),
          oneWayRouteMinutes: 5,
          totalExpectedMinutes: 40,
          distanceMeters: 300,
          transportMode: 'walk',
          confidenceBadge: 'high',
          reason: '',
          providerAttribution: 'Kakao Local / Kakao Mobility',
          path: []
        },
        {
          ...createCandidate({
            id: 'over-budget',
            name: '비싼 코스요리',
            category: '양식',
            pricePerPersonKrw: 15000
          }),
          oneWayRouteMinutes: 5,
          totalExpectedMinutes: 40,
          distanceMeters: 300,
          transportMode: 'walk',
          confidenceBadge: 'high',
          reason: '',
          providerAttribution: 'Kakao Local / Kakao Mobility',
          path: []
        }
      ],
      slots,
      '2026-05-20T12:00:00+09:00'
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe('keep');
  });

  it('uses deterministic tie-breakers when total scores match', () => {
    const slots = createSlots({ totalTimeMinutes: 60, vibe: 'casual' });
    const ranked = rankBetCandidates(
      [
        {
          ...createCandidate({ id: 'b', name: '나식당' }),
          oneWayRouteMinutes: 5,
          totalExpectedMinutes: 40,
          distanceMeters: 400,
          transportMode: 'walk',
          confidenceBadge: 'high',
          reason: '',
          providerAttribution: 'Kakao Local / Kakao Mobility',
          path: []
        },
        {
          ...createCandidate({ id: 'a', name: '가식당' }),
          oneWayRouteMinutes: 5,
          totalExpectedMinutes: 40,
          distanceMeters: 400,
          transportMode: 'walk',
          confidenceBadge: 'high',
          reason: '',
          providerAttribution: 'Kakao Local / Kakao Mobility',
          path: []
        },
        {
          ...createCandidate({ id: 'c', name: '다식당' }),
          oneWayRouteMinutes: 6,
          totalExpectedMinutes: 42,
          distanceMeters: 400,
          transportMode: 'walk',
          confidenceBadge: 'high',
          reason: '',
          providerAttribution: 'Kakao Local / Kakao Mobility',
          path: []
        }
      ],
      slots,
      '2026-05-20T12:00:00+09:00'
    );

    expect(ranked.map((candidate) => candidate.id)).toEqual(['a', 'b', 'c']);
  });

  it('clips ranked results to Top 5 by default without fabricating candidates', () => {
    const slots = createSlots({ totalTimeMinutes: 60, vibe: 'casual' });
    const candidates = Array.from({ length: 6 }, (_, index) => ({
      ...createCandidate({
        id: `candidate-${index + 1}`,
        name: `식당-${index + 1}`,
        location: { lat: 37.501 + index * 0.001, lng: 127.031 + index * 0.001 }
      }),
      oneWayRouteMinutes: 5,
      totalExpectedMinutes: 40,
      distanceMeters: 300 + index * 10,
      transportMode: 'walk',
      confidenceBadge: 'high',
      reason: '',
      providerAttribution: 'Kakao Local / Kakao Mobility',
      path: []
    }));

    const ranked = rankBetCandidates(
      candidates,
      slots,
      '2026-05-20T12:00:00+09:00'
    );

    expect(ranked).toHaveLength(5);
    expect(ranked.map((candidate) => candidate.id)).not.toContain(
      'candidate-6'
    );
  });

  it('excludes cafes and bars unless the slot bundle explicitly allows them', async () => {
    const logger = createLogger();
    const agent = new BetAgent({
      searchNearbyCandidates: vi.fn().mockResolvedValue([
        createCandidate({ id: 'restaurant-1', name: '든든한국밥', category: '한식' }),
        createCandidate({ id: 'cafe-1', name: '모닝커피', category: '카페' }),
        createCandidate({ id: 'bar-1', name: '즐거운술집', category: '술집' })
      ]),
      getWalkingRoute: vi.fn().mockResolvedValue(createRoute(5, 400)),
      logger
    });

    const defaultResult = await agent.search(
      createSlots({ venueIntentExplicit: false }),
      { now: '2026-05-20T12:00:00+09:00' }
    );

    expect(defaultResult.status).toBe('results');
    expect(defaultResult.results.map((item) => item.id)).toEqual(['restaurant-1']);

    const explicitResult = await agent.search(
      createSlots({ venueIntentExplicit: true }),
      { now: '2026-05-20T12:00:00+09:00' }
    );

    expect(explicitResult.results.map((item) => item.id)).toEqual([
      'restaurant-1',
      'cafe-1',
      'bar-1'
    ]);
  });
});

describe('Bet Agent – Venue-Type Gating', () => {
  const cafeCandidate = {
    id: 'cafe-1',
    name: '스타벅스 강남점',
    category: '카페',
    address: '서울 강남구',
    location: { lat: 37.501, lng: 127.031 },
    priceLevel: null,
    openingHours: null,
    rating: null,
    reviewCount: null,
    reviewSummary: null,
    openStatus: null
  };

  const barCandidate = {
    id: 'bar-1',
    name: '맥주창고 강남점',
    category: '술집',
    address: '서울 강남구',
    location: { lat: 37.502, lng: 127.032 },
    priceLevel: null,
    openingHours: null,
    rating: null,
    reviewCount: null,
    reviewSummary: null,
    openStatus: null
  };

  const restaurantCandidate = {
    id: 'rest-1',
    name: '깔끔한국밥',
    category: '한식',
    address: '서울 강남구',
    location: { lat: 37.503, lng: 127.033 },
    priceLevel: null,
    openingHours: null,
    rating: null,
    reviewCount: null,
    reviewSummary: null,
    openStatus: null
  };

  function createRoute(durationMinutes = 5, distanceMeters = 400) {
    return { durationMinutes, distanceMeters, path: [] };
  }

  function createSlots(overrides = {}) {
    return {
      mode: 'normal',
      location: { lat: 37.4979, lng: 127.0276 },
      mealPeriod: 'lunch',
      totalTimeMinutes: 60,
      transportMode: 'walk',
      budgetPerPersonKrw: 15000,
      partyContext: '친구',
      vibe: '캐주얼',
      excludedFoods: [],
      ...overrides
    };
  }

  function createLogger() {
    return { info: vi.fn(), error: vi.fn() };
  }

  it('excludes cafes and bars by default when the prompt has no explicit cafe/bar intent', async () => {
    const agent = new BetAgent({
      searchNearbyCandidates: vi
        .fn()
        .mockResolvedValue([cafeCandidate, barCandidate, restaurantCandidate]),
      getWalkingRoute: vi.fn().mockResolvedValue(createRoute()),
      logger: createLogger()
    });

    const result = await agent.search(createSlots(), {
      now: '2026-06-26T12:00:00+09:00'
    });

    expect(result.status).toBe('results');
    const ids = result.results.map((c) => c.id);
    expect(ids).not.toContain('cafe-1');
    expect(ids).not.toContain('bar-1');
    expect(ids).toContain('rest-1');
  });

  it('includes cafes when the slot vibe explicitly requests 카페', async () => {
    const agent = new BetAgent({
      searchNearbyCandidates: vi
        .fn()
        .mockResolvedValue([cafeCandidate, restaurantCandidate]),
      getWalkingRoute: vi.fn().mockResolvedValue(createRoute()),
      logger: createLogger()
    });

    const result = await agent.search(
      createSlots({ venuePreference: 'cafe' }),
      { now: '2026-06-26T12:00:00+09:00' }
    );

    expect(result.status).toBe('results');
    const ids = result.results.map((c) => c.id);
    expect(ids).toContain('cafe-1');
  });

  it('includes bars when slot partyContext explicitly requests 술', async () => {
    const agent = new BetAgent({
      searchNearbyCandidates: vi
        .fn()
        .mockResolvedValue([barCandidate, restaurantCandidate]),
      getWalkingRoute: vi.fn().mockResolvedValue(createRoute()),
      logger: createLogger()
    });

    const result = await agent.search(
      createSlots({ venuePreference: 'bar' }),
      { now: '2026-06-26T12:00:00+09:00' }
    );

    expect(result.status).toBe('results');
    const ids = result.results.map((c) => c.id);
    expect(ids).toContain('bar-1');
  });
});
