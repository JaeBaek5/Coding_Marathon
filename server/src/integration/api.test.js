import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { sessions } from '../services/sessions.js';
import { ErrorCodes } from '../../../shared/contracts/schemas.js';
import { KakaoLocalAdapter } from '../adapters/kakaoLocalAdapter.js';
import { cache } from '../utils/cache.js';
import { resetClientForTesting } from '../llm/client.js';

describe('HTTP API Endpoints Integration Tests', () => {
  beforeEach(() => {
    sessions.clear();
    cache.clear();
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('KAKAO_API_KEY', '');
    vi.stubEnv('NAVER_CLIENT_ID', '');
    vi.stubEnv('NAVER_CLIENT_SECRET', '');
    resetClientForTesting();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('GET /api/health', () => {
    it('should return 200 with service ok state', async () => {
      const res = await request(app).get('/api/health').expect(200);

      expect(res.body.status).toBe('ok');
    });
  });

  describe('GET /api/config/public', () => {
    it('should return 200 with public configuration options', async () => {
      const res = await request(app).get('/api/config/public').expect(200);

      expect(res.body.mapProvider).toBe('naver');
      expect(res.body.defaultLocale).toBe('ko-KR');
      expect(res.body.supportedTransportModes).toContain('walk');
      expect(res.body.supportedTransportModes).toContain('drive');
      expect(res.body.timeRange.min).toBe(20);
      expect(res.body.timeRange.max).toBe(60);
    });

    it('should expose provider readiness without fake map keys or secrets', async () => {
      const res = await request(app).get('/api/config/public').expect(200);

      expect(res.text).not.toContain('mock-client-id');
      expect(res.body.naverClientId).toBeNull();
      expect(res.body.mapReady).toBe(false);
      expect(res.body.providerReadiness).toEqual({
        map: false,
        kakaoLocal: false,
        kakaoMobility: false,
        naverDirections: false,
        openRouter: false
      });
    });

    it('should mark live providers ready when their environment keys are present', async () => {
      vi.stubEnv('KAKAO_API_KEY', 'secret-kakao-key');
      vi.stubEnv('NAVER_CLIENT_ID', 'public-naver-client-id');
      vi.stubEnv('NAVER_CLIENT_SECRET', 'secret-naver-client-secret');
      vi.stubEnv('OPENROUTER_API_KEY', 'secret-openrouter-key');
      resetClientForTesting();

      const res = await request(app).get('/api/config/public').expect(200);

      expect(res.body.naverClientId).toBe('public-naver-client-id');
      expect(res.body.mapReady).toBe(true);
      expect(res.body.providerReadiness).toEqual({
        map: true,
        kakaoLocal: true,
        kakaoMobility: true,
        naverDirections: true,
        openRouter: true
      });
      expect(res.text).not.toContain('secret-kakao-key');
      expect(res.text).not.toContain('secret-naver-client-secret');
      expect(res.text).not.toContain('secret-openrouter-key');
    });

    it('should expose OpenRouter harness metadata without exposing the API key', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', 'secret-openrouter-key');
      vi.stubEnv('LLM_API_KEY', '');
      vi.stubEnv('LLM_BASE_URL', '');
      vi.stubEnv('LLM_MODEL_ORCHESTRATOR', '');
      vi.stubEnv('LLM_MODEL_ALEPH', '');
      vi.stubEnv('LLM_MODEL_BET', '');
      vi.stubEnv('LLM_MODEL_GIMEL', '');
      resetClientForTesting();

      const res = await request(app).get('/api/config/public').expect(200);

      expect(res.text).not.toContain('secret-openrouter-key');
      expect(res.body.llmHarness.provider).toBe('openrouter');
      expect(res.body.llmHarness.baseURL).toBe('https://openrouter.ai/api/v1');
      expect(res.body.llmHarness.model).toBe('anthropic/claude-sonnet-4.6');
      expect(res.body.llmHarness.agents.map((agent) => agent.name)).toEqual([
        'orchestrator',
        'aleph',
        'bet',
        'gimel'
      ]);
      expect(
        res.body.llmHarness.agents.every(
          (agent) => agent.model === 'anthropic/claude-sonnet-4.6'
        )
      ).toBe(true);
    });

    it('should expose custom OpenRouter harness metadata without exposing secrets', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', 'secret-openrouter-key');
      vi.stubEnv('LLM_BASE_URL', 'https://custom-openrouter.test/v1');
      vi.stubEnv('OPENROUTER_MODEL', 'custom/openrouter-model');
      resetClientForTesting();

      const res = await request(app).get('/api/config/public').expect(200);

      expect(res.text).not.toContain('secret-openrouter-key');
      expect(res.body.llmHarness).toMatchObject({
        provider: 'openrouter',
        baseURL: 'https://custom-openrouter.test/v1',
        model: 'custom/openrouter-model'
      });
      expect(
        res.body.llmHarness.agents.every(
          (agent) =>
            agent.baseURL === 'https://custom-openrouter.test/v1' &&
            agent.model === 'custom/openrouter-model'
        )
      ).toBe(true);
    });
  });

  describe('GET /api/location-search', () => {
    it('should return empty list if query is empty or missing', async () => {
      const res = await request(app).get('/api/location-search').expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return 200 with list of normalized location candidates', async () => {
      const res = await request(app)
        .get(`/api/location-search?q=${encodeURIComponent('판교역')}`)
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('address');
      expect(res.body[0]).toHaveProperty('location');
      expect(res.body[0]).toHaveProperty('coords');
    });

    it('should degrade to PROVIDER_ERROR if provider throws and there is no quota match', async () => {
      vi.spyOn(KakaoLocalAdapter.prototype, 'searchKeyword').mockRejectedValue(
        new Error('Kakao network issue')
      );

      const res = await request(app)
        .get(`/api/location-search?q=${encodeURIComponent('판교역')}`)
        .expect(502);

      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe(ErrorCodes.PROVIDER_ERROR);
    });

    it('should map quota error message to PROVIDER_QUOTA code', async () => {
      vi.spyOn(KakaoLocalAdapter.prototype, 'searchKeyword').mockRejectedValue(
        new Error('Quota exceeded 429')
      );

      const res = await request(app)
        .get(`/api/location-search?q=${encodeURIComponent('판교역')}`)
        .expect(429);

      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe(ErrorCodes.PROVIDER_QUOTA);
    });
  });

  describe('POST /api/recommendations', () => {
    it('should return 400 with GEO_REQUIRED if normal mode is chosen without coordinates', async () => {
      const res = await request(app)
        .post('/api/recommendations')
        .send({
          query: '점심 1시간',
          mode: 'normal',
          userLocation: null
        })
        .expect(400);

      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe(ErrorCodes.GEO_REQUIRED);
    });

    it('should return 400 with SCHEDULED_MEAL_UNSUPPORTED if future planning keywords are detected', async () => {
      const res = await request(app)
        .post('/api/recommendations')
        .send({
          query: '내일 점심 예약 가능해?',
          mode: 'normal',
          userLocation: { lat: 37.4979, lng: 127.0276 }
        })
        .expect(400);

      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe(ErrorCodes.SCHEDULED_MEAL_UNSUPPORTED);
    });

    it('should return 200 with status questions if initial request is incomplete', async () => {
      const res = await request(app)
        .post('/api/recommendations')
        .send({
          query: '회사 상사랑 점심 먹으려는데 1시간 안에 갈만한 곳 추천해줘',
          mode: 'normal',
          userLocation: { lat: 37.4979, lng: 127.0276 }
        })
        .expect(200);

      expect(res.body.status).toBe('questions');
      expect(res.body.sessionId).toBeDefined();
      expect(res.body.missingFields).toContain('transportMode');
    });

    it('should return 200 with status results if initial request is already complete', async () => {
      const res = await request(app)
        .post('/api/recommendations')
        .send({
          query: '친구랑 조용한 분위기로 점심 먹으려고 해. 60분, 도보, 예산 12000원, 매운 음식 제외하고',
          mode: 'normal',
          userLocation: { lat: 37.4979, lng: 127.0276 }
        })
        .expect(200);

      expect(res.body.status).toBe('results');
      expect(res.body.results).toBeInstanceOf(Array);
    });

    it('should return 400 with INVALID_TOTAL_TIME if the parsed totalTimeMinutes from query is out of bounds', async () => {
      const res = await request(app)
        .post('/api/recommendations')
        .send({
          query: '상사랑 점심 10분 도보 1만원 조용한 분위기 제외음식없음',
          mode: 'normal',
          userLocation: { lat: 37.4979, lng: 127.0276 }
        })
        .expect(400);

      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe(ErrorCodes.INVALID_TOTAL_TIME);
    });
  });

  describe('POST /api/sessions/:sessionId/answers', () => {
    it('should return 410 with SESSION_EXPIRED for invalid or non-existent session ID', async () => {
      const res = await request(app)
        .post('/api/sessions/non-existent-session/answers')
        .send({
          answers: { transportMode: 'walk' }
        })
        .expect(410);

      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe(ErrorCodes.SESSION_EXPIRED);
    });

    it('should transition to results successfully with valid answers', async () => {
      const initRes = await request(app)
        .post('/api/recommendations')
        .send({
          query: '상사랑 점심 1시간',
          mode: 'normal',
          userLocation: { lat: 37.4979, lng: 127.0276 }
        });

      const sessionId = initRes.body.sessionId;

      const res = await request(app)
        .post(`/api/sessions/${sessionId}/answers`)
        .send({
          answers: {
            transportMode: 'walk',
            budgetPerPersonKrw: 10000,
            partyContext: '친구',
            vibe: '조용한',
            excludedFoods: []
          }
        })
        .expect(200);

      expect(res.body.status).toBe('results');
      expect(res.body.results.length).toBeGreaterThan(0);
    });

    it('should return 400 with INVALID_TOTAL_TIME if answered totalTimeMinutes is out of bounds', async () => {
      const initRes = await request(app)
        .post('/api/recommendations')
        .send({
          query: '상사랑 점심',
          mode: 'normal',
          userLocation: { lat: 37.4979, lng: 127.0276 }
        });

      const sessionId = initRes.body.sessionId;

      const res = await request(app)
        .post(`/api/sessions/${sessionId}/answers`)
        .send({
          answers: {
            totalTimeMinutes: 10
          }
        })
        .expect(400);

      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe(ErrorCodes.INVALID_TOTAL_TIME);
    });
  });
});
