export const DISLIKE_SIMILARITY_PENALTY_MAX = 25;

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[\s,/_().·\-+]+/)
    .filter((token) => token.length >= 2);
}

export function toDislikeProfile(candidate) {
  const name = candidate?.name || '';
  const category = candidate?.category || '';

  return {
    id: candidate?.id || '',
    name,
    category,
    tokens: [...new Set([...tokenize(name), ...tokenize(category)])]
  };
}

export function computeDislikeSimilarity(candidate, profile) {
  if (!candidate || !profile) {
    return 0;
  }
  if (candidate.id && candidate.id === profile.id) {
    return 1;
  }

  let score = 0;
  const category = (candidate.category || '').toLowerCase().trim();
  const profileCategory = (profile.category || '').toLowerCase().trim();

  if (category && profileCategory) {
    if (category === profileCategory) {
      score += 0.55;
    } else if (
      category.includes(profileCategory) ||
      profileCategory.includes(category)
    ) {
      score += 0.35;
    }
  }

  const candidateTokens = new Set([
    ...tokenize(candidate.name),
    ...tokenize(candidate.category)
  ]);
  let tokenOverlap = 0;
  for (const token of profile.tokens || []) {
    if (candidateTokens.has(token)) {
      tokenOverlap += 1;
      continue;
    }
    if (category.includes(token) || String(candidate.name || '').includes(token)) {
      tokenOverlap += 1;
    }
  }
  score += Math.min(0.4, tokenOverlap * 0.12);

  return Math.min(1, score);
}

export function computeDislikeSimilarityPenalty(
  candidate,
  dislikedProfiles,
  maxPenalty = DISLIKE_SIMILARITY_PENALTY_MAX
) {
  if (!Array.isArray(dislikedProfiles) || dislikedProfiles.length === 0) {
    return 0;
  }

  let maxSimilarity = 0;
  for (const profile of dislikedProfiles) {
    maxSimilarity = Math.max(
      maxSimilarity,
      computeDislikeSimilarity(candidate, profile)
    );
  }

  return Number((maxSimilarity * maxPenalty).toFixed(4));
}

function applyPenaltyToCandidate(candidate, penalty) {
  if (!penalty) {
    return candidate;
  }

  const baseScore =
    typeof candidate.scoreTotal === 'number'
      ? candidate.scoreTotal
      : candidate.scoreBreakdown?.total ?? 0;
  const adjustedScore = Number(Math.max(0, baseScore - penalty).toFixed(4));
  const scoreComponents = {
    ...(candidate.scoreComponents || candidate.scoreBreakdown?.components || {}),
    dislikeSimilarityPenalty: penalty
  };

  return {
    ...candidate,
    scoreTotal: adjustedScore,
    scoreComponents,
    scoreBreakdown: {
      total: adjustedScore,
      components: scoreComponents
    }
  };
}

export function rerankCandidatesByDislikeSimilarity(
  candidates,
  dislikedProfiles
) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }
  if (!Array.isArray(dislikedProfiles) || dislikedProfiles.length === 0) {
    return [...candidates];
  }

  const scored = candidates.map((candidate) => {
    const penalty = computeDislikeSimilarityPenalty(candidate, dislikedProfiles);
    return applyPenaltyToCandidate(candidate, penalty);
  });

  scored.sort((left, right) => {
    if (right.scoreTotal !== left.scoreTotal) {
      return right.scoreTotal - left.scoreTotal;
    }
    if (left.totalExpectedMinutes !== right.totalExpectedMinutes) {
      return left.totalExpectedMinutes - right.totalExpectedMinutes;
    }
    return (left.name || '').localeCompare(right.name || '', 'ko');
  });

  return scored;
}
