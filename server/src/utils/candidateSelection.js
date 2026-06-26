import { classifyVenueType } from './venueGating.js';
import { getRankKeywordsForFoods } from './foodPreference.js';

function buildHaystack(candidate) {
  return `${candidate.name || ''} ${candidate.category || ''}`.toLowerCase();
}

export function scoreCandidateSearchRelevance(
  candidate,
  { desiredFoods = [], searchKeywords = [] } = {}
) {
  const haystack = buildHaystack(candidate);
  let score = 0;

  for (const food of desiredFoods) {
    const keywords = getRankKeywordsForFoods([food]);
    const probe = keywords.length > 0 ? keywords : [food];
    for (const keyword of probe) {
      if (haystack.includes(String(keyword).toLowerCase())) {
        score += 4;
      }
    }
  }

  for (const keyword of searchKeywords) {
    if (keyword && haystack.includes(String(keyword).toLowerCase())) {
      score += 2;
    }
  }

  return score;
}

export function selectCandidatesForRouting(candidates, options = {}, limit) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const normalizedLimit =
    Number.isInteger(limit) && limit > 0 ? limit : candidates.length;
  if (candidates.length <= normalizedLimit) {
    return candidates;
  }

  const desiredFoods = Array.isArray(options.desiredFoods)
    ? options.desiredFoods
    : [];
  const searchKeywords = Array.isArray(options.searchKeywords)
    ? options.searchKeywords
    : [];
  const venuePreference = options.venuePreference || 'restaurant';
  const venueIntentExplicit = options.venueIntentExplicit === true;

  const scored = candidates.map((candidate, index) => {
    let venuePenalty = 0;
    if (!venueIntentExplicit && venuePreference === 'restaurant') {
      const venueType = classifyVenueType(candidate);
      if (venueType !== 'restaurant') {
        venuePenalty = -8;
      }
    }

    const relevance = scoreCandidateSearchRelevance(candidate, {
      desiredFoods,
      searchKeywords
    });

    return {
      candidate,
      sortKey: relevance + venuePenalty,
      index
    };
  });

  scored.sort((left, right) => {
    if (right.sortKey !== left.sortKey) {
      return right.sortKey - left.sortKey;
    }
    return left.index - right.index;
  });

  return scored.slice(0, normalizedLimit).map((entry) => entry.candidate);
}
