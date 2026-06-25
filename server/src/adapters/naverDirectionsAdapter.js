import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../fixtures');

export class NaverDirectionsAdapter {
  constructor() {
    this.clientId = process.env.NAVER_CLIENT_ID;
    this.clientSecret = process.env.NAVER_CLIENT_SECRET;
  }

  async getDrivingRoute(startLat, startLng, goalLat, goalLng) {
    if (!this.clientId || !this.clientSecret) {
      const filePath = path.join(fixturesDir, 'naver-driving-response.json');
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    }

    const url = new URL(
      'https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving'
    );
    url.searchParams.append('start', `${startLng},${startLat}`);
    url.searchParams.append('goal', `${goalLng},${goalLat}`);
    url.searchParams.append('option', 'trafast');

    const response = await fetch(url, {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': this.clientId,
        'X-NCP-APIGW-API-KEY': this.clientSecret
      }
    });

    if (!response.ok) {
      throw new Error(
        `NAVER Directions 5 driving directions failed: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }
}
