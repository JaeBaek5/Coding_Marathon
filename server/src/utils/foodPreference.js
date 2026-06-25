import {
  HANGOVER_TEXT_PATTERNS,
  expandFoodSearchKeywords,
  getHangoverSearchKeywords,
  getMismatchesForFoodIds,
  getRankKeywordsForFoodIds,
  normalizeFoodIds,
  resolveFoodId,
  resolveFoodIdsFromText
} from '../../../shared/contracts/foodCatalog.js';

export {
  buildFoodCatalogPromptSummary,
  getDefaultDesiredFoodOptions,
  getExcludedFoodOptions,
  inferDesiredFoodOptions,
  isKnownFoodId,
  listFoodIds,
  FOOD_CATALOG,
  FOOD_CATALOG_STATS,
  FOOD_CATEGORIES
} from '../../../shared/contracts/foodCatalog.js';

export const HANGOVER_SEARCH_KEYWORDS = getHangoverSearchKeywords();

function uniqueKeywords(keywords = []) {
  return keywords.filter(
    (keyword, index) => keyword && keywords.indexOf(keyword) === index
  );
}

export function detectHangoverIntent(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  return HANGOVER_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

export function detectHangoverIntentFromSources(textSources = []) {
  const combined = textSources
    .flatMap((value) => {
      if (typeof value === 'string') {
        return [value];
      }
      if (Array.isArray(value)) {
        return value.filter((item) => typeof item === 'string');
      }
      return [];
    })
    .join(' ');

  return detectHangoverIntent(combined);
}

export function enrichSlotsWithHangoverIntent(slots = {}, textSources = [], options = {}) {
  const onlyIfMissing = options.onlyIfMissing !== false;

  if (!detectHangoverIntentFromSources(textSources)) {
    return slots;
  }

  const next = { ...slots };

  if (next.venuePreference === 'bar') {
    next.venuePreference = 'restaurant';
  }

  const hasFoodIntent =
    Array.isArray(next.desiredFoods) && next.desiredFoods.length > 0;
  const hasSearchKeywords =
    Array.isArray(next.searchKeywords) && next.searchKeywords.length > 0;

  if (onlyIfMissing && hasFoodIntent && hasSearchKeywords) {
    if (!next.venuePreference) {
      next.venuePreference = 'restaurant';
    }
    return next;
  }

  if (!hasFoodIntent) {
    next.searchKeywords = uniqueKeywords([
      ...(Array.isArray(next.searchKeywords) ? next.searchKeywords : []),
      ...HANGOVER_SEARCH_KEYWORDS
    ]);
  } else if (!hasSearchKeywords) {
    next.searchKeywords = uniqueKeywords([
      ...(Array.isArray(next.searchKeywords) ? next.searchKeywords : []),
      ...HANGOVER_SEARCH_KEYWORDS
    ]);
  }

  if (
    !Array.isArray(next.foodPreferenceScores) ||
    next.foodPreferenceScores.length === 0
  ) {
    next.foodPreferenceScores = [
      { food: '해장', score: 95 },
      { food: '국밥', score: 92 },
      { food: '치킨', score: 12 },
      { food: '피자', score: 10 }
    ];
  }

  if (!next.venuePreference) {
    next.venuePreference = 'restaurant';
  }

  return next;
}

export function parseDesiredFoodsFromText(text) {
  return resolveFoodIdsFromText(text);
}

export function normalizeDesiredFoods(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return normalizeFoodIds(
      value.flatMap((item) => {
        const resolved = resolveFoodId(String(item));
        if (resolved) {
          return [resolved];
        }
        return resolveFoodIdsFromText(String(item));
      })
    );
  }

  const resolved = resolveFoodId(String(value));
  if (resolved) {
    return [resolved];
  }
  return resolveFoodIdsFromText(String(value));
}

export function expandFoodSearchSuffixes(desiredFoods = []) {
  return expandFoodSearchKeywords(desiredFoods);
}

export function getRankKeywordsForFoods(desiredFoods = []) {
  return getRankKeywordsForFoodIds(desiredFoods);
}

export function buildSearchKeywords(desiredFoods = [], extraKeywords = []) {
  const merged = [
    ...extraKeywords,
    ...expandFoodSearchSuffixes(desiredFoods)
  ].filter(Boolean);
  return merged.filter((keyword, index) => merged.indexOf(keyword) === index);
}

