import { describe, it, expect, vi } from 'vitest';
import {
  applyLLMScoresToCandidates,
  scoreCandidatesWithLLM
} from '../../services/llmReviewScoring.js';

vi.mock('../../llm/client.js', () => ({
  createAgentChatCompletion: vi.fn()
}));

import { createAgentChatCompletion } from '../../llm/client.js';

describe('llmReviewScoring', () => {
  it('maps structured LLM scores onto candidates', async () => {
    createAgentChatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            parsed: {
              scores: [
                {
                  id: 'a',
                  relevanceScore: 92,
                  sentimentScore: 88,
                  rationale: '고기 구이 리뷰가 많음'
                }
              ]
            }
          }
        }
      ]
    });

    const candidates = [
      {
        id: 'a',
        name: '육식사관학교',
        category: '육류,고기',
        oneWayRouteMinutes: 5,
        totalExpectedMinutes: 40,
        distanceMeters: 400,
        reviews: [{ body: '삼겹살 맛있음', rating: 5 }]
      }
    ];

    const scoreMap = await scoreCandidatesWithLLM(candidates, {
      userQuery: '고기먹고 싶다',
      desiredFoods: ['고기']
    });
    const enriched = applyLLMScoresToCandidates(candidates, scoreMap);

    expect(enriched[0].llmRelevanceScore).toBe(92);
    expect(enriched[0].llmSentimentScore).toBe(88);
  });
});
