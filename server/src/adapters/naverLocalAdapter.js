import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineMeters } from '../utils/haversine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../fixtures');

const DEFAULT_NEARBY_QUERIES = ['맛집', '한식', '일식', '중식', '분식'];
const MEAL_QUERY_MAP = {
  breakfast: ['아침식사', '브런치'],
  lunch: ['점심 맛집', '백반'],
  dinner: ['저녁식사', '식당'],
  late_night: ['야식', '심야식당']
};
const PARTY_QUERY_MAP = {
  solo: ['혼밥', '1인 식당'],
  friends: ['캐주얼 식당'],
  date: ['조용한 식당'],
  family: ['가족식사'],
  colleague: ['점심 식당']
};
const VIBE_QUERY_MAP = {
  quiet: ['조용한 식당', '대화하기 좋은 식당'],
  casual: ['캐주얼 식당'],
  stylish: ['깔끔한 식당']
};
const VENUE_QUERY_MAP = {
  cafe: ['카페', '커피'],
  bar: ['술집', '맥주']
};

function stripHtml(value) {
  return String(value || '').replace(/<\/?b>/gi, '');
}

function hasSearchCredentials() {
  return Boolean(
    process.env.NAVER_SEARCH_ID && process.env.NAVER_SEARCH_SECRET
  );
}

function hasMapsCredentials() {
  return Boolean(
    process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET
  );
}

function shouldUseTestFixtures() {
  return process.env.VITEST === 'true' && !hasSearchCredentials();
}

async function loadFixture(filename) {
  const filePath = path.join(fixturesDir, filename);
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data);
}

function missingSearchCredentialsError() {
  return new Error('NAVER_SEARCH_ID/SECRET is required for Naver local search');
}

function missingMapsCredentialsError() {
  return new Error('NAVER_CLIENT_ID/SECRET is required for Naver Maps API');
}

function buildNearbyQueries(slots = {}) {
  const queries = [
    ...DEFAULT_NEARBY_QUERIES,
    ...(MEAL_QUERY_MAP[slots.mealPeriod] ?? []),
    ...(PARTY_QUERY_MAP[slots.partyContext] ?? []),
    ...(VIBE_QUERY_MAP[slots.vibe] ?? [])
  ];

  if (slots.venuePreference === 'cafe' || slots.venuePreference === 'bar') {
    queries.push(...(VENUE_QUERY_MAP[slots.venuePreference] ?? []));
  }

  for (const excluded of slots.excludedFoods ?? []) {
    if (String(excluded).includes('매운')) {
      queries.push('맵지 않은 식당');
      break;
    }
  }

  return Array.from(new Set(queries)).slice(0, 10);
}

export class NaverLocalAdapter {
  async reverseGeocode(lat, lng) {
    if (!hasMapsCredentials()) {
      if (shouldUseTestFixtures()) {
        return '강남구';
      }
      throw missingMapsCredentialsError();
    }

    const url = new URL(
      'https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc'
    );
    url.searchParams.set('coords', `${lng},${lat}`);
    url.searchParams.set('output', 'json');
    url.searchParams.set('orders', 'admcode,roadaddr');

    const response = await fetch(url, {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID,
        'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET
      }
    });

    if (!response.ok) {
      throw new Error(
        `Naver reverse geocode failed: ${response.status} ${response.statusText}`
      );
    }

    const body = await response.json();
    for (const result of body.results || []) {
      const region = result.region || {};
      const area =
        `${region.area2?.name || ''} ${region.area3?.name || ''}`.trim();
      if (area) return area;
    }

    throw new Error('Naver reverse geocode returned no area');
  }

  async searchLocal(query) {
    if (!hasSearchCredentials()) {
      if (shouldUseTestFixtures()) {
        const fixture = await loadFixture('naver-local-items.json');
        return fixture.items.filter((item) =>
          stripHtml(item.title).includes(stripHtml(query))
        );
      }
      throw missingSearchCredentialsError();
    }

    const url = new URL('https://openapi.naver.com/v1/search/local.json');
    url.searchParams.set('query', query);
    url.searchParams.set('display', '5');
    url.searchParams.set('sort', 'comment');

    const response = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_SEARCH_ID,
        'X-Naver-Client-Secret': process.env.NAVER_SEARCH_SECRET
      }
    });

    if (!response.ok) {
      throw new Error(
        `Naver local search failed: ${response.status} ${response.statusText}`
      );
    }

    const body = await response.json();
    return body.items || [];
  }

  async searchNearbyRestaurants(lat, lng, radius = 1000, slots = {}) {
    if (!hasSearchCredentials()) {
      if (shouldUseTestFixtures()) {
        const fixture = await loadFixture('naver-local-items.json');
        return fixture.items.filter((item) => {
          const itemLat = Number(item.mapy) / 1e7;
          const itemLng = Number(item.mapx) / 1e7;
          return haversineMeters(lat, lng, itemLat, itemLng) <= radius;
        });
      }
      throw missingSearchCredentialsError();
    }

    const area = await this.reverseGeocode(lat, lng);
    const seen = new Set();
    const items = [];

    for (const suffix of buildNearbyQueries(slots)) {
      const query = `${area} ${suffix}`;
      try {
        const batch = await this.searchLocal(query);
        for (const item of batch) {
          const title = stripHtml(item.title);
          if (!title || seen.has(title)) continue;
          seen.add(title);
          items.push(item);
        }
      } catch {
        continue;
      }
    }

    return items.filter((item) => {
      const itemLat = Number(item.mapy) / 1e7;
      const itemLng = Number(item.mapx) / 1e7;
      return haversineMeters(lat, lng, itemLat, itemLng) <= radius;
    });
  }

  async searchKeyword(query) {
    if (!hasSearchCredentials()) {
      if (shouldUseTestFixtures()) {
        const fixture = await loadFixture('naver-keyword-items.json');
        return fixture.items;
      }
      throw missingSearchCredentialsError();
    }

    return this.searchLocal(query);
  }
}
