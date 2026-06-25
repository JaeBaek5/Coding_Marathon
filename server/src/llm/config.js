export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_DEFAULT_MODEL = 'anthropic/claude-opus-4.8-fast';

function envValue(env, name) {
  const value = env[name];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseTimeoutMs(value) {
  if (!value) {
    return 30000;
  }

  const timeoutMs = Number(value);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error(
      'Invalid LLM config: LLM_TIMEOUT_MS must be a positive integer'
    );
  }

  return timeoutMs;
}

export function loadLLMConfig() {
  const openRouterApiKey = envValue(process.env, 'OPENROUTER_API_KEY');
  const provider = openRouterApiKey ? 'openrouter' : 'openai-compatible';
  const apiKey = openRouterApiKey || envValue(process.env, 'LLM_API_KEY');
  const baseURL =
    envValue(process.env, 'LLM_BASE_URL') ||
    (openRouterApiKey ? OPENROUTER_BASE_URL : undefined);
  const sharedModel =
    envValue(process.env, 'OPENROUTER_MODEL') ||
    envValue(process.env, 'LLM_MODEL') ||
    (openRouterApiKey ? OPENROUTER_DEFAULT_MODEL : null);
  const orchestrator =
    envValue(process.env, 'LLM_MODEL_ORCHESTRATOR') || sharedModel;
  const aleph = envValue(process.env, 'LLM_MODEL_ALEPH') || sharedModel;
  const gimel = envValue(process.env, 'LLM_MODEL_GIMEL') || sharedModel;
  const bet = envValue(process.env, 'LLM_MODEL_BET') || sharedModel;
  const timeoutMs = parseTimeoutMs(envValue(process.env, 'LLM_TIMEOUT_MS'));

  if (!apiKey) {
    throw new Error(
      'Missing required LLM config: LLM_API_KEY or OPENROUTER_API_KEY'
    );
  }
  if (!orchestrator) {
    throw new Error('Missing required LLM config: LLM_MODEL_ORCHESTRATOR');
  }
  if (!aleph) {
    throw new Error('Missing required LLM config: LLM_MODEL_ALEPH');
  }
  if (!gimel) {
    throw new Error('Missing required LLM config: LLM_MODEL_GIMEL');
  }

  return {
    apiKey,
    baseURL,
    provider,
    reasoning: { enabled: true },
    timeoutMs,
    models: {
      orchestrator,
      aleph,
      gimel,
      bet
    }
  };
}
