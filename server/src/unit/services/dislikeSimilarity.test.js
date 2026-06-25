import { describe, expect, it } from 'vitest';
import {
  computeDislikeSimilarity,
  computeDislikeSimilarityPenalty,
  rerankCandidatesByDislikeSimilarity,
  toDislikeProfile
} from '../../services/dislikeSimilarity.js';

describe('dislikeSimilarity', () => {
  it('penalizes candidates with the same category more heavily', () => {
    const disliked = toDislikeProfile({
      id: 'a',
      name: '삼겹살집',
      category: '한식>육류,고기'
    });
    const similar = {
      id: 'b',
      name: '돼지고기 명가',
      category: '한식>육류,고기',
      scoreTotal: 90
    };
    const different = {
      id: 'c',
      name: '스시야',
      category: '일식>초밥',
      scoreTotal: 90
    };

    expect(computeDislikeSimilarity(similar, disliked)).toBeGreaterThan(0.5);
    expect(computeDislikeSimilarity(different, disliked)).toBeLessThan(0.2);
    expect(
      computeDislikeSimilarityPenalty(similar, [disliked])
    ).toBeGreaterThan(computeDislikeSimilarityPenalty(different, [disliked]));
  });

  it('reorders the pool so similar candidates fall behind', () => {
    const disliked = toDislikeProfile({
      id: 'a',
      name: '삼겹살집',
      category: '한식>육류,고기'
    });
    const reranked = rerankCandidatesByDislikeSimilarity(
      [
        {
          id: 'b',
          name: '돼지고기 명가',
          category: '한식>육류,고기',
          scoreTotal: 95,
          totalExpectedMinutes: 40
        },
        {
          id: 'c',
          name: '스시야',
          category: '일식>초밥',
          scoreTotal: 90,
          totalExpectedMinutes: 35
        }
      ],
      [disliked]
    );

    expect(reranked[0].id).toBe('c');
    expect(reranked[1].scoreComponents.dislikeSimilarityPenalty).toBeGreaterThan(0);
  });
});
