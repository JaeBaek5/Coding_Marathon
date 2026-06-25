import {
  NormalizedRouteSchema,
  NormalizedCandidateSchema,
  LocationSearchResultSchema
} from '../../../shared/contracts/schemas.js';

export function normalizeKakaoLocalCandidate(rawDoc) {
  const categorySegment = rawDoc.category_name
    ? rawDoc.category_name.split(' > ')[1] ||
      rawDoc.category_name.split(' > ')[0] ||
      '음식점'
    : '음식점';

  return {
    id: String(rawDoc.id),
    name: rawDoc.place_name,
    category: categorySegment,
    address: rawDoc.road_address_name || rawDoc.address_name || '',
    location: {
      lat: parseFloat(rawDoc.y),
      lng: parseFloat(rawDoc.x)
    },
    priceLevel: null,
    openingHours: null,
    rating: null,
    reviewCount: null,
    reviewSummary: null,
    openStatus: null
  };
}

export function normalizeKakaoKeywordLocation(rawDoc) {
  const item = {
    id: String(rawDoc.id),
    name: rawDoc.place_name,
    address: rawDoc.road_address_name || rawDoc.address_name || '',
    location: {
      lat: parseFloat(rawDoc.y),
      lng: parseFloat(rawDoc.x)
    }
  };
  return LocationSearchResultSchema.parse(item);
}

export function normalizeKakaoWalkingRoute(rawRoute) {
  if (!rawRoute.routes || rawRoute.routes.length === 0) {
    throw new Error('No walking routes found');
  }

  const route = rawRoute.routes[0];
  const distanceMeters = Math.round(route.summary.distance);
  const durationMinutes = Math.round(route.summary.duration / 60);

  const pathCoords = [];
  if (route.sections?.[0]?.roads) {
    for (const road of route.sections[0].roads) {
      if (road.vertexes) {
        for (let i = 0; i < road.vertexes.length; i += 2) {
          pathCoords.push({
            lng: road.vertexes[i],
            lat: road.vertexes[i + 1]
          });
        }
      }
    }
  }

  const result = {
    durationMinutes,
    distanceMeters,
    path: pathCoords
  };

  return NormalizedRouteSchema.parse(result);
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
      ? 'Kakao Local / Kakao Mobility'
      : 'Kakao Local / NAVER Maps';

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
