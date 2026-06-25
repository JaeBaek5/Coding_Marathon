import { ErrorCodes } from '../../../../shared/contracts/schemas.js';
import {
  searchNearbyCandidates as defaultSearchNearbyCandidates,
  getWalkingRoute as defaultGetWalkingRoute,
  getDrivingRoute as defaultGetDrivingRoute,
  mergeCandidateWithRoute as defaultMergeCandidateWithRoute
} from '../../adapters/index.js';
import { deduplicateCandidates } from '../../utils/dedupe.js';
import {
  rankCandidates as defaultRankCandidates,
  validateTimeBudget,
  RankingValidationError
} from '../../services/ranking.js';
import { logger as defaultLogger, logAgentHop } from '../../utils/logger.js';

export const DEFAULT_TOP_N = 5;
export const DEFAULT_NEARBY_CANDIDATE_WINDOW = 20;
export const DEFAULT_ROUTE_CONCURRENCY = 4;
export const DEFAULT_ROUTE_CANDIDATE_LIMIT = 15;
export const DEFAULT_MIN_CANDIDATE_TARGET = 7;
export const DEFAULT_CANDIDATE_RADIUS_MULTIPLIERS = [2, 3];

const defaultDependencies = {
  searchNearbyCandidates: defaultSearchNearbyCandidates,
  getWalkingRoute: defaultGetWalkingRoute,
  getDrivingRoute: defaultGetDrivingRoute,
  mergeCandidateWithRoute: defaultMergeCandidateWithRoute,
  rankCandidates: defaultRankCandidates,
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

function calculateRadius(baseRadius, multiplier) {
  return Math.round(baseRadius * multiplier);
}

async function collectCandidatesWithExpandedRadius({
  searchNearbyCandidates,
  lat,
  lng,
  baseRadius,
  minCandidateTarget,
  multipliers,
  slots
}) {
  const attemptedSearches = [];
  const accumulatedCandidates = [];
  const seenCandidateIds = new Set();
  let multiplier = 1;
  let attempt = 0;
  const maxAttempts = 6;

  while (
    accumulatedCandidates.length < minCandidateTarget &&
    attempt < maxAttempts
  ) {
    const searchRadius = calculateRadius(baseRadius, multiplier);
    const candidates = await searchNearbyCandidates(
      lat,
      lng,
      searchRadius,
      slots
    );
    const normalizedCandidates = Array.isArray(candidates) ? candidates : [];

    attemptedSearches.push({
      attempt,
      multiplier,
      searchRadius,
      candidateCount: normalizedCandidates.length
    });

    for (const candidate of normalizedCandidates) {
      if (candidate?.id && !seenCandidateIds.has(candidate.id)) {
        seenCandidateIds.add(candidate.id);
        accumulatedCandidates.push(candidate);
      }
    }

    const expandFactor =
      multipliers[attempt] ?? multipliers[multipliers.length - 1] ?? 3;
    multiplier = attempt === 0 ? expandFactor : multiplier * expandFactor;
    attempt += 1;
  }

  return {
    candidates: accumulatedCandidates,
    attemptedSearches
  };
}

export function getSearchRadius(mode, transportMode) {
  if (mode === 'normal') {
    return transportMode === 'walk' ? 1000 : 5000;
  }

  return transportMode === 'walk' ? 2000 : 10000;
}

export async function mapWithConcurrencyLimit(items, limit, mapper) {
  if (items.length === 0) {
    return [];
  }

  const normalizedLimit = Math.min(
    items.length,
    normalizePositiveInteger(limit, DEFAULT_ROUTE_CONCURRENCY)
  );
  const results = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: normalizedLimit }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

export class BetAgent {
  constructor(dependencies = {}) {
    this.dependencies = {
      ...defaultDependencies,
      ...dependencies
    };
  }

  appendTrace(trace, event) {
    if (typeof trace !== 'function') {
      return;
    }
    trace({
      ...event,
      agent: 'bet',
      fromAgent: event.fromAgent || 'bet',
      toAgent: event.toAgent || 'bet',
      timestamp: new Date().toISOString()
    });
  }

  async search(slots, options = {}) {
    const {
      now = null,
      topN = DEFAULT_TOP_N,
      routeConcurrency = DEFAULT_ROUTE_CONCURRENCY,
      routeCandidateLimit = DEFAULT_ROUTE_CANDIDATE_LIMIT,
      trace = null
    } = options;
    const { mode, transportMode, location, totalTimeMinutes } = slots;
    const searchRadius = getSearchRadius(mode, transportMode);
    const normalizedTopN = normalizePositiveInteger(topN, DEFAULT_TOP_N);
    const normalizedRouteConcurrency = normalizePositiveInteger(
      routeConcurrency,
      DEFAULT_ROUTE_CONCURRENCY
    );
    const normalizedRouteCandidateLimit = normalizePositiveInteger(
      routeCandidateLimit,
      DEFAULT_ROUTE_CANDIDATE_LIMIT
    );
    const candidateWindowLimit = Math.min(
      DEFAULT_NEARBY_CANDIDATE_WINDOW,
      normalizedRouteCandidateLimit
    );
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

    try {
      validateTimeBudget(totalTimeMinutes);
    } catch (error) {
      return createErrorResult(
        error.code || ErrorCodes.INVALID_TOTAL_TIME,
        error.message,
        metadata
      );
    }

    this.dependencies.logger.info('Bet search started', {
      event: 'bet_search_started',
      agent: 'bet',
      mode,
      transportMode,
      searchRadiusMeters: searchRadius,
      requestedTopN: normalizedTopN,
      routeConcurrency: normalizedRouteConcurrency
    });
    this.appendTrace(trace, {
      event: 'bet_search_started',
      phase: 'start',
      mode,
      transportMode,
      searchRadiusMeters: searchRadius,
      requestedTopN: normalizedTopN,
      routeConcurrency: normalizedRouteConcurrency,
      routeCandidateLimit: normalizedRouteCandidateLimit
    });

    let nearbyCandidates;
    let attemptedSearches = [];
    try {
      const searchResult = await collectCandidatesWithExpandedRadius({
        searchNearbyCandidates: this.dependencies.searchNearbyCandidates,
        slots,
        lat: location.lat,
        lng: location.lng,
        baseRadius: searchRadius,
        minCandidateTarget: DEFAULT_MIN_CANDIDATE_TARGET,
        multipliers: DEFAULT_CANDIDATE_RADIUS_MULTIPLIERS
      });
      nearbyCandidates = searchResult.candidates;
      attemptedSearches = searchResult.attemptedSearches;
    } catch (error) {
      this.dependencies.logger.error(
        'Bet nearby candidate search failed',
        error,
        {
          location,
          searchRadiusMeters: searchRadius
        }
      );
      this.appendTrace(trace, {
        event: 'bet_candidates_failed',
        phase: 'provider_query',
        message: error.message
      });

      return createErrorResult(
        isProviderQuotaError(error)
          ? ErrorCodes.PROVIDER_QUOTA
          : ErrorCodes.PROVIDER_ERROR,
        '?앸떦 寃?됱뿉 ?ㅽ뙣?덉뒿?덈떎.',
        metadata
      );
    }

    const normalizedCandidates = Array.isArray(nearbyCandidates)
      ? nearbyCandidates
      : [];
    const candidatesForRouting = normalizedCandidates.slice(
      0,
      candidateWindowLimit
    );
    const searchMetadata = {
      ...metadata,
      rawCandidateCount: normalizedCandidates.length,
      candidateCountForRouting: candidatesForRouting.length,
      searchAttemptCount: attemptedSearches.length,
      searchAttempts: attemptedSearches
    };

    if (attemptedSearches.length > 1) {
      this.appendTrace(trace, {
        event: 'bet_search_radius_expanded',
        phase: 'candidate_search',
        attempts: attemptedSearches
      });
      this.dependencies.logger.info('Bet search radius expanded', {
        event: 'bet_search_radius_expanded',
        agent: 'bet',
        searchAttempts: attemptedSearches
      });
    }

    this.dependencies.logger.info('Bet nearby candidates fetched', {
      event: 'bet_candidates_fetched',
      agent: 'bet',
      ...searchMetadata
    });
    this.appendTrace(trace, {
      event: 'bet_candidates_fetched',
      phase: 'candidate_search',
      rawCandidateCount: searchMetadata.rawCandidateCount,
      candidateCountForRouting: searchMetadata.candidateCountForRouting
    });

    if (candidatesForRouting.length === 0) {
      return createErrorResult(
        ErrorCodes.NO_RESULTS,
        '議곌굔??留욌뒗 ?앸떦??李얠? 紐삵뻽?듬땲??',
        searchMetadata
      );
    }

    const getRoute =
      transportMode === 'walk'
        ? this.dependencies.getWalkingRoute
        : this.dependencies.getDrivingRoute;

    const routedCandidates = [];
    let routeFailureCount = 0;
    const routeLookupSummary = {
      candidatesForLookup: candidatesForRouting.length,
      succeeded: 0,
      failed: 0,
      topSuccessCandidateIds: [],
      topFailedCandidateIds: []
    };
    this.appendTrace(trace, {
      event: 'bet_route_lookup_started',
      phase: 'route_lookup',
      candidateCount: routeLookupSummary.candidatesForLookup,
      transportMode
    });

    const routeResults = await mapWithConcurrencyLimit(
      candidatesForRouting,
      normalizedRouteConcurrency,
      async (candidate) => {
        logAgentHop(this.dependencies.logger, {
          fromAgent: 'bet',
          toAgent:
            transportMode === 'walk' ? 'walking-route' : 'naver-directions',
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

          routeLookupSummary.succeeded += 1;
          if (routeLookupSummary.topSuccessCandidateIds.length < 3) {
            routeLookupSummary.topSuccessCandidateIds.push(candidate.id);
          }

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
          routeLookupSummary.failed += 1;
          if (routeLookupSummary.topFailedCandidateIds.length < 3) {
            routeLookupSummary.topFailedCandidateIds.push(candidate.id);
          }
          return null;
        }
      }
    );

    for (const candidate of routeResults) {
      if (candidate) {
        routedCandidates.push(candidate);
      }
    }

    const dedupedRoutedCandidates = deduplicateCandidates(routedCandidates);

    const routeMetadata = {
      ...searchMetadata,
      routedCandidateCount: routedCandidates.length,
      dedupedRoutedCandidateCount: dedupedRoutedCandidates.length,
      routeFailureCount
    };

    this.dependencies.logger.info('Bet route fan-out completed', {
      event: 'bet_route_fanout_completed',
      agent: 'bet',
      ...routeMetadata
    });
    this.appendTrace(trace, {
      event: 'bet_route_fanout_completed',
      phase: 'route_lookup',
      routedCandidateCount: routeMetadata.routedCandidateCount,
      routeFailureCount
    });
    this.appendTrace(trace, {
      event: 'bet_route_lookup_fanout',
      phase: 'route_lookup',
      candidateCount: routeLookupSummary.candidatesForLookup,
      succeeded: routeLookupSummary.succeeded,
      failed: routeLookupSummary.failed,
      topSuccessCandidateIds: routeLookupSummary.topSuccessCandidateIds,
      topFailedCandidateIds: routeLookupSummary.topFailedCandidateIds
    });

    if (routedCandidates.length === 0) {
      return createErrorResult(
        ErrorCodes.ROUTE_UNAVAILABLE,
        '寃쎈줈 ?먯깋???ㅽ뙣?덉뒿?덈떎.',
        routeMetadata
      );
    }

    let rankedCandidates;
    try {
      rankedCandidates = this.dependencies.rankCandidates(
        dedupedRoutedCandidates,
        slots,
        now,
        normalizedTopN
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
        '議곌굔??留욌뒗 ?앸떦??李얠? 紐삵뻽?듬땲??',
        routeMetadata
      );
    }

    this.dependencies.logger.info('Bet ranking completed', {
      event: 'bet_ranking_completed',
      agent: 'bet',
      ...routeMetadata,
      eligibleCount: rankedCandidates.length
    });
    this.appendTrace(trace, {
      event: 'bet_ranking_completed',
      phase: 'ranking',
      candidateCount: routedCandidates.length,
      eligibleCount: rankedCandidates.length,
      topIds: rankedCandidates.slice(0, normalizedTopN).map((item) => item.id),
      topScoreBreakdowns: rankedCandidates
        .slice(0, normalizedTopN)
        .map((item) => ({
          id: item.id,
          scoreTotal: item.scoreTotal,
          scoreBreakdown: item.scoreBreakdown
        }))
    });

    return {
      status: 'results',
      eligibleCount: rankedCandidates.length,
      results: rankedCandidates,
      metadata: {
        ...routeMetadata,
        eligibleCount: rankedCandidates.length,
        decisionEvidence: {
          rawCandidateCount: routeMetadata.rawCandidateCount,
          candidateWindowLimit,
          routedCandidateCount: routeMetadata.routedCandidateCount,
          routeFailureCount: routeMetadata.routeFailureCount,
          topN: normalizedTopN,
          topCandidateIds: rankedCandidates
            .slice(0, normalizedTopN)
            .map((candidate) => candidate.id)
        }
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
