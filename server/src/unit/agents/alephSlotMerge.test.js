import { describe, it, expect } from 'vitest';
import { mergeSlotsWithLlmPriority } from '../../../src/agents/aleph/slotMerge.js';

describe('slotMerge', () => {
  it('lets LLM values override deterministic and semantic fallbacks', () => {
    const merged = mergeSlotsWithLlmPriority(
      {
        partyContext: '연인',
        desiredFoods: ['일식'],
        totalTimeMinutes: 90
      },
      {
        partyContext: '친구',
        totalTimeMinutes: 60,
        transportMode: 'walk'
      },
      {
        desiredFoods: ['고기'],
        vibe: '캐주얼'
      }
    );

    expect(merged.partyContext).toBe('연인');
    expect(merged.desiredFoods).toEqual(['일식']);
    expect(merged.totalTimeMinutes).toBe(90);
    expect(merged.transportMode).toBe('walk');
    expect(merged.vibe).toBe('캐주얼');
  });
});
