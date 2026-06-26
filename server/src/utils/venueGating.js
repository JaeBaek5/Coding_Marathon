import { detectHangoverIntentFromSources } from './foodPreference.js';

const CAFE_INTENT_KEYWORDS = [
  '카페',
  'cafe',
  'coffee',
  '커피',
  '디저트',
  'dessert',
  '베이커리',
  'bakery'
];

const BAR_INTENT_KEYWORDS = [
  '술집',
  'bar',
  'pub',
  '호프',
  '주점',
  '이자카야',
  '와인바',
  '맥주',
  'alcohol',
  'drinking',
  '포차',
  '펍',
  '치맥',
  '소맥',
  '음주',
  '술'
];

const BAR_INTENT_PATTERNS = [
  /술\s*마시고?\s*싶/,
  /술\s*마시/,
  /술\s*마실/,
  /술\s*한잔/,
  /술\s*먹고?\s*싶/,
  /맥주\s*한잔/,
  /와인\s*한잔/,
  /한잔\s*하/,
  /\bbar\b/i,
  /\bpub\b/i,
  /drinks?/i
];

export const BAR_SEARCH_KEYWORDS = [
  '술집',
  '호프',
  '주점',
  '이자카야',
  '와인바',
  '포차',
  '펍'
];

export const CAFE_SEARCH_KEYWORDS = ['카페', '디저트', '베이커리', '커피'];

const RESTAURANT_NEARBY_QUERIES = ['맛집', '한식', '일식', '중식', '양식'];
const DEFAULT_NEARBY_QUERIES = RESTAURANT_NEARBY_QUERIES;
const BAR_NEARBY_QUERIES = ['술집', '호프', '주점', '이자카야', '포차', '와인바'];
const CAFE_NEARBY_QUERIES = ['카페', '디저트', '베이커리', '커피'];
const HANGOVER_NEARBY_QUERIES = [
  '해장국',
  '국밥',
  '순대국',
  '설렁탕',
  '감자탕',
  '뼈해장국'
];

const CAFE_CATEGORY_PATTERNS = [
  /카페/,
  /커피/,
  /베이커리/,
  /디저트/,
  /cafe/i,
  /coffee/i,
  /dessert/i,
  /bakery/i
];

const BAR_CATEGORY_PATTERNS = [
  /술집/,
  /주점/,
  /호프/,
  /이자카야/,
  /와인바/,
  /칵테일바/,
  /펍/,
  /\bbar\b/i,
  /\bpub\b/i
];

const BAR_MISMATCH_PATTERNS = [
  /샤브/,
  /훠궈/,
  /전골/,
  /칼국수/,
  /국수/,
  /뷔페/,
  /한정식/,
  /백반/
];

function joinTextSources(textSources = []) {
  return textSources
    .flatMap((value) => {
      if (typeof value === 'string') {
        return [value];
      }
      if (Array.isArray(value)) {
        return value.filter((item) => typeof item === 'string');
      }
      return [];
    })
    .join(' ')
    .toLowerCase();
}

function uniqueKeywords(keywords = []) {
  return keywords.filter(
    (keyword, index) => keyword && keywords.indexOf(keyword) === index
  );
}

export function detectCafeIntent(textSources = []) {
  const combined = joinTextSources(textSources);
  return CAFE_INTENT_KEYWORDS.some((keyword) =>
    combined.includes(keyword.toLowerCase())
  );
}

export function detectBarIntent(textSources = []) {
  if (detectHangoverIntentFromSources(textSources)) {
    return false;
  }

  const combined = joinTextSources(textSources);
  if (BAR_INTENT_KEYWORDS.some((keyword) => combined.includes(keyword.toLowerCase()))) {
    return true;
  }
  return BAR_INTENT_PATTERNS.some((pattern) => pattern.test(combined));
}

export function detectExplicitVenueIntent(textSources = []) {
  return detectCafeIntent(textSources) || detectBarIntent(textSources);
}

