import { describe, it, expect } from 'vitest';
import {
  computeTravelRadiusMeters,
  resolveSearchRadiusMeters
} from '../../../../shared/contracts/travelRange.js';

describe('travelRange contract', () => {
  it('expands drive search radius as total time grows', () => {
    const shortTrip = resolveSearchRadiusMeters({
      mode: 'normal',
      transportMode: 'drive',
      totalTimeMinutes: 60
    });
    const longTrip = resolveSearchRadiusMeters({
      mode: 'normal',
      transportMode: 'drive',
      totalTimeMinutes: 150
    });

    expect(shortTrip).toBeGreaterThan(5000);
    expect(longTrip).toBeGreaterThan(shortTrip);
    expect(longTrip).toBe(computeTravelRadiusMeters(150, 'drive'));
  });

  it('keeps walk search radius within bounded range', () => {
    const radius = resolveSearchRadiusMeters({
      mode: 'normal',
      transportMode: 'walk',
      totalTimeMinutes: 240
    });

    expect(radius).toBeLessThanOrEqual(3000);
    expect(radius).toBeGreaterThanOrEqual(1000);
  });
});
