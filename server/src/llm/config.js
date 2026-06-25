export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_DEFAULT_MODEL = 'cohere/north-mini-code:free';

export function loadLLMConfig() {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const provider = openRouterApiKey ? 'openrouter' : 'openai-compatible';
  const apiKey = openRouterApiKey || process.env.LLM_API_KEY;
  const baseURL =
    process.env.LLM_BASE_URL ||
    (openRouterApiKey ? OPENROUTER_BASE_URL : undefined);
  const sharedModel =
    process.env.OPENROUTER_MODEL ||
    process.env.LLM_MODEL ||
    (openRouterApiKey ? OPENROUTER_DEFAULT_MODEL : null);
  const orchestrator = process.env.LLM_MODEL_ORCHESTRATOR || sharedModel;
  const aleph = process.env.LLM_MODEL_ALEPH || sharedModel;
  const gimel = process.env.LLM_MODEL_GIMEL || sharedModel;
  const bet = process.env.LLM_MODEL_BET || sharedModel;

  const timeoutMs = process.env.LLM_TIMEOUT_MS
    ? parseInt(process.env.LLM_TIMEOUT_MS, 10)
    : 30000;

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
