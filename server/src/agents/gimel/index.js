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
import {
  extractNaverReviews,
  extractNaverHomeEnrichment,
  extractPlaceIdFromUrl
} from '../../tools/naverReviewExtractor.js';

const DEFAULT_GIMEL_CONCURRENCY = 5;
const MAX_MEDIA_MENU_ITEMS = 3;
const DRINK_KEYWORDS =
  /\b(커피|음료|맥주|와인|칵테일|소주|에이드|주류|술|칵테일바)\b/iu;
const NEGATIVE_REVIEW_PATTERN =
  /(아쉬|불편|별로|비싸|느리|시끄|불친절|맛없|최악|실망|비추|재방문 안|재방문은 안|부족|없어서)/u;
const POSITIVE_REVIEW_PATTERN =
  /(깨끗|깔끔|맛있|좋|친절|조용|편하|혼밥|구성|잘 넘어가|텁텁한 느낌도 없|호감|든든|국물|빨리|빠르)/u;

function formatWorkerName(index) {
  const suffixes = ['1st', '2nd', '3rd', '4th', '5th'];
  const suffix = suffixes[index % suffixes.length];
  return `gimel ${suffix}`;
}

function isDrinkItem(name) {
  return DRINK_KEYWORDS.test(name);
}

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
    reviewSignals: { categories: [], doReasons: [], dontReasons: [] },
    reviewSnippets: [],
    reviewPhotos: [],
    mainPhoto: null,
    menuBoardPhoto: null,
    menuItems: [],
    negativeReviewCount: 0,
    positiveReviewCount: 0,
    shouldExcludeFromRecommendation: false,
    extractionMethod: 'unavailable',
    fetchedAt: new Date().toISOString(),
    error: message
  });
}

