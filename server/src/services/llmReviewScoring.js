import { zodResponseFormat } from 'openai/helpers/zod';
import { BetCandidateLLMScoreOutputSchema } from '../../../shared/contracts/schemas.js';
import { createAgentChatCompletion } from '../llm/client.js';

function buildCandidatePayload(candidate) {
  return {
    id: candidate.id,
    name: candidate.name,
    category: candidate.category,
    oneWayRouteMinutes: candidate.oneWayRouteMinutes,
    totalExpectedMinutes: candidate.totalExpectedMinutes,
    distanceMeters: candidate.distanceMeters,
    rating: candidate.rating ?? null,
    reviewCount: candidate.reviewCount ?? null,
    reviewSummary: candidate.reviewSummary ?? null,
    reviewSnippets: (candidate.reviewSnippets || []).slice(0, 5),
    reviews: (candidate.reviews || []).slice(0, 8).map((review) => ({
      body: String(review?.body || '').slice(0, 220),
      rating: review?.rating ?? null
    }))
  };
}

/**
 * Uses the Bet LLM role to score candidate relevance and review sentiment.
 * Returns a map keyed by candidate id.
 */
export async function scoreCandidatesWithLLM(candidates, context = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const {
    userQuery = '',
    desiredFoods = [],
    foodPreferenceScores = [],
    partyContext = '',
    vibe = '',
    budgetPerPersonKrw = null,
    totalTimeMinutes = null,
    transportMode = 'walk'
  } = context;

  try {
    const completion = await createAgentChatCompletion('bet', {
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Score each restaurant for the user request.',
            userRequest: {
              query: userQuery,
              desiredFoods,
              foodPreferenceScores,
              partyContext,
              vibe,
              budgetPerPersonKrw,
              totalTimeMinutes,
              transportMode
            },
            candidates: candidates.map(buildCandidatePayload),
            scoringGuide: {
              relevanceScore:
                '0-100 how well food type, category, and reviews match what the user wants to eat and the social context.',
              sentimentScore:
                '0-100 how positive the available reviews are for this visit.'
            },
            instruction:
              'Return one entry per candidate id. Base scores only on provided facts. Penalize clear mismatches (e.g. shabu when user wants grilled meat).'
          })
        }
      ],
      response_format: zodResponseFormat(
        BetCandidateLLMScoreOutputSchema,
        'bet_candidate_scores'
      )
    });

    const parsed = completion?.choices?.[0]?.message?.parsed;
    const validation = BetCandidateLLMScoreOutputSchema.safeParse(parsed);
    if (!validation.success) {
      return null;
    }

    const scoreMap = {};
    for (const entry of validation.data.scores) {
      scoreMap[entry.id] = entry;
    }
    return scoreMap;
  } catch {
    return null;
  }
}

export function applyLLMScoresToCandidates(candidates, scoreMap) {
  if (!scoreMap) {
    return candidates;
  }

  return candidates.map((candidate) => {
    const scored = scoreMap[candidate.id];
    if (!scored) {
      return candidate;
    }

    return {
      ...candidate,
      llmRelevanceScore: scored.relevanceScore,
      llmSentimentScore: scored.sentimentScore,
      llmScoreRationale: scored.rationale
    };
  });
}
