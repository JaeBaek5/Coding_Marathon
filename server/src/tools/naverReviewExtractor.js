import { ReviewExtractionOutputSchema } from '../../../shared/contracts/schemas.js';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const MAX_REVIEW_PHOTOS = 6;

const BIZ_PATHS = [
  'restaurant',
  'place',
  'hairshop',
  'beauty',
  'hospital',
  'accommodation',
  'cafe'
];

// Strip timestamp from Naver URL for cache key stability.
export function normalizeNaverUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.delete('timestamp');
    return u.toString();
  } catch {
    return url;
  }
}

// Extract numeric place_id from m.place.naver.com or pcmap.place.naver.com URL.
export function extractPlaceIdFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(
    /(?:m|pcmap)\.place\.naver\.com\/(?:place|restaurant|hairshop|beauty|hospital|accommodation|cafe)\/(\d+)/
  );
  return m ? m[1] : null;
}

// Resolve place_id via m.search.naver.com using name + address fragment.
export async function resolveNaverPlaceId(
  placeName,
  address,
  { fetchFn = fetch } = {}
) {
  if (!placeName) return null;
  const addressPart = address ? (address.split(' ')[1] ?? '') : '';
  const query = `${placeName} ${addressPart}`.trim();
  const searchUrl = `https://m.search.naver.com/search.naver?query=${encodeURIComponent(query)}`;
  try {
    const response = await fetchFn(searchUrl, {
      headers: {
        'User-Agent': MOBILE_UA,
        'Accept-Language': 'ko-KR,ko;q=0.9'
      }
    });
    if (!response.ok) return null;
    const text = await response.text();
    const m = text.match(
      /m\.place\.naver\.com\/(?:place|restaurant|hairshop|beauty|hospital|accommodation|cafe)\/(\d+)/
    );
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// Parse __APOLLO_STATE__ JSON from HTML using a balanced-brace scan.
export function parseApolloState(html) {
  if (!html || !html.includes('__APOLLO_STATE__')) return null;
  const idx = html.indexOf('__APOLLO_STATE__');
  const braceStart = html.indexOf('{', idx);
  if (braceStart === -1) return null;
  let depth = 0;
  let end = braceStart;
  for (let i = braceStart; i < html.length; i++) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  try {
    return JSON.parse(html.slice(braceStart, end + 1));
  } catch {
    return null;
  }
}

// Extract review objects from Apollo state, including negative reviews.
export function extractReviewsFromState(state) {
  if (!state || typeof state !== 'object') return [];

  // Build nickname-by-key lookup for author resolution.
  const nickById = {};
  for (const [k, v] of Object.entries(state)) {
    if (v && typeof v === 'object' && (v.nickname || v.name)) {
      nickById[k] = v.nickname || v.name;
    }
  }

  const reviews = [];
  for (const v of Object.values(state)) {
    if (!v || typeof v !== 'object') continue;
    const typename = v.__typename ?? '';
    if (!typename.includes('Review')) continue;
    const body = v.body;
    if (typeof body !== 'string' || !body.trim()) continue;

    let author = null;
    const a = v.author;
    if (a && typeof a === 'object') {
      const ref = a.id ?? a.__ref;
      if (ref && nickById[ref]) author = nickById[ref];
    }
    author = author ?? v.nickname ?? v.authorName ?? null;

    reviews.push({
      body: body.trim(),
      author: author ?? null,
      rating: v.rating ?? v.starRating ?? null,
      visitedAt: v.visited ?? v.visitDate ?? v.created ?? null
    });
  }
  return reviews;
}

function extractReviewPhotosFromState(state) {
  if (!state || typeof state !== 'object') return [];

  const photos = [];
  function collectPhotoUrls(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) collectPhotoUrls(item);
      return;
    }

    for (const key of [
      'origin',
      'url',
      'imageUrl',
      'photoUrl',
      'imgUrl',
      'thumbnail',
      'thumbnailUrl'
    ]) {
      const itemUrl = value[key];
      if (typeof itemUrl === 'string' && itemUrl.startsWith('http')) {
        photos.push(itemUrl);
      }
    }

    for (const key of [
      'photo',
      'image',
      'media',
      'images',
      'imageList',
      'photoList',
      'photos',
      'attachImageList',
      'reviewPhotos'
    ]) {
      collectPhotoUrls(value[key]);
    }
  }

  for (const v of Object.values(state)) {
    if (!v || typeof v !== 'object') continue;
    if (typeof v.__typename === 'string' && !v.__typename.includes('Review')) continue;

    collectPhotoUrls(v);
  }

  return Array.from(new Set(photos)).slice(0, MAX_REVIEW_PHOTOS);
}

