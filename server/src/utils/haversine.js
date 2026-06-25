const WALK_METERS_PER_MINUTE = 67;
const WALK_DETOUR_FACTOR = 1.3;
const DRIVE_METERS_PER_MINUTE = 500;
const DRIVE_DETOUR_FACTOR = 1.35;

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const earthRadiusMeters = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

export function estimateWalkingRoute(startLat, startLng, goalLat, goalLng) {
  const straightMeters = haversineMeters(startLat, startLng, goalLat, goalLng);
  const distanceMeters = Math.round(straightMeters * WALK_DETOUR_FACTOR);
  const durationMinutes = Math.max(
    1,
    Math.round(distanceMeters / WALK_METERS_PER_MINUTE)
  );

  return {
    durationMinutes,
    distanceMeters,
    path: [
      { lat: startLat, lng: startLng },
      { lat: goalLat, lng: goalLng }
    ]
  };
}

export function estimateDrivingRoute(startLat, startLng, goalLat, goalLng) {
  const straightMeters = haversineMeters(startLat, startLng, goalLat, goalLng);
  const distanceMeters = Math.round(straightMeters * DRIVE_DETOUR_FACTOR);
  const durationMinutes = Math.max(
    1,
    Math.round(distanceMeters / DRIVE_METERS_PER_MINUTE)
  );

  return {
    durationMinutes,
    distanceMeters,
    path: [
      { lat: startLat, lng: startLng },
      { lat: goalLat, lng: goalLng }
    ]
  };
}
