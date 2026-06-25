import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getLLMClient,
  resetClientForTesting
} from '../../../src/llm/client.js';

describe('LLM Swarm Runtime Integration', () => {
  beforeEach(() => {
    resetClientForTesting();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses the configured OpenAI-compatible endpoint for agent calls', async () => {
    vi.stubEnv('LLM_API_KEY', 'integration-key');
    vi.stubEnv('LLM_BASE_URL', 'https://custom-lm-studio.local/v1');
    vi.stubEnv('LLM_MODEL_ORCHESTRATOR', 'integration-model');
    vi.stubEnv('LLM_MODEL_ALEPH', 'integration-aleph');
    vi.stubEnv('LLM_MODEL_GIMEL', 'integration-gimel');
    vi.stubEnv('LLM_MODEL_BET', 'integration-bet');

    const { client, config } = getLLMClient();

    vi.spyOn(client.chat.completions, 'create').mockResolvedValue({
      choices: [{ message: { content: 'mocked response' } }]
    });

    const response = await client.chat.completions.create({
      model: config.models.orchestrator,
      messages: [{ role: 'user', content: 'test message' }]
    });

    expect(client.baseURL).toBe('https://custom-lm-studio.local/v1');
    expect(client.apiKey).toBe('integration-key');
    expect(client.chat.completions.create).toHaveBeenCalledWith({
      model: 'integration-model',
      messages: [{ role: 'user', content: 'test message' }]
    });
    expect(response.choices[0].message.content).toBe('mocked response');
  });
});