// Extract home enrichment data (photos + registered menu items) from Apollo state.
export function extractEnrichmentFromState(state, storeName = '') {
  const empty = {
    mainPhoto: null,
    menuBoardPhoto: null,
    foodPhotos: [],
    menuItems: []
  };
  if (!state || typeof state !== 'object') return empty;

  const photos = Object.values(state).filter(
    (v) =>
      v && typeof v === 'object' && v.__typename === 'PlaceDetailTopPhotoItem'
  );

  const menuBoardTitles = ['메뉴판', '메뉴'];
  const storeTitles = ['외부', '내부', storeName].filter(Boolean);

  const menuBoardPhotoObj = photos.find((p) =>
    menuBoardTitles.includes(p.title)
  );
  const mainPhotoObj = photos.find((p) => {
    const title = p.title ?? '';
    return (
      storeTitles.includes(title) ||
      p.type === 'business' ||
      p.category === '대표'
    );
  });
  const foodPhotos = photos
    .filter(
      (p) =>
        p !== menuBoardPhotoObj &&
        p !== mainPhotoObj &&
        !menuBoardTitles.includes(p.title) &&
        !storeTitles.includes(p.title)
    )
    .slice(0, 3)
    .map((p) => ({ title: p.title ?? null, url: p.origin ?? null }));

  const menuItems = [];
  for (const v of Object.values(state)) {
    if (v && typeof v === 'object' && v.__typename === 'Menu' && v.name) {
      menuItems.push({ name: v.name, price: v.price ?? null });
      if (menuItems.length >= 20) break;
    }
  }

  return {
    mainPhoto: mainPhotoObj?.origin ?? null,
    menuBoardPhoto: menuBoardPhotoObj?.origin ?? null,
    foodPhotos,
    menuItems
  };
}

function extractRatingFromState(state) {
  if (!state) return null;
  for (const v of Object.values(state)) {
    if (!v || typeof v !== 'object') continue;
    const t = v.__typename ?? '';
    if (t.includes('BusinessSummary') || t.includes('PlaceDetail')) {
      const r = v.visitorReviewScore ?? v.reviewScore ?? v.starScore;
      if (typeof r === 'number') return r;
    }
  }
  return null;
}

// Deterministic one-line pros summary from review corpus.
function summarizePros(reviews) {
  const positiveKws = [
    '맛있',
    '친절',
    '깔끔',
    '추천',
    '최고',
    '재방문',
    '좋아',
    '신선',
    '빠르'
  ];
  for (const kw of positiveKws) {
    const match = reviews.find((r) => r.body.includes(kw));
    if (match) {
      const sentence = match.body.split(/[.!?\n]/)[0].trim();
      if (sentence.length >= 10) return sentence.slice(0, 100);
    }
  }
  const first = reviews[0]?.body.split(/[.!?\n]/)[0].trim() ?? null;
  return first && first.length >= 10 ? first.slice(0, 100) : null;
}

// Deterministic one-line cons summary from review corpus.
function summarizeCons(reviews) {
  const negativeKws = [
    '아쉬',
    '불편',
    '별로',
    '비싸',
    '느리',
    '시끄',
    '주차',
    '불친절',
    '실망'
  ];
  for (const kw of negativeKws) {
    const match = reviews.find((r) => r.body.includes(kw));
    if (match) {
      const sentence = match.body.split(/[.!?\n]/)[0].trim();
      if (sentence.length >= 8) return sentence.slice(0, 100);
    }
  }
  return null;
}

const POSITIVE_REVIEW_KEYWORDS = [
  '맛있',
  '친절',
  '깔끔',
  '추천',
  '최고',
  '재방문',
  '좋',
  '신선',
  '빠르',
  '조용',
  '편하',
  '든든',
  '만족'
];

const NEGATIVE_REVIEW_KEYWORDS = [
  '아쉬',
  '아쉬운점',
  '불편',
  '별로',
  '비싸',
  '느리',
  '시끄',
  '주차',
  '불친절',
  '맛없',
  '최악',
  '실망',
  '다시는',
  '비추',
  '재방문은 안',
  '재방문 안',
  '부담',
  '어려웠',
  '밍밍',
  '적어서',
  '늦게'
];

