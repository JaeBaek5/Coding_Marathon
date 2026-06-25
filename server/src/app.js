import express from 'express';
import cors from 'cors';
import { healthContract } from '../../shared/contracts/health.js';
import { orchestrator } from './services/orchestrator.js';
import { sessions } from './services/sessions.js';
import { searchLocation, reverseGeocodeLocation } from './adapters/index.js';
import {
  ErrorCodes,
  RecommendationRequestSchema,
  AnswersRequestSchema,
  FeedbackRequestSchema,
  isTotalTimeBelowMinimum,
  totalTimeOutOfRangeMessage
} from '../../shared/contracts/schemas.js';
import { resolveTotalTimeMinutesHeuristic } from './services/slotExceptionResolver.js';
import { logger, loggerMiddleware } from './utils/logger.js';
import { getPublicConfig } from './config/publicConfig.js';
import {
  getClientIp,
  isPrivateOrLocalIp,
  lookupIpLocation
} from './utils/ipGeolocation.js';
import { getSessionProgress, resetSessionProgress } from './services/sessionProgress.js';

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

app.post('/api/sessions', (_req, res) => {
  const session = orchestrator.createSession({});
  resetSessionProgress(session.id);
  return res.status(201).json({ sessionId: session.id });
});

app.get('/api/sessions/:sessionId/progress', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(410).json({
      status: 'error',
      code: ErrorCodes.SESSION_EXPIRED,
      message: '세션이 만료되었거나 존재하지 않습니다.'
    });
  }

  const progress = getSessionProgress(sessionId);
  return res.status(200).json({
    status: 'ok',
    current: progress.current,
    steps: progress.steps
  });
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

app.get('/api/location/reverse', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({
      status: 'error',
      code: ErrorCodes.GEO_REQUIRED,
      message: '유효한 좌표가 필요합니다.',
      missingFields: []
    });
  }

  try {
    const result = await reverseGeocodeLocation(lat, lng);
    res.set('Cache-Control', 'no-store');
    return res.json({
      lat,
      lng,
      label: result.label || null
    });
  } catch (err) {
    logger.error('Reverse geocode failed', err, {
      requestId: req.id,
      lat,
      lng
    });
    res.set('Cache-Control', 'no-store');
    return res.json({
      lat,
      lng,
      label: null
    });
  }
});

app.get('/api/location/ip', async (req, res) => {
  const clientIp = getClientIp(req);
  const lookupIp =
    clientIp && !isPrivateOrLocalIp(clientIp) ? clientIp : null;

  try {
    const location = await lookupIpLocation(lookupIp);
    res.set('Cache-Control', 'no-store');
    return res.json(location);
  } catch (err) {
    logger.error('IP geolocation failed', err, {
      requestId: req.id,
      clientIp
    });
    return res.status(502).json({
      status: 'error',
      code: ErrorCodes.PROVIDER_ERROR,
      message: 'IP 위치 추정에 실패했습니다.',
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
    if (typeof totalTime !== 'number' || !Number.isFinite(totalTime)) {
      return res.status(400).json({
        status: 'error',
        code: ErrorCodes.INVALID_TOTAL_TIME,
        message: totalTimeOutOfRangeMessage(),
        missingFields: []
      });
    }
    if (isTotalTimeBelowMinimum(totalTime)) {
      const resolved = resolveTotalTimeMinutesHeuristic(totalTime);
      answers.totalTimeMinutes = resolved.value;
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
