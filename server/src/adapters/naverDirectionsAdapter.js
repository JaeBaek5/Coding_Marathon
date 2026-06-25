function getMapsCredentials() {
  return {
    clientId: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET
  };
}

export class NaverDirectionsAdapter {
  async getDrivingRoute(startLat, startLng, goalLat, goalLng) {
    const { clientId, clientSecret } = getMapsCredentials();
    if (!clientId || !clientSecret) {
      throw new Error(
        'NAVER_CLIENT_ID/SECRET 없음 (Naver Cloud Directions API 키 필요)'
      );
    }

    const url = new URL(
      'https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving'
    );
    url.searchParams.append('start', `${startLng},${startLat}`);
    url.searchParams.append('goal', `${goalLng},${goalLat}`);
    url.searchParams.append('option', 'trafast');

    const response = await fetch(url, {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': clientId,
        'X-NCP-APIGW-API-KEY': clientSecret
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
