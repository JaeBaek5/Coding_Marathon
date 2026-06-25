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
    placeUrl: overrides.placeUrl ?? 'https://map.naver.com/p/entry/place/111111',
    transportMode: overrides.transportMode ?? 'walk',
    oneWayRouteMinutes: overrides.oneWayRouteMinutes ?? 5,
    totalExpectedMinutes: overrides.totalExpectedMinutes ?? 40,
    distanceMeters: overrides.distanceMeters ?? 400,
    confidenceBadge: overrides.confidenceBadge ?? 'high',
    providerAttribution:
      overrides.providerAttribution ?? 'Naver Local Search / Walk estimate',
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

function createScrapeResult(overrides = {}) {
  return {
    provider: 'naver',
    placeUrl: overrides.placeUrl ?? 'https://map.naver.com/p/entry/place/111111',
    placeId: overrides.placeId ?? '111111',
    rating: overrides.rating ?? null,
    reviewCount: overrides.reviewCount ?? 10,
    reviews: overrides.reviews ?? [],
    reviewSummary: overrides.reviewSummary ?? { pros: null, cons: null },
    reviewSnippets: overrides.reviewSnippets ?? [],
    reviewPhotos: overrides.reviewPhotos ?? [],
    mainPhoto: overrides.mainPhoto ?? null,
    menuBoardPhoto: overrides.menuBoardPhoto ?? null,
    menuItems: overrides.menuItems ?? [],
    negativeReviewCount: overrides.negativeReviewCount ?? 0,
    positiveReviewCount: overrides.positiveReviewCount ?? 0,
    shouldExcludeFromRecommendation:
      overrides.shouldExcludeFromRecommendation ?? false,
    extractionMethod: overrides.extractionMethod ?? 'static-hydration',
    fetchedAt: overrides.fetchedAt ?? new Date().toISOString(),
    error: overrides.error ?? null
  };
}

