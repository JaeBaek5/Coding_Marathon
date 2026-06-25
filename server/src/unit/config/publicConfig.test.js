import { describe, expect, it } from 'vitest';
import { getPublicConfig } from '../../config/publicConfig.js';

describe('public config', () => {
  it('prefers the dedicated Naver Maps JavaScript client id for browser maps', () => {
    const config = getPublicConfig({
      NAVER_MAP_CLIENT_ID: 'browser-map-client-id',
      NAVER_CLIENT_ID: 'server-naver-client-id',
      NAVER_CLIENT_SECRET: 'secret-naver-client-secret'
    });

    expect(config.naverClientId).toBe('browser-map-client-id');
    expect(config.mapReady).toBe(true);
    expect(config.providerReadiness.map).toBe(true);
    expect(config.providerReadiness.naverDirections).toBe(true);
    expect(JSON.stringify(config)).not.toContain('secret-naver-client-secret');
  });
});
