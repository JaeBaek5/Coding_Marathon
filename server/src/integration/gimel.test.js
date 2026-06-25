import { describe, it, expect, vi } from 'vitest';
import {
  GimelAgent,
  sanitizeCandidateForPrompt
} from '../agents/gimel/index.js';

function createCandidate(overrides = {}) {
  return {
    id: overrides.id ?? 'candidate-1',
    name: overrides.name ?? '든든한국밥',
    category: overrides.category ?? '한식',
    address: overrides.address ?? '서울 강남구 테헤란로 123',
    location: overrides.location ?? { lat: 37.4981, lng: 127.0282 },
    placeUrl: overrides.placeUrl ?? 'https://place.map.kakao.com/111111',
    transportMode: overrides.transportMode ?? 'walk',
    oneWayRouteMinutes: overrides.oneWayRouteMinutes ?? 5,
    totalExpectedMinutes: overrides.totalExpectedMinutes ?? 40,
    distanceMeters: overrides.distanceMeters ?? 400,
    confidenceBadge: overrides.confidenceBadge ?? 'high',
    providerAttribution:
      overrides.providerAttribution ?? 'Kakao Local / Kakao Mobility',
    openStatus: overrides.openStatus ?? null,
    reason: overrides.reason ?? '',
    priceLevel: null,
    openingHours: null,
    rating: null,
    reviewCount: null,
    reviewSummary: null,
    path: []
  };
}

describe('Gimel Integration', () => {
  it('rejects hallucinated review and rating content and falls back to scraped facts only', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'tool-1',
                  type: 'function',
                  function: {
                    name: 'scrape_reviews',
                    arguments: JSON.stringify({
                      placeUrl: 'https://place.map.kakao.com/111111',
                      placeName: '든든한국밥'
                    })
                  }
                }
              ]
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              parsed: {
                reasons: [
                  {
                    id: 'candidate-1',
                    reason:
                      '실제 리뷰에서 "24시간 영업"이라는 평이 있고 평점은 4.9점이라 빠른 점심에 좋습니다.'
                  }
                ]
              }
            }
          }
        ]
      });

    const agent = new GimelAgent({
      getAgentHarness: () => ({
        model: 'gimel-model'
      }),
      createAgentChatCompletion: (_agentName, request) => create(request),
      scrapeReviews: vi.fn().mockResolvedValue({
        placeUrl: 'https://place.map.kakao.com/111111',
        provider: 'Kakao Map',
        rating: 4.2,
        reviewCount: 18,
        reviewSnippets: ['국물이 진하고 점심에 빨리 나와요'],
        sourceExcerpt: '평점 4.2 리뷰 18 국물이 진하고 점심에 빨리 나와요',
        error: null
      })
    });

    const [result] = await agent.generateReasons([createCandidate()]);

    expect(result.reason).toContain('국물이 진하고 점심에 빨리 나와요');
    expect(result.reason).toContain('4.2점');
    expect(result.reason).not.toContain('24시간 영업');
    expect(result.reason).not.toContain('4.9점');
  });

  it('removes coordinates before prompt assembly and preserves candidate order', async () => {
    const create = vi
      .fn()
      .mockImplementationOnce(async (request) => {
        const userPayload = JSON.parse(request.messages[0].content);
        expect(userPayload.candidate.location).toBeUndefined();
        expect(userPayload.candidate.lat).toBeUndefined();
        expect(userPayload.candidate.lng).toBeUndefined();

        return {
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'tool-1',
                    type: 'function',
                    function: {
                      name: 'scrape_reviews',
                      arguments: JSON.stringify({
                        placeUrl: 'https://place.map.kakao.com/111111',
                        placeName: '첫번째 식당'
                      })
                    }
                  }
                ]
              }
            }
          ]
        };
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              parsed: {
                reasons: [
                  {
                    id: 'first',
                    reason: '실제 리뷰 기준으로 빠르게 식사하기 좋습니다.'
                  }
                ]
              }
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'tool-2',
                  type: 'function',
                  function: {
                    name: 'scrape_reviews',
                    arguments: JSON.stringify({
                      placeUrl: 'https://place.map.kakao.com/222222',
                      placeName: '두번째 식당'
                    })
                  }
                }
              ]
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              parsed: {
                reasons: [
                  {
                    id: 'second',
                    reason: '실제 리뷰 기준으로 깔끔하다는 반응이 있습니다.'
                  }
                ]
              }
            }
          }
        ]
      });

    const agent = new GimelAgent({
      getAgentHarness: () => ({
        model: 'gimel-model'
      }),
      createAgentChatCompletion: (_agentName, request) => create(request),
      scrapeReviews: vi.fn().mockResolvedValue({
        placeUrl: 'https://place.map.kakao.com/111111',
        provider: 'Kakao Map',
        rating: null,
        reviewCount: null,
        reviewSnippets: ['빠르게 식사하기 좋아요'],
        sourceExcerpt: '빠르게 식사하기 좋아요',
        error: null
      })
    });

    const results = await agent.generateReasons([
      createCandidate({ id: 'first', name: '첫번째 식당' }),
      createCandidate({
        id: 'second',
        name: '두번째 식당',
        placeUrl: 'https://place.map.kakao.com/222222'
      })
    ]);

    expect(results.map((item) => item.id)).toEqual(['first', 'second']);
    expect(
      sanitizeCandidateForPrompt(createCandidate()).location
    ).toBeUndefined();
  });

  it('uses reviewSummary.pros in fallback reason when LLM reason fails validation', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'tool-1',
                  type: 'function',
                  function: {
                    name: 'scrape_reviews',
                    arguments: JSON.stringify({
                      placeUrl: 'https://place.map.kakao.com/111111',
                      placeName: '든든한국밥'
                    })
                  }
                }
              ]
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              parsed: {
                reasons: [
                  {
                    id: 'candidate-1',
                    reason: '평점이 4.9점으로 훌륭합니다.' // hallucinated — rating is 4.2
                  }
                ]
              }
            }
          }
        ]
      });

    const agent = new GimelAgent({
      getAgentHarness: () => ({ model: 'gimel-model' }),
      createAgentChatCompletion: (_agentName, request) => create(request),
      scrapeReviews: vi.fn().mockResolvedValue({
        placeUrl: 'https://place.map.kakao.com/111111',
        provider: 'kakao',
        rating: 4.2,
        reviewCount: 18,
        reviewSnippets: ['국물 맛있어요'],
        reviewSummary: { pros: '국물이 진하고 든든해요', cons: '주차가 불편해요' },
        reviews: [{ body: '국물이 진하고 든든해요', author: null, rating: 4 }],
        error: null
      })
    });

    const [result] = await agent.generateReasons([createCandidate()]);

    expect(result.reason).toContain('국물이 진하고 든든해요');
    expect(result.reason).toContain('주차가 불편해요');
  });
});
