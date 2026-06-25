import {
  ErrorCodes,
  TOTAL_TIME_MIN_MINUTES,
  totalTimeOutOfRangeMessage
} from '../../../shared/contracts/schemas.js';
import { isVenueAllowed, scoreVenueIntentFit } from '../utils/venueGating.js';
import { scoreFoodPreference, deriveFoodPreferenceScores } from '../utils/foodPreference.js';
import { scoreCandidateReviews } from './reviewScoring.js';
import { computeDislikeSimilarityPenalty } from './dislikeSimilarity.js';

export class RankingValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'RankingValidationError';
    this.code = code;
  }
}

/**
 * Validates that the totalTimeMinutes budget is within the supported range.
 * @param {number} totalTimeMinutes
 */
export function validateTimeBudget(totalTimeMinutes) {
  if (
    typeof totalTimeMinutes !== 'number' ||
    !Number.isFinite(totalTimeMinutes) ||
    totalTimeMinutes < TOTAL_TIME_MIN_MINUTES
  ) {
    throw new RankingValidationError(
      totalTimeOutOfRangeMessage(),
      ErrorCodes.INVALID_TOTAL_TIME
    );
  }
}

export const DEFAULT_MEAL_MINUTES = 30;

/**
 * Round-trip travel plus meal time, capped by the user's total time budget.
 * Meal time defaults to 30 minutes but shrinks when the budget is tight.
 */
export function computeTotalExpectedMinutes(
  oneWayRouteMinutes,
  totalTimeMinutes
) {
  const roundTripMinutes = oneWayRouteMinutes * 2;
  const mealMinutes = Math.min(
    DEFAULT_MEAL_MINUTES,
    Math.max(0, totalTimeMinutes - roundTripMinutes)
  );
  return roundTripMinutes + mealMinutes;
}

export function isWithinTimeBudget(oneWayRouteMinutes, totalTimeMinutes) {
  return oneWayRouteMinutes * 2 <= totalTimeMinutes;
}

const HARD_EXCLUSION_PENALTY = 35;
const VENUE_MISMATCH_PENALTY = 12;
const CLOSED_HOURS_PENALTY = 10;

/** Within travel-time budget, food + reviews dominate; distance/time are tie-breakers. */
export const RANKING_WEIGHTS = {
  TIME_FIT_MAX: 10,
  TIME_FIT_IN_RANGE_BASE: 8,
  TIME_FIT_TIE_BREAKER_MAX: 2,
  DISTANCE_FIT_MAX: 5
};

/**
 * Time score: flat bonus when the round trip fits the budget, small gradient as tie-breaker.
 * Out-of-budget candidates get 0 — they remain rankable but sink below in-range matches.
 */
export function computeTimeFit(
  withinTimeBudget,
  totalExpectedMinutes,
  totalTimeMinutes
) {
  if (!withinTimeBudget) {
    return 0;
  }

  const { TIME_FIT_MAX, TIME_FIT_IN_RANGE_BASE, TIME_FIT_TIE_BREAKER_MAX } =
    RANKING_WEIGHTS;

  if (totalTimeMinutes <= TOTAL_TIME_MIN_MINUTES) {
    return TIME_FIT_MAX;
  }

  const slack = totalTimeMinutes - totalExpectedMinutes;
  const range = totalTimeMinutes - TOTAL_TIME_MIN_MINUTES;
  const tieBreaker =
    range > 0
      ? Math.min(TIME_FIT_TIE_BREAKER_MAX, (TIME_FIT_TIE_BREAKER_MAX * slack) / range)
      : 0;

  return Math.min(TIME_FIT_MAX, TIME_FIT_IN_RANGE_BASE + tieBreaker);
}

export function computeDistanceFit(distanceMeters, transportMode) {
  const maxDistance = transportMode === 'walk' ? 2000 : 10000;
  return Math.max(
    0,
    RANKING_WEIGHTS.DISTANCE_FIT_MAX *
      (1 - (distanceMeters || 0) / maxDistance)
  );
}

