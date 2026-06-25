import { zodResponseFormat } from 'openai/helpers/zod';
import {
  GimelInputAllowlistSchema,
  GimelReasonOutputSchema,
  ReviewExtractionOutputSchema
} from '../../../../shared/contracts/schemas.js';
import {
  createAgentChatCompletion,
  getAgentHarness
} from '../../llm/client.js';
import { logger, logAgentHop } from '../../utils/logger.js';
import { setSessionProgress } from '../../services/sessionProgress.js';
import { extractNaverReviews } from '../../tools/naverReviewExtractor.js';
import { mapWithConcurrencyLimit } from '../../utils/concurrency.js';
import {
  FAST_MODE,
  GIMEL_LLM_CANDIDATE_LIMIT_FAST,
  GIMEL_LLM_TIMEOUT_MS
} from '../../config/performance.js';

export const DEFAULT_GIMEL_CONCURRENCY = 5;

const SCRAPE_REVIEWS_TOOL = {
  type: 'function',
  function: {
    name: 'scrape_reviews',
    description:
      'Fetch and scrape real review snippets and ratings from a Naver place page URL.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        placeUrl: {
          type: 'string',
          description: 'Naver Map place URL to inspect.'
        },
        placeName: {
          type: 'string',
          description: 'Restaurant name for traceability.'
        }
      },
      required: ['placeUrl', 'placeName']
    }
  }
};

function createToolError(message) {
  return ReviewExtractionOutputSchema.parse({
    provider: null,
    placeUrl: null,
    placeId: null,
    rating: null,
    reviewCount: null,
    reviews: [],
    reviewSummary: { pros: null, cons: null },
    reviewSnippets: [],
    extractionMethod: 'unavailable',
    fetchedAt: new Date().toISOString(),
    error: message
  });
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function getProviderFromUrl(placeUrl) {
  if (!placeUrl) {
    return null;
  }

  const normalized = String(placeUrl).toLowerCase();
  if (normalized.includes('naver.com')) {
    return 'Naver Map';
  }

  return null;
}

function parseNumericCapture(text, regex) {
  const match = text.match(regex);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[1].replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function collectReviewSnippets(text) {
  const snippets = [];
  const quotedMatches = text.matchAll(/["“”'']([^"“”'']{12,140})["“”'']/g);

  for (const match of quotedMatches) {
    const snippet = stripHtml(match[1]);
    if (snippet.length >= 12 && snippet.length <= 140) {
      snippets.push(snippet);
    }
    if (snippets.length >= 3) {
      break;
    }
  }

  if (snippets.length > 0) {
    return snippets;
  }

  const reviewBlocks = text.matchAll(
    /(리뷰|후기|평가)[:\s-]+([^.!?\n]{12,140})/gi
  );

  for (const match of reviewBlocks) {
    const snippet = stripHtml(match[2]);
    if (snippet.length >= 12 && snippet.length <= 140) {
      snippets.push(snippet);
    }
    if (snippets.length >= 3) {
      break;
    }
  }

  return snippets;
}

export async function defaultScrapeReviewsTool({ placeUrl, placeName, address }) {
  if (!placeUrl && !placeName) {
    return createToolError('Missing place URL and name');
  }

  // Route Naver URLs through the full Apollo extraction pipeline.
  if (placeUrl && String(placeUrl).toLowerCase().includes('naver.com')) {
    return extractNaverReviews({ placeUrl, placeName, address });
  }
  if (!placeUrl) {
    return createToolError('Missing place URL');
  }

  return createToolError('Only Naver place URLs are supported');
}

export function sanitizeCandidateForPrompt(candidate) {
  return GimelInputAllowlistSchema.parse({
    id: candidate.id,
    name: candidate.name,
    category: candidate.category,
    address: candidate.address,
    transportMode: candidate.transportMode,
    oneWayRouteMinutes: candidate.oneWayRouteMinutes,
    totalExpectedMinutes: candidate.totalExpectedMinutes,
    distanceMeters: candidate.distanceMeters,
    openStatus: candidate.openStatus ?? null,
    confidenceBadge: candidate.confidenceBadge,
    providerAttribution: candidate.providerAttribution
  });
}

export function createGroundedFallbackReason(candidate, scraped) {
  const transportLabel = candidate.transportMode === 'walk' ? '도보' : '차량';
  const parts = [
    `${candidate.category} 식당으로 ${transportLabel} ${candidate.oneWayRouteMinutes}분 거리여서 이동 부담이 적습니다.`
  ];

  // Prefer structured reviewSummary.pros over raw first snippet
  const positiveFact =
    scraped?.reviewSummary?.pros ?? scraped?.reviewSnippets?.[0] ?? null;
  if (positiveFact) {
    parts.push(`실제 리뷰에는 "${positiveFact}"라는 반응이 확인됩니다.`);
  }

  if (scraped?.reviewSummary?.cons) {
    parts.push(`단점으로는 "${scraped.reviewSummary.cons}"는 반응도 있습니다.`);
  }

  if (typeof scraped?.rating === 'number') {
    parts.push(`확인된 평점은 ${scraped.rating}점입니다.`);
  } else if (typeof scraped?.reviewCount === 'number') {
    parts.push(`확인된 리뷰 수는 ${scraped.reviewCount}건입니다.`);
  }

  return parts.join(' ');
}

async function runReasonFromPreloadedReviews(
  candidate,
  scraped,
  createChatCompletion
) {
  const sanitizedCandidate = sanitizeCandidateForPrompt(candidate);
  const completion = await createChatCompletion('gimel', {
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Generate one grounded Korean recommendation reason for this restaurant.',
          candidate: sanitizedCandidate,
          scrapedReviews: {
            rating: scraped.rating ?? null,
            reviewCount: scraped.reviewCount ?? null,
            reviewSummary: scraped.reviewSummary ?? null,
            reviewSnippets: scraped.reviewSnippets ?? [],
            reviews: (scraped.reviews ?? []).slice(0, 5)
          },
          instruction:
            'Use only scrapedReviews and candidate facts. Mention a concrete positive from reviews when available.'
        })
      }
    ],
    response_format: zodResponseFormat(GimelReasonOutputSchema, 'gimel_reasons')
  });

  return {
    scraped,
    parsed: completion.choices[0].message.parsed,
    sanitizedCandidate
  };
}

