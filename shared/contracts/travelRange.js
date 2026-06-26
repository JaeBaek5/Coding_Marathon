export const TOTAL_TIME_MIN_MINUTES = 20;

export const WALK_METERS_PER_MINUTE = 80;
export const DRIVE_METERS_PER_MINUTE = 350;

export const SEARCH_RADIUS_BOUNDS = {
  normal: {
    walk: { floor: 1000, ceiling: 3000 },
    drive: { floor: 5000, ceiling: 35000 }
  },
  travel: {
    walk: { floor: 2000, ceiling: 5000 },
    drive: { floor: 10000, ceiling: 50000 }
  }
};

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

export function resolveSearchRadiusMeters({
  mode = 'normal',
  transportMode = 'walk',
  totalTimeMinutes
} = {}) {
  const modeKey = mode === 'travel' ? 'travel' : 'normal';
  const transportKey = transportMode === 'drive' ? 'drive' : 'walk';
  const bounds =
    SEARCH_RADIUS_BOUNDS[modeKey]?.[transportKey] ||
    SEARCH_RADIUS_BOUNDS.normal.walk;

  const timeBased = computeTravelRadiusMeters(totalTimeMinutes, transportMode);
  if (timeBased <= 0) {
    return bounds.floor;
  }

  return Math.min(bounds.ceiling, Math.max(bounds.floor, timeBased));
}
