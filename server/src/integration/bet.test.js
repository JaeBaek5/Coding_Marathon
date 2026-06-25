import { describe, it, expect, vi } from 'vitest';
import { BetAgent } from '../agents/bet/index.js';

function createCandidate(index, overrides = {}) {
  return {
    id: overrides.id ?? `candidate-${index}`,
    name: overrides.name ?? `식당-${index}`,
    category: overrides.category ?? '한식',
    address: overrides.address ?? `서울 강남구 테헤란로 ${index}`,
    location: overrides.location ?? {
      lat: 37.5 + index * 0.001,
      lng: 127.02 + index * 0.001
    },
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
    totalTimeMinutes: 60,
    transportMode: 'walk',
    budgetPerPersonKrw: 15000,
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

describe('Bet Agent Integration', () => {
  it('fans out route lookups with a bounded concurrency limit', async () => {
    let activeCalls = 0;
    let maxConcurrentCalls = 0;
    const logger = createLogger();
    const candidates = Array.from({ length: 5 }, (_, index) =>
      createCandidate(index + 1)
    );

    const getWalkingRoute = vi.fn().mockImplementation(async () => {
      activeCalls += 1;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, activeCalls);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeCalls -= 1;
      return createRoute(5, 300);
    });

    const agent = new BetAgent({
      searchNearbyCandidates: vi.fn().mockResolvedValue(candidates),
      getWalkingRoute,
      logger
    });

    const result = await agent.search(createSlots(), {
      routeConcurrency: 2,
      now: '2026-05-20T12:00:00+09:00'
    });

    expect(result.status).toBe('results');
    expect(getWalkingRoute).toHaveBeenCalledTimes(5);
    expect(maxConcurrentCalls).toBeLessThanOrEqual(2);
    expect(result.metadata.routeConcurrency).toBe(2);
  });

  it('returns NO_RESULTS when the provider search yields no candidates', async () => {
    const agent = new BetAgent({
      searchNearbyCandidates: vi.fn().mockResolvedValue([]),
      logger: createLogger()
    });

    const result = await agent.search(createSlots());

    expect(result.status).toBe('error');
    expect(result.code).toBe('NO_RESULTS');
  });

  it('returns PROVIDER_ERROR when nearby search fails', async () => {
    const agent = new BetAgent({
      searchNearbyCandidates: vi
        .fn()
        .mockRejectedValue(new Error('provider down')),
      logger: createLogger()
    });

    const result = await agent.search(createSlots());

    expect(result.status).toBe('error');
    expect(result.code).toBe('PROVIDER_ERROR');
  });

  it('returns fewer than 5 results when fewer candidates survive', async () => {
    const logger = createLogger();
    const agent = new BetAgent({
      searchNearbyCandidates: vi
        .fn()
        .mockResolvedValue([
          createCandidate(1, { name: '든든한국밥' }),
          createCandidate(2, { name: '깔끔초밥', category: '일식' }),
          createCandidate(3, { name: '쾌적한 백반집' })
        ]),
      getWalkingRoute: vi.fn().mockResolvedValue(createRoute(5, 350)),
      logger
    });

    const result = await agent.search(createSlots(), {
      now: '2026-05-20T12:00:00+09:00'
    });

    expect(result.status).toBe('results');
    expect(result.results).toHaveLength(3);
    expect(result.eligibleCount).toBe(3);
  });

  it('preserves the pre-routing candidate window by ignoring matches beyond the first 20 raw docs', async () => {
    const logger = createLogger();
    const firstTwentyCandidates = Array.from({ length: 20 }, (_, index) =>
      createCandidate(index + 1)
    );
    const beyondWindowCandidate = createCandidate(21, {
      id: 'candidate-21',
      name: '후순위 식당',
      location: { lat: 37.6, lng: 127.2 }
    });
    const agent = new BetAgent({
      searchNearbyCandidates: vi
        .fn()
        .mockResolvedValue([...firstTwentyCandidates, beyondWindowCandidate]),
      getWalkingRoute: vi.fn().mockResolvedValue(createRoute(5, 300)),
      logger
    });

    const result = await agent.search(createSlots(), {
      routeCandidateLimit: 25,
      now: '2026-05-20T12:00:00+09:00'
    });

    expect(result.status).toBe('results');
    expect(result.metadata.rawCandidateCount).toBe(21);
    expect(result.metadata.candidateWindowLimit).toBe(20);
    expect(result.metadata.candidateCountForRouting).toBe(20);
    expect(result.results.map((candidate) => candidate.id)).not.toContain(
      'candidate-21'
    );
  });
});
