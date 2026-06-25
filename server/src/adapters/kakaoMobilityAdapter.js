import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../fixtures');

export class KakaoMobilityAdapter {
  constructor() {
    this.apiKey = process.env.KAKAO_API_KEY;
  }

  async getWalkingRoute(startLat, startLng, goalLat, goalLng) {
    if (!this.apiKey) {
      const filePath = path.join(fixturesDir, 'kakao-walking-response.json');
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    }

    const url = new URL('https://apis-navi.kakaomobility.com/v1/directions');
    url.searchParams.append('origin', `${startLng},${startLat}`);
    url.searchParams.append('destination', `${goalLng},${goalLat}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `KakaoAK ${this.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(
        `Kakao Mobility walking directions failed: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }
}
