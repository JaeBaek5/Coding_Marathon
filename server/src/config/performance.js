function envFlag(name, defaultValue = true) {
  const value = process.env[name];
  if (value === undefined || value === null || value.trim() === '') {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  return defaultValue;
}

export const FAST_MODE = envFlag('MUMUK_FAST_MODE', true);

export const ALEPH_LLM_TIMEOUT_MS = Number(process.env.ALEPH_LLM_TIMEOUT_MS) || 2500;
export const ALEPH_FOOD_INFERENCE_TIMEOUT_MS =
  Number(process.env.ALEPH_FOOD_INFERENCE_TIMEOUT_MS) || 15000;
export const SLOT_AI_TIMEOUT_MS = Number(process.env.SLOT_AI_TIMEOUT_MS) || 2000;
export const GIMEL_LLM_TIMEOUT_MS = Number(process.env.GIMEL_LLM_TIMEOUT_MS) || 3500;

export const BET_ROUTE_CANDIDATE_LIMIT_FAST = 20;
export const BET_ROUTE_CONCURRENCY_FAST = 6;
export const BET_REVIEW_ENRICH_LIMIT_FAST = 3;
export const BET_REVIEW_TIMEOUT_MS_FAST = 5000;
export const GIMEL_LLM_CANDIDATE_LIMIT_FAST = 1;