const CONTRAST_CONNECTORS = ['지만', '하지만', '그런데', '다만', '입니다만', '으나'];

const REVIEW_CATEGORY_RULES = [
  { category: 'meat', patterns: ['삼겹살', '목살', '고기', '한 근', '갈비', '소고기'] },
  { category: 'vietnamese', patterns: ['쌀국수', '반미', '분짜', '고수', '베트남'] },
  { category: 'noodle', patterns: ['국수', '쌀국수', '칼국수', '모밀', '면', '짜장면', '짬뽕'] },
  { category: 'western', patterns: ['돈가스', '돈까스', '파스타', '스테이크', '양식'] },
  { category: 'korean', patterns: ['국밥', '찌개', '백반', '한식', '김치'] },
  { category: 'japanese', patterns: ['초밥', '라멘', '우동', '덮밥', '일식'] },
  { category: 'chinese', patterns: ['짜장', '짬뽕', '탕수육', '중식', '마라'] }
];

const REVIEW_DO_RULES = [
  { label: '고기 양이 넉넉함', patterns: ['두 근 양', '양을 많이', '양이 많', '푸짐'] },
  { label: '쌀국수 맛이 좋음', patterns: ['쌀국수', '고수 향', '베트남 음식'] },
  { label: '튀김 식감이 좋음', patterns: ['바삭', '튀김'] },
  {
    label: '면과 국물 만족도가 높음',
    patterns: ['잘 넘어가', '텁텁한 느낌도 없', '면이 좋', '쫄깃', '국물이 진']
  },
  { label: '매장이 깨끗함', patterns: ['깨끗', '깔끔한 인테리어', '위생적'] },
  { label: '혼밥하기 좋음', patterns: ['혼밥', '혼자 먹기'] },
  { label: '음식이 맛있음', patterns: ['맛있', '존맛', '맛집'] },
  { label: '응대가 친절함', patterns: ['친절', '응대가 좋'] },
  { label: '대화하기 좋음', patterns: ['조용', '편하게 얘기', '오래 얘기'] }
];

const REVIEW_DONT_RULES = [
  { label: '불친절 응대', patterns: ['불친절', '응대가 별로', '직원이 별로'] },
  { label: '위생 아쉬움', patterns: ['위생이 아쉬', '더러', '청결이 아쉬'] },
  { label: '재방문 의사 낮음', patterns: ['재방문하고 싶지', '재방문 안', '다시는'] },
  { label: '음식 아쉬움', patterns: ['맛없', '밍밍', '별로'] },
  { label: '대기나 제공이 느림', patterns: ['늦게', '느리', '오래 기다'] },
  { label: '가격 부담', patterns: ['비싸', '가격 대비'] },
  { label: '시끄러움', patterns: ['시끄'] },
  { label: '주차 불편', patterns: ['주차가 불편', '주차 불편'] },
  { label: '재료 아쉬움', patterns: ['새우가 없어서 아쉬', '재료가 부족'] }
];

function firstReviewSentence(body) {
  return body.split(/[.!?\n]/)[0].trim();
}

function reviewContainsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function splitReviewClauses(body) {
  const sentence = firstReviewSentence(body);
  const clauses = [sentence.trim()].filter(Boolean);
  for (const connector of CONTRAST_CONNECTORS) {
    const nextClauses = [];
    for (const clause of clauses) {
      const index = clause.indexOf(connector);
      if (index === -1) {
        nextClauses.push(clause);
        continue;
      }
      const before = clause.slice(0, index + connector.length).trim();
      const after = clause.slice(index + connector.length).trim();
      if (before) nextClauses.push(before);
      if (after) nextClauses.push(after);
    }
    clauses.splice(0, clauses.length, ...nextClauses);
  }
  return clauses;
}

function createEmptyReviewSignals() {
  return { categories: [], doReasons: [], dontReasons: [] };
}

function addUniqueSignal(signals, bucket, signal) {
  if (bucket === 'categories') {
    if (!signals.categories.includes(signal)) signals.categories.push(signal);
    return;
  }
  if (
    !signals[bucket].some(
      (item) => item.label === signal.label && item.evidence === signal.evidence
    )
  ) {
    signals[bucket].push(signal);
  }
}

function matchReviewRules(text, rules) {
  return rules.filter((rule) =>
    rule.patterns.some((pattern) => text.includes(pattern))
  );
}