export function normalizeFoodPreferenceScores(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const entry of value) {
    if (!entry?.food || typeof entry.score !== 'number') {
      continue;
    }
    const food = resolveFoodId(String(entry.food).trim()) || String(entry.food).trim();
    if (!food || seen.has(food)) {
      continue;
    }
    const score = Math.max(0, Math.min(100, Math.round(entry.score)));
    seen.add(food);
    normalized.push({ food, score });
  }

  return normalized;
}

export function deriveFoodPreferenceScores({
  desiredFoods = [],
  excludedFoods = [],
  foodPreferenceScores = []
} = {}) {
  const normalized = normalizeFoodPreferenceScores(foodPreferenceScores);
  if (normalized.length > 0) {
    return normalized;
  }

  const scores = [];
  const seen = new Set();
  const normalizedDesired = normalizeFoodIds(desiredFoods);

  for (const food of normalizedDesired) {
    if (!food || seen.has(food)) {
      continue;
    }
    seen.add(food);
    scores.push({ food, score: 85 });

    for (const mismatch of getMismatchesForFoodIds([food])) {
      const mismatchLabel = String(mismatch).trim();
      if (!mismatchLabel || seen.has(mismatchLabel)) {
        continue;
      }
      const mismatchId = resolveFoodId(mismatchLabel) || mismatchLabel;
      seen.add(mismatchId);
      scores.push({ food: mismatchId, score: 12 });
    }
  }

  for (const food of excludedFoods) {
    const label = resolveFoodId(String(food).trim()) || String(food).trim();
    if (!label || seen.has(label)) {
      continue;
    }
    seen.add(label);
    scores.push({ food: label, score: 10 });
  }

  return scores;
}

export function buildSearchKeywordsFromScores(
  foodPreferenceScores = [],
  extraKeywords = []
) {
  const prioritized = [...foodPreferenceScores]
    .filter((entry) => entry.score >= 55)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);

  const suffixes = [];
  for (const { food } of prioritized) {
    suffixes.push(...expandFoodSearchSuffixes([food]));
    if (!suffixes.includes(food)) {
      suffixes.push(food);
    }
  }

  return uniqueKeywords([...extraKeywords, ...suffixes]);
}

function candidateMatchesFoodKeywords(haystack, food) {
  const keywords = getRankKeywordsForFoods([food]);
  const probe = keywords.length > 0 ? keywords : [food];
  return probe.some((keyword) => haystack.includes(String(keyword).toLowerCase()));
}

export function scoreFoodPreferenceWithScores(candidate, foodPreferenceScores = []) {
  if (!foodPreferenceScores.length) {
    return { foodPreferenceFit: 0, foodMismatchPenalty: 0 };
  }

  const haystack = `${candidate.name || ''} ${candidate.category || ''}`.toLowerCase();
  let positiveSignal = 0;
  let negativeSignal = 0;

  for (const { food, score } of foodPreferenceScores) {
    if (!candidateMatchesFoodKeywords(haystack, food)) {
      continue;
    }

    if (score >= 55) {
      positiveSignal += ((score - 50) / 50) * 18;
    } else if (score <= 45) {
      negativeSignal += ((50 - score) / 50) * 14;
    }
  }

  return {
    foodPreferenceFit: Math.min(52, Math.round(positiveSignal)),
    foodMismatchPenalty: Math.min(34, Math.round(negativeSignal))
  };
}

export function scoreFoodPreference(candidate, desiredFoods = [], foodPreferenceScores = []) {
  const scores = normalizeFoodPreferenceScores(foodPreferenceScores);
  if (scores.length > 0) {
    return scoreFoodPreferenceWithScores(candidate, scores);
  }

  if (!desiredFoods.length) {
    return { foodPreferenceFit: 0, foodMismatchPenalty: 0 };
  }

  const haystack = `${candidate.name || ''} ${candidate.category || ''}`.toLowerCase();
  let matchCount = 0;
  let mismatchCount = 0;
  const normalizedDesired = normalizeFoodIds(desiredFoods);

  for (const food of normalizedDesired) {
    const keywords = getRankKeywordsForFoods([food]);
    for (const keyword of keywords) {
      if (haystack.includes(keyword.toLowerCase())) {
        matchCount += 1;
      }
    }

    const mismatches = getMismatchesForFoodIds([food]);
    for (const keyword of mismatches) {
      if (haystack.includes(keyword.toLowerCase())) {
        mismatchCount += 1;
      }
    }
  }

  const foodPreferenceFit =
    matchCount === 0 ? 0 : matchCount === 1 ? 28 : matchCount === 2 ? 40 : 48;
  const foodMismatchPenalty = mismatchCount > 0 ? 18 : 0;

  return { foodPreferenceFit, foodMismatchPenalty };
}
