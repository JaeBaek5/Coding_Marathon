import { describe, it, expect } from 'vitest';
import {
  classifyVenueType,
  detectBarIntent,
  detectCafeIntent,
  detectExplicitVenueIntent,
  enrichSlotsWithVenueIntent,
  filterCandidatesByVenue,
  isVenueAllowed,
  resolveNearbyQuerySuffixes,
  scoreVenueIntentFit
} from '../../utils/venueGating.js';

describe('venue gating', () => {
  it('excludes cafes and bars by default', () => {
    const candidates = [
      { id: '1', name: '든든한국밥', category: '한식' },
      { id: '2', name: '모닝커피', category: '카페' },
      { id: '3', name: '즐거운술집', category: '술집' }
    ];

    const filtered = filterCandidatesByVenue(candidates, {
      venueIntentExplicit: false
    });

    expect(filtered.map((item) => item.id)).toEqual(['1']);
  });

  it('includes cafes and bars when the user explicitly asks for them', () => {
    const candidates = [
      { id: '1', name: '모닝커피', category: '카페' },
      { id: '2', name: '즐거운술집', category: '술집' }
    ];

    const filtered = filterCandidatesByVenue(candidates, {
      venueIntentExplicit: true
    });

    expect(filtered).toHaveLength(2);
  });

  it('detects bar intent from natural drinking phrases', () => {
    expect(detectBarIntent(['술마시고 싶다'])).toBe(true);
    expect(detectBarIntent(['친구랑 술 한잔 하고 싶어'])).toBe(true);
    expect(detectBarIntent(['after work drinks at a pub near gangnam'])).toBe(true);
    expect(detectBarIntent(['강남 맛집 점심 추천해줘'])).toBe(false);
  });

  it('does not treat hangover recovery as bar intent', () => {
    expect(detectBarIntent(['어제 술마셔서 해장 하고 싶다'])).toBe(false);
    expect(detectBarIntent(['숙취 때문에 국밥 먹고 싶어'])).toBe(false);
  });

  it('detects explicit cafe and bar intent from natural language', () => {
    expect(
      detectCafeIntent(['친구랑 카페에서 디저트 먹고 싶어'])
    ).toBe(true);
    expect(
      detectExplicitVenueIntent(['친구랑 카페에서 디저트 먹고 싶어'])
    ).toBe(true);
    expect(
      detectExplicitVenueIntent(['after work drinks at a pub near gangnam'])
    ).toBe(true);
    expect(
      detectExplicitVenueIntent(['강남 맛집 점심 추천해줘'])
    ).toBe(false);
  });

  it('enriches slots with bar preference and search keywords', () => {
    const enriched = enrichSlotsWithVenueIntent({}, ['술마시고 싶다']);
    expect(enriched.venuePreference).toBe('bar');
    expect(enriched.searchKeywords).toContain('술집');
    expect(enriched.searchKeywords).toContain('호프');
  });

  it('prefers hangover-focused nearby queries when hangover food is requested', () => {
    const suffixes = resolveNearbyQuerySuffixes({
      desiredFoods: ['해장'],
      searchKeywords: ['해장국']
    });
    expect(suffixes).toContain('해장국');
    expect(suffixes).toContain('국밥');
    expect(suffixes).not.toContain('일식');
    expect(suffixes).not.toContain('치킨');
  });

  it('prefers bar-focused nearby queries when bar intent is present', () => {
    const suffixes = resolveNearbyQuerySuffixes({
      venuePreference: 'bar',
      searchKeywords: ['술집']
    });
    expect(suffixes[0]).toBe('술집');
    expect(suffixes).toContain('호프');
    expect(suffixes).not.toContain('일식');
  });

  it('classifies venue types from category and name', () => {
    expect(classifyVenueType({ name: '브런치카페', category: '음식점' })).toBe(
      'cafe'
    );
    expect(classifyVenueType({ name: '포차', category: '술집' })).toBe('bar');
    expect(classifyVenueType({ name: '든든한국밥', category: '한식' })).toBe(
      'restaurant'
    );
  });

  it('penalizes shabu places when the user asked for bars', () => {
    const shabu = scoreVenueIntentFit(
      { name: '샤브로21', category: '샤브샤브' },
      { venuePreference: 'bar' }
    );
    const bar = scoreVenueIntentFit(
      { name: '즐거운술집', category: '술집' },
      { venuePreference: 'bar' }
    );

    expect(shabu.venueIntentMismatchPenalty).toBeGreaterThan(bar.venueIntentMismatchPenalty);
    expect(bar.venueIntentFit).toBeGreaterThan(0);
  });

  it('does not treat generic 맛집 wording as cafe/bar intent', () => {
    expect(isVenueAllowed({ name: '모닝커피', category: '카페' }, {})).toBe(
      false
    );
  });
});
