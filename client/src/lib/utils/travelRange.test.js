import { describe, it, expect } from 'vitest';
import {
  computeMaxOneWayTravelMinutes,
  computeTravelRadiusMeters,
  formatTravelRadiusKm
} from '../../lib/utils/travelRange.js';

describe('travelRange', () => {
  it('computes one-way travel minutes as half of total budget', () => {
    expect(computeMaxOneWayTravelMinutes(60)).toBe(30);
    expect(computeMaxOneWayTravelMinutes(19)).toBe(0);
  });

  it('computes walk and drive radii differently', () => {
    const walkRadius = computeTravelRadiusMeters(60, 'walk');
    const driveRadius = computeTravelRadiusMeters(60, 'drive');

    expect(walkRadius).toBe(2400);
    expect(driveRadius).toBeGreaterThan(walkRadius);
  });

  it('formats radius in kilometers', () => {
    expect(formatTravelRadiusKm(2400)).toBe('2.4');
  });
});