function deriveReviewSignals(reviews) {
  const signals = createEmptyReviewSignals();
  for (const review of reviews) {
    const normalized = firstReviewSentence(review.body).trim();
    const clauses = splitReviewClauses(review.body);

    for (const rule of matchReviewRules(normalized, REVIEW_CATEGORY_RULES)) {
      addUniqueSignal(signals, 'categories', rule.category);
    }
    for (const clause of clauses) {
      for (const rule of matchReviewRules(clause, REVIEW_DO_RULES)) {
        if (matchReviewRules(clause, REVIEW_DONT_RULES).length > 0) continue;
        addUniqueSignal(signals, 'doReasons', {
          label: rule.label,
          evidence: clause.slice(0, 120)
        });
      }
      for (const rule of matchReviewRules(clause, REVIEW_DONT_RULES)) {
        addUniqueSignal(signals, 'dontReasons', {
          label: rule.label,
          evidence: clause.slice(0, 120)
        });
      }
    }
  }
  return signals;
}

export function isNegativeReview(review) {
  const body = typeof review === 'string' ? review : review?.body;
  if (!body) return false;
  const normalized = body.trim();
  return reviewContainsAny(normalized, NEGATIVE_REVIEW_KEYWORDS);
}

function isPositiveReview(review) {
  const body = typeof review === 'string' ? review : review?.body;
  if (!body || isNegativeReview(body)) return false;
  return reviewContainsAny(body, POSITIVE_REVIEW_KEYWORDS);
}

function summarizePositiveReviews(reviews) {
  const positiveReviews = reviews.filter(isPositiveReview);
  for (const kw of POSITIVE_REVIEW_KEYWORDS) {
    const match = positiveReviews.find((r) => r.body.includes(kw));
    if (match) {
      const sentence = firstReviewSentence(match.body);
      if (sentence.length >= 10) return sentence.slice(0, 100);
    }
  }
  const first = positiveReviews[0] ? firstReviewSentence(positiveReviews[0].body) : null;
  if (first && first.length >= 10) return first.slice(0, 100);
  return summarizePros(positiveReviews);
}

function summarizeNegativeReviews(reviews) {
  for (const kw of NEGATIVE_REVIEW_KEYWORDS) {
    const match = reviews.find((r) => r.body.includes(kw));
    if (match) {
      const sentence = firstReviewSentence(match.body);
      if (sentence.length >= 8) return sentence.slice(0, 100);
    }
  }
  return summarizeCons(reviews);
}

function hasNegativeContrast(review) {
  const body = typeof review === 'string' ? review : review?.body;
  if (!body) return false;
  for (const connector of CONTRAST_CONNECTORS) {
    const index = body.indexOf(connector);
    if (index === -1) continue;
    const afterConnector = body.slice(index + connector.length);
    if (reviewContainsAny(afterConnector, NEGATIVE_REVIEW_KEYWORDS)) return true;
  }
  return false;
}

function shouldExcludeByReviewSentiment({
  reviews,
  pros,
  cons,
  negativeReviewCount,
  positiveReviewCount
}) {
  if (!reviews.length) return false;
  if (pros && cons && pros === cons) return true;
  if (pros && isNegativeReview(pros)) return true;
  if (reviews.some(hasNegativeContrast) && negativeReviewCount >= positiveReviewCount) {
    return true;
  }
  if (reviews.length >= 5 && negativeReviewCount >= 3 && negativeReviewCount >= positiveReviewCount) {
    return true;
  }
  return reviews.length >= 10 && negativeReviewCount > positiveReviewCount;
}

async function fetchReviewPage(placeId, { fetchFn = fetch } = {}) {
  const headers = {
    'User-Agent': MOBILE_UA,
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    Referer: `https://m.place.naver.com/restaurant/${placeId}/home`
  };
  for (const biz of BIZ_PATHS) {
    const url = `https://m.place.naver.com/${biz}/${placeId}/review/visitor`;
    try {
      const response = await fetchFn(url, { headers });
      if (!response.ok) continue;
      const text = await response.text();
      if (!text.includes('__APOLLO_STATE__')) continue;
      return { url, text };
    } catch {
      continue;
    }
  }
  return null;
}