async function runReasonToolLoop(
  candidate,
  tools,
  scrapeReviews,
  createChatCompletion
) {
  const sanitizedCandidate = sanitizeCandidateForPrompt(candidate);
  const messages = [
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Generate one grounded Korean recommendation reason for this restaurant.',
        candidate: sanitizedCandidate,
        instruction:
          'Call scrape_reviews first when a place URL is available, then write the reason.'
      })
    }
  ];

  const toolCatalog = tools ?? [SCRAPE_REVIEWS_TOOL];
  let scraped = createToolError('Tool not called');
  let completion = await createChatCompletion('gimel', {
    messages,
    tools: toolCatalog,
    tool_choice: candidate.placeUrl ? 'required' : 'none'
  });

  while (completion.choices[0].message.tool_calls?.length) {
    const assistantMessage = completion.choices[0].message;
    messages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.type !== 'function') {
        continue;
      }

      const args = JSON.parse(toolCall.function.arguments);
      const toolResult =
        toolCall.function.name === 'scrape_reviews'
          ? await scrapeReviews(args)
          : createToolError(`Unsupported tool: ${toolCall.function.name}`);
      scraped = toolResult;

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult)
      });
    }

    completion = await createChatCompletion('gimel', {
      messages,
      tools: toolCatalog,
      response_format: zodResponseFormat(
        GimelReasonOutputSchema,
        'gimel_reasons'
      )
    });
  }

  return {
    scraped,
    parsed: completion.choices[0].message.parsed,
    sanitizedCandidate,
    messages
  };
}

function validateReasonAgainstScrape(reason, scraped) {
  if (!reason) {
    return false;
  }

  const normalizedReason = reason.replace(/\s+/g, ' ').trim();

  const ratingMatch = normalizedReason.match(/([0-5](?:\.\d)?)점/);
  if (ratingMatch) {
    if (typeof scraped?.rating !== 'number') {
      return false;
    }

    if (Number.parseFloat(ratingMatch[1]) !== scraped.rating) {
      return false;
    }
  }

  const reviewCountMatch = normalizedReason.match(/리뷰\s*([0-9][0-9,]*)건/);
  if (reviewCountMatch) {
    if (typeof scraped?.reviewCount !== 'number') {
      return false;
    }

    if (
      Number.parseInt(reviewCountMatch[1].replace(/,/g, ''), 10) !==
      scraped.reviewCount
    ) {
      return false;
    }
  }

  return !/(위도|경도|latitude|longitude)/i.test(normalizedReason);
}

export class GimelAgent {
  constructor(dependencies = {}) {
    this.dependencies = {
      getAgentHarness,
      createAgentChatCompletion,
      scrapeReviews: defaultScrapeReviewsTool,
      tools: [SCRAPE_REVIEWS_TOOL],
      logger: logger.child({ agent: 'gimel' }),
      ...dependencies
    };
  }

