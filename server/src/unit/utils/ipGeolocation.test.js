import { describe, it, expect } from 'vitest';
import {
  getClientIp,
  isPrivateOrLocalIp,
  normalizeIpWhoResponse,
  lookupIpLocation
} from '../../utils/ipGeolocation.js';

describe('ipGeolocation utilities', () => {
  it('detects private and local IPs', () => {
    expect(isPrivateOrLocalIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrLocalIp('::1')).toBe(true);
    expect(isPrivateOrLocalIp('192.168.0.12')).toBe(true);
    expect(isPrivateOrLocalIp('8.8.8.8')).toBe(false);
  });

  it('reads client IP from forwarded headers', () => {
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' }
    };
    expect(getClientIp(req)).toBe('203.0.113.10');
  });

  it('normalizes ipwho.is responses', () => {
    const normalized = normalizeIpWhoResponse({
      success: true,
      latitude: 34.95,
      longitude: 127.49,
      city: 'Suncheon',
      region: 'Jeollanam-do',
      country: 'South Korea'
    });

    expect(normalized).toEqual({
      lat: 34.95,
      lng: 127.49,
      label: 'Suncheon, Jeollanam-do, South Korea',
      accuracyMeters: 5000,
      source: 'ip-geolocation'
    });
  });

  it('looks up public IP locations through ipwho.is', async () => {
    const fetchFn = async () => ({
      ok: true,
      async json() {
        return {
          success: true,
          latitude: 37.5,
          longitude: 127.0,
          city: 'Seoul',
          region: 'Seoul',
          country: 'South Korea'
        };
      }
    });

    const result = await lookupIpLocation('203.0.113.10', fetchFn);
    expect(result.lat).toBe(37.5);
    expect(result.source).toBe('ip-geolocation');
  });
});
