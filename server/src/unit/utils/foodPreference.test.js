import { describe, it, expect } from 'vitest';
import {
  parseDesiredFoodsFromText,
  expandFoodSearchSuffixes,
  scoreFoodPreference,
  detectHangoverIntent,
  enrichSlotsWithHangoverIntent,
  buildSearchKeywordsFromScores
} from '../../utils/foodPreference.js';

describe('foodPreference', () => {
  it('parses meat intent from natural language', () => {
    expect(parseDesiredFoodsFromText('고기먹고 싶다')).toEqual(['고기']);
    expect(parseDesiredFoodsFromText('삼겹살 먹자')).toEqual(['삼겹살']);
  });

  it('parses hangover intent from natural language', () => {
    expect(parseDesiredFoodsFromText('어제 술마셔서 해장 하고 싶다')).toEqual(['해장']);
    expect(detectHangoverIntent('숙취 때문에 국밥')).toBe(true);
  });

  it('enriches slots for hangover recovery searches', () => {
    const enriched = enrichSlotsWithHangoverIntent({}, [
      '어제 술마셔서 해장 하고 싶다'
    ]);
    expect(enriched.desiredFoods ?? []).toEqual([]);
    expect(enriched.searchKeywords).toContain('해장국');
    expect(enriched.venuePreference).toBe('restaurant');
  });

  it('does not override LLM-provided food intent when onlyIfMissing is true', () => {
    const enriched = enrichSlotsWithHangoverIntent(
      {
        desiredFoods: ['일식'],
        searchKeywords: ['초밥'],
        venuePreference: 'restaurant'
      },
      ['어제 술마셔서 해장 하고 싶다'],
      { onlyIfMissing: true }
    );

    expect(enriched.desiredFoods).toEqual(['일식']);
    expect(enriched.searchKeywords).toEqual(['초밥']);
  });

  it('fills missing search keywords when only desiredFoods is already set', () => {
    const enriched = enrichSlotsWithHangoverIntent(
      {
        desiredFoods: ['해장']
      },
      ['어제 술마셔서 해장 하고 싶다'],
      { onlyIfMissing: true }
    );

    expect(enriched.searchKeywords).toContain('해장국');
    expect(enriched.venuePreference).toBe('restaurant');
  });

  it('expands meat searches for nearby lookup', () => {
    expect(expandFoodSearchSuffixes(['고기'])).toEqual([
      '고기',
      '삼겹살',
      '육류',
      '정육',
      '고깃집',
      '육식'
    ]);
  });

  it('ranks meat restaurants above shabu places when meat is desired', () => {
    const meat = scoreFoodPreference(
      { name: '육식사관학교', category: '육류,고기' },
      ['고기']
    );
    const shabu = scoreFoodPreference(
      { name: '샤브로', category: '샤브샤브' },
      ['고기']
    );

    expect(meat.foodPreferenceFit).toBeGreaterThan(shabu.foodPreferenceFit);
    expect(shabu.foodMismatchPenalty).toBeGreaterThan(0);
  });

  it('ranks hangover soup places above chicken when hangover is desired', () => {
    const soup = scoreFoodPreference(
      { name: '할매국밥', category: '국밥' },
      ['해장']
    );
    const chicken = scoreFoodPreference(
      { name: 'BBQ치킨', category: '치킨' },
      ['해장']
    );

    expect(soup.foodPreferenceFit).toBeGreaterThan(chicken.foodPreferenceFit);
    expect(chicken.foodMismatchPenalty).toBeGreaterThan(0);
  });

  it('scores candidates using LLM food preference scores', () => {
    const soup = scoreFoodPreference(
      { name: '할매국밥', category: '국밥' },
      [],
      [
        { food: '국밥', score: 95 },
        { food: '치킨', score: 10 }
      ]
    );
    const chicken = scoreFoodPreference(
      { name: 'BBQ치킨', category: '치킨' },
      [],
      [
        { food: '국밥', score: 95 },
        { food: '치킨', score: 10 }
      ]
    );

    expect(soup.foodPreferenceFit).toBeGreaterThan(chicken.foodPreferenceFit);
    expect(chicken.foodMismatchPenalty).toBeGreaterThan(0);
  });

  it('builds search keywords from high-scoring foods only', () => {
    expect(
      buildSearchKeywordsFromScores([
        { food: '해장', score: 95 },
        { food: '치킨', score: 10 }
      ])
    ).toContain('해장국');
  });
});
