const IPWHO_BASE_URL = 'https://ipwho.is';

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  const remote = req.socket?.remoteAddress || '';
  return remote.replace(/^::ffff:/, '');
}

export function isPrivateOrLocalIp(ip) {
  if (!ip) {
    return true;
  }

  if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') {
    return true;
  }

  if (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.')
  ) {
    return true;
  }

  const parts = ip.split('.');
  if (parts.length === 4 && parts[0] === '172') {
    const second = Number(parts[1]);
    if (second >= 16 && second <= 31) {
      return true;
    }
  }

  return false;
}

export function normalizeIpWhoResponse(body) {
  if (!body?.success) {
    throw new Error(body?.message || 'IP geolocation lookup failed');
  }

  if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
    throw new Error('IP geolocation response missing coordinates');
  }

  const label = [body.city, body.region, body.country]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(', ');

  return {
    lat: body.latitude,
    lng: body.longitude,
    label: label || 'IP 추정 위치',
    accuracyMeters: 5000,
    source: 'ip-geolocation'
  };
}

export async function lookupIpLocation(ip, fetchFn = fetch) {
  const url =
    ip && !isPrivateOrLocalIp(ip)
      ? `${IPWHO_BASE_URL}/${encodeURIComponent(ip)}`
      : `${IPWHO_BASE_URL}/`;

  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(
      `IP geolocation failed: ${response.status} ${response.statusText}`
    );
  }

  const body = await response.json();
  return normalizeIpWhoResponse(body);
}
