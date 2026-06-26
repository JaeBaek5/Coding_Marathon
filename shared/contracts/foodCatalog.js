/**
 * Mumuk 음식 마스터 카탈로그 — 단일 출처.
 * id는 desiredFoods / foodPreferenceScores / 검색·랭킹에서 공통 사용.
 */

import { FOOD_CATALOG_DATA } from './foodCatalogData.js';

export const FOOD_CATEGORIES = {
  hangover: { id: 'hangover', label: '해장·국물' },
  korean: { id: 'korean', label: '한식' },
  meat: { id: 'meat', label: '고기·구이' },
  seafood: { id: 'seafood', label: '해산물·회' },
  soup: { id: 'soup', label: '찌개·탕' },
  noodle: { id: 'noodle', label: '면류' },
  rice: { id: 'rice', label: '밥·덮밥' },
  chicken: { id: 'chicken', label: '치킨' },
  chinese: { id: 'chinese', label: '중식' },
  japanese: { id: 'japanese', label: '일식' },
  western: { id: 'western', label: '양식' },
  snack: { id: 'snack', label: '분식' },
  southeast_asian: { id: 'southeast_asian', label: '동남아·아시아' },
  dessert: { id: 'dessert', label: '디저트·카페' }
};

/** @typedef {{ id: string, label: string, category: string, intentOnly?: boolean, aliases?: string[], searchKeywords?: string[], rankKeywords?: string[], mismatches?: string[] }} FoodCatalogItem */

/** @type {FoodCatalogItem[]} */
export const FOOD_CATALOG = FOOD_CATALOG_DATA;

export const EXCLUSION_PRESETS = [
  { value: [], label: '없음' },
  { value: '매운 음식', label: '매운 음식', aliases: ['매운', '맵', '고추'] },
  { value: '해산물', label: '해산물', aliases: ['해산물', '회', '조개'] },
  { value: '고기', label: '고기', aliases: ['고기', '육류'] },
  { value: '치킨', label: '치킨', aliases: ['치킨', '닭'] },
  { value: '면', label: '면류', aliases: ['면', '라면', '국수'] }
];

export const HANGOVER_TEXT_PATTERNS = [
  /해장/,
  /숙취/,
  /술\s*마셔?서/,
  /어제\s*술/,
  /전날\s*술/,
  /술\s*먹었/,
  /술\s*마신/
];

const FOOD_BY_ID = new Map(FOOD_CATALOG.map((item) => [item.id, item]));
const ALIAS_ENTRIES = [];

for (const item of FOOD_CATALOG) {
  const aliases = new Set([item.id, item.label, ...(item.aliases || [])]);
  for (const alias of aliases) {
    if (alias) {
      ALIAS_ENTRIES.push({ alias: alias.toLowerCase(), id: item.id, length: alias.length });
    }
  }
}

ALIAS_ENTRIES.sort((left, right) => right.length - left.length);

function aliasMatchesText(alias, text) {
  if (!alias || !text) {
    return false;
  }

  const index = text.indexOf(alias);
  if (index < 0) {
    return false;
  }

  const before = index === 0 ? '' : text[index - 1];
  const after = text[index + alias.length] || '';

  if (before && /[\p{L}\p{N}]/u.test(before)) {
    return false;
  }

  if (!after || !/[\p{L}\p{N}]/u.test(after)) {
    return true;
  }

  return /^[먹드시할주자답]/u.test(after);
}

export function getFoodById(id) {
  return FOOD_BY_ID.get(id) || null;
}

export function isKnownFoodId(id) {
  return FOOD_BY_ID.has(id);
}

export function listFoodIds() {
  return FOOD_CATALOG.map((item) => item.id);
}

export function listFoodsByCategory(categoryId) {
  return FOOD_CATALOG.filter((item) => item.category === categoryId);
}

export function listCategoryIds() {
  return Object.keys(FOOD_CATEGORIES);
}

export function getCategoryLabel(categoryId) {
  return FOOD_CATEGORIES[categoryId]?.label || categoryId;
}

export function resolveFoodId(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (FOOD_BY_ID.has(trimmed)) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  for (const entry of ALIAS_ENTRIES) {
    if (aliasMatchesText(entry.alias, lower)) {
      return entry.id;
    }
  }

  return null;
}

export function resolveFoodIdsFromText(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const lower = text.toLowerCase();
  const found = [];

  for (const entry of ALIAS_ENTRIES) {
    if (!aliasMatchesText(entry.alias, lower)) {
      continue;
    }
    if (!found.includes(entry.id)) {
      found.push(entry.id);
    }
  }

  return found;
}

export function normalizeFoodIds(values = []) {
  const ids = [];
  for (const value of values) {
    const resolved = resolveFoodId(String(value)) || String(value).trim();
    if (resolved && !ids.includes(resolved)) {
      ids.push(resolved);
    }
  }
  return ids;
}

export function getDefaultDesiredFoodOptions() {
  return FOOD_CATALOG.filter((item) => item.intentOnly).map((item) => ({
    value: item.id,
    label: item.label,
    category: item.category
  }));
}

const SOUTHEAST_ASIAN_QUERY_PATTERN =
  /베트남|쌀국수|분짜|태국|팟타이|동남아|쌀국|반미|똠얌/;

function queryMentionsSoutheastAsian(query = '') {
  return SOUTHEAST_ASIAN_QUERY_PATTERN.test(query);
}

function queryMentionsDessert(query = '') {
  return /디저트|카페|커피|케이크|빵|브런치/.test(query);
}

function toDesiredFoodOption(item) {
  return {
    value: item.id,
    label: item.label,
    category: item.category
  };
}

