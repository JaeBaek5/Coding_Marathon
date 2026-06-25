import { parseQuery, processAnswers as defaultProcessAnswers, buildRefinementQuestionResponse } from '../aleph/index.js';
import { bet as defaultBet } from '../bet/index.js';
import { gimel as defaultGimel } from '../gimel/index.js';
import { sessions } from '../../services/sessions.js';
import {
  resetSessionProgress,
  setSessionProgress,
  completeSessionProgress
} from '../../services/sessionProgress.js';
import {
  formatMissingFieldsDetail,
  formatSlotsProgressDetail,
  truncateProgressText
} from '../../services/progressFormat.js';
import { ErrorCodes } from '../../../../shared/contracts/schemas.js';
import { logger, logAgentHop } from '../../utils/logger.js';
import { REFINEMENT_FIELDS } from '../aleph/slotDefaults.js';
import {
  toDislikeProfile,
  rerankCandidatesByDislikeSimilarity
} from '../../services/dislikeSimilarity.js';

const SESSION_ID_PREFIX = 'ses_';
const FEEDBACK_ACTIONS = new Set(['like', 'dislike']);
const TRIPLE_DISPLAY_DISLIKE_COUNT = 2;
const VALID_LOCATION_SOURCES = new Set([
  'browser-geolocation',
  'manual-location',
  'selected-location',
  'ip-geolocation'
]);

