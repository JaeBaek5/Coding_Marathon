export function formatProgressElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return null;
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60_000) {
    const seconds = ms / 1000;
    return seconds < 10 ? `${seconds.toFixed(1)}초` : `${Math.round(seconds)}초`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}분 ${seconds}초` : `${minutes}분`;
}

export function formatProgressClock(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

export function formatProgressMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return [];
  }

  return Object.entries(meta)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: ${value.join(', ')}`;
      }
      return `${key}: ${value}`;
    });
}
