import { extractNaverReviews } from '../tools/naverReviewExtractor.js';
import { mapWithConcurrencyLimit } from '../utils/concurrency.js';

const DEFAULT_REVIEW_CONCURRENCY = 3;

function buildCanonicalPlaceUrl(placeId) {
  if (!placeId) {
    return null;
  }
  return `https://m.place.naver.com/restaurant/${placeId}/home`;
}

export async function enrichCandidatesWithReviews(
  candidates,
  { concurrency = DEFAULT_REVIEW_CONCURRENCY, fetchFn = fetch } = {}
) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  return mapWithConcurrencyLimit(
    candidates,
    concurrency,
    async (candidate) => {
      const scraped = await extractNaverReviews(
        {
          placeUrl: candidate.placeUrl,
          placeName: candidate.name,
          address: candidate.address
        },
        { fetchFn }
      );

      const canonicalPlaceUrl =
        buildCanonicalPlaceUrl(scraped.placeId) ?? candidate.placeUrl ?? null;

      return {
        ...candidate,
        placeId: scraped.placeId ?? candidate.placeId ?? null,
        placeUrl: canonicalPlaceUrl,
        rating:
          typeof scraped.rating === 'number' ? scraped.rating : candidate.rating,
        reviewCount:
          typeof scraped.reviewCount === 'number'
            ? scraped.reviewCount
            : candidate.reviewCount,
        reviewSummary: scraped.reviewSummary ?? candidate.reviewSummary ?? null,
        reviewSnippets: scraped.reviewSnippets ?? [],
        reviews: scraped.reviews ?? [],
        mainPhoto: scraped.mainPhoto ?? null,
        menuBoardPhoto: scraped.menuBoardPhoto ?? null,
        menuItems: Array.isArray(scraped.menuItems) ? scraped.menuItems : [],
        reviewExtraction: scraped
      };
    }
  );
}

/**
 * Enriches only the first N candidates and returns within a hard timeout budget.
 */
export async function enrichTopCandidatesWithReviewsFast(
  candidates,
  {
    limit = 3,
    timeoutMs = 5000,
    concurrency = 4,
    fetchFn = fetch
  } = {}
) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const head = candidates.slice(0, limit);
  const tail = candidates.slice(limit);

  let enrichedHead = head;
  try {
    enrichedHead = await Promise.race([
      enrichCandidatesWithReviews(head, { concurrency, fetchFn }),
      new Promise((resolve) =>
        setTimeout(() => resolve(head), timeoutMs)
      )
    ]);
  } catch {
    enrichedHead = head;
  }

  return [...enrichedHead, ...tail];
}