function randomSessionId() {
  return `${SESSION_ID_PREFIX}${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeLocationPayload(payload, defaultSource) {
  if (!payload) {
    return null;
  }

  const coords = payload.coords && typeof payload.coords === 'object' ? payload.coords : payload;

  if (typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
    return null;
  }

  const source = VALID_LOCATION_SOURCES.has(payload.source)
    ? payload.source
    : VALID_LOCATION_SOURCES.has(coords.source)
      ? coords.source
      : defaultSource;

  return {
    lat: coords.lat,
    lng: coords.lng,
    accuracyMeters:
      typeof payload.accuracyMeters === 'number'
        ? payload.accuracyMeters
        : undefined,
    source
  };
}

function toOrchestratorError(code, message, missingFields = []) {
  return {
    status: 'error',
    code,
    message,
    missingFields
  };
}

function isFeedbackPayload(answers) {
  if (!answers || typeof answers !== 'object') {
    return false;
  }

  const action = String(answers.action || '').toLowerCase();
  return FEEDBACK_ACTIONS.has(action);
}

function toFeedbackResponse(answers) {
  return {
    action: String(answers.action || '').toLowerCase(),
    candidateId:
      typeof answers.candidateId === 'string'
        ? answers.candidateId
        : undefined
  };
}

function resolveDisplayMode(dislikeCount) {
  return dislikeCount >= TRIPLE_DISPLAY_DISLIKE_COUNT ? 'triple' : 'single';
}

function ensureSessionCandidateState(session, initialValues = {}) {
  const current = session.candidatePool || [];
  if (!Array.isArray(session.dislikedCandidateIds)) {
    session.dislikedCandidateIds = [];
  }
  if (!Array.isArray(session.likedCandidateIds)) {
    session.likedCandidateIds = [];
  }

  const disliked = new Set(session.dislikedCandidateIds);
  const filtered = current.filter((candidate) => !disliked.has(candidate.id));
  if (!Number.isInteger(session.currentRecommendationIndex)) {
    session.currentRecommendationIndex = 0;
  }
  if (!Number.isInteger(session.feedbackDislikeCount)) {
    session.feedbackDislikeCount = 0;
  }
  if (!Number.isInteger(session.feedbackLikeCount)) {
    session.feedbackLikeCount = 0;
  }

  Object.assign(session, initialValues);

  return {
    pool: current,
    filteredPool: filtered
  };
}

function nextVisibleIndex(pool, dislikedSet, startIndex) {
  for (let index = startIndex; index < pool.length; index += 1) {
    const candidate = pool[index];
    if (!candidate || dislikedSet.has(candidate.id)) {
      continue;
    }
    return index;
  }
  return -1;
}

function buildDisplayedResult(session) {
  const { candidatePool = [] } = session;
  const dislikedSet = new Set(session.dislikedCandidateIds || []);
  const visiblePool = candidatePool.filter(
    (candidate) => !dislikedSet.has(candidate.id)
  );
  const dislikeCount = session.feedbackDislikeCount || 0;
  const displayMode = resolveDisplayMode(dislikeCount);
  const currentIndexBase = Math.max(0, session.currentRecommendationIndex || 0);
  const currentIndex = nextVisibleIndex(
    candidatePool,
    dislikedSet,
    currentIndexBase
  );
  const currentRecommendation =
    currentIndex >= 0 ? candidatePool[currentIndex] : visiblePool[0] ?? null;

  if (displayMode === 'triple') {
    const tripleResults = visiblePool.slice(0, 3);
    return {
      results: tripleResults,
      candidatePool: visiblePool,
      currentRecommendation: tripleResults[0] ?? currentRecommendation,
      eligibleCount: visiblePool.length,
      displayMode
    };
  }

  return {
    results: currentRecommendation ? [currentRecommendation] : [],
    candidatePool: visiblePool,
    currentRecommendation,
    eligibleCount: visiblePool.length,
    displayMode
  };
}

function defaultNoReason(candidate, fallback) {
  const transportLabel = candidate.transportMode === 'walk' ? '도보' : '차량';
  return `${fallback} ${transportLabel} 이동 기준으로 추천됩니다.`;
}

function buildDislikedProfiles(session, pool, dislikedIds) {
  const profileById = new Map(
    (session.dislikedCandidateProfiles || []).map((profile) => [
      profile.id,
      profile
    ])
  );

  for (const candidateId of dislikedIds) {
    if (profileById.has(candidateId)) {
      continue;
    }
    const candidate = pool.find((item) => item.id === candidateId);
    if (candidate) {
      profileById.set(candidateId, toDislikeProfile(candidate));
    }
  }

  return Array.from(profileById.values());
}

function reorderPoolAfterDislike(pool, dislikedIds, dislikedProfiles) {
  const dislikedSet = new Set(dislikedIds);
  const visible = pool.filter((candidate) => !dislikedSet.has(candidate.id));
  const hidden = pool.filter((candidate) => dislikedSet.has(candidate.id));
  const rerankedVisible = rerankCandidatesByDislikeSimilarity(
    visible,
    dislikedProfiles
  );
  return [...rerankedVisible, ...hidden];
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
      reason: candidate.reason || defaultNoReason(candidate, '조건을 충족하는 후보입니다.')
    }));
  }

  createSession(initialSlots = {}) {
    const sessionId = randomSessionId();
    const session = this.dependencies.sessions.create(sessionId, initialSlots);
    return session;
  }

  normalizeStructuredLocation(request) {
    const mode = request?.mode || 'normal';
    if (request?.location) {
      return normalizeLocationPayload(
        request.location,
        mode === 'travel' ? 'selected-location' : 'browser-geolocation'
      );
    }
    if (mode === 'travel') {
      return normalizeLocationPayload(
        request.selectedLocation,
        'selected-location'
      );
    }
    return normalizeLocationPayload(request.userLocation, 'browser-geolocation');
  }

  validateLocation(mode, location) {
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
    const state = ensureSessionCandidateState(session);
    return state;
  }

  async runCandidateFlow(session, slots, now, options = {}) {
    const excludeCandidateIds = options.excludeCandidateIds || [];
    const dislikedProfiles = options.dislikedProfiles || [];

    logAgentHop(this.dependencies.logger, {
      fromAgent: 'orchestrator',
      toAgent: 'bet',
      phase: 'candidate_search',
      sessionId: session.id
    });

    const betResult = await this.dependencies.bet.search(slots, {
      now,
      sessionId: session.id,
      userQuery: session.userQuery || '',
      excludeCandidateIds,
      dislikedProfiles
    });
    if (betResult.status !== 'results') {
      return betResult;
    }

    setSessionProgress(session.id, {
      phase: 'gimel',
      message: '리뷰·추천 이유 생성 중',
      detail: `${betResult.results.length}곳 후보`,
      meta: {
        상위후보: betResult.results
          .slice(0, 3)
          .map((candidate) => candidate.name)
          .join(', ')
      }
    });

    const reasonedCandidates = await this.dependencies.gimel.generateReasons(
      betResult.results,
      { sessionId: session.id }
    );
    const candidatePool = this.buildCandidatePoolCandidates(reasonedCandidates);

    const updatePayload = {
      slots,
      candidatePool,
      currentRecommendationIndex: 0,
      pendingRefinement: false
    };

    if (options.resetFeedbackStage) {
      updatePayload.feedbackDislikeCount = 0;
    } else if (!Array.isArray(session.candidatePool) || session.candidatePool.length === 0) {
      updatePayload.dislikedCandidateIds = [];
      updatePayload.likedCandidateIds = [];
      updatePayload.feedbackDislikeCount = 0;
      updatePayload.feedbackLikeCount = 0;
    }

    this.dependencies.sessions.update(session.id, updatePayload);

    const display = buildDisplayedResult(session);
    logAgentHop(this.dependencies.logger, {
      fromAgent: 'orchestrator',
      toAgent: 'gimel',
      phase: 'reason_generation',
      sessionId: session.id,
      candidateCount: candidatePool.length
    });

    completeSessionProgress(
      session.id,
      '추천 준비 완료',
      `${display.results.length}곳 표시 · 후보 ${display.eligibleCount}곳`
    );

    return {
      status: 'results',
      sessionId: session.id,
      eligibleCount: display.eligibleCount,
      results: display.results,
      candidatePool: display.candidatePool,
      currentRecommendation: display.currentRecommendation,
      displayMode: display.displayMode
    };
  }

  async processRequest(requestPayload) {
    const existingSessionId = requestPayload.sessionId;
    let session = existingSessionId
      ? this.dependencies.sessions.get(existingSessionId)
      : null;

    if (existingSessionId && !session) {
      return toOrchestratorError(
        ErrorCodes.SESSION_EXPIRED,
        'Session expired. Please restart recommendations.'
      );
    }

    if (!session) {
      session = this.createSession({});
    }

    const mode = requestPayload.mode || 'normal';
    const location = this.normalizeStructuredLocation(requestPayload);

    resetSessionProgress(session.id);
    const queryPreview = truncateProgressText(requestPayload.query || '');
    setSessionProgress(session.id, {
      phase: 'aleph',
      message: '입력 내용 분석 중',
      detail: queryPreview || '자연어 요청 해석',
      meta: {
        모드: mode === 'travel' ? '출장/여행' : '현재 위치',
        ...(location
          ? {
              위치: `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
            }
          : {})
      }
    });
    const locationError = this.validateLocation(mode, location);

    if (locationError) {
      this.dependencies.sessions.delete(session.id);
      return locationError;
    }

    const initialSlots = {
      mode,
      location,
      venuePreference:
        requestPayload.venuePreference ??
        (requestPayload.query ? null : null)
    };

    const parseResult = await this.dependencies.aleph.parseQuery(
      requestPayload.query || '',
      initialSlots,
      1
    );

    setSessionProgress(session.id, {
      phase: 'aleph_llm',
      message: 'AI 조건 해석 완료',
      detail: formatSlotsProgressDetail(parseResult.slots || parseResult.currentState || initialSlots) || '추가 조건 확인 중'
    });

    if (parseResult.status === 'questions') {
      setSessionProgress(session.id, {
        phase: 'aleph_questions',
        message: '추가 질문 준비 완료',
        detail: formatMissingFieldsDetail(parseResult.missingFields),
        meta: {
          필요항목: `${parseResult.missingFields?.length ?? 0}개`
        }
      });
      this.dependencies.sessions.update(session.id, {
        slots: parseResult.currentState || initialSlots,
        turnCount: 0,
        userQuery: requestPayload.query || ''
      });
      return {
        status: 'questions',
        sessionId: session.id,
        missingFields: parseResult.missingFields,
        questions: parseResult.questions
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
      turnCount: 0,
      userQuery: requestPayload.query || session.userQuery || ''
    });
    setSessionProgress(session.id, {
      phase: 'aleph_done',
      message: '입력 내용 분석 완료',
      detail: formatSlotsProgressDetail(parseResult.slots)
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
    resetSessionProgress(sessionId);
    setSessionProgress(sessionId, {
      phase: 'aleph',
      message: '답변 내용 분석 중',
      detail: formatSlotsProgressDetail(session.slots) || '선택한 답변 반영'
    });

    const parseResult = await this.dependencies.aleph.processAnswers(
      answers,
      session.slots,
      nextRound,
      {
        userQuery: session.userQuery || '',
        skipQuestions: session.pendingRefinement === true,
        refinementFields: session.pendingRefinement ? REFINEMENT_FIELDS : undefined
      }
    );

    this.dependencies.sessions.update(sessionId, {
      turnCount: nextRound,
      slots: parseResult.slots || parseResult.currentState || session.slots
    });

    if (parseResult.status === 'questions') {
      setSessionProgress(sessionId, {
        phase: 'aleph_questions',
        message: '추가 질문 준비 완료',
        detail: formatMissingFieldsDetail(parseResult.missingFields)
      });
      return {
        status: 'questions',
        sessionId,
        missingFields: parseResult.missingFields,
        questions: parseResult.questions
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

    setSessionProgress(sessionId, {
      phase: 'aleph_done',
      message: '답변 내용 분석 완료',
      detail: formatSlotsProgressDetail(parseResult.slots)
    });

    const wasRefining = session.pendingRefinement === true;
    if (wasRefining) {
      this.dependencies.sessions.update(sessionId, {
        pendingRefinement: false
      });
    }

    return this.runCandidateFlow(session, parseResult.slots, session.createdAt, {
      excludeCandidateIds: session.dislikedCandidateIds || [],
      dislikedProfiles: session.dislikedCandidateProfiles || [],
      resetFeedbackStage: wasRefining
    });
  }

  async buildRefinementQuestions(session) {
    const refinement = await buildRefinementQuestionResponse(
      session.slots,
      session.userQuery || ''
    );

    return {
      ...refinement,
      sessionId: session.id,
      message: '마음에 드는 곳이 없으시군요. 조건을 조금만 더 알려주세요.'
    };
  }

  async applyFeedback(session, feedback) {
    if (!Array.isArray(session.candidatePool) || session.candidatePool.length === 0) {
      return toOrchestratorError(
        ErrorCodes.NO_RESULTS,
        'No recommendation candidates available in this session.'
      );
    }

    const pool = session.candidatePool;
    const dislikedSet = new Set(session.dislikedCandidateIds || []);
    const likedSet = new Set(session.likedCandidateIds || []);
    const dislikeCountBefore = session.feedbackDislikeCount || 0;
    const wasTripleDisplay =
      resolveDisplayMode(dislikeCountBefore) === 'triple';

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
      if (!dislikedSet.has(targetCandidateId)) {
        dislikedSet.add(targetCandidateId);
      }
      likedSet.delete(targetCandidateId);
      session.feedbackDislikeCount = dislikeCountBefore + 1;

      const newDisliked = Array.from(dislikedSet);
      const dislikedProfiles = buildDislikedProfiles(session, pool, newDisliked);
      const rerankedPool = reorderPoolAfterDislike(
        pool,
        newDisliked,
        dislikedProfiles
      );

      if (wasTripleDisplay) {
        this.dependencies.sessions.update(session.id, {
          dislikedCandidateIds: newDisliked,
          dislikedCandidateProfiles: dislikedProfiles,
          likedCandidateIds: Array.from(likedSet),
          candidatePool: rerankedPool,
          currentRecommendationIndex: 0,
          feedbackDislikeCount: session.feedbackDislikeCount,
          pendingRefinement: true
        });

        const refinement = await this.buildRefinementQuestions(session);
        if (refinement) {
          return refinement;
        }

        return this.runCandidateFlow(session, session.slots, session.createdAt, {
          excludeCandidateIds: newDisliked,
          dislikedProfiles,
          resetFeedbackStage: true
        });
      }

      const newLiked = Array.from(likedSet);
      this.dependencies.sessions.update(session.id, {
        dislikedCandidateIds: newDisliked,
        dislikedCandidateProfiles: dislikedProfiles,
        likedCandidateIds: newLiked,
        candidatePool: rerankedPool,
        currentRecommendationIndex: 0,
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
        displayMode: refreshed.displayMode
      };
    }

    if (feedback.action === 'like') {
      if (!likedSet.has(targetCandidateId)) {
        likedSet.add(targetCandidateId);
      }
      dislikedSet.delete(targetCandidateId);
      session.feedbackLikeCount = (session.feedbackLikeCount || 0) + 1;
    }

    const newDisliked = Array.from(dislikedSet);
    const newLiked = Array.from(likedSet);

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
      displayMode: refreshed.displayMode
    };
  }
}

export const orchestrator = new OrchestratorAgent();
export const alephAgent = {
  parseQuery,
  processAnswers: defaultProcessAnswers
};
export default orchestrator;
