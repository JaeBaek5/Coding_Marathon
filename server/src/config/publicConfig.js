import { getPublicHarnessConfig } from '../llm/client.js';

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function getProviderReadiness(env = process.env) {
  const hasNaverClientId = hasValue(env.NAVER_CLIENT_ID);
  const hasNaverClientSecret = hasValue(env.NAVER_CLIENT_SECRET);
  const hasKakaoApiKey = hasValue(env.KAKAO_API_KEY);
  const hasOpenRouterApiKey =
    hasValue(env.OPENROUTER_API_KEY) || hasValue(env.LLM_API_KEY);

  return {
    map: hasNaverClientId,
    kakaoLocal: hasKakaoApiKey,
    kakaoMobility: hasKakaoApiKey,
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
    timeRange: { min: 20, max: 60 },
    llmHarness
  };
}
