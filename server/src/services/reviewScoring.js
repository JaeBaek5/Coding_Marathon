import {
  scoreFoodPreference,
  getRankKeywordsForFoods
} from '../utils/foodPreference.js';

const POSITIVE_REVIEW_KEYWORDS = [
  '맛있',
  '친절',
  '깔끔',
  '추천',
  '최고',
  '재방문',
  '좋아',
  '신선',
  '빠르',
  '만족'
];

const NEGATIVE_REVIEW_KEYWORDS = [
  '별로',
  '실망',
  '불친절',
  '비싸',
  '느리',
  '시끄',
  '아쉬',
  '불편'
];

function averageReviewRating(reviews = []) {
  const rated = reviews.filter(
    (review) => typeof review?.rating === 'number' && Number.isFinite(review.rating)
  );
  if (rated.length === 0) {
    return null;
  }
  return rated.reduce((sum, review) => sum + review.rating, 0) / rated.length;
}

function countKeywordHits(text, keywords) {
  const haystack = String(text || '').toLowerCase();
  let hits = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword.toLowerCase())) {
      hits += 1;
    }
  }
  return hits;
}

function countIntentHitsInReviews(reviews, keywords) {
  let hits = 0;
  for (const review of reviews) {
    hits += countKeywordHits(review?.body, keywords);
  }
  return hits;
}

/**
 * Review-grounded score used before final ranking.
 */
export function scoreCandidateReviews(candidate, desiredFoods = []) {
  const reviews = Array.isArray(candidate.reviews) ? candidate.reviews : [];
  const reviewText = [
    candidate.reviewSummary?.pros,
    candidate.reviewSummary?.cons,
    ...reviews.map((review) => review?.body),
    ...(candidate.reviewSnippets || [])
  ]
    .filter(Boolean)
    .join(' ');

  let reviewSentimentFit = 0;
  const placeRating =
    typeof candidate.rating === 'number' ? candidate.rating : null;
  const averageRating = averageReviewRating(reviews);

  if (placeRating !== null) {
    reviewSentimentFit += Math.min(16, placeRating * 3.2);
  } else if (averageRating !== null) {
    reviewSentimentFit += Math.min(16, averageRating * 3.2);
  }

  const positiveHits = countKeywordHits(reviewText, POSITIVE_REVIEW_KEYWORDS);
  const negativeHits = countKeywordHits(reviewText, NEGATIVE_REVIEW_KEYWORDS);
  reviewSentimentFit += Math.min(10, positiveHits * 2.5);
  reviewSentimentFit -= Math.min(10, negativeHits * 2.5);
  reviewSentimentFit = Math.max(0, reviewSentimentFit);

  let reviewIntentFit = 0;
  let reviewMismatchPenalty = 0;

  if (desiredFoods.length > 0) {
    const intentKeywords = getRankKeywordsForFoods(desiredFoods);
    const metadataHits =
      countKeywordHits(`${candidate.name} ${candidate.category}`, intentKeywords) +
      countIntentHitsInReviews(reviews, intentKeywords);
    const reviewOnlyHits = countKeywordHits(reviewText, intentKeywords);

    reviewIntentFit =
      metadataHits === 0 && reviewOnlyHits === 0
        ? 0
        : Math.min(25, (metadataHits + reviewOnlyHits) * 4);

    const { foodPreferenceFit, foodMismatchPenalty } = scoreFoodPreference(
      candidate,
      desiredFoods
    );
    reviewIntentFit = Math.max(reviewIntentFit, Math.min(30, foodPreferenceFit));
    reviewMismatchPenalty = foodMismatchPenalty;

    if (metadataHits + reviewOnlyHits === 0 && reviews.length > 0) {
      reviewMismatchPenalty += 12;
    }
  }

  const reviewCoverageFit =
    reviews.length >= 5 ? 8 : reviews.length > 0 ? 5 : 0;

  const reviewFit = Number(
    (reviewSentimentFit + reviewIntentFit + reviewCoverageFit).toFixed(4)
  );

  return {
    reviewFit,
    reviewSentimentFit,
    reviewIntentFit,
    reviewCoverageFit,
    reviewMismatchPenalty
  };
}
