import { describe, it, expect } from 'vitest';
import {
  classifyVenueType,
  detectExplicitVenueIntent,
  filterCandidatesByVenue,
  isVenueAllowed
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

  it('detects explicit cafe and bar intent from natural language', () => {
    expect(
      detectExplicitVenueIntent([
        '친구랑 카페에서 디저트 먹고 싶어'
      ])
    ).toBe(true);
    expect(
      detectExplicitVenueIntent([
        'after work drinks at a pub near gangnam'
      ])
    ).toBe(true);
    expect(
      detectExplicitVenueIntent(['강남 맛집 점심 추천해줘'])
    ).toBe(false);
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

  it('does not treat generic 맛집 wording as cafe/bar intent', () => {
    expect(isVenueAllowed({ name: '모닝커피', category: '카페' }, {})).toBe(
      false
    );
  });
});
