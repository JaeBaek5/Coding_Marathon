import { getPublicHarnessConfig } from '../llm/client.js';
import { TOTAL_TIME_MIN_MINUTES } from '../../../shared/contracts/schemas.js';

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function getProviderReadiness(env = process.env) {
  const hasNaverClientId = hasValue(env.NAVER_CLIENT_ID);
  const hasNaverClientSecret = hasValue(env.NAVER_CLIENT_SECRET);
  const hasNaverSearchId = hasValue(env.NAVER_SEARCH_ID);
  const hasNaverSearchSecret = hasValue(env.NAVER_SEARCH_SECRET);
  const hasOpenRouterApiKey =
    hasValue(env.OPENROUTER_API_KEY) || hasValue(env.LLM_API_KEY);

  return {
    map: hasNaverClientId,
    naverLocalSearch: hasNaverSearchId && hasNaverSearchSecret,
    naverGeocoding: hasNaverClientId && hasNaverClientSecret,
    naverDirections: hasNaverClientId && hasNaverClientSecret,
    openRouter: hasOpenRouterApiKey
  };
}

export function getPublicConfig(env = process.env) {
  let llmHarness = null;
  try {
    llmHarness = getPublicHarnessConfig();
  } catch {
    llmHarness = null;
  }

  const providerReadiness = getProviderReadiness(env);
  const naverClientId = hasValue(env.NAVER_CLIENT_ID)
    ? env.NAVER_CLIENT_ID
    : null;

  return {
    mapProvider: 'naver',
    naverClientId,
    mapReady: providerReadiness.map,
    providerReadiness,
    defaultLocale: 'ko-KR',
    supportedTransportModes: ['walk', 'drive'],
    timeRange: { min: TOTAL_TIME_MIN_MINUTES, max: null },
    llmHarness
  };
}
