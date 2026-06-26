import { ErrorCodes } from '../../../../shared/contracts/schemas.js';
import {
  searchNearbyCandidates as defaultSearchNearbyCandidates,
  getWalkingRoute as defaultGetWalkingRoute,
  getDrivingRoute as defaultGetDrivingRoute,
  mergeCandidateWithRoute as defaultMergeCandidateWithRoute
} from '../../adapters/index.js';
import {
  rankCandidates as defaultRankCandidates,
  validateTimeBudget,
  RankingValidationError
} from '../../services/ranking.js';
import { logger as defaultLogger, logAgentHop } from '../../utils/logger.js';
import { setSessionProgress } from '../../services/sessionProgress.js';
import { formatSearchContextDetail, formatTransportLabel } from '../../services/progressFormat.js';
import { enrichCandidatesWithReviews, enrichTopCandidatesWithReviewsFast } from '../../services/candidateEnrichment.js';
import {
  applyLLMScoresToCandidates,
  scoreCandidatesWithLLM
} from '../../services/llmReviewScoring.js';
import {
  buildSearchKeywords,
  buildSearchKeywordsFromScores,
  deriveFoodPreferenceScores
} from '../../utils/foodPreference.js';
import { resolveTotalTimeMinutesHeuristic } from '../../services/slotExceptionResolver.js';
import { selectCandidatesForRouting } from '../../utils/candidateSelection.js';
import { resolveSearchRadiusMeters } from '../../../../shared/contracts/travelRange.js';
import {
  FAST_MODE,
  BET_ROUTE_CANDIDATE_LIMIT_FAST,
  BET_ROUTE_CONCURRENCY_FAST,
  BET_REVIEW_ENRICH_LIMIT_FAST,
  BET_REVIEW_TIMEOUT_MS_FAST
} from '../../config/performance.js';

export const DEFAULT_TOP_N = 5;
export const DEFAULT_NEARBY_CANDIDATE_WINDOW = 20;
export const DEFAULT_ROUTE_CONCURRENCY = 4;
export const DEFAULT_ROUTE_CANDIDATE_LIMIT = 15;
export const DEFAULT_REVIEW_CONCURRENCY = 6;
export const DEFAULT_LLM_SCORE_CONCURRENCY = 1;

const defaultDependencies = {
  searchNearbyCandidates: defaultSearchNearbyCandidates,
  getWalkingRoute: defaultGetWalkingRoute,
  getDrivingRoute: defaultGetDrivingRoute,
  mergeCandidateWithRoute: defaultMergeCandidateWithRoute,
  rankCandidates: defaultRankCandidates,
  enrichCandidatesWithReviews,
  enrichTopCandidatesWithReviewsFast,
  scoreCandidatesWithLLM,
  logger: defaultLogger
};

function normalizePositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function isProviderQuotaError(error) {
  const message = error?.message?.toLowerCase() || '';
  return message.includes('quota') || message.includes('429');
}

function createErrorResult(code, message, metadata = {}) {
  return {
    status: 'error',
    code,
    message,
    missingFields: [],
    metadata
  };
}

export function getSearchRadius(mode, transportMode, totalTimeMinutes) {
  return resolveSearchRadiusMeters({
    mode,
    transportMode,
    totalTimeMinutes
  });
}

import { mapWithConcurrencyLimit } from '../../utils/concurrency.js';

export { mapWithConcurrencyLimit };

export class BetAgent {
  constructor(dependencies = {}) {
    this.dependencies = {
      ...defaultDependencies,
      ...dependencies
    };
  }

