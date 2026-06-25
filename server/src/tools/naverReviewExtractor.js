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

function firstReviewSentence(body) {
  return body.split(/[.!?\n]/)[0].trim();
}

function reviewContainsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
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
  const negativeReviewCount = reviews.filter(isNegativeReview).length;
  const positiveReviewCount = reviews.filter(isPositiveReview).length;
  const shouldExcludeFromRecommendation = shouldExcludeByReviewSentiment({
    reviews,
    pros,
    cons,
    negativeReviewCount,
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
