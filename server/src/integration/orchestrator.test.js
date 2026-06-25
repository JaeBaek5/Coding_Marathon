import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OrchestratorAgent } from '../agents/orchestrator/index.js';
import { sessions } from '../services/sessions.js';
import { ErrorCodes } from '../../../shared/contracts/schemas.js';

describe('Orchestrator Supervisor Integration Tests', () => {
  const defaultSlots = {
    mode: 'normal',
    location: { lat: 37.4979, lng: 127.0276, source: 'browser-geolocation' },
    mealPeriod: 'lunch',
    totalTimeMinutes: 60,
    transportMode: 'walk',
    budgetPerPersonKrw: 15000,
    partyContext: '친구',
    vibe: '조용한',
    excludedFoods: ['매운 음식'],
    venuePreference: 'restaurant'
  };

  const rankedCandidates = [
    {
      id: 'p-1',
      name: '한식당A',
      category: '식당',
      address: '서울 종로구 테스트 1',
      location: { lat: 37.4979, lng: 127.0276 },
      placeUrl: 'https://map.naver.com/p/entry/place/111',
      transportMode: 'walk',
      oneWayRouteMinutes: 10,
      totalExpectedMinutes: 50,
      distanceMeters: 430,
      confidenceBadge: 'high',
      providerAttribution: 'Naver Local Search / Walk estimate',
      scoreBreakdown: {
        total: 96,
        components: { routeTime: 60, budgetFit: 20, contextFit: 16 }
      },
      openStatus: null
    },
    {
      id: 'p-2',
      name: '한식당B',
      category: '식당',
      address: '서울 종로구 테스트 2',
      location: { lat: 37.498, lng: 127.028 },
      placeUrl: 'https://map.naver.com/p/entry/place/112',
      transportMode: 'walk',
      oneWayRouteMinutes: 12,
      totalExpectedMinutes: 52,
      distanceMeters: 620,
      confidenceBadge: 'high',
      providerAttribution: 'Naver Local Search / Walk estimate',
      scoreBreakdown: {
        total: 95,
        components: { routeTime: 57, budgetFit: 20, contextFit: 18 }
      },
      openStatus: null
    },
    {
      id: 'p-3',
      name: '한식당C',
      category: '식당',
      address: '서울 종로구 테스트 3',
      location: { lat: 37.4968, lng: 127.0269 },
      placeUrl: 'https://map.naver.com/p/entry/place/113',
      transportMode: 'walk',
      oneWayRouteMinutes: 14,
      totalExpectedMinutes: 55,
      distanceMeters: 770,
      confidenceBadge: 'medium',
      providerAttribution: 'Naver Local Search / Walk estimate',
      scoreBreakdown: {
        total: 90,
        components: { routeTime: 55, budgetFit: 20, contextFit: 15 }
      },
      openStatus: null
    },
    {
      id: 'p-4',
      name: '한식당D',
      category: '식당',
      address: '서울 종로구 테스트 4',
      location: { lat: 37.4983, lng: 127.0265 },
      placeUrl: 'https://map.naver.com/p/entry/place/114',
      transportMode: 'walk',
      oneWayRouteMinutes: 8,
      totalExpectedMinutes: 49,
      distanceMeters: 370,
      confidenceBadge: 'medium',
      providerAttribution: 'Naver Local Search / Walk estimate',
      scoreBreakdown: {
        total: 87,
        components: { routeTime: 40, budgetFit: 20, contextFit: 27 }
      },
      openStatus: null
    },
    {
      id: 'p-5',
      name: '한식당E',
      category: '식당',
      address: '서울 종로구 테스트 5',
      location: { lat: 37.4972, lng: 127.029 },
      placeUrl: 'https://map.naver.com/p/entry/place/115',
      transportMode: 'walk',
      oneWayRouteMinutes: 16,
      totalExpectedMinutes: 58,
      distanceMeters: 900,
      confidenceBadge: 'low',
      providerAttribution: 'Naver Local Search / Walk estimate',
      scoreBreakdown: {
        total: 82,
        components: { routeTime: 35, budgetFit: 20, contextFit: 27 }
      },
      openStatus: null
    }
  ];

  const createOrchestrator = ({
    parseResult,
    answerResult,
    betStatus = 'results'
  } = {}) => {
    const aleph = {
      parseQuery: vi.fn().mockResolvedValue(
        parseResult ?? {
          status: 'complete',
          slots: defaultSlots
        }
      ),
      processAnswers: vi.fn().mockResolvedValue(
        answerResult ?? { status: 'complete', slots: defaultSlots }
      )
    };

    const bet = {
      search: vi.fn(async () => ({
        status: betStatus,
        results: rankedCandidates,
        eligibleCount: rankedCandidates.length
      }))
    };

    const gimel = {
      generateReasons: vi.fn(async (candidates) =>
        candidates.map((candidate) => ({
          ...candidate,
          reason: `${candidate.name}은(는) 맛집입니다.`
        }))
      )
    };

    return {
      aleph,
      orchestrator: new OrchestratorAgent({
        aleph,
        bet,
        gimel
      }),
      bet,
      gimel
    };
  };

  beforeEach(() => {
    sessions.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should return GEO_REQUIRED before Aleph when normal mode misses structured location', async () => {
    const { orchestrator, aleph } = createOrchestrator();

    const res = await orchestrator.processRequest({
      query: '친구랑 점심 먹으려고',
      mode: 'normal',
      userLocation: null
    });

    expect(res.status).toBe('error');
    expect(res.code).toBe(ErrorCodes.GEO_REQUIRED);
    expect(aleph.parseQuery).not.toHaveBeenCalled();
  });

  it('should return questions when Aleph reports missing required slots', async () => {
    const { orchestrator } = createOrchestrator({
      parseResult: {
        status: 'questions',
        missingFields: ['transportMode', 'budgetPerPersonKrw', 'vibe'],
        questions: [
          { field: 'transportMode', label: '이동수단(도보/차량)' },
          { field: 'budgetPerPersonKrw', label: '1인 예산(원)' },
          { field: 'vibe', label: '원하는 분위기' }
        ],
        currentState: defaultSlots
      }
    });

    const res = await orchestrator.processRequest({
      query: '친구랑 점심 먹으려고',
      mode: 'normal',
      userLocation: { lat: 37.4979, lng: 127.0276, source: 'browser-geolocation' }
    });

    expect(res.status).toBe('questions');
    expect(res.sessionId).toBeTypeOf('string');
    expect(res.missingFields).toContain('transportMode');

    const session = sessions.get(res.sessionId);
    expect(session).toBeDefined();
    expect(session.turnCount).toBe(0);
  });

  it('should return initial results with one visible recommendation and full candidate pool', async () => {
    const { orchestrator, gimel } = createOrchestrator();

    const res = await orchestrator.processRequest({
      query: '친구랑 60분 안에 조용한 점심',
      mode: 'normal',
      userLocation: { lat: 37.4979, lng: 127.0276, source: 'browser-geolocation' }
    });

    expect(res.status).toBe('results');
    expect(res.currentRecommendation).toBeDefined();
    expect(res.results).toHaveLength(1);
    expect(res.displayMode).toBe('single');
    expect(res.currentRecommendation.id).toBe('p-1');
    expect(res.candidatePool).toHaveLength(5);
    expect(res.eligibleCount).toBe(5);
    expect(gimel.generateReasons).toHaveBeenCalledTimes(1);

    const session = sessions.get(res.sessionId);
    expect(session.dislikedCandidateIds).toEqual([]);
    expect(session.likedCandidateIds).toEqual([]);
  });

  it('should remove disliked candidates from the visible pool', async () => {
    const { orchestrator } = createOrchestrator();

    const initial = await orchestrator.processRequest({
      query: '친구랑 60분 안에 조용한 점심',
      mode: 'normal',
      userLocation: { lat: 37.4979, lng: 127.0276, source: 'browser-geolocation' }
    });

    const sessionId = initial.sessionId;

    const afterFirstDislike = await orchestrator.processAnswers(sessionId, {
      answers: {
        action: 'dislike'
      }
    });

    expect(afterFirstDislike.status).toBe('results');
    expect(afterFirstDislike.results).toHaveLength(1);
    expect(afterFirstDislike.displayMode).toBe('single');
    expect(afterFirstDislike.results.map((item) => item.id)).not.toContain('p-1');
    expect(afterFirstDislike.currentRecommendation.id).toBe('p-2');

    const afterSecondDislike = await orchestrator.processAnswers(sessionId, {
      answers: {
        action: 'dislike'
      }
    });

    expect(afterSecondDislike.status).toBe('results');
    expect(afterSecondDislike.results).toHaveLength(3);
    expect(afterSecondDislike.displayMode).toBe('triple');
    expect(afterSecondDislike.results.map((item) => item.id)).not.toContain('p-2');
    expect(afterSecondDislike.candidatePool).toHaveLength(3);

    const afterThirdDislike = await orchestrator.processAnswers(sessionId, {
      answers: {
        action: 'dislike',
        candidateId: 'p-3'
      }
    });

    expect(afterThirdDislike.status).toBe('questions');
    expect(afterThirdDislike.questions?.length).toBeGreaterThan(0);

    const session = sessions.get(sessionId);
    expect(session.dislikedCandidateIds).toEqual(['p-1', 'p-2', 'p-3']);
    expect(session.feedbackDislikeCount).toBe(3);
  });

  it('should persist like/dislike identifiers in session state', async () => {
    const { orchestrator } = createOrchestrator();

    const initial = await orchestrator.processRequest({
      query: '친구랑 60분 안에 조용한 점심',
      mode: 'normal',
      userLocation: { lat: 37.4979, lng: 127.0276, source: 'browser-geolocation' }
    });

    const sessionId = initial.sessionId;

    await orchestrator.processAnswers(sessionId, {
      answers: {
        action: 'like',
        candidateId: 'p-1'
      }
    });

    await orchestrator.processAnswers(sessionId, {
      answers: {
        action: 'dislike',
        candidateId: 'p-2'
      }
    });

    const session = sessions.get(sessionId);
    expect(session.likedCandidateIds).toContain('p-1');
    expect(session.dislikedCandidateIds).toContain('p-2');
    expect(session.dislikedCandidateIds).not.toContain('p-1');
  });

  it('should not recommend an already disliked candidate again in the same session', async () => {
    const { orchestrator } = createOrchestrator();

    const initial = await orchestrator.processRequest({
      query: '친구랑 60분 안에 조용한 점심',
      mode: 'normal',
      userLocation: { lat: 37.4979, lng: 127.0276, source: 'browser-geolocation' }
    });
    const { sessionId } = initial;

    await orchestrator.processAnswers(sessionId, {
      answers: {
        action: 'dislike'
      }
    });

    const afterSecondDislike = await orchestrator.processAnswers(sessionId, {
      answers: {
        action: 'dislike'
      }
    });

    const seenIds = afterSecondDislike.results.map((candidate) => candidate.id);
    expect(seenIds).not.toContain('p-1');
    expect(seenIds).not.toContain('p-2');
  });

  it('should return SESSION_EXPIRED for unknown sessions', async () => {
    const { orchestrator } = createOrchestrator();

    const missing = await orchestrator.processAnswers('unknown-session', {
      answers: { transportMode: 'walk' }
    });

    expect(missing.status).toBe('error');
    expect(missing.code).toBe(ErrorCodes.SESSION_EXPIRED);
  });

  it('should return an error when Aleph rejects answers with invalid values', async () => {
    const { orchestrator } = createOrchestrator({
      parseResult: {
        status: 'complete',
        slots: defaultSlots
      },
      answerResult: {
        status: 'error',
        code: ErrorCodes.INVALID_TOTAL_TIME,
        message: 'Total time must be at least 20 minutes.',
        missingFields: []
      }
    });

    const init = await orchestrator.processRequest({
      query: '친구랑 점심',
      mode: 'normal',
      userLocation: { lat: 37.4979, lng: 127.0276, source: 'browser-geolocation' }
    });

    const res = await orchestrator.processAnswers(init.sessionId, {
      answers: { action: 'invalid' }
    });

    const answersSession = sessions.get(init.sessionId);
    expect(answersSession).toBeDefined();
    expect(res.status).toBe('error');
    expect(res.code).toBe(ErrorCodes.INVALID_TOTAL_TIME);
  });

  it('should propagate Bet NO_RESULTS with correct status and code', async () => {
    const { orchestrator, bet } = createOrchestrator({
      parseResult: {
        status: 'complete',
        slots: defaultSlots
      }
    });

    bet.search.mockResolvedValueOnce({
      status: 'error',
      code: ErrorCodes.NO_RESULTS,
      message: 'No candidates',
      missingFields: []
    });

    const res = await orchestrator.processRequest({
      query: '친구랑 60분 안에 조용한 점심',
      mode: 'normal',
      userLocation: { lat: 37.4979, lng: 127.0276, source: 'browser-geolocation' }
    });

    expect(res.status).toBe('error');
    expect(res.code).toBe(ErrorCodes.NO_RESULTS);
  });
});
