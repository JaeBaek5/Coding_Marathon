const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const NAVER_PLACE_BIZ_TYPES = [
  'restaurant',
  'place',
  'hairshop',
  'beauty',
  'hospital',
  'accommodation',
  'cafe'
];

const PLACE_ID_PATTERN =
  /m\.place\.naver\.com\/(?:place|restaurant|hairshop|beauty|hospital|accommodation|cafe)\/(\d+)/;

const DEFAULT_REVIEW_LIMIT = 20;
const MIN_REVIEW_TARGET = 10;

export function stripNaverUrlTimestamp(placeUrl) {
  if (!placeUrl) {
    return null;
  }

  try {
    const url = new URL(placeUrl);
    url.searchParams.delete('timestamp');
    return url.toString();
  } catch {
    return String(placeUrl)
      .replace(/([?&])timestamp=[^&]+&?/g, '$1')
      .replace(/[?&]$/, '');
  }
}

export function extractApolloState(html) {
  const markerIndex = html.indexOf('__APOLLO_STATE__');
  if (markerIndex === -1) {
    return null;
  }

  const braceStart = html.indexOf('{', markerIndex);
  if (braceStart === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = braceStart; index < html.length; index += 1) {
    const char = html[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(braceStart, index + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function addressSearchPart(address) {
  const parts = String(address || '').split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[1] : parts[0] || '';
}

export async function resolveNaverPlaceId(placeName, address) {
  const query = `${placeName} ${addressSearchPart(address)}`.trim();
  if (!query) {
    return null;
  }

  const response = await fetch(
    `https://m.search.naver.com/search.naver?query=${encodeURIComponent(query)}`,
    {
      headers: {
        'User-Agent': MOBILE_UA,
        'Accept-Language': 'ko-KR,ko;q=0.9'
      }
    }
  );

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const match = html.match(PLACE_ID_PATTERN);
  return match ? match[1] : null;
}

export async function fetchNaverPlaceState(placeId, section) {
  const headers = {
    'User-Agent': MOBILE_UA,
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    Referer: `https://m.place.naver.com/restaurant/${placeId}/home`
  };

  for (const biz of NAVER_PLACE_BIZ_TYPES) {
    const url = `https://m.place.naver.com/${biz}/${placeId}/${section}`;
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      if (!html.includes('__APOLLO_STATE__')) {
        continue;
      }

      const state = extractApolloState(html);
      if (state) {
        return { placeUrl: url, state, extractionMethod: 'static-hydration' };
      }
    } catch {
      continue;
    }
  }

  return { placeUrl: null, state: null, extractionMethod: 'static-hydration' };
}

function resolveReviewAuthor(review, nickById) {
  const author = review.author;
  if (author && typeof author === 'object') {
    const ref = author.id || author.__ref;
    if (ref && nickById[ref]) {
      return nickById[ref];
    }
  }

  return review.nickname || review.authorName || null;
}

export function parseReviewsFromApolloState(state, limit = DEFAULT_REVIEW_LIMIT) {
  const values = Object.values(state || {}).filter(
    (value) => value && typeof value === 'object'
  );
  const nickById = {};

  for (const [key, value] of Object.entries(state || {})) {
    if (value && typeof value === 'object' && (value.nickname || value.name)) {
      nickById[value.id || key] = value.nickname || value.name;
    }
  }

  const reviews = [];
  for (const value of values) {
    const body = value.body;
    const typename = value.__typename || '';
    if (!typename.includes('Review') || typeof body !== 'string' || !body.trim()) {
      continue;
    }

    reviews.push({
      author: resolveReviewAuthor(value, nickById),
      rating: value.rating ?? value.starRating ?? null,
      date: value.visited || value.visitDate || value.created || null,
      body: body.trim()
    });

    if (reviews.length >= limit) {
      break;
    }
  }

  return reviews;
}

function summarizeReviews(reviews) {
  if (!reviews.length) {
    return { pros: null, cons: null };
  }

  const positive = reviews.filter(
    (review) => typeof review.rating === 'number' && review.rating >= 4
  );
  const negative = reviews.filter(
    (review) => typeof review.rating === 'number' && review.rating <= 2
  );

  const prosSource = positive[0] || reviews[0];
  const consSource = negative[0] || reviews.find((review) => review.rating === 3) || null;

  return {
    pros: prosSource?.body ? prosSource.body.replace(/\s+/g, ' ').slice(0, 120) : null,
    cons: consSource?.body
      ? consSource.body.replace(/\s+/g, ' ').slice(0, 120)
      : null
  };
}

function averageRating(reviews) {
  const ratings = reviews
    .map((review) => review.rating)
    .filter((rating) => typeof rating === 'number');
  if (!ratings.length) {
    return null;
  }

  const total = ratings.reduce((sum, rating) => sum + rating, 0);
  return Number((total / ratings.length).toFixed(1));
}

export async function extractNaverPlaceReviews({
  placeUrl,
  placeName,
  address,
  reviewLimit = DEFAULT_REVIEW_LIMIT
}) {
  const normalizedUrl = stripNaverUrlTimestamp(placeUrl);
  let placeId = null;
  let resolvedPlaceUrl = normalizedUrl;

  if (normalizedUrl) {
    const match = normalizedUrl.match(PLACE_ID_PATTERN);
    placeId = match ? match[1] : null;
  }

  if (!placeId && placeName) {
    placeId = await resolveNaverPlaceId(placeName, address);
    if (placeId) {
      resolvedPlaceUrl = `https://m.place.naver.com/restaurant/${placeId}/review/visitor`;
    }
  }

  if (!placeId) {
    return {
      provider: 'Naver Map',
      placeUrl: resolvedPlaceUrl,
      placeId: null,
      rating: null,
      reviewCount: null,
      reviews: [],
      reviewSummary: { pros: null, cons: null },
      reviewSnippets: [],
      extractionMethod: 'static-hydration',
      fetchedAt: new Date().toISOString(),
      error: 'Unable to resolve Naver place id'
    };
  }

  const { placeUrl: sourceUrl, state, extractionMethod } =
    await fetchNaverPlaceState(placeId, 'review/visitor');
  const reviews = parseReviewsFromApolloState(state, reviewLimit);
  const reviewSummary = summarizeReviews(reviews);
  const reviewSnippets = reviews
    .slice(0, Math.max(MIN_REVIEW_TARGET, Math.min(reviewLimit, reviews.length)))
    .map((review) => review.body)
    .slice(0, 20);

  return {
    provider: 'Naver Map',
    placeUrl: stripNaverUrlTimestamp(sourceUrl || resolvedPlaceUrl),
    placeId,
    rating: averageRating(reviews),
    reviewCount: reviews.length,
    reviews,
    reviewSummary,
    reviewSnippets,
    extractionMethod,
    fetchedAt: new Date().toISOString(),
    error: reviews.length ? null : 'No reviews extracted from Naver Place page'
  };
}