  async generateReasonForCandidate(
    candidate,
    llmRuntime,
    sessionId,
    index,
    total
  ) {
    const position = `${index + 1}/${total}`;
    const detailParts = [position];
    if (typeof candidate.category === 'string' && candidate.category.trim()) {
      detailParts.push(candidate.category.trim());
    }
    if (typeof candidate.rating === 'number') {
      detailParts.push(`${candidate.rating}점`);
    }
    if (typeof candidate.reviewCount === 'number' && candidate.reviewCount > 0) {
      detailParts.push(`리뷰 ${candidate.reviewCount.toLocaleString('ko-KR')}건`);
    }
    if (typeof candidate.travelTimeMinutes === 'number') {
      detailParts.push(`이동 ${candidate.travelTimeMinutes}분`);
    }

    if (sessionId) {
      setSessionProgress(sessionId, {
        phase: 'gimel_candidate',
        message: `추천 이유 생성 중: ${candidate.name}`,
        detail: detailParts.join(' · ')
      });
    }

    let reason = createGroundedFallbackReason(
      sanitizeCandidateForPrompt(candidate),
      candidate.reviewExtraction || createToolError('LLM unavailable')
    );

    if (llmRuntime) {
      logAgentHop(this.dependencies.logger, {
        fromAgent: 'gimel',
        toAgent: 'llm',
        phase: 'reason_generation',
        candidateId: candidate.id,
        model: llmRuntime.model
      });

      const preloaded = candidate.reviewExtraction;
      const hasPreloadedReviews =
        Array.isArray(preloaded?.reviews) && preloaded.reviews.length > 0;

      const { parsed, scraped } = hasPreloadedReviews
        ? await runReasonFromPreloadedReviews(
            candidate,
            preloaded,
            this.dependencies.createAgentChatCompletion
          )
        : await runReasonToolLoop(
            candidate,
            this.dependencies.tools,
            this.dependencies.scrapeReviews,
            this.dependencies.createAgentChatCompletion
          );

      const llmReason = parsed?.reasons?.find(
        (item) => item.id === candidate.id
      )?.reason;

      if (validateReasonAgainstScrape(llmReason, scraped)) {
        reason = llmReason;
        this.dependencies.logger.info('Gimel accepted LLM reason', {
          event: 'gimel_reason_accepted',
          candidateId: candidate.id,
          scrapedProvider: scraped.provider,
          hasRating: typeof scraped.rating === 'number',
          hasReviewCount: typeof scraped.reviewCount === 'number',
          snippetCount: scraped.reviewSnippets?.length ?? 0
        });
      } else {
        reason = createGroundedFallbackReason(
          sanitizeCandidateForPrompt(candidate),
          scraped
        );
        this.dependencies.logger.warn('Gimel fell back to deterministic reason', {
          event: 'gimel_reason_fallback',
          candidateId: candidate.id,
          scrapeError: scraped.error,
          snippetCount: scraped.reviewSnippets?.length ?? 0
        });
      }
    } else {
      this.dependencies.logger.warn('Gimel used deterministic fallback without LLM', {
        event: 'gimel_reason_no_llm',
        candidateId: candidate.id
      });
    }

    return {
      ...candidate,
      reason
    };
  }

  async generateReasons(candidates, options = {}) {
    const { sessionId = null } = options;
    let llmRuntime = null;

    try {
      llmRuntime = this.dependencies.getAgentHarness('gimel');
    } catch {
      llmRuntime = null;
    }

    const llmCandidateLimit = FAST_MODE
      ? GIMEL_LLM_CANDIDATE_LIMIT_FAST
      : candidates.length;

    this.dependencies.logger.info('Gimel reason generation started', {
      event: 'gimel_generation_started',
      candidateCount: candidates.length,
      llmAvailable: Boolean(llmRuntime),
      fastMode: FAST_MODE,
      llmCandidateLimit
    });

    const results = await mapWithConcurrencyLimit(
      candidates,
      FAST_MODE ? candidates.length : DEFAULT_GIMEL_CONCURRENCY,
      async (candidate, index) => {
        const useLlm = Boolean(llmRuntime) && index < llmCandidateLimit;
        if (!useLlm) {
          return {
            ...candidate,
            reason: createGroundedFallbackReason(
              sanitizeCandidateForPrompt(candidate),
              candidate.reviewExtraction || createToolError('fast_mode_skip_llm')
            )
          };
        }

        if (FAST_MODE) {
          try {
            return await Promise.race([
              this.generateReasonForCandidate(
                candidate,
                llmRuntime,
                sessionId,
                index,
                candidates.length
              ),
              new Promise((resolve) =>
                setTimeout(
                  () =>
                    resolve({
                      ...candidate,
                      reason: createGroundedFallbackReason(
                        sanitizeCandidateForPrompt(candidate),
                        candidate.reviewExtraction ||
                          createToolError('gimel_timeout')
                      )
                    }),
                  GIMEL_LLM_TIMEOUT_MS
                )
              )
            ]);
          } catch {
            return {
              ...candidate,
              reason: createGroundedFallbackReason(
                sanitizeCandidateForPrompt(candidate),
                candidate.reviewExtraction || createToolError('gimel_error')
              )
            };
          }
        }

        return this.generateReasonForCandidate(
          candidate,
          llmRuntime,
          sessionId,
          index,
          candidates.length
        );
      }
    );

    this.dependencies.logger.info('Gimel reason generation completed', {
      event: 'gimel_generation_completed',
      resultCount: results.length
    });

    return results;
  }
}

export const gimel = new GimelAgent();

export default gimel;
