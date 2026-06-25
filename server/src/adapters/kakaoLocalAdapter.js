import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../fixtures');

export class KakaoLocalAdapter {
  constructor() {
    this.apiKey = process.env.KAKAO_API_KEY;
  }

  async searchNearbyRestaurants(lat, lng, radius = 1000) {
    if (!this.apiKey) {
      const filePath = path.join(fixturesDir, 'kakao-category-response.json');
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    }

    const url = new URL('https://dapi.kakao.com/v2/local/search/category.json');
    url.searchParams.append('category_group_code', 'FD6');
    url.searchParams.append('y', String(lat));
    url.searchParams.append('x', String(lng));
    url.searchParams.append('radius', String(radius));
    url.searchParams.append('size', '15');

    const response = await fetch(url, {
      headers: {
        Authorization: `KakaoAK ${this.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(
        `Kakao Local API category search failed: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  async searchKeyword(query) {
    if (!this.apiKey) {
      const filePath = path.join(fixturesDir, 'kakao-keyword-response.json');
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    }

    const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    url.searchParams.append('query', query);

    const response = await fetch(url, {
      headers: {
        Authorization: `KakaoAK ${this.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(
        `Kakao Local API keyword search failed: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }
}
