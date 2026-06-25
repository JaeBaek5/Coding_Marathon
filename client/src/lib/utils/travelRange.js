export const TOTAL_TIME_MIN_MINUTES = 20;

export const WALK_METERS_PER_MINUTE = 80;
export const DRIVE_METERS_PER_MINUTE = 350;

export function computeMaxOneWayTravelMinutes(totalTimeMinutes) {
  if (
    typeof totalTimeMinutes !== 'number' ||
    !Number.isFinite(totalTimeMinutes) ||
    totalTimeMinutes < TOTAL_TIME_MIN_MINUTES
  ) {
    return 0;
  }

  return Math.floor(totalTimeMinutes / 2);
}

export function computeTravelRadiusMeters(
  totalTimeMinutes,
  transportMode = 'walk'
) {
  const oneWayMinutes = computeMaxOneWayTravelMinutes(totalTimeMinutes);
  if (oneWayMinutes <= 0) {
    return 0;
  }

  const metersPerMinute =
    transportMode === 'drive' ? DRIVE_METERS_PER_MINUTE : WALK_METERS_PER_MINUTE;
  return oneWayMinutes * metersPerMinute;
}

export function formatTravelRadiusKm(radiusMeters) {
  if (!radiusMeters || radiusMeters <= 0) {
    return '0';
  }

  if (radiusMeters >= 1000) {
    return (radiusMeters / 1000).toFixed(1);
  }

  return (radiusMeters / 1000).toFixed(2);
}
