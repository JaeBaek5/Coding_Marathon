import { NaverLocalAdapter } from './naverLocalAdapter.js';
import { NaverDirectionsAdapter } from './naverDirectionsAdapter.js';
import { cache, cacheTTLs } from '../utils/cache.js';
import { deduplicateCandidates } from '../utils/dedupe.js';
import { estimateWalkingRoute, estimateDrivingRoute } from '../utils/haversine.js';
import {
  normalizeNaverLocalItem,
  normalizeNaverKeywordLocation,
  normalizeWalkingRoute,
  normalizeNaverDrivingRoute,
  mergeCandidateWithRoute
} from './normalization.js';

const naverLocal = new NaverLocalAdapter();
const naverDirections = new NaverDirectionsAdapter();

export async function searchNearbyCandidates(lat, lng, radius = 1000) {
  const key = `nearby:${lat}:${lng}:${radius}`;
  return cache.wrap(key, cacheTTLs.NEARBY, async () => {
    const raw = await naverLocal.searchNearbyRestaurants(lat, lng, radius);
    const normalized = raw.map(normalizeNaverLocalItem);
    return deduplicateCandidates(normalized);
  });
}

export async function searchLocation(query) {
  const key = `geocode:${query}`;
  return cache.wrap(key, cacheTTLs.LOCATION, async () => {
    const raw = await naverLocal.searchKeyword(query);
    return raw.map(normalizeNaverKeywordLocation);
  });
}

export async function getWalkingRoute(startLat, startLng, goalLat, goalLng) {
  const key = `walk:${startLat}:${startLng}:${goalLat}:${goalLng}`;
  return cache.wrap(key, cacheTTLs.ROUTE, async () => {
    const route = estimateWalkingRoute(startLat, startLng, goalLat, goalLng);
    return normalizeWalkingRoute(route);
  });
}

export async function getDrivingRoute(startLat, startLng, goalLat, goalLng) {
  const key = `drive:v2:${startLat}:${startLng}:${goalLat}:${goalLng}`;
  return cache.wrap(key, cacheTTLs.ROUTE, async () => {
    try {
      const raw = await naverDirections.getDrivingRoute(
        startLat,
        startLng,
        goalLat,
        goalLng
      );
      return normalizeNaverDrivingRoute(raw);
    } catch {
      const route = estimateDrivingRoute(startLat, startLng, goalLat, goalLng);
      return normalizeWalkingRoute(route);
    }
  });
}

export { mergeCandidateWithRoute };
