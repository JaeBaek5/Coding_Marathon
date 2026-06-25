import { describe, it, expect } from 'vitest';
import {
  applySelectedFoodCraving,
  buildFoodCravingQuestion,
  shouldOfferFoodCravingQuestion
} from '../../agents/aleph/foodCravingInference.js';

describe('foodCravingInference', () => {
  it('offers food craving question for vague state descriptions', () => {
    expect(
      shouldOfferFoodCravingQuestion({}, '스트레스 받아서 기운 없어', {})
    ).toBe(true);
    expect(
      shouldOfferFoodCravingQuestion({}, '어제 술 마셔서 머리 아파', {})
    ).toBe(true);
  });

  it('skips food craving when the user already named what to eat', () => {
    expect(
      shouldOfferFoodCravingQuestion({}, '고기 먹고 싶다', {})
    ).toBe(false);
    expect(
      shouldOfferFoodCravingQuestion(
        { desiredFoods: ['일식'] },
        '조용한 곳에서 초밥',
        {}
      )
    ).toBe(false);
    expect(
      shouldOfferFoodCravingQuestion(
        { venuePreference: 'bar' },
        '친구랑 술마시고 싶다',
        {}
      )
    ).toBe(false);
  });

  it('builds a three-option desiredFoods question', () => {
    const question = buildFoodCravingQuestion({
      stateSummary: '피곤한 상태',
      suggestions: [
        { food: '국밥', label: '따뜻한 국밥', score: 95 },
        { food: '면', label: '얼큰한 라면', score: 88 },
        { food: '죽', label: '속 편한 죽', score: 80 }
      ],
      avoidSuggestions: [
        { food: '치킨', label: '치킨', score: 10 },
        { food: '피자', label: '피자', score: 8 }
      ]
    });

    expect(question.field).toBe('desiredFoods');
    expect(question.options).toHaveLength(3);
    expect(question.avoidSuggestions).toHaveLength(2);
    expect(question.label).toContain('피곤한 상태');
  });

  it('keeps low-score avoid foods in excludedFoods after selection', () => {
    const slots = applySelectedFoodCraving(
      {
        foodPreferenceScores: [
          { food: '국밥', score: 95 },
          { food: '면', score: 88 },
          { food: '치킨', score: 10 }
        ],
        excludedFoods: ['치킨']
      },
      ['국밥']
    );

    expect(slots.desiredFoods).toEqual(['국밥']);
    expect(slots.excludedFoods).toContain('치킨');
    expect(slots.foodPreferenceScores.find((item) => item.food === '치킨').score).toBe(10);
  });

  it('boosts the selected food and builds search keywords', () => {
    const slots = applySelectedFoodCraving(
      {
        foodPreferenceScores: [
          { food: '국밥', score: 95 },
          { food: '면', score: 88 }
        ]
      },
      ['국밥']
    );

    expect(slots.desiredFoods).toEqual(['국밥']);
    expect(slots.foodPreferenceScores.find((item) => item.food === '국밥').score).toBe(
      100
    );
    expect(slots.searchKeywords.length).toBeGreaterThan(0);
  });
});