// Main review extraction entry point — returns ReviewExtractionOutputSchema.
export async function extractNaverReviews(opts, { fetchFn = fetch } = {}) {
  const { placeUrl, placeName, address } = opts ?? {};
  const fetchedAt = new Date().toISOString();

  const normalizedUrl = placeUrl ? normalizeNaverUrl(placeUrl) : null;
  let placeId = normalizedUrl ? extractPlaceIdFromUrl(normalizedUrl) : null;

  if (!placeId && placeName) {
    placeId = await resolveNaverPlaceId(placeName, address ?? '', { fetchFn });
  }

  if (!placeId) {
    return ReviewExtractionOutputSchema.parse({
      provider: 'naver',
      placeUrl: normalizedUrl,
      placeId: null,
      rating: null,
      reviewCount: null,
      reviews: [],
      reviewSummary: { pros: null, cons: null },
      reviewSignals: createEmptyReviewSignals(),
      reviewSnippets: [],
      negativeReviewCount: 0,
      positiveReviewCount: 0,
      shouldExcludeFromRecommendation: false,
      extractionMethod: 'unavailable',
      fetchedAt,
      error: 'Could not resolve Naver place ID'
    });
  }

  const page = await fetchReviewPage(placeId, { fetchFn });

  if (!page) {
    return ReviewExtractionOutputSchema.parse({
      provider: 'naver',
      placeUrl:
        normalizedUrl ??
        `https://m.place.naver.com/restaurant/${placeId}/review/visitor`,
      placeId,
      rating: null,
      reviewCount: null,
      reviews: [],
      reviewSummary: { pros: null, cons: null },
      reviewSignals: createEmptyReviewSignals(),
      reviewSnippets: [],
      negativeReviewCount: 0,
      positiveReviewCount: 0,
      shouldExcludeFromRecommendation: false,
      extractionMethod: 'unavailable',
      fetchedAt,
      error: 'Could not fetch review page'
    });
  }

  const state = parseApolloState(page.text);
  const allReviews = extractReviewsFromState(state);
  const reviewPhotos = extractReviewPhotosFromState(state);
  const reviews = allReviews.slice(0, 20);
  const reviewSnippets = reviews.slice(0, 5).map((r) => r.body.slice(0, 140));
  const pros = reviews.length > 0 ? summarizePositiveReviews(reviews) : null;
  const cons = reviews.length > 0 ? summarizeNegativeReviews(reviews) : null;
  const reviewSignals = deriveReviewSignals(reviews);
  const negativeReviewCount = reviews.filter(isNegativeReview).length;
  const positiveReviewCount = reviews.filter(isPositiveReview).length;
  const shouldExcludeFromRecommendation =
    reviewSignals.dontReasons.length >= 2 ||
    shouldExcludeByReviewSentiment({
      reviews,
      pros,
      cons,
      negativeReviewCount: negativeReviewCount + reviewSignals.dontReasons.length,
      positiveReviewCount
    });
  const rating = extractRatingFromState(state);

  return ReviewExtractionOutputSchema.parse({
    provider: 'naver',
    placeUrl: normalizedUrl ?? page.url,
    placeId,
    rating,
    reviewCount: allReviews.length,
    reviews,
    reviewSummary: { pros, cons },
    reviewSignals,
    reviewSnippets,
    reviewPhotos,
    negativeReviewCount,
    positiveReviewCount,
    shouldExcludeFromRecommendation,
    extractionMethod: 'static-hydration',
    fetchedAt,
    error: null
  });
}

// Extract home enrichment for a given place_id (photos + menu).
// Vision extraction is the caller's responsibility — check OPENROUTER_API_KEY
// and menuBoardPhoto before calling any Vision LLM.
export async function extractNaverHomeEnrichment(
  placeId,
  storeName = '',
  { fetchFn = fetch } = {}
) {
  const headers = {
    'User-Agent': MOBILE_UA,
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    Referer: `https://m.place.naver.com/restaurant/${placeId}/home`
  };
  for (const biz of BIZ_PATHS) {
    const url = `https://m.place.naver.com/${biz}/${placeId}/home`;
    try {
      const response = await fetchFn(url, { headers });
      if (!response.ok) continue;
      const text = await response.text();
      if (!text.includes('__APOLLO_STATE__')) continue;
      const state = parseApolloState(text);
      if (!state) continue;
      return extractEnrichmentFromState(state, storeName);
    } catch {
      continue;
    }
  }
  return { mainPhoto: null, menuBoardPhoto: null, foodPhotos: [], menuItems: [] };
}