function foodReviewSortScore(candidate) {
  const components = candidate.scoreComponents || {};
  return (
    (components.foodPreferenceFit || 0) +
    (components.reviewFit || 0) -
    (components.foodMismatchPenalty || 0) -
    (components.reviewMismatchPenalty || 0)
  );
}

const ContextKeywords = {
  party: {
    상사: ['한식', '일식', '정식', '깔끔', '조용한', '룸', '대접', '국밥'],
    부모님: ['한식', '건강', '정식', '조용한', '전통', '가족', '오리', '백숙'],
    아이: ['돈까스', '파스타', '피자', '달콤', '가족', '놀이방', '짜장면'],
    친구: [
      '삼겹살',
      '치킨',
      '피자',
      '맥주',
      '왁자지껄',
      '포차',
      '가성비',
      '곱창'
    ],
    연인: [
      '파스타',
      '이탈리안',
      '양식',
      '와인',
      '조용한',
      '분위기',
      '감성',
      '데이트'
    ],
    혼밥: ['라멘', '국밥', '1인', '바테이블', '가성비', '패스트푸드', '김밥']
  },
  job: {
    IT: ['개발자', '커피', '가성비', '빠른', '국밥', '샌드위치', '라멘'],
    영업: ['대접', '룸', '조용한', '일식', '한정식', '고급', '고기집'],
    금융: ['깔끔', '정식', '초밥', '고급', '양식', '조용한']
  }
};

const CAFE_CATEGORIES = ['카페', '커피숍', '디저트카페', '테이크아웃커피'];
const BAR_CATEGORIES = ['술집', '호프', '호프/요리주점', '요리주점', '와인바', '칵테일바', '펍'];

function isCafeCategory(category) {
  const lower = (category || '').toLowerCase();
  return CAFE_CATEGORIES.some((c) => lower.includes(c.toLowerCase()));
}

function isBarCategory(category) {
  const lower = (category || '').toLowerCase();
  return BAR_CATEGORIES.some((b) => lower.includes(b.toLowerCase()));
}

const VibeKeywords = {
  casual: ['캐주얼', '편안한', '분식', '김밥', '포차', '가성비', '가벼운'],
  조용한: ['조용한', '룸', '고급', '정식', '찻집', '분위기', '프라이빗'],
  쾌적한: ['쾌적한', '넓은', '깔끔한', '청결', '새로', '오픈', '인테리어'],
  왁자지껄: ['왁자지껄', '시끌벅적', '삼겹살', '포차', '치킨', '호프', '모임'],
  격식있는: ['격식', '코스', '대접', '파인다이닝', '일식집', '한정식', '고급'],
  감성적인: [
    '감성',
    '이탈리안',
    '와인',
    '카페',
    '디저트',
    '데이트',
    '뷰',
    '이쁜'
  ]
};

/**
 * Checks if current time is within service window.
 * @param {string|object} openingHours
 * @param {string} nowStr
 * @returns {boolean}
 */
export function isWithinServiceWindow(openingHours, nowStr) {
  if (!openingHours) return true;

  const date = nowStr ? new Date(nowStr) : new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const hourPart = parts.find((p) => p.type === 'hour')?.value;
  const minutePart = parts.find((p) => p.type === 'minute')?.value;
  if (!hourPart || !minutePart) return true;

  const currentMinutes = parseInt(hourPart, 10) * 60 + parseInt(minutePart, 10);

  if (typeof openingHours === 'string') {
    const match = openingHours.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
    if (match) {
      const startMinutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      const endMinutes = parseInt(match[3], 10) * 60 + parseInt(match[4], 10);
      return isTimeInWindow(currentMinutes, startMinutes, endMinutes);
    }
  }

  if (typeof openingHours === 'object') {
    const open = openingHours.open || openingHours.start;
    const close = openingHours.close || openingHours.end;
    if (open && close) {
      const openParts = open.split(':');
      const closeParts = close.split(':');
      if (openParts.length === 2 && closeParts.length === 2) {
        const startMinutes =
          parseInt(openParts[0], 10) * 60 + parseInt(openParts[1], 10);
        const endMinutes =
          parseInt(closeParts[0], 10) * 60 + parseInt(closeParts[1], 10);
        return isTimeInWindow(currentMinutes, startMinutes, endMinutes);
      }
    }
  }

  return true;
}

