import express from 'express';
import cors from 'cors';
import { healthContract } from '../../shared/contracts/health.js';
import { orchestrator } from './services/orchestrator.js';
import { sessions } from './services/sessions.js';
import { searchLocation } from './adapters/index.js';
import {
  ErrorCodes,
  RecommendationRequestSchema,
  AnswersRequestSchema,
  FeedbackRequestSchema
} from '../../shared/contracts/schemas.js';
import { logger, loggerMiddleware } from './utils/logger.js';
import { getPublicConfig } from './config/publicConfig.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(loggerMiddleware);

function mapErrorCodeToStatus(code) {
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

app.get(healthContract.path, (_req, res) => {
  res.status(healthContract.response.status).json(healthContract.response.body);
});

app.get('/api/config/public', (_req, res) => {
  res.status(200).json(getPublicConfig());
});

app.get('/api/location-search', async (req, res) => {
  const q = req.query.q;
  if (!q) {
    return res.json([]);
  }

  try {
    const results = await searchLocation(q);
    return res.json(
      results.map((item) => ({
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

app.post('/api/recommendations', async (req, res) => {
  const parseResult = RecommendationRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      status: 'error',
      code: ErrorCodes.INVALID_TOTAL_TIME,
      message: parseResult.error.errors.map((e) => e.message).join(', '),
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
  if (futureKeywords.some((keyword) => query.toLowerCase().includes(keyword))) {
    return res.status(400).json({
      status: 'error',
      code: ErrorCodes.SCHEDULED_MEAL_UNSUPPORTED,
      message:
        '머먹 MVP는 현재/현재에 가까운 식사만 지원합니다. 예약이나 미래 소요시간 계획은 지원하지 않습니다.',
      missingFields: []
    });
  }

  try {
    const result = await orchestrator.processRequest(parseResult.data);
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

app.post('/api/sessions/:sessionId/answers', async (req, res) => {
  const { sessionId } = req.params;
  const parseResult = AnswersRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      status: 'error',
      code: ErrorCodes.INVALID_TOTAL_TIME,
      message: parseResult.error.errors.map((e) => e.message).join(', '),
      missingFields: []
    });
  }

  const session = sessions.get(sessionId);
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
    const result = await orchestrator.processAnswers(
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

app.post('/api/sessions/:sessionId/feedback', async (req, res) => {
  const { sessionId } = req.params;
  const parseResult = FeedbackRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      status: 'error',
      code: ErrorCodes.INVALID_TOTAL_TIME,
      message: parseResult.error.errors.map((e) => e.message).join(', '),
      missingFields: []
    });
  }

  try {
    const result = await orchestrator.processFeedback(
      sessionId,
      parseResult.data
    );
    if (result.status === 'error') {
      return res.status(mapErrorCodeToStatus(result.code)).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    logger.error('Feedback processing failed', err, {
      requestId: req.id,
      sessionId
    });
    return res.status(500).json({
      status: 'error',
      code: ErrorCodes.PROVIDER_ERROR,
      message: '피드백 처리에 실패했습니다.',
      missingFields: []
    });
  }
});

export default app;
