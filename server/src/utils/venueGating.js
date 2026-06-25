const EXPLICIT_VENUE_KEYWORDS = [
  '카페',
  'cafe',
  'coffee',
  '커피',
  '디저트',
  'dessert',
  '베이커리',
  'bakery',
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
  '술'
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
  /\bbar\b/i,
  /\bpub\b/i
];

export function detectExplicitVenueIntent(textSources = []) {
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
    .join(' ')
    .toLowerCase();

  return EXPLICIT_VENUE_KEYWORDS.some((keyword) =>
    combined.includes(keyword.toLowerCase())
  );
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

  if (slot.venueIntentExplicit === true) {
    return true;
  }

  return false;
}

export function filterCandidatesByVenue(candidates, slot = {}) {
  return candidates.filter((candidate) => isVenueAllowed(candidate, slot));
}
