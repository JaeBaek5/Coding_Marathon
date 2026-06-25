import { describe, it, expect } from 'vitest';
import {
  rankCandidates,
  validateTimeBudget,
  isWithinServiceWindow,
  RankingValidationError
} from '../../services/ranking.js';

describe('Ranking and Time-Budget Scoring Engine', () => {
  describe('Time Limit Validation', () => {
    it('should pass if totalTimeMinutes is between 20 and 60 inclusive', () => {
      expect(() => validateTimeBudget(20)).not.toThrow();
      expect(() => validateTimeBudget(45)).not.toThrow();
      expect(() => validateTimeBudget(60)).not.toThrow();
    });

    it('should reject with INVALID_TOTAL_TIME if totalTimeMinutes is less than 20 or greater than 60', () => {
      expect(() => validateTimeBudget(19)).toThrow(RankingValidationError);
      expect(() => validateTimeBudget(61)).toThrow(RankingValidationError);
      expect(() => validateTimeBudget(null)).toThrow(RankingValidationError);
    });
  });

  describe('Service Window Validation (isWithinServiceWindow)', () => {
    it('should return true if opening hours are not provided', () => {
      expect(isWithinServiceWindow(null, '2026-05-20T12:00:00+09:00')).toBe(
        true
      );
      expect(
        isWithinServiceWindow(undefined, '2026-05-20T12:00:00+09:00')
      ).toBe(true);
    });

    it('should support string format HH:MM-HH:MM and check window correctly', () => {
      // 12:00 is within 09:00-22:00
      expect(
        isWithinServiceWindow('09:00-22:00', '2026-05-20T12:00:00+09:00')
      ).toBe(true);
      // 08:00 is outside 09:00-22:00
      expect(
        isWithinServiceWindow('09:00-22:00', '2026-05-20T08:00:00+09:00')
      ).toBe(false);
    });

    it('should support object format {open, close} or {start, end}', () => {
      expect(
        isWithinServiceWindow(
          { open: '09:00', close: '22:00' },
          '2026-05-20T12:00:00+09:00'
        )
      ).toBe(true);
      expect(
        isWithinServiceWindow(
          { start: '09:00', end: '22:00' },
          '2026-05-20T23:00:00+09:00'
        )
      ).toBe(false);
    });

    it('should support overnight/over-midnight service windows', () => {
      // Overnight window from 22:00 to 04:00 (next day)
      // 23:00 is within window
      expect(
        isWithinServiceWindow('22:00-04:00', '2026-05-20T23:00:00+09:00')
      ).toBe(true);
      // 02:00 is within window
      expect(
        isWithinServiceWindow('22:00-04:00', '2026-05-20T02:00:00+09:00')
      ).toBe(true);
      // 12:00 is outside window
      expect(
        isWithinServiceWindow('22:00-04:00', '2026-05-20T12:00:00+09:00')
      ).toBe(false);
    });
  });

  describe('Hard Filters', () => {
    const baseSlot = {
      totalTimeMinutes: 45,
      transportMode: 'walk',
      excludedFoods: [],
      partyContext: '상사',
      vibe: 'casual',
      budgetPerPersonKrw: 10000
    };

    it('should exclude candidates with no valid route (missing/negative route minutes)', () => {
      const candidates = [
        {
          id: '1',
          name: 'Route Present',
          category: '한식',
          address: 'Address 1',
          oneWayRouteMinutes: 5,
          distanceMeters: 400
        },
        {
          id: '2',
          name: 'No Route',
          category: '한식',
          address: 'Address 2',
          oneWayRouteMinutes: null,
          distanceMeters: 400
        },
        {
          id: '3',
          name: 'Negative Route',
          category: '한식',
          address: 'Address 3',
          oneWayRouteMinutes: -1,
          distanceMeters: 400
        }
      ];

      const results = rankCandidates(candidates, baseSlot);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it('should exclude candidates whose totalExpectedMinutes exceeds user limit', () => {
      // For route = 10, totalExpectedMinutes = 10 * 2 + 30 = 50. Limit is 45. Excluded.
      // For route = 5, totalExpectedMinutes = 5 * 2 + 30 = 40. Limit is 45. Kept.
      const candidates = [
        {
          id: '1',
          name: 'In Time',
          category: '한식',
          address: 'Address 1',
          oneWayRouteMinutes: 5,
          distanceMeters: 400
        },
        {
          id: '2',
          name: 'Too Slow',
          category: '한식',
          address: 'Address 2',
          oneWayRouteMinutes: 10,
          distanceMeters: 800
        }
      ];

      const results = rankCandidates(candidates, baseSlot);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it('should exclude candidate if there is a hard match with excluded food keyword', () => {
      const candidates = [
        {
          id: '1',
          name: '마포 고기구이',
          category: '육류,고기',
          address: 'Address 1',
          oneWayRouteMinutes: 5,
          distanceMeters: 400
        },
        {
          id: '2',
          name: '깔끔 스시집',
          category: '일식,초밥',
          address: 'Address 2',
          oneWayRouteMinutes: 5,
          distanceMeters: 400
        }
      ];

      const slotWithExclusion = {
        ...baseSlot,
        excludedFoods: ['고기']
      };

      const results = rankCandidates(candidates, slotWithExclusion);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('2'); // '고기' is a token in '육류,고기' category of candidate 1
    });

    it('should exclude candidate if current time is outside opening hours', () => {
      const candidates = [
        {
          id: '1',
          name: 'Open Restaurant',
          category: '한식',
          address: 'Address 1',
          oneWayRouteMinutes: 5,
          distanceMeters: 400,
          openingHours: '09:00-22:00'
        },
        {
          id: '2',
          name: 'Closed Restaurant',
          category: '한식',
          address: 'Address 2',
          oneWayRouteMinutes: 5,
          distanceMeters: 400,
          openingHours: '09:00-14:00'
        }
      ];

      // now is 15:00:00 (outside closed window 09:00-14:00)
      const results = rankCandidates(
        candidates,
        baseSlot,
        '2026-05-20T15:00:00+09:00'
      );
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it('should exclude candidate if price exceeds budget (when budget data is NOT universally missing)', () => {
      const candidates = [
        {
          id: '1',
          name: 'Affordable',
          category: '한식',
          address: 'Address 1',
          oneWayRouteMinutes: 5,
          distanceMeters: 400,
          pricePerPersonKrw: 8000
        },
        {
          id: '2',
          name: 'Expensive',
          category: '한식',
          address: 'Address 2',
          oneWayRouteMinutes: 5,
          distanceMeters: 400,
          pricePerPersonKrw: 12000
        }
      ];

      const results = rankCandidates(candidates, baseSlot);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it('should keep candidates even if price exceeds budget if budget data IS universally missing', () => {
      const candidates = [
        {
          id: '1',
          name: 'Missing Price',
          category: '한식',
          address: 'Address 1',
          oneWayRouteMinutes: 5,
          distanceMeters: 400,
          pricePerPersonKrw: null
        }
      ];

      const results = rankCandidates(candidates, baseSlot);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });
  });

  describe('Soft Score Components', () => {
    it('should calculate timeFit correctly (linear scale, max 35)', () => {
      // totalTimeMinutes = 60, totalExpectedMinutes = 30 -> timeFit = 35 * (60 - 30) / (60 - 20) = 26.25
      const slot = {
        totalTimeMinutes: 60,
        transportMode: 'walk',
        partyContext: '상사',
        vibe: 'casual',
        budgetPerPersonKrw: 10000
      };
      const candidates = [
        {
          id: '1',
          name: 'Time 30',
          category: '한식',
          address: 'Address 1',
          oneWayRouteMinutes: 0, // totalExpectedMinutes = 0 * 2 + 30 = 30
          distanceMeters: 200
        }
      ];

      const results = rankCandidates(candidates, slot);
      expect(results[0].scoreComponents.timeFit).toBeCloseTo(26.25, 2);
    });

    it('should calculate distanceFit correctly (max 15)', () => {
      const slot = {
        totalTimeMinutes: 45,
        transportMode: 'walk',
        partyContext: '상사',
        vibe: 'casual',
        budgetPerPersonKrw: 10000
      };
      const candidates = [
        {
          id: '1',
          name: 'Distance 1000',
          category: '한식',
          address: 'Address 1',
          oneWayRouteMinutes: 5,
          distanceMeters: 1000 // walk max is 2000m -> 15 * (1 - 1000/2000) = 7.5
        }
      ];

      const results = rankCandidates(candidates, slot);
      expect(results[0].scoreComponents.distanceFit).toBe(7.5);
    });

    it('should calculate contextFit correctly (max 15, exact dictionary / custom text)', () => {
      const slot = {
        totalTimeMinutes: 45,
        transportMode: 'walk',
        partyContext: '상사', // keywords include '한식', '일식'
        jobContext: 'IT', // keywords include '커피', '가성비'
        vibe: 'casual',
        budgetPerPersonKrw: 10000
      };
      const candidates = [
        {
          id: '1',
          name: '가성비 좋은 한식집', // Matches '한식' (party) and '가성비' (job) -> 2 matches -> 15 points
          category: '한식',
          address: 'Address 1',
          oneWayRouteMinutes: 5,
          distanceMeters: 400
        },
        {
          id: '2',
          name: '일반 식당', // Matches none -> 0 matches -> 0 points
          category: '태국식',
          address: 'Address 2',
          oneWayRouteMinutes: 5,
          distanceMeters: 400
        }
      ];

      const results = rankCandidates(candidates, slot);
      const match15 = results.find((c) => c.id === '1');
      const match0 = results.find((c) => c.id === '2');

      expect(match15.scoreComponents.contextFit).toBe(15);
      expect(match0.scoreComponents.contextFit).toBe(0);
    });

    it('should calculate vibeFit correctly (max 10)', () => {
      const slot = {
        totalTimeMinutes: 45,
        transportMode: 'walk',
        partyContext: '상사',
        vibe: '조용한', // keywords include '조용한', '룸', '고급'
        budgetPerPersonKrw: 10000
      };
      const candidates = [
        {
          id: '1',
          name: '조용한 룸 식당', // Matches '조용한', '룸' -> 2+ matches -> 10 points
          category: '한식',
          address: 'Address 1',
          oneWayRouteMinutes: 5,
          distanceMeters: 400
        }
      ];

      const results = rankCandidates(candidates, slot);
      expect(results[0].scoreComponents.vibeFit).toBe(10);
    });

    it('should calculate metadataConfidence correctly (max 10) and derive correct badge', () => {
      const slot = {
        totalTimeMinutes: 45,
        transportMode: 'walk',
        partyContext: '상사',
        vibe: 'casual',
        budgetPerPersonKrw: 10000
      };
      const candidates = [
        {
          id: '1', // present
          name: 'Complete',
          category: '한식', // present
          address: 'Address 1', // present
          oneWayRouteMinutes: 5,
          distanceMeters: 400
        },
        {
          id: '2', // present
          name: 'Missing Category',
          category: '', // missing
          address: 'Address 2', // present
          oneWayRouteMinutes: 5,
          distanceMeters: 400
        }
      ];

      const results = rankCandidates(candidates, slot);
      const complete = results.find((c) => c.id === '1');
      const missingCat = results.find((c) => c.id === '2');

      expect(complete.scoreComponents.metadataConfidence).toBe(10);
      expect(complete.confidenceBadge).toBe('high');

      expect(missingCat.scoreComponents.metadataConfidence).toBe(8);
      expect(missingCat.confidenceBadge).toBe('high'); // >= 8 is high
    });

    it('should subtract 5 points from categorySafety if excluded-food keyword fuzzy match is uncertain but not a hard-match', () => {
      const slot = {
        totalTimeMinutes: 45,
        transportMode: 'walk',
        excludedFoods: ['국수'],
        partyContext: '상사',
        vibe: 'casual',
        budgetPerPersonKrw: 10000
      };
      const candidates = [
        {
          id: '1',
          name: '동해막국수집', // '국수' is a substring of name, but not an exact token.
          category: '면류', // Not '국수'
          address: 'Address 1',
          oneWayRouteMinutes: 5,
          distanceMeters: 400
        }
      ];

      const results = rankCandidates(candidates, slot);
      expect(results).toHaveLength(1); // Not excluded since it's only an uncertain fuzzy match
      expect(results[0].scoreComponents.categorySafety).toBe(0); // 5 - 5 = 0
    });
  });

  describe('Deterministic Sorting and Tie-Breakers', () => {
    it('should sort primarily by scoreTotal (descending), then lower totalExpectedMinutes, then higher metadataConfidence, then alphabetical', () => {
      const slot = {
        totalTimeMinutes: 45,
        transportMode: 'walk',
        partyContext: '상사',
        vibe: 'casual',
        budgetPerPersonKrw: 10000
      };

      const candidates = [
        {
          id: 'B',
          name: '나식당',
          category: '한식',
          address: 'Address 2',
          oneWayRouteMinutes: 5,
          distanceMeters: 400
        },
        {
          id: 'A',
          name: '가식당',
          category: '한식',
          address: 'Address 1',
          oneWayRouteMinutes: 5,
          distanceMeters: 400
        },
        {
          id: 'C',
          name: '다식당',
          category: '한식',
          address: 'Address 3',
          oneWayRouteMinutes: 6, // Larger expected minutes (lower tie-breaker)
          distanceMeters: 400
        }
      ];

      const results = rankCandidates(candidates, slot);
      // Since all other parameters are identical:
      // A and B will have identical scores, C will have slightly lower score (due to higher expected minutes -> lower timeFit)
      // Therefore, A and B are sorted before C.
      // Between A and B, they have the exact same scoreTotal, totalExpectedMinutes, and metadataConfidence.
      // So they are sorted alphabetically: '가식당' (A) before '나식당' (B).
      expect(results[0].id).toBe('A');
      expect(results[1].id).toBe('B');
      expect(results[2].id).toBe('C');
    });
  });

  describe('Fewer than 5 candidates', () => {
    it('should return only surviving candidates and not pad with fake candidates', () => {
      const slot = {
        totalTimeMinutes: 45,
        transportMode: 'walk',
        partyContext: '상사',
        vibe: 'casual',
        budgetPerPersonKrw: 10000
      };
      const candidates = [
        {
          id: '1',
          name: 'Only One',
          category: '한식',
          address: 'Address 1',
          oneWayRouteMinutes: 5,
          distanceMeters: 400
        }
      ];

      const results = rankCandidates(candidates, slot);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Only One');
    });
  });
});