function isTimeInWindow(current, start, end) {
  if (start <= end) {
    return current >= start && current <= end;
  } else {
    return current >= start || current <= end;
  }
}

function getCandidatePrice(candidate) {
  if (
    candidate.pricePerPersonKrw !== undefined &&
    candidate.pricePerPersonKrw !== null
  ) {
    return candidate.pricePerPersonKrw;
  }
  if (candidate.priceLevel !== undefined && candidate.priceLevel !== null) {
    return candidate.priceLevel * 10000;
  }
  return null;
}

/**
 * Ranks candidates deterministically.
 * @param {Array} candidates
 * @param {Object} slot
 * @param {string} nowStr
 * @returns {Array} Up to 5 ranked candidates
 */
export function rankCandidates(candidates, slot, nowStr, topN = 5, options = {}) {
  const {
    totalTimeMinutes,
    transportMode,
    excludedFoods = [],
    partyContext,
    vibe,
    budgetPerPersonKrw,
    jobContext,
    desiredFoods = [],
    foodPreferenceScores = []
  } = slot;
  const resolvedFoodScores = deriveFoodPreferenceScores({
    desiredFoods,
    excludedFoods,
    foodPreferenceScores
  });
  const dislikedProfiles = options.dislikedProfiles || [];

  validateTimeBudget(totalTimeMinutes);

  // 1. Determine if budget data is universally missing
  const allPrices = candidates.map(getCandidatePrice);
  const universallyMissingBudget = allPrices.every((p) => p === null);

  // 2. Score every candidate with a valid route (no hard exclusion)
  const scoredPool = [];

  for (const candidate of candidates) {
    const hasRoute =
      candidate.oneWayRouteMinutes !== undefined &&
      candidate.oneWayRouteMinutes !== null &&
      candidate.oneWayRouteMinutes >= 0;

    if (!hasRoute) {
      continue;
    }

    const withinTimeBudget = isWithinTimeBudget(
      candidate.oneWayRouteMinutes,
      totalTimeMinutes
    );
    const totalExpectedMinutes = withinTimeBudget
      ? computeTotalExpectedMinutes(
          candidate.oneWayRouteMinutes,
          totalTimeMinutes
        )
      : candidate.oneWayRouteMinutes * 2 + DEFAULT_MEAL_MINUTES;

    let isHardExcluded = false;
    let isUncertainFuzzyExcluded = false;

    if (excludedFoods && excludedFoods.length > 0) {
      const nameLower = (candidate.name || '').toLowerCase();
      const catLower = (candidate.category || '').toLowerCase();
      const nameTokens = nameLower.split(/[\s,/_().-]+/);
      const catTokens = catLower.split(/[\s,/_().-]+/);
      const allTokens = [...nameTokens, ...catTokens];

      for (const excludedFood of excludedFoods) {
        const normExcluded = excludedFood.toLowerCase();
        if (!normExcluded) continue;

        const exactTokenMatch = allTokens.includes(normExcluded);
        const exactFieldMatch =
          nameLower === normExcluded || catLower === normExcluded;

        if (exactTokenMatch || exactFieldMatch) {
          isHardExcluded = true;
          break;
        }

        if (
          nameLower.includes(normExcluded) ||
          catLower.includes(normExcluded)
        ) {
          isUncertainFuzzyExcluded = true;
        }
      }
    }

    const venueAllowed = isVenueAllowed(candidate, slot);

    let isOpen = true;
    if (
      candidate.openingHours !== null &&
      candidate.openingHours !== undefined
    ) {
      isOpen = isWithinServiceWindow(candidate.openingHours, nowStr);
    }

    const price = getCandidatePrice(candidate);

    scoredPool.push({
      candidate,
      totalExpectedMinutes,
      withinTimeBudget,
      isHardExcluded,
      isUncertainFuzzyExcluded,
      venueAllowed,
      isOpen,
      price
    });
  }

  const scoredCandidates = scoredPool.map(
    ({
      candidate,
      totalExpectedMinutes,
      withinTimeBudget,
      isHardExcluded,
      isUncertainFuzzyExcluded,
      venueAllowed,
      isOpen,
      price
    }) => {
      // timeFit — in-range gate + small tie-breaker (not a primary rank driver)
      const timeFit = computeTimeFit(
        withinTimeBudget,
        totalExpectedMinutes,
        totalTimeMinutes
      );

      // distanceFit — lowest priority among soft scores
      const distanceFit = computeDistanceFit(
        candidate.distanceMeters,
        transportMode
      );

      // contextFit (15 points)
      const contextKws = new Set();
      if (partyContext && ContextKeywords.party[partyContext]) {
        ContextKeywords.party[partyContext].forEach((k) => {
          contextKws.add(k);
        });
      } else if (partyContext) {
        partyContext.split(/\s+/).forEach((w) => {
          if (w.length > 1) {
            contextKws.add(w);
          }
        });
      }
      if (jobContext && ContextKeywords.job[jobContext]) {
        ContextKeywords.job[jobContext].forEach((k) => {
          contextKws.add(k);
        });
      } else if (jobContext) {
        jobContext.split(/\s+/).forEach((w) => {
          if (w.length > 1) {
            contextKws.add(w);
          }
        });
      }

      let contextMatches = 0;
      for (const kw of contextKws) {
        if (
          (candidate.name || '').toLowerCase().includes(kw.toLowerCase()) ||
          (candidate.category || '').toLowerCase().includes(kw.toLowerCase())
        ) {
          contextMatches++;
        }
      }
      const contextFit =
        contextMatches === 0 ? 0 : contextMatches === 1 ? 8 : 15;

      // vibeFit (10 points)
      const vibeKws = new Set();
      if (vibe && VibeKeywords[vibe]) {
        VibeKeywords[vibe].forEach((k) => {
          vibeKws.add(k);
        });
      } else if (vibe) {
        vibe.split(/\s+/).forEach((w) => {
          if (w.length > 1) {
            vibeKws.add(w);
          }
        });
      }

      let vibeMatches = 0;
      for (const kw of vibeKws) {
        if (
          (candidate.name || '').toLowerCase().includes(kw.toLowerCase()) ||
          (candidate.category || '').toLowerCase().includes(kw.toLowerCase())
        ) {
          vibeMatches++;
        }
      }
      const vibeFit = vibeMatches === 0 ? 0 : vibeMatches === 1 ? 6 : 10;

      // budgetFit (10 points)
      let budgetFit = 4;
      if (price !== null) {
        if (price <= budgetPerPersonKrw) {
          budgetFit = 10;
        } else {
          budgetFit = 0;
        }
      }

      // metadataConfidence (10 points)
      let metadataConfidence = 10;
      if (!candidate.category) metadataConfidence -= 2;
      if (!candidate.address) metadataConfidence -= 2;
      if (!candidate.id) metadataConfidence -= 2;
      metadataConfidence = Math.max(0, metadataConfidence);

      const categorySafety = isUncertainFuzzyExcluded || isHardExcluded ? 0 : 5;

      const { foodPreferenceFit, foodMismatchPenalty } = scoreFoodPreference(
        candidate,
        desiredFoods,
        resolvedFoodScores
      );

      const { venueIntentFit, venueIntentMismatchPenalty } = scoreVenueIntentFit(
        candidate,
        slot
      );

      const {
        reviewFit,
        reviewSentimentFit,
        reviewIntentFit,
        reviewCoverageFit,
        reviewMismatchPenalty
      } = scoreCandidateReviews(candidate, desiredFoods);

      const llmRelevanceFit =
        typeof candidate.llmRelevanceScore === 'number'
          ? Math.max(0, Math.min(30, candidate.llmRelevanceScore * 0.3))
          : 0;
      const llmSentimentFit =
        typeof candidate.llmSentimentScore === 'number'
          ? Math.max(0, Math.min(15, candidate.llmSentimentScore * 0.15))
          : 0;

      const dislikeSimilarityPenalty = computeDislikeSimilarityPenalty(
        candidate,
        dislikedProfiles
      );

      let constraintPenalty = 0;
      if (isHardExcluded) {
        constraintPenalty += HARD_EXCLUSION_PENALTY;
      }
      if (!venueAllowed) {
        constraintPenalty += VENUE_MISMATCH_PENALTY;
      }
      if (!isOpen) {
        constraintPenalty += CLOSED_HOURS_PENALTY;
      }

      const scoreTotal = Number(
        (
          timeFit +
          distanceFit +
          contextFit +
          vibeFit +
          budgetFit +
          metadataConfidence +
          categorySafety +
          foodPreferenceFit +
          venueIntentFit +
          reviewFit +
          llmRelevanceFit +
          llmSentimentFit -
          constraintPenalty -
          foodMismatchPenalty -
          venueIntentMismatchPenalty -
          reviewMismatchPenalty -
          dislikeSimilarityPenalty
        ).toFixed(4)
      );

      // confidence badge derivation
      const confidenceBadge =
        metadataConfidence >= 8
          ? 'high'
          : metadataConfidence >= 5
            ? 'medium'
            : 'low';

      const openStatus =
        candidate.openingHours !== null && candidate.openingHours !== undefined
          ? isOpen
          : candidate.openStatus !== undefined
            ? candidate.openStatus
            : null;

      const scoreComponents = {
        timeFit,
        distanceFit,
        contextFit,
        vibeFit,
        budgetFit,
        metadataConfidence,
        categorySafety,
        foodPreferenceFit,
        venueIntentFit,
        reviewFit,
        reviewSentimentFit,
        reviewIntentFit,
        reviewCoverageFit,
        llmRelevanceFit,
        llmSentimentFit,
        foodMismatchPenalty,
        venueIntentMismatchPenalty,
        reviewMismatchPenalty,
        constraintPenalty,
        dislikeSimilarityPenalty
      };

      return {
        ...candidate,
        totalExpectedMinutes,
        confidenceBadge,
        openStatus,
        scoreTotal,
        metadataConfidence,
        scoreComponents,
        scoreBreakdown: {
          total: scoreTotal,
          components: scoreComponents
        }
      };
    }
  );

  // 4. Deterministic sorting / Tie-breakers
  scoredCandidates.sort((a, b) => {
    if (b.scoreTotal !== a.scoreTotal) {
      return b.scoreTotal - a.scoreTotal;
    }
    const foodReviewDelta = foodReviewSortScore(b) - foodReviewSortScore(a);
    if (foodReviewDelta !== 0) {
      return foodReviewDelta;
    }
    if (a.totalExpectedMinutes !== b.totalExpectedMinutes) {
      return a.totalExpectedMinutes - b.totalExpectedMinutes;
    }
    if ((a.distanceMeters || 0) !== (b.distanceMeters || 0)) {
      return (a.distanceMeters || 0) - (b.distanceMeters || 0);
    }
    if (b.metadataConfidence !== a.metadataConfidence) {
      return b.metadataConfidence - a.metadataConfidence;
    }
    return (a.name || '').localeCompare(b.name || '', 'ko');
  });

  const normalizedTopN =
    Number.isInteger(topN) && topN > 0 ? topN : 5;

  return scoredCandidates.slice(0, normalizedTopN);
}
