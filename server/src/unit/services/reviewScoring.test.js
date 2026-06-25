import { describe, it, expect } from 'vitest';
import { scoreCandidateReviews } from '../../services/reviewScoring.js';

describe('reviewScoring', () => {
  it('prefers meat-focused restaurants with positive meat reviews when 고기 is desired', () => {
    const meatCandidate = {
      name: '육식사관학교',
      category: '육류,고기',
      rating: 4.5,
      reviews: [
        { body: '삼겹살이 두툼하고 맛있어요', rating: 5 },
        { body: '고기 굽기 좋고 재방문 의사 있음', rating: 5 }
      ],
      reviewSummary: { pros: '삼겹살이 두툼하고 맛있어요', cons: null }
    };
    const shabuCandidate = {
      name: '샤브로',
      category: '샤브샤브',
      rating: 4.2,
      reviews: [{ body: '국물이 깔끔해요', rating: 4 }],
      reviewSummary: { pros: '국물이 깔끔해요', cons: null }
    };

    const meatScore = scoreCandidateReviews(meatCandidate, ['고기']);
    const shabuScore = scoreCandidateReviews(shabuCandidate, ['고기']);

    expect(meatScore.reviewFit).toBeGreaterThan(shabuScore.reviewFit);
    expect(shabuScore.reviewMismatchPenalty).toBeGreaterThan(0);
  });
});
