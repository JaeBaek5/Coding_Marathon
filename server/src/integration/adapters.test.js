import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  searchNearbyCandidates,
  searchLocation,
  getWalkingRoute,
  getDrivingRoute
} from '../adapters/index.js';
import { cache } from '../utils/cache.js';

describe('Adapter Boundaries Integration', () => {
  beforeEach(() => {
    cache.clear();
  });

  afterEach(() => {
    cache.clear();
  });

  it('should search nearby candidates, normalize, and deduplicate', async () => {
    const lat = 37.4979;
    const lng = 127.0276;

    const results = await searchNearbyCandidates(lat, lng, 500);
    expect(results).toBeInstanceOf(Array);
    if (results.length > 0) {
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('name');
      expect(results[0]).toHaveProperty('category');
      expect(results[0]).toHaveProperty('address');
      expect(results[0]).toHaveProperty('location');
      expect(results[0].location).toHaveProperty('lat');
      expect(results[0].location).toHaveProperty('lng');
    }

    const cachedResults = await searchNearbyCandidates(lat, lng, 500);
    expect(cachedResults).toEqual(results);
  });

  it('should search location by keyword and normalize', async () => {
    const query = '강남역';
    const results = await searchLocation(query);
    expect(results).toBeInstanceOf(Array);
    if (results.length > 0) {
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('name');
      expect(results[0]).toHaveProperty('address');
      expect(results[0]).toHaveProperty('location');
    }

    const cachedResultsLocation = await searchLocation(query);
    expect(cachedResultsLocation).toEqual(results);
  });

  it('should get walking route, normalize, and cache', async () => {
    const startLat = 37.4979;
    const startLng = 127.0276;
    const goalLat = 37.4981;
    const goalLng = 127.0282;

    const route = await getWalkingRoute(startLat, startLng, goalLat, goalLng);
    expect(route).toHaveProperty('durationMinutes');
    expect(route).toHaveProperty('distanceMeters');
    expect(route).toHaveProperty('path');
    expect(route.path).toBeInstanceOf(Array);

    const cachedRoute = await getWalkingRoute(
      startLat,
      startLng,
      goalLat,
      goalLng
    );
    expect(cachedRoute).toEqual(route);
  });

  it('should get driving route, normalize, and cache', async () => {
    const startLat = 37.4979;
    const startLng = 127.0276;
    const goalLat = 37.4965;
    const goalLng = 127.0255;

    const route = await getDrivingRoute(startLat, startLng, goalLat, goalLng);
    expect(route).toHaveProperty('durationMinutes');
    expect(route).toHaveProperty('distanceMeters');
    expect(route).toHaveProperty('path');
    expect(route.path).toBeInstanceOf(Array);

    const cachedRoute = await getDrivingRoute(
      startLat,
      startLng,
      goalLat,
      goalLng
    );
    expect(cachedRoute).toEqual(route);
  });
});
