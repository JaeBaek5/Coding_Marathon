import {
  NormalizedRouteSchema,
  NormalizedCandidateSchema,
  LocationSearchResultSchema
} from '../../../shared/contracts/schemas.js';

function stripHtml(value) {
  return String(value || '').replace(/<\/?b>/gi, '');
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
    id: item.link || title,
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
    mainPhoto: null,
    menuBoardPhoto: null,
    reviewPhotos: [],
    menuItems: [],
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

export function normalizeNaverDrivingRoute(rawRoute) {
  if (
    rawRoute.code !== 0 ||
    !rawRoute.route ||
    !rawRoute.route.trafast ||
    rawRoute.route.trafast.length === 0
  ) {
    throw new Error('No driving routes found');
  }

  const trafast = rawRoute.route.trafast[0];
  const distanceMeters = Math.round(trafast.summary.distance);
  const durationMinutes = Math.round(trafast.summary.duration / 1000 / 60);

  const pathCoords = trafast.path.map((coord) => ({
    lng: coord[0],
    lat: coord[1]
  }));

  const result = {
    durationMinutes,
    distanceMeters,
    path: pathCoords
  };

  return NormalizedRouteSchema.parse(result);
}

export function mergeCandidateWithRoute(candidate, route, transportMode) {
  const oneWayRouteMinutes = route.durationMinutes;
  const totalExpectedMinutes = oneWayRouteMinutes * 2 + 30;

  const hasAllMetadata =
    candidate.id && candidate.name && candidate.category && candidate.address;
  const confidenceBadge = hasAllMetadata ? 'high' : 'medium';

  const providerAttribution =
    transportMode === 'walk'
      ? 'Naver Local Search / Walk estimate'
      : 'Naver Local Search / Naver Maps';

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