export function enrichSlotsWithVenueIntent(slots = {}, textSources = [], options = {}) {
  const onlyIfMissing = options.onlyIfMissing !== false;

  if (onlyIfMissing && slots.venuePreference) {
    return slots;
  }

  const next = { ...slots };
  const barIntent = detectBarIntent(textSources);
  const cafeIntent = detectCafeIntent(textSources);

  if (barIntent) {
    next.venuePreference = 'bar';
    next.searchKeywords = uniqueKeywords([
      ...(Array.isArray(next.searchKeywords) ? next.searchKeywords : []),
      ...BAR_SEARCH_KEYWORDS
    ]);
    return next;
  }

  if (cafeIntent) {
    next.venuePreference = 'cafe';
    next.searchKeywords = uniqueKeywords([
      ...(Array.isArray(next.searchKeywords) ? next.searchKeywords : []),
      ...CAFE_SEARCH_KEYWORDS
    ]);
  }

  return next;
}

export function buildVenueTextSources(slots = {}, userQuery = '') {
  return [
    userQuery,
    slots.vibe,
    slots.partyContext,
    ...(Array.isArray(slots.desiredFoods) ? slots.desiredFoods : []),
    ...(Array.isArray(slots.searchKeywords) ? slots.searchKeywords : [])
  ];
}

export function resolveNearbyQuerySuffixes({
  desiredFoods = [],
  searchKeywords = [],
  venuePreference = 'restaurant',
  expandFoodSearchSuffixes = (foods) => foods
} = {}) {
  const foodSuffixes = expandFoodSearchSuffixes(desiredFoods);
  const wantsHangoverFood =
    desiredFoods.includes('해장') ||
    searchKeywords.some((keyword) =>
      HANGOVER_NEARBY_QUERIES.includes(keyword)
    );
  let baseQueries = DEFAULT_NEARBY_QUERIES;

  if (wantsHangoverFood) {
    baseQueries = HANGOVER_NEARBY_QUERIES;
  } else if (venuePreference === 'bar') {
    baseQueries = BAR_NEARBY_QUERIES;
  } else if (venuePreference === 'cafe') {
    baseQueries = CAFE_NEARBY_QUERIES;
  }

  return uniqueKeywords([...searchKeywords, ...foodSuffixes, ...baseQueries]);
}

export function classifyVenueType(candidate) {
  const text = `${candidate.category || ''} ${candidate.name || ''}`.toLowerCase();

  if (BAR_CATEGORY_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'bar';
  }

  if (CAFE_CATEGORY_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'cafe';
  }

  return 'restaurant';
}

export function isVenueAllowed(candidate, slot = {}) {
  const venueType = classifyVenueType(candidate);
  if (venueType === 'restaurant') {
    return true;
  }

  const venuePreference = slot?.venuePreference || 'restaurant';

  if (slot.venueIntentExplicit === true) {
    return true;
  }

  if (venueType === 'cafe' && (venuePreference === 'cafe' || venuePreference === 'any')) {
    return true;
  }

  if (venueType === 'bar' && (venuePreference === 'bar' || venuePreference === 'any')) {
    return true;
  }

  return false;
}

export function scoreVenueIntentFit(candidate, slot = {}) {
  const venuePreference = slot?.venuePreference || 'restaurant';
  if (venuePreference === 'restaurant') {
    return { venueIntentFit: 0, venueIntentMismatchPenalty: 0 };
  }

  const venueType = classifyVenueType(candidate);
  const text = `${candidate.name || ''} ${candidate.category || ''}`.toLowerCase();

  if (venuePreference === 'bar') {
    if (venueType === 'bar') {
      return { venueIntentFit: 20, venueIntentMismatchPenalty: 0 };
    }
    if (BAR_MISMATCH_PATTERNS.some((pattern) => pattern.test(text))) {
      return { venueIntentFit: 0, venueIntentMismatchPenalty: 24 };
    }
    return { venueIntentFit: 0, venueIntentMismatchPenalty: 6 };
  }

  if (venuePreference === 'cafe' || venuePreference === 'any') {
    if (venueType === 'cafe') {
      return { venueIntentFit: 16, venueIntentMismatchPenalty: 0 };
    }
    if (venueType === 'bar' && venuePreference === 'cafe') {
      return { venueIntentFit: 0, venueIntentMismatchPenalty: 8 };
    }
  }

  return { venueIntentFit: 0, venueIntentMismatchPenalty: 0 };
}

export function filterCandidatesByVenue(candidates, slot = {}) {
  return candidates.filter((candidate) => isVenueAllowed(candidate, slot));
}