  async search(slots, options = {}) {
    const {
      now = null,
      topN = DEFAULT_TOP_N,
      routeConcurrency = DEFAULT_ROUTE_CONCURRENCY,
      routeCandidateLimit = DEFAULT_ROUTE_CANDIDATE_LIMIT,
      sessionId = null,
      userQuery = '',
      fastMode = FAST_MODE,
      excludeCandidateIds = []
    } = options;
    const dislikedProfiles = options.dislikedProfiles || [];
    const { mode, transportMode, location, desiredFoods = [], searchKeywords = [], venuePreference, foodPreferenceScores = [], venueIntentExplicit } =
      slots;
    let { totalTimeMinutes } = slots;
    const normalizedDesiredFoods = Array.isArray(desiredFoods) ? desiredFoods : [];
    const resolvedFoodScores = deriveFoodPreferenceScores({
      desiredFoods: normalizedDesiredFoods,
      excludedFoods: slots.excludedFoods || [],
      foodPreferenceScores
    });
    const normalizedSearchKeywords =
      resolvedFoodScores.length > 0
        ? buildSearchKeywordsFromScores(
            resolvedFoodScores,
            Array.isArray(searchKeywords) ? searchKeywords : []
          )
        : buildSearchKeywords(
            normalizedDesiredFoods,
            Array.isArray(searchKeywords) ? searchKeywords : []
          );
    const normalizedTopN = normalizePositiveInteger(topN, DEFAULT_TOP_N);
    const normalizedRouteConcurrency = normalizePositiveInteger(
      routeConcurrency,
      DEFAULT_ROUTE_CONCURRENCY
    );
    const normalizedRouteCandidateLimit = normalizePositiveInteger(
      routeCandidateLimit,
      DEFAULT_ROUTE_CANDIDATE_LIMIT
    );
    const baseRouteLimit =
      normalizedDesiredFoods.length > 0
        ? Math.max(normalizedRouteCandidateLimit, 20)
        : normalizedRouteCandidateLimit;
    const effectiveRouteLimit = fastMode
      ? Math.min(baseRouteLimit, BET_ROUTE_CANDIDATE_LIMIT_FAST)
      : baseRouteLimit;
    const activeRouteConcurrency = fastMode
      ? BET_ROUTE_CONCURRENCY_FAST
      : normalizedRouteConcurrency;
    const hasFoodIntent =
      normalizedDesiredFoods.length > 0 || normalizedSearchKeywords.length > 0;
    const routingPoolLimit = hasFoodIntent
      ? 25
      : DEFAULT_NEARBY_CANDIDATE_WINDOW;
    const candidateWindowLimit = Math.min(routingPoolLimit, effectiveRouteLimit);

    try {
      validateTimeBudget(totalTimeMinutes);
    } catch (error) {
      const resolved = resolveTotalTimeMinutesHeuristic(totalTimeMinutes, userQuery);
      totalTimeMinutes = resolved.value;
      slots.totalTimeMinutes = totalTimeMinutes;
      try {
        validateTimeBudget(totalTimeMinutes);
      } catch {
        return createErrorResult(
          error.code || ErrorCodes.INVALID_TOTAL_TIME,
          error.message,
          {
            searchRadiusMeters: getSearchRadius(mode, transportMode, totalTimeMinutes),
            requestedTopN: normalizedTopN,
            routeConcurrency: normalizedRouteConcurrency,
            routeCandidateLimit: normalizedRouteCandidateLimit,
            candidateWindowLimit,
            rawCandidateCount: 0,
            routedCandidateCount: 0,
            routeFailureCount: 0
          }
        );
      }
    }

    const searchRadius = getSearchRadius(mode, transportMode, totalTimeMinutes);
    const metadata = {
      searchRadiusMeters: searchRadius,
      requestedTopN: normalizedTopN,
      routeConcurrency: normalizedRouteConcurrency,
      routeCandidateLimit: normalizedRouteCandidateLimit,
      candidateWindowLimit,
      rawCandidateCount: 0,
      routedCandidateCount: 0,
      routeFailureCount: 0
    };

    this.dependencies.logger.info('Bet search started', {
      event: 'bet_search_started',
      agent: 'bet',
      mode,
      transportMode,
      searchRadiusMeters: searchRadius,
      requestedTopN: normalizedTopN,
      routeConcurrency: normalizedRouteConcurrency
    });

    if (sessionId) {
      setSessionProgress(sessionId, {
        phase: 'bet_search',
        message: '네이버에서 근처 식당 검색 중',
        detail: formatSearchContextDetail({
          desiredFoods: normalizedDesiredFoods,
          searchKeywords: normalizedSearchKeywords,
          transportMode,
          searchRadiusMeters: searchRadius
        }),
        meta: {
          후보창: `${candidateWindowLimit}곳`,
          모드: mode === 'travel' ? '출장/여행' : '현재 위치'
        }
      });
    }

    let nearbyCandidates;
    try {
      nearbyCandidates = await this.dependencies.searchNearbyCandidates(
        location.lat,
        location.lng,
        searchRadius,
        {
          desiredFoods: normalizedDesiredFoods,
          searchKeywords: normalizedSearchKeywords,
          venuePreference: venuePreference || 'restaurant'
        }
      );
    } catch (error) {
      this.dependencies.logger.error(
        'Bet nearby candidate search failed',
        error,
        {
          location,
          searchRadiusMeters: searchRadius
        }
      );

      return createErrorResult(
        isProviderQuotaError(error)
          ? ErrorCodes.PROVIDER_QUOTA
          : ErrorCodes.PROVIDER_ERROR,
        '식당 검색에 실패했습니다.',
        metadata
      );
    }

    const normalizedCandidates = Array.isArray(nearbyCandidates)
      ? nearbyCandidates
      : [];
    const candidatesForRouting = selectCandidatesForRouting(
      normalizedCandidates,
      {
        desiredFoods: normalizedDesiredFoods,
        searchKeywords: normalizedSearchKeywords,
        venuePreference: venuePreference || 'restaurant',
        venueIntentExplicit
      },
      candidateWindowLimit
    );
    const searchMetadata = {
      ...metadata,
      rawCandidateCount: normalizedCandidates.length,
      candidateCountForRouting: candidatesForRouting.length
    };

    this.dependencies.logger.info('Bet nearby candidates fetched', {
      event: 'bet_candidates_fetched',
      agent: 'bet',
      ...searchMetadata
    });

    if (candidatesForRouting.length === 0) {
      return createErrorResult(
        ErrorCodes.NO_RESULTS,
        '조건에 맞는 식당을 찾지 못했습니다.',
        searchMetadata
      );
    }

    if (sessionId) {
      setSessionProgress(sessionId, {
        phase: 'bet_search_done',
        message: `식당 ${normalizedCandidates.length}곳 발견`,
        detail: `경로 계산 대상 ${candidatesForRouting.length}곳 · 검색 ${normalizedSearchKeywords.slice(0, 5).join(', ') || '주변 식당'}`
      });
      setSessionProgress(sessionId, {
        phase: 'bet_routes',
        message: '이동 경로 계산 중',
        detail: `${candidatesForRouting.length}곳 · ${transportMode === 'walk' ? '도보' : '차량'} · 동시 ${activeRouteConcurrency}건`
      });
    }

    const getRoute =
      transportMode === 'walk'
        ? this.dependencies.getWalkingRoute
        : this.dependencies.getDrivingRoute;

    const routedCandidates = [];
    let routeFailureCount = 0;

    const routeResults = await mapWithConcurrencyLimit(
      candidatesForRouting,
      activeRouteConcurrency,
      async (candidate) => {
        logAgentHop(this.dependencies.logger, {
          fromAgent: 'bet',
          toAgent:
            transportMode === 'walk' ? 'naver-walk-estimate' : 'naver-directions',
          phase: 'route_lookup',
          candidateId: candidate.id,
          candidateName: candidate.name,
          transportMode
        });

        try {
          const route = await getRoute(
            location.lat,
            location.lng,
            candidate.location.lat,
            candidate.location.lng
          );

          return this.dependencies.mergeCandidateWithRoute(
            candidate,
            route,
            transportMode
          );
        } catch (error) {
          routeFailureCount += 1;
          this.dependencies.logger.error('Bet route lookup failed', error, {
            event: 'bet_route_lookup_failed',
            agent: 'bet',
            candidateId: candidate.id,
            candidateName: candidate.name,
            transportMode
          });
          return null;
        }
      }
    );

    for (const candidate of routeResults) {
      if (candidate) {
        routedCandidates.push(candidate);
      }
    }

    const routeMetadata = {
      ...searchMetadata,
      routedCandidateCount: routedCandidates.length,
      routeFailureCount
    };

    this.dependencies.logger.info('Bet route fan-out completed', {
      event: 'bet_route_fanout_completed',
      agent: 'bet',
      ...routeMetadata
    });

    if (routedCandidates.length === 0) {
      return createErrorResult(
        ErrorCodes.ROUTE_UNAVAILABLE,
        '경로 탐색에 실패했습니다.',
        routeMetadata
      );
    }

    if (sessionId) {
      setSessionProgress(sessionId, {
        phase: 'bet_routes_done',
        message: '이동 경로 계산 완료',
        detail: `${routedCandidates.length}곳 성공${routeFailureCount > 0 ? ` · ${routeFailureCount}곳 실패` : ''}`,
        meta: {
          총소요: `${totalTimeMinutes}분 예산`
        }
      });
    }

    let reviewedCandidates = routedCandidates;

    if (fastMode) {
      const quickRanked = this.dependencies.rankCandidates(
        routedCandidates,
        { ...slots, totalTimeMinutes },
        now,
        Math.max(normalizedTopN, BET_REVIEW_ENRICH_LIMIT_FAST),
        { dislikedProfiles }
      );
      const enrichTargets =
        quickRanked.length > 0
          ? quickRanked
          : routedCandidates.slice(0, BET_REVIEW_ENRICH_LIMIT_FAST);

      if (sessionId) {
        setSessionProgress(sessionId, {
          phase: 'bet_reviews',
          message: '상위 후보만 빠르게 분석 중',
          detail: `${enrichTargets.length}곳 · 리뷰·평점 추출`,
          meta: {
            방식: '빠른 모드'
          }
        });
      }

      const enrichedTargets =
        await this.dependencies.enrichTopCandidatesWithReviewsFast(
          enrichTargets,
          {
            limit: enrichTargets.length,
            timeoutMs: BET_REVIEW_TIMEOUT_MS_FAST
          }
        );
      const enrichedIds = new Set(enrichedTargets.map((candidate) => candidate.id));
      reviewedCandidates = [
        ...enrichedTargets,
        ...routedCandidates.filter((candidate) => !enrichedIds.has(candidate.id))
      ];
    } else {
      if (sessionId) {
        setSessionProgress(sessionId, {
          phase: 'bet_reviews',
          message: '리뷰 수집·분석 중',
          detail: `${routedCandidates.length}곳 · 네이버 리뷰 수집`
        });
      }

      reviewedCandidates = await this.dependencies.enrichCandidatesWithReviews(
        routedCandidates,
        {
          concurrency: DEFAULT_REVIEW_CONCURRENCY
        }
      );

      if (sessionId) {
        setSessionProgress(sessionId, {
          phase: 'bet_reviews_done',
          message: '리뷰 분석 완료',
          detail: `${reviewedCandidates.filter((candidate) => (candidate.reviews || []).length > 0).length}곳 리뷰 확보 · 평균 ${Math.round(
            reviewedCandidates.reduce((sum, candidate) => sum + (candidate.reviews?.length || 0), 0) /
              Math.max(reviewedCandidates.length, 1)
          )}건/곳`
        });
        setSessionProgress(sessionId, {
          phase: 'bet_llm_score',
          message: 'AI가 취향·리뷰 적합도 분석 중',
          detail: `${reviewedCandidates.length}곳 · 음식 취향·리뷰 키워드 매칭`
        });
      }

      const llmScoreMap = await this.dependencies.scoreCandidatesWithLLM(
        reviewedCandidates,
        {
          userQuery,
          desiredFoods: normalizedDesiredFoods,
          foodPreferenceScores: resolvedFoodScores,
          partyContext: slots.partyContext,
          vibe: slots.vibe,
          budgetPerPersonKrw: slots.budgetPerPersonKrw,
          totalTimeMinutes,
          transportMode: slots.transportMode
        }
      );
      reviewedCandidates = applyLLMScoresToCandidates(
        reviewedCandidates,
        llmScoreMap
      );
    }

    if (sessionId && fastMode) {
      setSessionProgress(sessionId, {
        phase: 'bet_reviews_done',
        message: '빠른 분석 완료',
        detail: `${reviewedCandidates.filter((candidate) => (candidate.reviews || []).length > 0).length}곳 리뷰 확보`
      });
    }

    const scoredCandidates = reviewedCandidates;

    if (sessionId) {
      setSessionProgress(sessionId, {
        phase: 'bet_rank',
        message: '조건 기반 순위 산정 중',
        detail: `총 소요 ${totalTimeMinutes}분 · 이동 ${formatTransportLabel(transportMode) || transportMode} · 예산·분위기·음식 가중치 반영`
      });
    }

    let rankedCandidates;
    try {
      rankedCandidates = this.dependencies.rankCandidates(
        scoredCandidates,
        { ...slots, totalTimeMinutes },
        now,
        normalizedTopN,
        { dislikedProfiles }
      );
    } catch (error) {
      if (
        error instanceof RankingValidationError ||
        error.code === ErrorCodes.INVALID_TOTAL_TIME
      ) {
        return createErrorResult(
          error.code || ErrorCodes.INVALID_TOTAL_TIME,
          error.message,
          routeMetadata
        );
      }

      throw error;
    }

    if (rankedCandidates.length === 0) {
      return createErrorResult(
        ErrorCodes.NO_RESULTS,
        '조건에 맞는 식당을 찾지 못했습니다.',
        routeMetadata
      );
    }

    const excludedIds = new Set(
      Array.isArray(excludeCandidateIds) ? excludeCandidateIds : []
    );
    if (excludedIds.size > 0) {
      rankedCandidates = rankedCandidates.filter(
        (candidate) => !excludedIds.has(candidate.id)
      );
    }

    if (rankedCandidates.length === 0) {
      return createErrorResult(
        ErrorCodes.NO_RESULTS,
        '싫어요한 식당을 제외하면 추천할 곳이 없습니다.',
        routeMetadata
      );
    }

    this.dependencies.logger.info('Bet ranking completed', {
      event: 'bet_ranking_completed',
      agent: 'bet',
      ...routeMetadata,
      eligibleCount: rankedCandidates.length
    });

    if (sessionId) {
      setSessionProgress(sessionId, {
        phase: 'bet_rank_done',
        message: '식당 선별 완료',
        detail: `${rankedCandidates.length}곳 추천 후보`,
        meta: {
          상위: rankedCandidates
            .slice(0, 3)
            .map((candidate) => candidate.name)
            .join(', ')
        }
      });
    }

    return {
      status: 'results',
      eligibleCount: rankedCandidates.length,
      results: rankedCandidates,
      metadata: {
        ...routeMetadata,
        eligibleCount: rankedCandidates.length
      }
    };
  }
}

export const bet = new BetAgent();

export {
  defaultRankCandidates as rankBetCandidates,
  validateTimeBudget as validateBetTimeBudget,
  RankingValidationError
};

export default bet;
