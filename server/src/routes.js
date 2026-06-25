import express from 'express';
import { healthContract } from '../../shared/contracts/health.js';
import {
  ErrorCodes,
  RecommendationRequestSchema,
  AnswersRequestSchema
} from '../../shared/contracts/schemas.js';
import { orchestrator } from './services/orchestrator.js';
import { sessions } from './services/sessions.js';
import { searchLocation } from './adapters/index.js';
import { logger } from './utils/logger.js';
import { getPublicConfig } from './config/publicConfig.js';

export function mapErrorCodeToStatus(code) {
  switch (code) {
    case ErrorCodes.GEO_REQUIRED:
      return 400;
    case ErrorCodes.INVALID_TOTAL_TIME:
      return 400;
    case ErrorCodes.SCHEDULED_MEAL_UNSUPPORTED:
      return 400;
    case ErrorCodes.UNSUPPORTED_BROWSER:
      return 400;
    case ErrorCodes.SESSION_EXPIRED:
      return 410;
    case ErrorCodes.NO_RESULTS:
      return 404;
    case ErrorCodes.ROUTE_UNAVAILABLE:
      return 404;
    case ErrorCodes.PROVIDER_QUOTA:
      return 429;
    case ErrorCodes.PROVIDER_ERROR:
      return 502;
    default:
      return 500;
  }
}

function formatValidationMessage(error) {
  const issues = error?.issues || error?.errors || [];
  return issues.map((issue) => issue.message).join(', ');
}

export function createApiRouter(options = {}) {
  const router = express.Router();
  const orchestratorService = options.orchestratorService || orchestrator;
  const sessionStore = options.sessionStore || sessions;

  router.get(healthContract.path, (_req, res) => {
    res
      .status(healthContract.response.status)
      .json(healthContract.response.body);
  });

  router.get('/api/config/public', (_req, res) => {
    res.status(200).json(getPublicConfig());
  });

  router.get('/api/sessions/:sessionId/logs', (req, res) => {
    const session = sessionStore.get(req.params.sessionId);
    if (!session) {
      return res.status(410).json({
        status: 'error',
        code: ErrorCodes.SESSION_EXPIRED,
        message: 'Session expired or not found.',
        missingFields: []
      });
    }

    return res.status(200).json({
      sessionId: session.id,
      agentCommunicationLog: session.agentCommunicationLog || []
    });
  });

  router.get('/api/location-search', async (req, res) => {
    const q = req.query.q;
    if (!q) {
      return res.json([]);
    }

    try {
      const normalized = await searchLocation(q);
      return res.json(
        normalized.map((item) => ({
          ...item,
          coords: item.location
        }))
      );
    } catch (err) {
      logger.error('Provider Error: Location search failed', err, {
        requestId: req.id,
        query: q
      });
      const isQuota =
        err.message?.toLowerCase().includes('quota') ||
        err.message?.includes('429');
      return res
        .status(
          mapErrorCodeToStatus(
            isQuota ? ErrorCodes.PROVIDER_QUOTA : ErrorCodes.PROVIDER_ERROR
          )
        )
        .json({
          status: 'error',
          code: isQuota ? ErrorCodes.PROVIDER_QUOTA : ErrorCodes.PROVIDER_ERROR,
          message: '위치 검색에 실패했습니다.',
          missingFields: []
        });
    }
  });

  router.post('/api/recommendations', async (req, res) => {
    const parseResult = RecommendationRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        code: ErrorCodes.INVALID_TOTAL_TIME,
        message: formatValidationMessage(parseResult.error),
        missingFields: []
      });
    }

    const { query } = parseResult.data;
    const futureKeywords = [
      '내일',
      '모레',
      '다음주',
      '예약',
      '예정',
      '주말',
      '토요일',
      '일요일',
      'tomorrow',
      'next week',
      'schedule',
      'reservation'
    ];
    if (
      futureKeywords.some((keyword) => query.toLowerCase().includes(keyword))
    ) {
      return res.status(400).json({
        status: 'error',
        code: ErrorCodes.SCHEDULED_MEAL_UNSUPPORTED,
        message:
          '머먹 MVP는 현재/현재에 가까운 식사만 지원합니다. 예약이나 미래 소요시간 계획은 지원하지 않습니다.',
        missingFields: []
      });
    }

    try {
      const result = await orchestratorService.processRequest(parseResult.data);
      if (result.status === 'error') {
        return res.status(mapErrorCodeToStatus(result.code)).json(result);
      }
      return res.status(200).json(result);
    } catch (err) {
      logger.error('Recommendation processing failed', err, {
        requestId: req.id
      });
      return res.status(500).json({
        status: 'error',
        code: ErrorCodes.PROVIDER_ERROR,
        message: '요청 처리에 실패했습니다.',
        missingFields: []
      });
    }
  });

  router.post('/api/sessions/:sessionId/answers', async (req, res) => {
    const { sessionId } = req.params;
    const parseResult = AnswersRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        code: ErrorCodes.INVALID_TOTAL_TIME,
        message: formatValidationMessage(parseResult.error),
        missingFields: []
      });
    }

    const session = sessionStore.get(sessionId);
    if (!session) {
      return res.status(410).json({
        status: 'error',
        code: ErrorCodes.SESSION_EXPIRED,
        message: '세션이 만료되었거나 존재하지 않습니다.',
        missingFields: []
      });
    }

    const answers = parseResult.data.answers || {};
    const totalTime = answers.totalTimeMinutes;
    if (totalTime !== undefined && totalTime !== null) {
      if (typeof totalTime !== 'number' || totalTime < 20 || totalTime > 60) {
        return res.status(400).json({
          status: 'error',
          code: ErrorCodes.INVALID_TOTAL_TIME,
          message: '총 소요시간은 20분 이상 60분 이하로 입력해 주세요.',
          missingFields: []
        });
      }
    }

    try {
      const result = await orchestratorService.processAnswers(
        sessionId,
        parseResult.data
      );
      if (result.status === 'error') {
        return res.status(mapErrorCodeToStatus(result.code)).json(result);
      }
      return res.status(200).json(result);
    } catch (err) {
      logger.error('Answer processing failed', err, {
        requestId: req.id,
        sessionId
      });
      return res.status(500).json({
        status: 'error',
        code: ErrorCodes.PROVIDER_ERROR,
        message: '답변 처리에 실패했습니다.',
        missingFields: []
      });
    }
  });

  return router;
}

export default createApiRouter;
