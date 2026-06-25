import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadLLMConfig } from '../../../src/llm/config.js';

describe('LLM Config Loader', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('loads config from valid environment variables', () => {
    vi.stubEnv('LLM_API_KEY', 'test-key');
    vi.stubEnv('LLM_BASE_URL', 'https://custom.api/v1');
    vi.stubEnv('LLM_MODEL_ORCHESTRATOR', 'model-orch');
    vi.stubEnv('LLM_MODEL_ALEPH', 'model-al');
    vi.stubEnv('LLM_MODEL_GIMEL', 'model-gim');
    vi.stubEnv('LLM_TIMEOUT_MS', '10000');
    vi.stubEnv('LLM_MODEL_BET', 'model-bet');

    const config = loadLLMConfig();
    expect(config.apiKey).toBe('test-key');
    expect(config.baseURL).toBe('https://custom.api/v1');
    expect(config.models.orchestrator).toBe('model-orch');
    expect(config.models.aleph).toBe('model-al');
    expect(config.models.gimel).toBe('model-gim');
    expect(config.models.bet).toBe('model-bet');
    expect(config.timeoutMs).toBe(10000);
  });

  it('provides default values for optional environment variables', () => {
    vi.stubEnv('LLM_API_KEY', 'test-key');
    vi.stubEnv('LLM_MODEL_ORCHESTRATOR', 'model-orch');
    vi.stubEnv('LLM_MODEL_ALEPH', 'model-al');
    vi.stubEnv('LLM_MODEL_GIMEL', 'model-gim');

    vi.stubEnv('LLM_BASE_URL', '');
    vi.stubEnv('LLM_TIMEOUT_MS', '');
    vi.stubEnv('LLM_MODEL_BET', '');

    const config = loadLLMConfig();
    expect(config.baseURL).toBeFalsy();
    expect(config.timeoutMs).toBe(30000);
    expect(config.models.bet).toBeFalsy();
  });

  it('uses one OpenRouter key and model for every agent by default', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'openrouter-key');
    vi.stubEnv('LLM_API_KEY', '');
    vi.stubEnv('LLM_BASE_URL', '');
    vi.stubEnv('LLM_MODEL_ORCHESTRATOR', '');
    vi.stubEnv('LLM_MODEL_ALEPH', '');
    vi.stubEnv('LLM_MODEL_BET', '');
    vi.stubEnv('LLM_MODEL_GIMEL', '');

    const config = loadLLMConfig();

    expect(config.apiKey).toBe('openrouter-key');
    expect(config.provider).toBe('openrouter');
    expect(config.baseURL).toBe('https://openrouter.ai/api/v1');
    expect(config.reasoning).toEqual({ enabled: true });
    expect(config.models).toEqual({
      orchestrator: 'anthropic/claude-opus-4.8-fast',
      aleph: 'anthropic/claude-opus-4.8-fast',
      bet: 'anthropic/claude-opus-4.8-fast',
      gimel: 'anthropic/claude-opus-4.8-fast'
    });
  });

  it('uses OPENROUTER_MODEL as the shared OpenRouter override', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'openrouter-key');
    vi.stubEnv('OPENROUTER_MODEL', 'custom/openrouter-model');
    vi.stubEnv('LLM_API_KEY', '');
    vi.stubEnv('LLM_BASE_URL', '   ');
    vi.stubEnv('LLM_MODEL_ORCHESTRATOR', '');
    vi.stubEnv('LLM_MODEL_ALEPH', '');
    vi.stubEnv('LLM_MODEL_BET', '');
    vi.stubEnv('LLM_MODEL_GIMEL', '');

    const config = loadLLMConfig();

    expect(config.baseURL).toBe('https://openrouter.ai/api/v1');
    expect(config.models).toEqual({
      orchestrator: 'custom/openrouter-model',
      aleph: 'custom/openrouter-model',
      bet: 'custom/openrouter-model',
      gimel: 'custom/openrouter-model'
    });
  });

  it('treats whitespace-only API keys as missing config', () => {
    vi.stubEnv('OPENROUTER_API_KEY', '   ');
    vi.stubEnv('LLM_API_KEY', '   ');
    vi.stubEnv('LLM_MODEL_ORCHESTRATOR', 'model-orch');
    vi.stubEnv('LLM_MODEL_ALEPH', 'model-al');
    vi.stubEnv('LLM_MODEL_GIMEL', 'model-gim');

    expect(() => loadLLMConfig()).toThrow(
      /Missing required LLM config: LLM_API_KEY/
    );
  });

  it('throws a clear error for an invalid timeout value', () => {
    vi.stubEnv('LLM_API_KEY', 'test-key');
    vi.stubEnv('LLM_BASE_URL', 'https://custom.api/v1');
    vi.stubEnv('LLM_MODEL_ORCHESTRATOR', 'model-orch');
    vi.stubEnv('LLM_MODEL_ALEPH', 'model-al');
    vi.stubEnv('LLM_MODEL_GIMEL', 'model-gim');
    vi.stubEnv('LLM_TIMEOUT_MS', 'not-a-number');

    expect(() => loadLLMConfig()).toThrow(/Invalid LLM config: LLM_TIMEOUT_MS/);
  });

  it('throws an error if required config is missing', () => {
    vi.stubEnv('LLM_API_KEY', '');
    vi.stubEnv('LLM_MODEL_ORCHESTRATOR', 'model-orch');
    vi.stubEnv('LLM_MODEL_ALEPH', 'model-al');
    vi.stubEnv('LLM_MODEL_GIMEL', 'model-gim');

    expect(() => loadLLMConfig()).toThrow(
      /Missing required LLM config: LLM_API_KEY/
    );
  });
});
