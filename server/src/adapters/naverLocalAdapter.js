import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineMeters } from '../utils/haversine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../fixtures');

import { expandFoodSearchSuffixes } from '../utils/foodPreference.js';
import { resolveNearbyQuerySuffixes } from '../utils/venueGating.js';

function stripHtml(value) {
  return String(value || '').replace(/<\/?b>/gi, '');
}

function hasSearchCredentials() {
  return Boolean(process.env.NAVER_SEARCH_ID && process.env.NAVER_SEARCH_SECRET);
}

function hasMapsCredentials() {
  return Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
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
  return new Error(
    'NAVER_SEARCH_ID/SECRET 없음 (developers.naver.com 검색 API 키 필요)'
  );
}

function missingMapsCredentialsError() {
  return new Error(
    'NAVER_CLIENT_ID/SECRET 없음 (Naver Cloud Maps API 키 필요)'
  );
}

export class NaverLocalAdapter {
  async reverseGeocode(lat, lng) {
    if (!hasMapsCredentials()) {
      if (shouldUseTestFixtures()) {
        return '역삼동';
      }
      throw missingMapsCredentialsError();
    }

    const url = new URL('https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc');
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
      const area = `${region.area2?.name || ''} ${region.area3?.name || ''}`.trim();
      if (area) {
        return area;
      }
    }

    throw new Error('Naver reverse geocode returned no area');
  }

  async searchLocal(query, display = 5) {
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
    url.searchParams.set('display', String(display));
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

  async searchNearbyRestaurants(lat, lng, radius = 1000, options = {}) {
    const desiredFoods = Array.isArray(options.desiredFoods)
      ? options.desiredFoods
      : [];
    const searchKeywords = Array.isArray(options.searchKeywords)
      ? options.searchKeywords
      : [];
    const venuePreference = options.venuePreference || 'restaurant';
    const querySuffixes = resolveNearbyQuerySuffixes({
      desiredFoods,
      searchKeywords,
      venuePreference,
      expandFoodSearchSuffixes
    });
    const displayPerQuery =
      desiredFoods.length > 0 || searchKeywords.length > 0 ? 10 : 5;
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

    for (const suffix of querySuffixes) {
      const query = `${area} ${suffix}`;
      try {
        const batch = await this.searchLocal(query, displayPerQuery);
        for (const item of batch) {
          const title = stripHtml(item.title);
          if (!title || seen.has(title)) {
            continue;
          }
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