export function buildDesiredFoodOptionsFromScores(
  foodPreferenceScores = [],
  { maxOptions = 8 } = {}
) {
  const scores = [...foodPreferenceScores]
    .filter((item) => Number(item.score) >= 50)
    .sort((left, right) => right.score - left.score);

  const options = [];
  const seen = new Set();

  const pushFood = (foodId) => {
    const item = getFoodById(foodId);
    if (!item || seen.has(item.id)) {
      return;
    }
    seen.add(item.id);
    options.push(toDesiredFoodOption(item));
  };

  for (const entry of scores) {
    pushFood(entry.food);
  }

  const topCategories = [
    ...new Set(
      scores
        .slice(0, 3)
        .map((entry) => getFoodById(entry.food)?.category)
        .filter(Boolean)
    )
  ];

  for (const categoryId of topCategories) {
    for (const item of listFoodsByCategory(categoryId)) {
      if (options.length >= maxOptions) {
        break;
      }
      if (!item.intentOnly) {
        pushFood(item.id);
      }
    }
  }

  return options.slice(0, maxOptions);
}

export function buildRelatedFoodOptionsForSuggestions(
  suggestions = [],
  { maxExtra = 3 } = {}
) {
  const categories = new Set(
    suggestions
      .map((entry) => getFoodById(entry.food)?.category)
      .filter(Boolean)
  );
  const seen = new Set(suggestions.map((entry) => entry.food));
  const related = [];

  for (const categoryId of categories) {
    for (const item of listFoodsByCategory(categoryId)) {
      if (related.length >= maxExtra) {
        break;
      }
      if (item.intentOnly || seen.has(item.id)) {
        continue;
      }
      if (
        item.category === 'southeast_asian' &&
        !categories.has('southeast_asian')
      ) {
        continue;
      }
      seen.add(item.id);
      related.push(toDesiredFoodOption(item));
    }
  }

  return related;
}

function filterFallbackIntentOptions(query = '') {
  return getDefaultDesiredFoodOptions().filter((item) => {
    if (item.category === 'southeast_asian') {
      return queryMentionsSoutheastAsian(query);
    }
    if (item.category === 'dessert') {
      return queryMentionsDessert(query);
    }
    return true;
  });
}

export function inferDesiredFoodOptions(partialSlots = {}, userQuery = '') {
  const query = `${userQuery} ${(partialSlots.desiredFoods || []).join(' ')}`.trim();
  const scores = Array.isArray(partialSlots.foodPreferenceScores)
    ? partialSlots.foodPreferenceScores
    : [];

  if (scores.length > 0) {
    const fromScores = buildDesiredFoodOptionsFromScores(scores);
    if (fromScores.length >= 2) {
      return fromScores;
    }
  }

  const matched = resolveFoodIdsFromText(query);

  if (matched.length > 0) {
    const primary = getFoodById(matched[0]);
    if (primary) {
      const sameCategory = listFoodsByCategory(primary.category)
        .filter((item) => !item.intentOnly || item.id === primary.id)
        .slice(0, 6)
        .map((item) => toDesiredFoodOption(item));
      if (sameCategory.length >= 2) {
        return sameCategory;
      }
    }
  }

  return filterFallbackIntentOptions(query);
}

export function getExcludedFoodOptions() {
  return EXCLUSION_PRESETS.map((item) => ({
    value: item.value,
    label: item.label
  }));
}

export function expandFoodSearchKeywords(foodIds = []) {
  const keywords = [];
  for (const foodId of normalizeFoodIds(foodIds)) {
    const item = getFoodById(foodId);
    const mapped = item?.searchKeywords?.length ? item.searchKeywords : [foodId];
    for (const keyword of mapped) {
      if (!keywords.includes(keyword)) {
        keywords.push(keyword);
      }
    }
  }
  return keywords;
}

export function getRankKeywordsForFoodIds(foodIds = []) {
  const keywords = new Set();
  for (const foodId of normalizeFoodIds(foodIds)) {
    const item = getFoodById(foodId);
    const mapped = item?.rankKeywords?.length ? item.rankKeywords : [foodId];
    for (const keyword of mapped) {
      keywords.add(keyword);
    }
  }
  return [...keywords];
}

export function getMismatchesForFoodIds(foodIds = []) {
  const mismatches = new Set();
  for (const foodId of normalizeFoodIds(foodIds)) {
    const item = getFoodById(foodId);
    for (const keyword of item?.mismatches || []) {
      mismatches.add(keyword);
    }
  }
  return [...mismatches];
}

export function getHangoverSearchKeywords() {
  return expandFoodSearchKeywords(
    listFoodsByCategory('hangover').map((item) => item.id)
  );
}

export function buildFoodCatalogPromptSummary() {
  const lines = listCategoryIds().map((categoryId) => {
    const foods = listFoodsByCategory(categoryId)
      .map((item) => item.id)
      .join(', ');
    return `${getCategoryLabel(categoryId)}: ${foods}`;
  });
  return lines.join('\n');
}

export function validateFoodCravingSuggestions(suggestions = [], avoidSuggestions = []) {
  const normalizeList = (entries) =>
    entries
      .map((entry) => {
        const foodId = resolveFoodId(entry.food) || entry.food;
        if (!isKnownFoodId(foodId)) {
          return null;
        }
        const item = getFoodById(foodId);
        return {
          food: foodId,
          label: entry.label || item.label,
          score: entry.score
        };
      })
      .filter(Boolean);

  return {
    suggestions: normalizeList(suggestions),
    avoidSuggestions: normalizeList(avoidSuggestions)
  };
}

export const FOOD_CATALOG_STATS = {
  totalFoods: FOOD_CATALOG.length,
  categories: listCategoryIds().length,
  intentFoods: FOOD_CATALOG.filter((item) => item.intentOnly).length
};
