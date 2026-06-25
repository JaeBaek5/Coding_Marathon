import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseQuery, processAnswers } from '../../../src/agents/aleph/index.js';
import { createAgentChatCompletion } from '../../../src/llm/client.js';

vi.mock('../../../src/llm/client.js', () => ({
  createAgentChatCompletion: vi.fn()
}));

describe('Aleph Agent', () => {
  let mockCreate;

  beforeEach(() => {
    mockCreate = createAgentChatCompletion;
    mockCreate.mockReset();
  });

  describe('parseQuery', () => {
    it('should parse complete query successfully', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              parsed: {
                mode: 'normal',
                location: { lat: 37.5, lng: 127.0 },
                mealPeriod: 'lunch',
                totalTimeMinutes: 60,
                transportMode: 'walk',
                budgetPerPersonKrw: 15000,
                partyContext: 'friends',
                vibe: 'casual',
                excludedFoods: []
              }
            }
          }
        ]
      });

      const result = await parseQuery('query text', {}, 1);

      expect(result.status).toBe('complete');
      expect(result.slots.mealPeriod).toBe('lunch');
    });

    it('should detect missing slots and generate questions in priority order', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              parsed: {
                mode: 'normal',
                location: { lat: 37.5, lng: 127.0 },
                mealPeriod: null,
                totalTimeMinutes: null,
                transportMode: null,
                budgetPerPersonKrw: null,
                partyContext: null,
                vibe: null,
                excludedFoods: null
              }
            }
          }
        ]
      });

      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              parsed: {
                missingFields: ['mealPeriod', 'totalTimeMinutes'],
                questions: [
                  { field: 'mealPeriod', label: '언제 드실 건가요?' },
                  { field: 'totalTimeMinutes', label: '시간은 얼마나 있나요?' }
                ]
              }
            }
          }
        ]
      });

      const result = await parseQuery('query text', {}, 1);

      expect(result.status).toBe('questions');
      expect(result.missingFields).toContain('mealPeriod');
      expect(result.questions).toHaveLength(2);
    });

    it('should throw or return error if max rounds exceeded', async () => {
      const result = await parseQuery('query text', {}, 3);
      expect(result.status).toBe('error');
      expect(result.code).toBe('SESSION_EXPIRED');
    });

    it('should handle invalid totalTimeMinutes (out of range)', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              parsed: {
                mode: 'normal',
                location: { lat: 37.5, lng: 127.0 },
                mealPeriod: 'lunch',
                totalTimeMinutes: 10,
                transportMode: 'walk',
                budgetPerPersonKrw: 15000,
                partyContext: 'friends',
                vibe: 'casual',
                excludedFoods: []
              }
            }
          }
        ]
      });

      const result = await parseQuery('query text', {}, 1);

      expect(result.status).toBe('error');
      expect(result.code).toBe('INVALID_TOTAL_TIME');
    });
  });

  describe('processAnswers', () => {
    it('should re-validate form answers', async () => {
      const answers = {
        mealPeriod: 'dinner',
        totalTimeMinutes: 30
      };
      const currentState = {
        mode: 'normal',
        location: { lat: 37.5, lng: 127.0 },
        transportMode: 'walk',
        budgetPerPersonKrw: 15000,
        partyContext: 'friends',
        vibe: 'casual',
        excludedFoods: []
      };

      const result = await processAnswers(answers, currentState);

      expect(result.status).toBe('complete');
      expect(result.slots.mealPeriod).toBe('dinner');
      expect(result.slots.totalTimeMinutes).toBe(30);
    });
  });
});
