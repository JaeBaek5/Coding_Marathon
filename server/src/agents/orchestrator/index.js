import { parseQuery, processAnswers as defaultProcessAnswers } from '../aleph/index.js';
import { bet as defaultBet } from '../bet/index.js';
import { gimel as defaultGimel } from '../gimel/index.js';
import { sessions } from '../../services/sessions.js';
import { ErrorCodes } from '../../../../shared/contracts/schemas.js';
import { logger, logAgentHop } from '../../utils/logger.js';

const SESSION_ID_PREFIX = 'ses_';
const FEEDBACK_ACTIONS = new Set(['like', 'dislike']);
const VALID_LOCATION_SOURCES = new Set([
  'browser-geolocation',
  'manual-location',
  'selected-location'
]);

function randomSessionId() {
  return `${SESSION_ID_PREFIX}${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeLocationPayload(payload, defaultSource) {
  if (!payload) return null;
  const coords = payload.coords && typeof payload.coords === 'object' ? payload.coords : payload;
  if (typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return null;

  const source = VALID_LOCATION_SOURCES.has(payload.source)
    ? payload.source
    : VALID_LOCATION_SOURCES.has(coords.source)
      ? coords.source
      : defaultSource;

  return {
    lat: coords.lat,
    lng: coords.lng,
    accuracyMeters:
      typeof payload.accuracyMeters === 'number' ? payload.accuracyMeters : undefined,
    source
  };
}

function toOrchestratorError(code, message, missingFields = []) {
  return { status: 'error', code, message, missingFields };
}

function isFeedbackPayload(answers) {
  if (!answers || typeof answers !== 'object') return false;
  return FEEDBACK_ACTIONS.has(String(answers.action || '').toLowerCase());
}

function toFeedbackResponse(answers) {
  return {
    action: String(answers.action || '').toLowerCase(),
    candidateId: typeof answers.candidateId === 'string' ? answers.candidateId : undefined
  };
}

function ensureSessionCandidateState(session, initialValues = {}) {
  const current = session.candidatePool || [];
  if (!Array.isArray(session.dislikedCandidateIds)) session.dislikedCandidateIds = [];
  if (!Array.isArray(session.likedCandidateIds)) session.likedCandidateIds = [];

  const disliked = new Set(session.dislikedCandidateIds);
  const filtered = current.filter((candidate) => !disliked.has(candidate.id));
  if (!Number.isInteger(session.currentRecommendationIndex)) session.currentRecommendationIndex = 0;
  if (!Number.isInteger(session.feedbackDislikeCount)) session.feedbackDislikeCount = 0;
  if (!Number.isInteger(session.feedbackLikeCount)) session.feedbackLikeCount = 0;

  Object.assign(session, initialValues);
  return { pool: current, filteredPool: filtered };
}

function nextVisibleIndex(pool, dislikedSet, startIndex) {
  for (let index = startIndex; index < pool.length; index += 1) {
    const candidate = pool[index];
    if (!candidate || dislikedSet.has(candidate.id)) continue;
    return index;
  }
  return -1;
}

function buildDisplayedResult(session) {
  const { candidatePool = [], feedbackDislikeCount = 0 } = session;
  const dislikedSet = new Set(session.dislikedCandidateIds || []);
  const visiblePool = candidatePool.filter((candidate) => !dislikedSet.has(candidate.id));
  const currentIndexBase = Math.max(0, session.currentRecommendationIndex || 0);
  const currentIndex = nextVisibleIndex(candidatePool, dislikedSet, currentIndexBase);
  const currentRecommendation = currentIndex >= 0 ? candidatePool[currentIndex] : null;
  const visibleCurrent = currentRecommendation ? [currentRecommendation] : [];
  const results = feedbackDislikeCount >= 2 ? visiblePool : visibleCurrent;

  return {
    results,
    candidatePool: visiblePool,
    currentRecommendation,
    eligibleCount: visiblePool.length
  };
}

function defaultNoReason(candidate, fallback) {
  const transportLabel = candidate.transportMode === 'walk' ? 'walk' : 'drive';
  return `${fallback} ${transportLabel} based recommendation reason`;
}

function toLogSnapshot(session, payload) {
  return {
    timestamp: new Date().toISOString(),
    sessionId: session?.id,
    ...payload
  };
}

export class OrchestratorAgent {
  constructor(dependencies = {}) {
    const betClient = dependencies.bet || defaultBet;
    const gimelClient = dependencies.gimel || defaultGimel;
    const alephModule = dependencies.aleph || {
      parseQuery,
      processAnswers: defaultProcessAnswers
    };

    this.dependencies = {
      aleph: {
        parseQuery: alephModule.parseQuery,
        processAnswers: alephModule.processAnswers
      },
      bet: betClient,
      gimel: gimelClient,
      sessions: dependencies.sessionStore || sessions,
      logger: dependencies.logger || logger.child({ service: 'orchestrator' }),
      ...dependencies
    };
  }

  buildCandidatePoolCandidates(candidates) {
    const baseCandidates = Array.isArray(candidates) ? candidates : [];
    return baseCandidates.map((candidate) => ({
      ...candidate,
      reason:
        candidate.reason ||
        defaultNoReason(candidate, '추천 근거를 추정해 표시')
    }));
  }

  createSession(initialSlots = {}) {
    const sessionId = randomSessionId();
    return this.dependencies.sessions.create(sessionId, initialSlots);
  }

  appendAgentLog(session, payload) {
    if (!session?.id) return null;
    return this.dependencies.sessions.appendAgentCommunicationLog(
      session.id,
      toLogSnapshot(session, payload)
    );
  }

  normalizeStructuredLocation(request) {
    const mode = request?.mode || 'normal';
    if (request?.location) {
      return normalizeLocationPayload(
        request.location,
        mode === 'travel' ? 'selected-location' : 'browser-geolocation'
      );
    }
    if (mode === 'travel') return normalizeLocationPayload(request.selectedLocation, 'selected-location');
    return normalizeLocationPayload(request.userLocation, 'browser-geolocation');
  }

  validateLocation(_mode, location) {
    if (!location) {
      return toOrchestratorError(
        ErrorCodes.GEO_REQUIRED,
        'Location is required for recommendation.'
      );
    }
    if (typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      return toOrchestratorError(
        ErrorCodes.GEO_REQUIRED,
        'Location must include lat and lng.'
      );
    }
    return null;
  }

  getCurrentState(session) {
    return ensureSessionCandidateState(session);
  }

  async runCandidateFlow(session, slots, now) {
    logAgentHop(this.dependencies.logger, {
      fromAgent: 'orchestrator',
      toAgent: 'bet',
      phase: 'candidate_search',
      sessionId: session.id
    });
    this.appendAgentLog(session, {
      event: 'agent_hop',
      fromAgent: 'orchestrator',
      toAgent: 'bet',
      phase: 'candidate_search',
      mode: slots?.mode,
      transportMode: slots?.transportMode
    });

    const betResult = await this.dependencies.bet.search(slots, {
      now,
      sessionId: session.id,
      trace: (entry) =>
        this.appendAgentLog(session, { event: 'bet_trace', ...entry })
    });

    if (betResult.status !== 'results') {
      this.appendAgentLog(session, {
        event: 'bet_flow_result',
        fromAgent: 'bet',
        toAgent: 'orchestrator',
        phase: 'non_result',
        status: betResult.status,
        code: betResult.code,
        message: betResult.message
      });
      return betResult;
    }

    this.appendAgentLog(session, {
      event: 'bet_flow_result',
      fromAgent: 'bet',
      toAgent: 'orchestrator',
      phase: 'results_ready',
      status: 'results',
      count: betResult.eligibleCount,
      metadata: betResult.metadata
    });

    const reasonedCandidates = await this.dependencies.gimel.generateReasons(
      betResult.results
    );
    this.appendAgentLog(session, {
      event: 'gimel_reasons',
      fromAgent: 'gimel',
      toAgent: 'orchestrator',
      phase: 'reasoning_completed',
      reasonedCount: reasonedCandidates.length
    });

    const candidatePool = this.buildCandidatePoolCandidates(reasonedCandidates);

    this.dependencies.sessions.update(session.id, {
      slots,
      candidatePool,
      currentRecommendationIndex: 0,
      dislikedCandidateIds: [],
      likedCandidateIds: [],
      feedbackDislikeCount: 0,
      feedbackLikeCount: 0
    });

    const display = buildDisplayedResult(session);
    logAgentHop(this.dependencies.logger, {
      fromAgent: 'orchestrator',
      toAgent: 'gimel',
      phase: 'reason_generation',
      sessionId: session.id,
      candidateCount: candidatePool.length
    });

    const agentCommunicationLog =
      this.dependencies.sessions.get(session.id)?.agentCommunicationLog || [];

    return {
      status: 'results',
      sessionId: session.id,
      eligibleCount: display.eligibleCount,
      results: display.results,
      candidatePool: display.candidatePool,
      currentRecommendation: display.currentRecommendation,
      agentCommunicationLog
    };
  }

  async processRequest(requestPayload) {
    const session = this.createSession({});
    const mode = requestPayload.mode || 'normal';
    const location = this.normalizeStructuredLocation(requestPayload);
    const locationError = this.validateLocation(mode, location);
    if (locationError) {
      this.dependencies.sessions.delete(session.id);
      return locationError;
    }

    const initialSlots = {
      mode,
      location,
      venuePreference: requestPayload.venuePreference ?? null
    };

    this.appendAgentLog(session, {
      event: 'request_entered',
      fromAgent: 'frontend',
      toAgent: 'orchestrator',
      mode,
      promptLength: (requestPayload.query || '').length
    });

    const parseResult = await this.dependencies.aleph.parseQuery(
      requestPayload.query || '',
      initialSlots,
      1
    );
    this.appendAgentLog(session, {
      event: 'aleph_parse',
      fromAgent: 'aleph',
      toAgent: 'orchestrator',
      phase: 'parse_complete',
      status: parseResult.status,
      missingFields: parseResult.missingFields || []
    });

    if (parseResult.status === 'questions') {
      this.dependencies.sessions.update(session.id, {
        slots: parseResult.currentState || initialSlots,
        turnCount: 0
      });
      return {
        status: 'questions',
        sessionId: session.id,
        missingFields: parseResult.missingFields,
        questions: parseResult.questions,
        agentCommunicationLog:
          this.dependencies.sessions.get(session.id)?.agentCommunicationLog || []
      };
    }

    if (parseResult.status === 'error') {
      this.dependencies.sessions.delete(session.id);
      return parseResult;
    }

    if (parseResult.status !== 'complete' || !parseResult.slots) {
      this.dependencies.sessions.delete(session.id);
      return toOrchestratorError(
        ErrorCodes.PROVIDER_ERROR,
        'Orchestrator unable to parse complete recommendation state.'
      );
    }

    this.dependencies.sessions.update(session.id, {
      slots: parseResult.slots,
      turnCount: 0
    });
    return this.runCandidateFlow(session, parseResult.slots, requestPayload.now);
  }

  async processAnswers(sessionId, answersPayload = {}) {
    const session = this.dependencies.sessions.get(sessionId);
    if (!session) {
      return toOrchestratorError(
        ErrorCodes.SESSION_EXPIRED,
        'Session expired. Please restart recommendations.'
      );
    }

    const answers = answersPayload.answers || {};
    const feedback = toFeedbackResponse(answers);

    if (isFeedbackPayload(answers)) {
      return this.applyFeedback(session, feedback);
    }

    const nextRound = session.turnCount + 1;
    const parseResult = await this.dependencies.aleph.processAnswers(
      answers,
      session.slots,
      nextRound
    );
    this.appendAgentLog(session, {
      event: 'aleph_answers',
      fromAgent: 'aleph',
      toAgent: 'orchestrator',
      phase: 'answers_parsed',
      status: parseResult.status,
      missingFields: parseResult.missingFields || []
    });

    this.dependencies.sessions.update(sessionId, {
      turnCount: nextRound,
      slots: parseResult.slots || parseResult.currentState || session.slots
    });

    if (parseResult.status === 'questions') {
      return {
        status: 'questions',
        sessionId,
        missingFields: parseResult.missingFields,
        questions: parseResult.questions,
        agentCommunicationLog:
          this.dependencies.sessions.get(sessionId)?.agentCommunicationLog || []
      };
    }

    if (parseResult.status === 'error') {
      this.dependencies.sessions.delete(sessionId);
      return parseResult;
    }

    if (parseResult.status !== 'complete' || !parseResult.slots) {
      return toOrchestratorError(
        ErrorCodes.PROVIDER_ERROR,
        'Unable to complete recommendation request.'
      );
    }

    return this.runCandidateFlow(session, parseResult.slots, session.createdAt);
  }

  applyFeedback(session, feedback) {
    if (!Array.isArray(session.candidatePool) || session.candidatePool.length === 0) {
      return toOrchestratorError(
        ErrorCodes.NO_RESULTS,
        'No recommendation candidates available in this session.'
      );
    }

    const pool = session.candidatePool;
    const dislikedSet = new Set(session.dislikedCandidateIds);
    const likedSet = new Set(session.likedCandidateIds);

    let targetCandidateId = feedback.candidateId;
    const currentData = buildDisplayedResult(session);
    if (!targetCandidateId && currentData.currentRecommendation) {
      targetCandidateId = currentData.currentRecommendation.id;
    }
    if (!targetCandidateId) {
      return toOrchestratorError(
        ErrorCodes.INVALID_TOTAL_TIME,
        'No active recommendation to provide feedback for.'
      );
    }

    if (!pool.some((candidate) => candidate.id === targetCandidateId)) {
      return toOrchestratorError(
        ErrorCodes.PROVIDER_ERROR,
        'Candidate not found in current session.'
      );
    }

    if (feedback.action === 'dislike') {
      dislikedSet.add(targetCandidateId);
      likedSet.delete(targetCandidateId);
      session.feedbackDislikeCount = (session.feedbackDislikeCount || 0) + 1;
    }

    if (feedback.action === 'like') {
      likedSet.add(targetCandidateId);
      dislikedSet.delete(targetCandidateId);
      session.feedbackLikeCount = (session.feedbackLikeCount || 0) + 1;
    }

    const newDisliked = Array.from(dislikedSet);
    const newLiked = Array.from(likedSet);

    this.appendAgentLog(session, {
      event: 'feedback_applied',
      fromAgent: 'orchestrator',
      toAgent: 'orchestrator',
      candidateId: targetCandidateId,
      action: feedback.action,
      dislikedCount: newDisliked.length,
      likedCount: newLiked.length
    });

    const baseIndex = session.currentRecommendationIndex || 0;
    const updatedIndex = nextVisibleIndex(
      pool,
      new Set(newDisliked),
      feedback.action === 'dislike' ? baseIndex + 1 : baseIndex
    );

    const finalIndex = updatedIndex >= 0 ? updatedIndex : baseIndex;
    this.dependencies.sessions.update(session.id, {
      dislikedCandidateIds: newDisliked,
      likedCandidateIds: newLiked,
      currentRecommendationIndex: finalIndex,
      feedbackDislikeCount: session.feedbackDislikeCount,
      feedbackLikeCount: session.feedbackLikeCount
    });

    const refreshed = buildDisplayedResult(session);
    return {
      status: 'results',
      sessionId: session.id,
      eligibleCount: refreshed.eligibleCount,
      results: refreshed.results,
      candidatePool: refreshed.candidatePool,
      currentRecommendation: refreshed.currentRecommendation,
      agentCommunicationLog:
        this.dependencies.sessions.get(session.id)?.agentCommunicationLog || []
    };
  }
}

export const orchestrator = new OrchestratorAgent();
export const alephAgent = {
  parseQuery,
  processAnswers: defaultProcessAnswers
};
export default orchestrator;
