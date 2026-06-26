import { describe, it, expect } from 'vitest';
import {
  FOOD_CATALOG,
  FOOD_CATALOG_STATS,
  FOOD_CATEGORIES,
  buildFoodCatalogPromptSummary,
  buildDesiredFoodOptionsFromScores,
  expandFoodSearchKeywords,
  getDefaultDesiredFoodOptions,
  inferDesiredFoodOptions,
  listCategoryIds,
  resolveFoodId,
  resolveFoodIdsFromText,
  validateFoodCravingSuggestions
} from '../../../../shared/contracts/foodCatalog.js';

describe('foodCatalog', () => {
  it('defines categorized foods with stable stats', () => {
    expect(FOOD_CATALOG_STATS.totalFoods).toBe(FOOD_CATALOG.length);
    expect(FOOD_CATALOG_STATS.categories).toBe(listCategoryIds().length);
    expect(listCategoryIds().length).toBe(Object.keys(FOOD_CATEGORIES).length);
    expect(FOOD_CATALOG_STATS.totalFoods).toBeGreaterThanOrEqual(130);
  });

  it('does not match short food aliases inside unrelated words', () => {
    expect(resolveFoodIdsFromText('분위기면 좋겠어')).toEqual([]);
    expect(resolveFoodIdsFromText('면 요리 먹고 싶다')).toContain('면');
  });

  it('resolves aliases to canonical food ids', () => {
    expect(resolveFoodId('삼겹살')).toBe('삼겹살');
    expect(resolveFoodIdsFromText('고기먹고 싶다')).toContain('고기');
    expect(resolveFoodIdsFromText('삼겹살 먹자')).toContain('삼겹살');
    expect(resolveFoodIdsFromText('어제 술마셔서 해장')).toContain('해장');
  });

  it('expands search keywords from catalog entries', () => {
    expect(expandFoodSearchKeywords(['고기'])).toContain('삼겹살');
    expect(expandFoodSearchKeywords(['해장'])).toContain('해장국');
  });

  it('exposes default intent food options', () => {
    const options = getDefaultDesiredFoodOptions();
    expect(options.length).toBeGreaterThanOrEqual(6);
    expect(options.map((item) => item.value)).toContain('고기');
    expect(options.map((item) => item.value)).toContain('해장');
  });

  it('builds desired food options from preference scores and related foods', () => {
    const options = buildDesiredFoodOptionsFromScores([
      { food: '국밥', score: 95 },
      { food: '해장국', score: 88 },
      { food: '치킨', score: 10 }
    ]);

    expect(options.map((item) => item.value)).toContain('국밥');
    expect(options.map((item) => item.value)).toContain('해장국');
    expect(options.map((item) => item.value)).not.toContain('치킨');
    expect(options.length).toBeGreaterThanOrEqual(3);
  });

  it('omits southeast asian intent from fallback unless query mentions it', () => {
    const defaultOptions = inferDesiredFoodOptions({}, '스트레스 받아서 기운 없어');
    expect(defaultOptions.map((item) => item.value)).not.toContain('동남아');

    const vietnameseOptions = inferDesiredFoodOptions({}, '베트남 쌀국수 먹고 싶어');
    expect(vietnameseOptions.map((item) => item.value)).toContain('동남아');
  });

  it('builds LLM catalog summary by category', () => {
    const summary = buildFoodCatalogPromptSummary();
    expect(summary).toContain('고기·구이');
    expect(summary).toContain('삼겹살');
  });

  it('validates craving suggestions against catalog ids', () => {
    const validated = validateFoodCravingSuggestions(
      [
        { food: '국밥', label: '국밥', score: 95 },
        { food: '해장국', label: '해장국', score: 90 },
        { food: '죽', label: '죽', score: 80 }
      ],
      [
        { food: '치킨', label: '치킨', score: 10 },
        { food: '피자', label: '피자', score: 8 }
      ]
    );

    expect(validated.suggestions).toHaveLength(3);
    expect(validated.avoidSuggestions).toHaveLength(2);
    expect(validated.suggestions[0].food).toBe('국밥');
  });
});
