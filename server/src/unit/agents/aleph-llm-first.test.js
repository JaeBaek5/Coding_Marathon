import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseQuery } from '../../../src/agents/aleph/index.js';
import { createAgentChatCompletion } from '../../../src/llm/client.js';

vi.mock('../../../src/llm/client.js', () => ({
  createAgentChatCompletion: vi.fn()
}));

describe('Aleph LLM-first parsing', () => {
  const structuredLocation = {
    lat: 37.5665,
    lng: 126.978,
    accuracyMeters: 25,
    source: 'browser-geolocation'
  };

  beforeEach(() => {
    createAgentChatCompletion.mockReset();
  });

  it('keeps LLM slot interpretation ahead of deterministic fallback guesses', async () => {
    createAgentChatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            parsed: {
              mode: 'normal',
              location: null,
              mealPeriod: 'dinner',
              totalTimeMinutes: 60,
              transportMode: 'walk',
              budgetPerPersonKrw: 12000,
              partyContext: 'friends',
              vibe: 'any',
              excludedFoods: ['매운 음식']
            }
          }
        }
      ]
    });

    const result = await parseQuery(
      '친구랑 한 시간 안에 점심도 저녁도 상관없고 분위기도 상관없어. 도보, 12000원, 매운 음식은 빼줘.',
      { location: structuredLocation },
      1
    );

    expect(result.status).toBe('complete');
    expect(result.slots.mealPeriod).toBe('dinner');
    expect(result.slots.vibe).toBe('any');
    expect(result.slots.excludedFoods).toEqual(['매운 음식']);
  });
});