export async function defaultScrapeReviewsTool({
  placeUrl,
  placeName,
  address
}) {
  if (!placeUrl && !placeName) {
    return createToolError('Missing place URL and name');
  }

  if (placeUrl && String(placeUrl).toLowerCase().includes('naver.com')) {
    return extractNaverReviews({ placeUrl, placeName, address });
  }

  if (placeName) {
    return extractNaverReviews({ placeUrl: null, placeName, address });
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

function normalizeMenuItems(menuItems) {
  const normalized = [];
  for (const item of menuItems || []) {
    if (!item || typeof item !== 'object' || typeof item.name !== 'string')
      continue;
    const name = item.name.trim();
    if (!name) continue;
    if (isDrinkItem(name)) continue;
    normalized.push({
      name,
      price: item.price == null ? null : String(item.price)
    });
    if (normalized.length >= MAX_MEDIA_MENU_ITEMS) break;
  }
  return normalized;
}

function derivePlaceId(candidate, scraped) {
  if (scraped?.placeId) return scraped.placeId;
  if (candidate?.placeUrl) return extractPlaceIdFromUrl(candidate.placeUrl);
  return null;
}

function normalizeReviewText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[^\p{L}\p{N}\s.,!?~ㄱ-ㅎㅏ-ㅣ가-힣]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNegativeReviewText(text) {
  return NEGATIVE_REVIEW_PATTERN.test(normalizeReviewText(text));
}

function isPositiveReviewText(text) {
  const normalized = normalizeReviewText(text);
  return POSITIVE_REVIEW_PATTERN.test(normalized) && !isNegativeReviewText(normalized);
}

function summarizePositiveText(text) {
  const normalized = normalizeReviewText(text);
  if (!normalized) return null;
  if (normalized.includes('깨끗') && normalized.includes('혼밥')) {
    return '매장이 깨끗하고 혼밥하기 좋은 구성이라고 합니다.';
  }
  if (normalized.includes('쌀국수') || normalized.includes('베트남')) {
    return '쌀국수와 베트남 음식 만족도가 높다고 합니다.';
  }
  if (normalized.includes('쫄깃') || normalized.includes('잘 넘어가')) {
    return '면 식감이 좋고 부담 없이 먹기 좋다고 합니다.';
  }
  if (normalized.includes('깨끗')) return '매장이 깨끗하다고 합니다.';
  if (normalized.includes('국물') && normalized.includes('든든')) {
    return '국물이 진하고 든든하다고 합니다.';
  }
  if (normalized.includes('국물') && (normalized.includes('빨리') || normalized.includes('빠르'))) {
    return '국물이 진하고 음식이 빨리 나온다고 합니다.';
  }
  if (normalized.includes('국물')) return '국물이 진하다고 합니다.';
  if (normalized.includes('조용')) return '조용해서 대화하기 좋다고 합니다.';
  if (normalized.includes('친절')) return '응대가 친절하다고 합니다.';
  if (normalized.includes('맛있')) return '음식이 맛있다고 합니다.';
  return `${normalized.slice(0, 60)}라고 합니다.`;
}

function summarizeNegativeText(text) {
  const normalized = normalizeReviewText(text);
  if (!normalized || !isNegativeReviewText(normalized)) return null;
  if (
    normalized.includes('새우') &&
    normalized.includes('아쉬') &&
    normalized.includes('짜장면')
  ) {
    return '짬뽕은 새우가 없어서 아쉬웠지만, 짜장면은 잘 넘어가고 텁텁한 느낌이 없다고 합니다.';
  }
  return `${normalized.slice(0, 60)}다고 합니다.`;
}

function deriveReviewSummary(scraped) {
  const reviews = Array.isArray(scraped?.reviews) ? scraped.reviews : [];
  const bodies = reviews.map((review) => review?.body).filter(Boolean);
  const doReason = scraped?.reviewSignals?.doReasons?.[0]?.evidence ?? null;
  const dontReason = scraped?.reviewSignals?.dontReasons?.[0]?.evidence ?? null;
  const positiveSource =
    doReason ||
    bodies.find((body) => normalizeReviewText(body).includes('깨끗')) ||
    bodies.find(isPositiveReviewText) ||
    scraped?.reviewSummary?.pros ||
    scraped?.reviewSnippets?.find(isPositiveReviewText) ||
    null;
  const negativeSource =
    dontReason ||
    bodies.find(
      (body) => isNegativeReviewText(body) && normalizeReviewText(body).includes('지만')
    ) ||
    bodies.find(isNegativeReviewText) ||
    (isNegativeReviewText(scraped?.reviewSummary?.cons)
      ? scraped.reviewSummary.cons
      : null);

  return {
    pros: summarizePositiveText(positiveSource),
    cons: summarizeNegativeText(negativeSource)
  };
}

function createConciseFallbackReason(candidate, reviewSummary) {
  const transportLabel = candidate.transportMode === 'walk' ? '도보' : '차량';
  const base = `${candidate.category} 식당으로 ${transportLabel} ${candidate.oneWayRouteMinutes}분 거리여서 이동 부담이 적`;
  const pros = normalizeReviewText(reviewSummary?.pros);
  if (pros.includes('깨끗')) return `${base}고, 매장이 깨끗해서 좋습니다.`;
  if (pros.includes('쌀국수') || pros.includes('베트남')) {
    return `${base}고, 쌀국수와 베트남 음식 만족도가 높습니다.`;
  }
  if (pros.includes('면 식감') || pros.includes('부담 없이 먹기')) {
    return `${base}고, 면 식감이 좋고 부담 없이 먹기 좋습니다.`;
  }
  if (pros.includes('국물') && pros.includes('든든')) {
    return `${base}고, 국물이 진하고 든든하다는 평가가 있습니다.`;
  }
  if (pros.includes('국물') && (pros.includes('빨리') || pros.includes('빠르'))) {
    return `${base}고, 국물이 진하고 음식이 빨리 나온다는 평가가 있습니다.`;
  }
  if (pros.includes('국물')) return `${base}고, 국물이 진하다는 평가가 있습니다.`;
  if (pros.includes('조용')) return `${base}고, 조용해서 대화하기 좋습니다.`;
  if (pros.includes('친절')) return `${base}고, 응대가 친절합니다.`;
  if (pros.includes('맛있')) return `${base}고, 음식이 맛있다는 평가가 있습니다.`;
  return `${base}습니다.`;
}

export function createGroundedFallbackReason(candidate, scraped) {
  return createConciseFallbackReason(candidate, deriveReviewSummary(scraped));
}

async function runReasonToolLoop(
  candidate,
  tools,
  scrapeReviews,
  createChatCompletion,
  trace,
  worker
) {
  const sanitizedCandidate = sanitizeCandidateForPrompt(candidate);
  const messages = [
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Generate one grounded Korean recommendation reason for this restaurant.',
        candidate: sanitizedCandidate,
        instruction:
          'Call scrape_reviews first when a place URL is available. Summarize visitor reviews into one natural Korean recommendation sentence. Do not quote raw reviews, do not label 좋은 점 or 아쉬운 점, and do not treat positive review text as a drawback.'
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
      if (trace) {
        trace({
          event: 'gimel_tool_started',
          candidateId: candidate.id,
          tool: toolCall.function.name,
          worker
        });
      }
      const toolResult =
        toolCall.function.name === 'scrape_reviews'
          ? await scrapeReviews(args)
          : createToolError(`Unsupported tool: ${toolCall.function.name}`);
      if (trace) {
        trace({
          event: 'gimel_tool_finished',
          candidateId: candidate.id,
          tool: toolCall.function.name,
          worker,
          reviewCount: Array.isArray(toolResult?.reviews)
            ? toolResult.reviews.length
            : 0,
          extractionMethod: toolResult?.extractionMethod
        });
      }
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

  const ratingMatch = normalizedReason.match(/([0-5](?:\.\d)?)/);
  if (ratingMatch) {
    if (typeof scraped?.rating !== 'number') {
      return false;
    }

    if (Number.parseFloat(ratingMatch[1]) !== scraped.rating) {
      return false;
    }
  }

  const reviewCountMatch = normalizedReason.match(/리뷰\s*([0-9][0-9,]*)/);
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

  return !/(리뷰|review|latitude|longitude)/i.test(normalizedReason);
}

async function enrichCandidateWithHomeData(candidate, scraped) {
  const placeId = derivePlaceId(candidate, scraped);
  if (!placeId) {
    return {
      mainPhoto: null,
      menuBoardPhoto: null,
      reviewPhotos: [],
      menuItems: []
    };
  }

  try {
    const homeData = await extractNaverHomeEnrichment(placeId, candidate.name);
    return {
      mainPhoto: homeData.mainPhoto ?? null,
      menuBoardPhoto: homeData.menuBoardPhoto ?? null,
      reviewPhotos: scraped.reviewPhotos ?? [],
      menuItems: normalizeMenuItems(homeData.menuItems ?? [])
    };
  } catch {
    return {
      mainPhoto: null,
      menuBoardPhoto: null,
      reviewPhotos: scraped.reviewPhotos ?? [],
      menuItems: []
    };
  }
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

  async generateReasons(candidates, options = {}) {
    const { trace = this.dependencies.trace } = options;
    let llmRuntime = null;

    try {
      llmRuntime = this.dependencies.getAgentHarness('gimel');
    } catch {
      llmRuntime = null;
    }

    const results = [];
    const queue = Array.isArray(candidates) ? candidates : [];
    const workerCount = Math.max(
      1,
      Math.min(DEFAULT_GIMEL_CONCURRENCY, queue.length)
    );
    let cursor = 0;

    this.dependencies.logger.info('Gimel reason generation started', {
      event: 'gimel_generation_started',
      candidateCount: queue.length,
      llmAvailable: Boolean(llmRuntime),
      workerCount
    });

    const workers = Array.from({ length: workerCount }, (_, workerIndex) =>
      (async () => {
        while (cursor < queue.length) {
          const currentIndex = cursor;
          cursor += 1;
          const candidate = queue[currentIndex];
          const worker = formatWorkerName(workerIndex);

          if (trace) {
            trace({
              event: 'gimel_worker_started',
              phase: 'reasoning',
              candidateId: candidate.id,
              worker
            });
          }

          let reason = createGroundedFallbackReason(
            sanitizeCandidateForPrompt(candidate),
            createToolError('LLM unavailable')
          );
          let scraped = createToolError('Tool not called');

          if (llmRuntime && candidate.placeUrl) {
            logAgentHop(this.dependencies.logger, {
              fromAgent: 'gimel',
              toAgent: 'llm',
              phase: 'reason_generation',
              candidateId: candidate.id,
              model: llmRuntime.model
            });
            const { parsed, scraped: toolScrape } = await runReasonToolLoop(
              candidate,
              this.dependencies.tools,
              this.dependencies.scrapeReviews,
              this.dependencies.createAgentChatCompletion,
              trace,
              worker
            );
            scraped = toolScrape;

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
              this.dependencies.logger.warn(
                'Gimel fell back to deterministic reason',
                {
                  event: 'gimel_reason_fallback',
                  candidateId: candidate.id,
                  scrapeError: scraped.error,
                  snippetCount: scraped.reviewSnippets?.length ?? 0
                }
              );
            }
          } else {
            if (trace) {
              trace({
                event: 'gimel_tool_started',
                candidateId: candidate.id,
                tool: 'scrape_reviews',
                worker
              });
            }
            scraped = await this.dependencies.scrapeReviews({
              placeUrl: candidate.placeUrl,
              placeName: candidate.name,
              address: candidate.address
            });
            reason = createGroundedFallbackReason(
              sanitizeCandidateForPrompt(candidate),
              scraped
            );
            if (trace) {
              trace({
                event: 'gimel_tool_finished',
                candidateId: candidate.id,
                tool: 'scrape_reviews',
                worker,
                reviewCount: scraped.reviewSnippets?.length ?? 0,
                extractionMethod: scraped.extractionMethod
              });
            }
            this.dependencies.logger.warn(
              'Gimel used deterministic fallback before/without LLM',
              {
                event: 'gimel_reason_no_llm',
                candidateId: candidate.id
              }
            );
          }

          const cleanedReviewSummary = deriveReviewSummary(scraped);

          if (scraped.shouldExcludeFromRecommendation) {
            if (trace) {
              trace({
                event: 'gimel_candidate_excluded_by_reviews',
                phase: 'review_screening',
                candidateId: candidate.id,
                worker,
                negativeReviewCount: scraped.negativeReviewCount ?? 0,
                positiveReviewCount: scraped.positiveReviewCount ?? 0
              });
            }
            results[currentIndex] = null;
            continue;
          }

          const media = await enrichCandidateWithHomeData(candidate, scraped);

          const normalizedScraped = {
            ...candidate,
            reason,
            rating: scraped.rating ?? candidate.rating ?? null,
            reviewCount: scraped.reviewCount ?? candidate.reviewCount ?? null,
            reviewSummary: cleanedReviewSummary ?? candidate.reviewSummary ?? null,
            reviewSignals:
              scraped.reviewSignals ?? candidate.reviewSignals ?? {
                categories: [],
                doReasons: [],
                dontReasons: []
              },
            mainPhoto: media.mainPhoto ?? null,
            menuBoardPhoto: media.menuBoardPhoto ?? null,
            reviewPhotos: media.reviewPhotos ?? [],
            menuItems: normalizeMenuItems(media.menuItems ?? [])
          };

          results[currentIndex] = {
            ...candidate,
            ...normalizedScraped
          };

          if (trace) {
            trace({
              event: 'gimel_reason_complete',
              phase: 'reasoning',
              candidateId: candidate.id,
              worker
            });
          }
        }
      })()
    );

    await Promise.all(workers);

    this.dependencies.logger.info('Gimel reason generation completed', {
      event: 'gimel_generation_completed',
      resultCount: results.length
    });

    return results.filter(Boolean);
  }
}

export const gimel = new GimelAgent();

export default gimel;
