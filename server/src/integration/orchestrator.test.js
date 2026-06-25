import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  orchestrator,
  parseQueryToSlotsRegex,
  generateGroundedExplanationFallback
} from '../services/orchestrator.js';
import { sessions } from '../services/sessions.js';
import { KakaoLocalAdapter } from '../adapters/kakaoLocalAdapter.js';
import { cache } from '../utils/cache.js';
import { ErrorCodes } from '../../../shared/contracts/schemas.js';

describe('Orchestrator Service Integration Tests', () => {
  beforeEach(() => {
    sessions.clear();
    cache.clear();
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should parse queries using rule-based regex fallback correctly', () => {
    const slots = parseQueryToSlotsRegex(
      '회사 상사랑 점심 먹으려는데 1만원 이하로 1시간 안에 갈만한 조용한 도보로 갈 국밥집 추천해줘'
    );
    expect(slots.partyContext).toBe('상사');
    expect(slots.mealPeriod).toBe('lunch');
    expect(slots.budgetPerPersonKrw).toBe(10000);
    expect(slots.totalTimeMinutes).toBe(60);
    expect(slots.vibe).toBe('조용한');
    expect(slots.transportMode).toBe('walk');
  });

  it('should return GEO_REQUIRED error when normal mode is requested without userLocation', async () => {
    const res = await orchestrator.processRequest({
      query: '상사랑 점심',
      mode: 'normal',
      userLocation: null
    });

    expect(res.status).toBe('error');
    expect(res.code).toBe(ErrorCodes.GEO_REQUIRED);
  });

  it('should trigger bundled questions state when slots are missing', async () => {
    const res = await orchestrator.processRequest({
      query: '회사 상사랑 점심 먹으려는데 1시간 안에 갈만한 곳 추천해줘',
      mode: 'normal',
      userLocation: { lat: 37.4979, lng: 127.0276 }
    });

    expect(res.status).toBe('questions');
    expect(res.sessionId).toBeDefined();
    expect(res.missingFields).toContain('transportMode');
    expect(res.missingFields).toContain('budgetPerPersonKrw');
    expect(res.missingFields).toContain('vibe');

    const transportQ = res.questions.find((q) => q.field === 'transportMode');
    expect(transportQ.label).toBe('도보로 갈까요, 차로 갈까요?');
  });

  it('should transition through follow-up turns and succeed when all slots are provided', async () => {
    const initRes = await orchestrator.processRequest({
      query: '상사랑 점심 1시간',
      mode: 'normal',
      userLocation: { lat: 37.4979, lng: 127.0276 }
    });

    expect(initRes.status).toBe('questions');
    const sessionId = initRes.sessionId;

    const followUpRes = await orchestrator.processAnswers(sessionId, {
      answers: {
        transportMode: 'walk',
        budgetPerPersonKrw: 10000,
        vibe: '조용한',
        excludedFoods: []
      }
    });

    expect(followUpRes.status).toBe('results');
    expect(followUpRes.results).toHaveLength(2);
    const names = followUpRes.results.map((r) => r.name);
    expect(names).toContain('든든한국밥');
    expect(names).toContain('깔끔초밥');
  });

  it('should trigger session expired error on the third turn (exceeding 2 follow-ups)', async () => {
    const initRes = await orchestrator.processRequest({
      query: '상사랑 점심 1시간',
      mode: 'normal',
      userLocation: { lat: 37.4979, lng: 127.0276 }
    });

    expect(initRes.status).toBe('questions');
    const sessionId = initRes.sessionId;

    const turn1Res = await orchestrator.processAnswers(sessionId, {
      answers: {
        transportMode: 'walk'
      }
    });
    expect(turn1Res.status).toBe('questions');

    const turn2Res = await orchestrator.processAnswers(sessionId, {
      answers: {
        budgetPerPersonKrw: 10000
      }
    });
    expect(turn2Res.status).toBe('error');
    expect(turn2Res.code).toBe(ErrorCodes.SESSION_EXPIRED);
  });

  it('should strictly ground explanations and filter coordinates from LLM input', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'mock-key');

    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content:
                    '이 한식당은 상사와의 점심 식사에 제격인 조용한 분위기를 자랑합니다.'
                }
              }
            ]
          })
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const initRes = await orchestrator.processRequest({
      query: '상사 점심 1시간 도보 1만원 조용한 없음',
      mode: 'normal',
      userLocation: { lat: 37.4979, lng: 127.0276 }
    });

    expect(initRes.status).toBe('results');
    expect(initRes.results[0].reason).toBe(
      '이 한식당은 상사와의 점심 식사에 제격인 조용한 분위기를 자랑합니다.'
    );

    const explainCall = fetchMock.mock.calls.find((call) => {
      try {
        const body = JSON.parse(call[1].body);
        return body.messages?.[0]?.content?.includes(
          'Generate a short Korean recommendation reason'
        );
      } catch {
        return false;
      }
    });

    expect(explainCall).toBeDefined();
    const explainBody = JSON.parse(explainCall[1].body);
    const candidateArg = JSON.parse(explainBody.messages[1].content).candidate;
    expect(candidateArg.location).toBeUndefined();
  });

  it('should enforce 30-minute session TTL', async () => {
    const initRes = await orchestrator.processRequest({
      query: '상사랑 점심 1시간',
      mode: 'normal',
      userLocation: { lat: 37.4979, lng: 127.0276 }
    });

    const sessionId = initRes.sessionId;
    expect(sessions.get(sessionId)).toBeDefined();

    vi.advanceTimersByTime(31 * 60 * 1000);

    expect(sessions.get(sessionId)).toBeNull();
  });

  it('should generate grounded fallback explanations deterministically', () => {
    const candidate = {
      name: '든든한국밥',
      category: '한식',
      transportMode: 'walk',
      oneWayRouteMinutes: 5,
      totalExpectedMinutes: 40
    };
    const slots = {
      partyContext: '상사',
      vibe: '조용한'
    };

    const explanation = generateGroundedExplanationFallback(candidate, slots);
    expect(explanation).toContain('현재 위치에서 도보 5분 거리(왕복 10분)');
    expect(explanation).toContain('한식 음식점인 든든한국밥');
    expect(explanation).toContain(
      '조용한 분위기에서 상사와 함께 식사하시기에 아주 적합하여 추천합니다.'
    );
  });

  it('should apply the exact fixed radii defined in the plan based on mode + transport mode', async () => {
    const spy = vi.spyOn(
      KakaoLocalAdapter.prototype,
      'searchNearbyRestaurants'
    );

    await orchestrator.processRequest({
      query: '강남 점심 1시간 도보 1만원 혼밥 조용한 룸식당 제외음식 없음',
      mode: 'normal',
      userLocation: { lat: 37.4979, lng: 127.0276 }
    });
    expect(spy).toHaveBeenCalledWith(37.4979, 127.0276, 1000);
    spy.mockClear();
    cache.clear();

    await orchestrator.processRequest({
      query: '강남 점심 1시간 차량 1만원 혼밥 조용한 룸식당 제외음식 없음',
      mode: 'normal',
      userLocation: { lat: 37.4979, lng: 127.0276 }
    });
    expect(spy).toHaveBeenCalledWith(37.4979, 127.0276, 5000);
    spy.mockClear();
    cache.clear();

    await orchestrator.processRequest({
      query: '강남 저녁 회식 1시간 도보 1만원 혼밥 조용한 룸식당 제외음식 없음',
      mode: 'travel',
      userLocation: { lat: 37.4979, lng: 127.0276 },
      selectedLocation: { coords: { lat: 37.4979, lng: 127.0276 } }
    });
    expect(spy).toHaveBeenCalledWith(37.4979, 127.0276, 2000);
    spy.mockClear();
    cache.clear();

    await orchestrator.processRequest({
      query: '강남 저녁 회식 1시간 차량 1만원 혼밥 조용한 룸식당 제외음식 없음',
      mode: 'travel',
      userLocation: { lat: 37.4979, lng: 127.0276 },
      selectedLocation: { coords: { lat: 37.4979, lng: 127.0276 } }
    });
    expect(spy).toHaveBeenCalledWith(37.4979, 127.0276, 10000);
    spy.mockClear();
    cache.clear();

    await orchestrator.processRequest({
      query: '상사랑 점심 1시간 차량 1만원 조용한 없음',
      mode: 'normal',
      userLocation: { lat: 37.4979, lng: 127.0276 }
    });
    expect(spy).toHaveBeenCalledWith(37.4979, 127.0276, 5000);
    spy.mockClear();
    cache.clear();

    await orchestrator.processRequest({
      query: '출장 상사 점심 1시간 도보 1만원 조용한 없음',
      mode: 'travel',
      userLocation: { lat: 37.4979, lng: 127.0276 },
      selectedLocation: { coords: { lat: 37.4979, lng: 127.0276 } }
    });
    expect(spy).toHaveBeenCalledWith(37.4979, 127.0276, 2000);
    spy.mockClear();
    cache.clear();

    await orchestrator.processRequest({
      query: '출장 상사 점심 1시간 차량 1만원 조용한 없음',
      mode: 'travel',
      userLocation: { lat: 37.4979, lng: 127.0276 },
      selectedLocation: { coords: { lat: 37.4979, lng: 127.0276 } }
    });
    expect(spy).toHaveBeenCalledWith(37.4979, 127.0276, 10000);
    spy.mockClear();
    cache.clear();
  });
});
