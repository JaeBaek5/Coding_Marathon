export function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
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

  return R * c;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function normalizeId(value) {
  if (!value || typeof value !== 'string') return '';
  const cleaned = value.split('?')[0].replace(/\/+$/, '');
  return cleaned.toLowerCase().trim();
}

export function deduplicateCandidates(candidates) {
  const unique = [];

  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue;

    const normId = normalizeId(item.id);
    const normName = normalizeText(item.name);
    const normAddr = normalizeText(item.address);

    const isDuplicate = unique.some((existing) => {
      const existingNormId = normalizeId(existing.id);
      if (normId && existingNormId && normId === existingNormId) {
        return true;
      }

      const existingName = normalizeText(existing.name);
      const existingAddr = normalizeText(existing.address);

      const matchName = existingName && normName && existingName === normName;
      const matchAddr = existingAddr && normAddr && existingAddr === normAddr;
      if (matchName && matchAddr) {
        const dist = getDistanceMeters(
          item.location.lat,
          item.location.lng,
          existing.location.lat,
          existing.location.lng
        );
        return dist <= 50;
      }
      return false;
    });

    if (!isDuplicate) {
      unique.push(item);
    }
  }

  return unique;
}