describe('Gimel Integration', () => {
  it('rejects hallucinated review and rating content and falls back to concise grounded facts only', async () => {
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
                      placeUrl: 'https://map.naver.com/p/entry/place/111111',
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
                      '실제 리뷰에서 24시간 영업이라는 평이 있고 평점은 4.9점이라 빠른 점심에 좋습니다.'
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
      scrapeReviews: vi.fn().mockResolvedValue(
        createScrapeResult({
          rating: 4.2,
          reviewCount: 18,
          reviewSnippets: ['국물이 진하고 점심에 빨리 나와요'],
          reviewSummary: { pros: '국물이 진하고 점심에 빨리 나와요', cons: null },
          reviews: [
            { body: '국물이 진하고 점심에 빨리 나와요', author: null, rating: 4 }
          ]
        })
      )
    });

    const [result] = await agent.generateReasons([createCandidate()]);

    expect(result.reason).toContain('식당으로 도보 5분 거리');
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
                        placeUrl: 'https://map.naver.com/p/entry/place/111111',
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
                    reason: '한식 식당으로 도보 5분 거리여서 이동 부담이 적고, 국물이 진합니다.'
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
                      placeUrl: 'https://map.naver.com/p/entry/place/222222',
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
                    reason: '한식 식당으로 도보 5분 거리여서 이동 부담이 적고, 매장이 깨끗합니다.'
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
      scrapeReviews: vi.fn().mockResolvedValue(
        createScrapeResult({
          reviewSnippets: ['국물이 진하고 든든해요'],
          reviewSummary: { pros: '국물이 진하고 든든해요', cons: null },
          reviews: [{ body: '국물이 진하고 든든해요', author: null, rating: 4 }]
        })
      )
    });

    const results = await agent.generateReasons([
      createCandidate({ id: 'first', name: '첫번째 식당' }),
      createCandidate({
        id: 'second',
        name: '두번째 식당',
        placeUrl: 'https://map.naver.com/p/entry/place/222222'
      })
    ]);

    expect(results.map((item) => item.id)).toEqual(['first', 'second']);
    expect(sanitizeCandidateForPrompt(createCandidate()).location).toBeUndefined();
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
                      placeUrl: 'https://map.naver.com/p/entry/place/111111',
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
                    reason: '평점은 4.9점으로 훌륭합니다.'
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
      scrapeReviews: vi.fn().mockResolvedValue(
        createScrapeResult({
          rating: 4.2,
          reviewCount: 18,
          reviewSnippets: ['국물이 진하고 든든해요'],
          reviewSummary: { pros: '국물이 진하고 든든해요', cons: '주차가 불편해요' },
          reviews: [{ body: '국물이 진하고 든든해요', author: null, rating: 4 }]
        })
      )
    });

    const [result] = await agent.generateReasons([createCandidate()]);

    expect(result.reason).toContain('국물이 진하고 든든');
    expect(result.reason).not.toContain('좋은 점:');
    expect(result.reason).not.toContain('아쉬운 점:');
  });

  it('uses a concise review summary instead of quoting raw pros and cons in fallback reasons', async () => {
    const agent = new GimelAgent({
      getAgentHarness: () => null,
      scrapeReviews: vi.fn().mockResolvedValue(
        createScrapeResult({
          reviews: [
            {
              body: '매장이 너무 깨끗해서 호감이고 혼밥하기 딱 좋은 구성입니다',
              author: null,
              rating: 5
            },
            {
              body: '깔끔한 인테리어에 혼밥하기 딱 좋은 구성',
              author: null,
              rating: 5
            },
            {
              body: '짬뽕은 새우가 없어서 아쉬웠지만 짜장면은 잘 넘어가고 텁텁한 느낌도 없어요',
              author: null,
              rating: 4
            }
          ],
          reviewSummary: {
            pros: '매장이 너무 깨끗해서 호감',
            cons: '깔끔한 인테리어에 혼밥하기 딱 좋은 구성'
          },
          reviewSnippets: [
            '매장이 너무 깨끗해서 호감이고 혼밥하기 딱 좋은 구성입니다',
            '짬뽕은 새우가 없어서 아쉬웠지만 짜장면은 잘 넘어가고 텁텁한 느낌도 없어요'
          ],
          positiveReviewCount: 3
        })
      )
    });

    const [result] = await agent.generateReasons([
      createCandidate({
        category: '샤브샤브',
        oneWayRouteMinutes: 4,
        name: '샤브로21'
      })
    ]);

    expect(result.reason).toBe(
      '샤브샤브 식당으로 도보 4분 거리여서 이동 부담이 적고, 매장이 깨끗해서 좋습니다.'
    );
    expect(result.reviewSummary.pros).toBe(
      '매장이 깨끗하고 혼밥하기 좋은 구성이라고 합니다.'
    );
    expect(result.reviewSummary.cons).toBe(
      '짬뽕은 새우가 없어서 아쉬웠지만, 짜장면은 잘 넘어가고 텁텁한 느낌이 없다고 합니다.'
    );
  });

  it('excludes candidates when scraped visitor reviews are strongly negative', async () => {
    const scrapeReviews = vi
      .fn()
      .mockResolvedValueOnce(
        createScrapeResult({
          reviewCount: 10,
          reviewSummary: {
            pros: null,
            cons: '국수나무를 좋아하지만 순천대점은 아쉬운 점이 많습니다'
          },
          negativeReviewCount: 8,
          positiveReviewCount: 0,
          shouldExcludeFromRecommendation: true
        })
      )
      .mockResolvedValueOnce(
        createScrapeResult({
          placeUrl: 'https://map.naver.com/p/entry/place/222222',
          placeId: '222222',
          reviewCount: 10,
          reviewSummary: {
            pros: '국물이 진하고 조용해서 점심에 이야기하기 좋아요',
            cons: null
          },
          reviewSnippets: ['국물이 진하고 조용해서 점심에 이야기하기 좋아요'],
          positiveReviewCount: 8
        })
      );
    const trace = vi.fn();
    const agent = new GimelAgent({
      getAgentHarness: () => null,
      scrapeReviews
    });

    const results = await agent.generateReasons(
      [
        createCandidate({ id: 'negative', name: '국수나무 순천대점' }),
        createCandidate({
          id: 'positive',
          name: '든든국수',
          placeUrl: 'https://map.naver.com/p/entry/place/222222'
        })
      ],
      { trace }
    );

    expect(results.map((item) => item.id)).toEqual(['positive']);
    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'gimel_candidate_excluded_by_reviews',
        candidateId: 'negative'
      })
    );
  });
});
