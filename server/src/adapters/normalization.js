import {
  NormalizedRouteSchema,
  NormalizedCandidateSchema,
  LocationSearchResultSchema
} from '../../../shared/contracts/schemas.js';

function stripHtml(value) {
  return String(value || '').replace(/<\/?b>/gi, '');
}

function buildStableCandidateId({ title, lat, lng, link }) {
  const normalizedLink = typeof link === 'string' ? link.trim() : '';
  if (
    normalizedLink &&
    /(?:place\.naver\.com|map\.naver\.com)/i.test(normalizedLink)
  ) {
    return normalizedLink;
  }

  const slug = title.replace(/\s+/g, '').toLowerCase() || 'unknown';
  return `${slug}@${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export function normalizeNaverLocalItem(item) {
  const title = stripHtml(item.title);
  const categoryParts = String(item.category || '').split('>');
  const category =
    categoryParts[categoryParts.length - 1]?.trim() ||
    categoryParts[0]?.trim() ||
    '음식점';
  const lat = Number(item.mapy) / 1e7;
  const lng = Number(item.mapx) / 1e7;

  return {
    id: buildStableCandidateId({ title, lat, lng, link: item.link }),
    name: title,
    category,
    address: item.roadAddress || item.address || '',
    location: { lat, lng },
    placeUrl: item.link || null,
    priceLevel: null,
    openingHours: null,
    rating: null,
    reviewCount: null,
    reviewSummary: null,
    openStatus: null
  };
}

export function normalizeNaverKeywordLocation(item) {
  const normalized = normalizeNaverLocalItem(item);
  return LocationSearchResultSchema.parse({
    id: normalized.id,
    name: normalized.name,
    address: normalized.address,
    location: normalized.location
  });
}

export function normalizeWalkingRoute(route) {
  return NormalizedRouteSchema.parse(route);
}

function normalizeNaverPathRoute(section) {
  const distanceMeters = Math.round(section.summary.distance);
  const durationMinutes = Math.round(section.summary.duration / 1000 / 60);
  const pathCoords = section.path.map((coord) => ({
    lng: coord[0],
    lat: coord[1]
  }));

  return NormalizedRouteSchema.parse({
    durationMinutes,
    distanceMeters,
    path: pathCoords
  });
}

export function normalizeNaverWalkingRoute(rawRoute) {
  if (
    rawRoute.code !== 0 ||
    !rawRoute.route ||
    !rawRoute.route.traoptimal ||
    rawRoute.route.traoptimal.length === 0
  ) {
    throw new Error('No walking routes found');
  }

  return normalizeNaverPathRoute(rawRoute.route.traoptimal[0]);
}

export function normalizeNaverDrivingRoute(rawRoute) {
  if (
    rawRoute.code !== 0 ||
    !rawRoute.route ||
    !rawRoute.route.trafast ||
    rawRoute.route.trafast.length === 0
  ) {
    throw new Error('No driving routes found');
  }

  return normalizeNaverPathRoute(rawRoute.route.trafast[0]);
}

export function mergeCandidateWithRoute(candidate, route, transportMode) {
  const oneWayRouteMinutes = route.durationMinutes;
  const totalExpectedMinutes = oneWayRouteMinutes * 2 + 30;

  const hasAllMetadata =
    candidate.id && candidate.name && candidate.category && candidate.address;
  const confidenceBadge = hasAllMetadata ? 'high' : 'medium';

  const hasDetailedPath = Array.isArray(route.path) && route.path.length > 2;
  const providerAttribution =
    hasDetailedPath || transportMode === 'drive'
      ? 'Naver Local Search / Naver Maps'
      : 'Naver Local Search / Walk estimate';

  const merged = {
    ...candidate,
    transportMode,
    oneWayRouteMinutes,
    totalExpectedMinutes,
    distanceMeters: route.distanceMeters,
    confidenceBadge,
    reason: '',
    providerAttribution,
    path: route.path || []
  };

  return NormalizedCandidateSchema.parse(merged);
}
