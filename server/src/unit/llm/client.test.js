import { describe, it, expect, vi } from 'vitest';
import {
  getAgentHarness,
  getLLMClient,
  listAgentHarnesses
} from '../../../src/llm/client.js';

vi.mock('../../../src/llm/config.js', () => ({
  loadLLMConfig: vi.fn(() => ({
    apiKey: 'mock-key',
    baseURL: 'https://mock.api/v1',
    timeoutMs: 15000,
    provider: 'openrouter',
    reasoning: { enabled: true },
    models: {
      orchestrator: 'mock-orch',
      aleph: 'mock-al',
      bet: 'mock-bet',
      gimel: 'mock-gim'
    }
  }))
}));

describe('LLM Client Factory', () => {
  it('creates an OpenAI client with configured options', () => {
    const { client, config } = getLLMClient();

    expect(config.apiKey).toBe('mock-key');
    expect(client.apiKey).toBe('mock-key');
    expect(client.baseURL).toBe('https://mock.api/v1');
    expect(client.timeout).toBe(15000);
  });

  it('creates a dedicated harness instance for each swarm agent', () => {
    const orchestrator = getAgentHarness('orchestrator');
    const aleph = getAgentHarness('aleph');
    const bet = getAgentHarness('bet');
    const gimel = getAgentHarness('gimel');

    expect(orchestrator).not.toBe(aleph);
    expect(aleph).not.toBe(bet);
    expect(bet).not.toBe(gimel);
    expect(orchestrator.instanceId).toBe('mumuk-orchestrator');
    expect(aleph.instanceId).toBe('mumuk-aleph');
    expect(bet.instanceId).toBe('mumuk-bet');
    expect(gimel.instanceId).toBe('mumuk-gimel');
    expect(orchestrator.reasoning).toEqual({ enabled: true });
    expect(gimel.systemPrompt).toContain('Gimel');
    expect(listAgentHarnesses().map((agent) => agent.name)).toEqual([
      'orchestrator',
      'aleph',
      'bet',
      'gimel'
    ]);
  });
});
