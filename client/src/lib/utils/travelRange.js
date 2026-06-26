export {
  TOTAL_TIME_MIN_MINUTES,
  WALK_METERS_PER_MINUTE,
  DRIVE_METERS_PER_MINUTE,
  computeMaxOneWayTravelMinutes,
  computeTravelRadiusMeters,
  resolveSearchRadiusMeters
} from '@shared/contracts/travelRange.js';

export function formatTravelRadiusKm(radiusMeters) {
  if (!radiusMeters || radiusMeters <= 0) {
    return '0';
  }

  if (radiusMeters >= 1000) {
    return (radiusMeters / 1000).toFixed(1);
  }

  return (radiusMeters / 1000).toFixed(2);
}
