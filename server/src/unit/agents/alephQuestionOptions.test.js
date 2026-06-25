import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  buildDefaultQuestions,
  mergeFollowUpQuestions,
  validateQuestionOptions
} from '../../../src/agents/aleph/questionOptions.js';
import { SlotSchema } from '../../../../shared/contracts/schemas.js';

describe('aleph questionOptions', () => {
  it('builds default button options for common missing fields', () => {
    const questions = buildDefaultQuestions(['mealPeriod', 'transportMode', 'desiredFoods'], {}, '', {
      desiredFoods: SlotSchema.shape.desiredFoods
    });
    expect(questions).toHaveLength(3);
    expect(questions[0].options.map((opt) => opt.value)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'late_night'
    ]);
    expect(questions[1].options.map((opt) => opt.value)).toEqual(['walk', 'drive']);
    expect(questions[2].options.map((opt) => opt.value)).toEqual([
      ['해장'],
      ['고기'],
      ['한식'],
      ['일식'],
      ['중식'],
      ['면'],
      ['치킨'],
      ['해산물'],
      ['찌개'],
      ['양식'],
      ['분식'],
      ['동남아']
    ]);
  });

  it('falls back to default options when LLM returns too few valid options', () => {
    const defaults = buildDefaultQuestions(['mealPeriod']);
    const merged = mergeFollowUpQuestions(
      ['mealPeriod'],
      defaults,
      [
        {
          field: 'mealPeriod',
          label: '지금은 언제 드실 계획인가요?',
          options: [{ label: '잘못된 값', value: 'brunch' }]
        }
      ],
      { mealPeriod: SlotSchema.shape.mealPeriod }
    );

    expect(merged[0].label).toBe('지금은 언제 드실 계획인가요?');
    expect(merged[0].options).toEqual(defaults[0].options);
  });

  it('keeps default options when LLM returns no options for a field', () => {
    const defaults = buildDefaultQuestions(['vibe', 'budgetPerPersonKrw']);
    const merged = mergeFollowUpQuestions(
      ['vibe', 'budgetPerPersonKrw'],
      defaults,
      [
        {
          field: 'vibe',
          label: '어떤 분위기를 원하세요?',
          options: []
        }
      ],
      {
        vibe: SlotSchema.shape.vibe,
        budgetPerPersonKrw: SlotSchema.shape.budgetPerPersonKrw
      }
    );

    expect(merged[0].options?.length).toBeGreaterThan(0);
    expect(merged[1].options?.length).toBeGreaterThan(0);
  });

  it('validates LLM options and falls back when too few are valid', () => {
    const options = validateQuestionOptions(
      'desiredFoods',
      z.array(z.string()),
      [
        { label: '삼겹살', value: '삼겹살' },
        { label: '소고기', value: '소고기' }
      ]
    );

    expect(options).toEqual([
      { label: '삼겹살', value: ['삼겹살'] },
      { label: '소고기', value: ['소고기'] }
    ]);
  });
});
