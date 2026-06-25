import { describe, expect, it } from 'vitest';
import {
  resolveSlotExceptions,
  resolveTotalTimeMinutesHeuristic
} from '../../services/slotExceptionResolver.js';

describe('slotExceptionResolver', () => {
  it('accepts long meal budgets without an upper cap', () => {
    const result = resolveTotalTimeMinutesHeuristic(480, '5시간 여유');
    expect(result.value).toBe(480);
    expect(result.adjusted).toBe(false);
  });

  it('clamps short budgets to the minimum', () => {
    const result = resolveTotalTimeMinutesHeuristic(10, '10분');
    expect(result.value).toBe(20);
    expect(result.adjusted).toBe(true);
  });

  it('resolves slots before validation instead of failing', async () => {
    const { slots, adjustments } = await resolveSlotExceptions(
      { totalTimeMinutes: 10, mealPeriod: 'lunch' },
      '점심 10분',
      { useAi: false }
    );

    expect(slots.totalTimeMinutes).toBe(20);
    expect(adjustments[0].field).toBe('totalTimeMinutes');
  });

  it('does not invent totalTimeMinutes when it is missing', async () => {
    const { slots, adjustments } = await resolveSlotExceptions(
      { mealPeriod: 'lunch' },
      '점심',
      { useAi: false }
    );

    expect(slots.totalTimeMinutes).toBeUndefined();
    expect(adjustments).toEqual([]);
  });
});
