import { ErrorCodes } from '../../../shared/contracts/schemas.js';
import { isVenueAllowed } from '../utils/venueGating.js';

export class RankingValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'RankingValidationError';
    this.code = code;
  }
}

/**
 * Validates that the totalTimeMinutes budget is strictly within 20–60 minutes.
 * @param {number} totalTimeMinutes
 */
export function validateTimeBudget(totalTimeMinutes) {
  if (
    typeof totalTimeMinutes !== 'number' ||
    totalTimeMinutes < 20 ||
    totalTimeMinutes > 60
  ) {
    throw new RankingValidationError(
      '총 소요시간은 20분 이상 60분 이하로 입력해 주세요.',
      ErrorCodes.INVALID_TOTAL_TIME
    );
  }
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
export function rankCandidates(candidates, slot, nowStr, topN = 5) {
  const {
    totalTimeMinutes,
    transportMode,
    excludedFoods = [],
    partyContext,
    vibe,
    budgetPerPersonKrw,
    jobContext
  } = slot;

  validateTimeBudget(totalTimeMinutes);

  // 1. Determine if budget data is universally missing
  const allPrices = candidates.map(getCandidatePrice);
  const universallyMissingBudget = allPrices.every((p) => p === null);

  // 2. Filter candidates
  const eligibleCandidates = [];

  for (const candidate of candidates) {
    // Hard filter: Valid route exists
    const hasRoute =
      candidate.oneWayRouteMinutes !== undefined &&
      candidate.oneWayRouteMinutes !== null &&
      candidate.oneWayRouteMinutes >= 0;

    if (!hasRoute) {
      continue;
    }

    if (!isVenueAllowed(candidate, slot)) {
      continue;
    }

    // Calculate totalExpectedMinutes formula
    const totalExpectedMinutes = candidate.oneWayRouteMinutes * 2 + 30;

    // Hard filter: Within totalTimeMinutes limit
    if (totalExpectedMinutes > totalTimeMinutes) {
      continue;
    }

    // Hard filter: Excluded food/category keyword check (exact/fuzzy case-insensitive token match)
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

        // Hard match if matches any token exactly or matches name/category exactly
        const exactTokenMatch = allTokens.includes(normExcluded);
        const exactFieldMatch =
          nameLower === normExcluded || catLower === normExcluded;

        if (exactTokenMatch || exactFieldMatch) {
          isHardExcluded = true;
          break;
        }

        // Uncertain but fuzzy match if substring match but not hard-match
        if (
          nameLower.includes(normExcluded) ||
          catLower.includes(normExcluded)
        ) {
          isUncertainFuzzyExcluded = true;
        }
      }
    }

    if (isHardExcluded) {
      continue;
    }

    // Hard filter: Venue-type gating — decision is driven by Aleph's structured venuePreference slot
    // Hard filter: Opening hours window check
    if (
      candidate.openingHours !== null &&
      candidate.openingHours !== undefined
    ) {
      const isWindowOpen = isWithinServiceWindow(
        candidate.openingHours,
        nowStr
      );
      if (!isWindowOpen) {
        continue;
      }
    }

    // Hard filter: Budget limit check
    const price = getCandidatePrice(candidate);
    if (
      !universallyMissingBudget &&
      price !== null &&
      price > budgetPerPersonKrw
    ) {
      continue;
    }

    eligibleCandidates.push({
      candidate,
      totalExpectedMinutes,
      isUncertainFuzzyExcluded,
      price
    });
  }

  // 3. Score candidates
  const scoredCandidates = eligibleCandidates.map(
    ({ candidate, totalExpectedMinutes, isUncertainFuzzyExcluded, price }) => {
      // timeFit (35 points)
      const timeFit =
        totalTimeMinutes > 20
          ? Math.max(
              0,
              (35 * (totalTimeMinutes - totalExpectedMinutes)) /
                (totalTimeMinutes - 20)
            )
          : 35;

      // distanceFit (15 points)
      const maxDistance = transportMode === 'walk' ? 2000 : 10000;
      const distanceFit = Math.max(
        0,
        15 * (1 - (candidate.distanceMeters || 0) / maxDistance)
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

      // categorySafety (5 points)
      const categorySafety = isUncertainFuzzyExcluded ? 0 : 5;

      const scoreTotal = Number(
        (
          timeFit +
          distanceFit +
          contextFit +
          vibeFit +
          budgetFit +
          metadataConfidence +
          categorySafety
        ).toFixed(4)
      );

      // confidence badge derivation
      const confidenceBadge =
        metadataConfidence >= 8
          ? 'high'
          : metadataConfidence >= 5
            ? 'medium'
            : 'low';

      // openStatus
      const openStatus =
        candidate.openingHours !== null && candidate.openingHours !== undefined
          ? isWithinServiceWindow(candidate.openingHours, nowStr)
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
        categorySafety
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
    if (a.totalExpectedMinutes !== b.totalExpectedMinutes) {
      return a.totalExpectedMinutes - b.totalExpectedMinutes;
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
