import { KakaoLocalAdapter } from './kakaoLocalAdapter.js';
import { KakaoMobilityAdapter } from './kakaoMobilityAdapter.js';
import { NaverDirectionsAdapter } from './naverDirectionsAdapter.js';
import { cache, cacheTTLs } from '../utils/cache.js';
import { deduplicateCandidates } from '../utils/dedupe.js';
import {
  normalizeKakaoLocalCandidate,
  normalizeKakaoKeywordLocation,
  normalizeKakaoWalkingRoute,
  normalizeNaverDrivingRoute,
  mergeCandidateWithRoute
} from './normalization.js';

const kakaoLocal = new KakaoLocalAdapter();
const kakaoMobility = new KakaoMobilityAdapter();
const naverDirections = new NaverDirectionsAdapter();

export async function searchNearbyCandidates(lat, lng, radius = 1000) {
  const key = `nearby:${lat}:${lng}:${radius}`;
  return cache.wrap(key, cacheTTLs.NEARBY, async () => {
    const raw = await kakaoLocal.searchNearbyRestaurants(lat, lng, radius);
    if (!raw.documents) return [];
    const normalized = raw.documents.map(normalizeKakaoLocalCandidate);
    return deduplicateCandidates(normalized);
  });
}

export async function searchLocation(query) {
  const key = `geocode:${query}`;
  return cache.wrap(key, cacheTTLs.LOCATION, async () => {
    const raw = await kakaoLocal.searchKeyword(query);
    if (!raw.documents) return [];
    return raw.documents.map(normalizeKakaoKeywordLocation);
  });
}

export async function getWalkingRoute(startLat, startLng, goalLat, goalLng) {
  const key = `walk:${startLat}:${startLng}:${goalLat}:${goalLng}`;
  return cache.wrap(key, cacheTTLs.ROUTE, async () => {
    const raw = await kakaoMobility.getWalkingRoute(
      startLat,
      startLng,
      goalLat,
      goalLng
    );
    return normalizeKakaoWalkingRoute(raw);
  });
}

export async function getDrivingRoute(startLat, startLng, goalLat, goalLng) {
  const key = `drive:${startLat}:${startLng}:${goalLat}:${goalLng}`;
  return cache.wrap(key, cacheTTLs.ROUTE, async () => {
    const raw = await naverDirections.getDrivingRoute(
      startLat,
      startLng,
      goalLat,
      goalLng
    );
    return normalizeNaverDrivingRoute(raw);
  });
}

export { mergeCandidateWithRoute };
