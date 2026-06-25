import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SlotSchema,
  RecommendationResponseSchema,
  QuestionsResponseSchema,
  ResultsResponseSchema,
  ErrorResponseSchema,
  AlephParseOutputSchema,
  AlephMissingSlotOutputSchema,
  GimelInputAllowlistSchema,
  GimelReasonOutputSchema,
  NormalizedCandidateSchema
} from '../../../shared/contracts/schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../../../shared/fixtures');

async function loadFixture(filename) {
  const filePath = path.join(fixturesDir, filename);
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data);
}

describe('Domain Contracts & Schemas Validation', () => {
  it('should successfully validate the normal-mode happy path fixture', async () => {
    const fixture = await loadFixture('normal-mode-happy.json');
    const result = RecommendationResponseSchema.safeParse(fixture);

    expect(result.success).toBe(true);

    const parsed = result.data;
    expect(parsed.status).toBe('results');
    expect(parsed.results).toHaveLength(2);

    const directResultsParse = ResultsResponseSchema.safeParse(fixture);
    expect(directResultsParse.success).toBe(true);

    for (const item of parsed.results) {
      expect(item.priceLevel).toBeNull();
      expect(item.openingHours).toBeNull();
      expect(item.rating).toBeNull();
      expect(item.reviewCount).toBeNull();
      expect(item.reviewSummary).toBeNull();
    }
  });

  it('should successfully validate the travel-mode happy path fixture', async () => {
    const fixture = await loadFixture('travel-mode-happy.json');
    const result = RecommendationResponseSchema.safeParse(fixture);

    expect(result.success).toBe(true);
    expect(result.data.status).toBe('results');
    expect(result.data.results[0].transportMode).toBe('drive');
  });

  it('should successfully validate the geolocation denied fixture', async () => {
    const fixture = await loadFixture('geolocation-denied.json');
    const result = RecommendationResponseSchema.safeParse(fixture);

    expect(result.success).toBe(true);
    expect(result.data.status).toBe('error');
    expect(result.data.code).toBe('GEO_REQUIRED');

    const directErrorParse = ErrorResponseSchema.safeParse(fixture);
    expect(directErrorParse.success).toBe(true);
  });

  it('should successfully validate the no-results fixture', async () => {
    const fixture = await loadFixture('no-results.json');
    const result = RecommendationResponseSchema.safeParse(fixture);

    expect(result.success).toBe(true);
    expect(result.data.status).toBe('error');
    expect(result.data.code).toBe('NO_RESULTS');
  });

  it('should successfully validate the route-failure fixture', async () => {
    const fixture = await loadFixture('route-failure.json');
    const result = RecommendationResponseSchema.safeParse(fixture);

    expect(result.success).toBe(true);
    expect(result.data.status).toBe('error');
    expect(result.data.code).toBe('ROUTE_UNAVAILABLE');
  });

  it('should successfully validate the incomplete-normal-lunch questions fixture', async () => {
    const fixture = await loadFixture('incomplete-normal-lunch.json');
    const result = RecommendationResponseSchema.safeParse(fixture);

    expect(result.success).toBe(true);
    expect(result.data.status).toBe('questions');
    expect(result.data.missingFields).toEqual([
      'budgetPerPersonKrw',
      'transportMode',
      'vibe'
    ]);

    const directQuestionsParse = QuestionsResponseSchema.safeParse(fixture);
    expect(directQuestionsParse.success).toBe(true);
  });

  it('should reject invalid transport modes in SlotSchema', () => {
    const invalidSlot = {
      mode: 'normal',
      mealPeriod: 'lunch',
      budgetPerPersonKrw: 10000,
      totalTimeMinutes: 45,
      transportMode: 'bicycle',
      excludedFoods: [],
      partyContext: '상사',
      vibe: 'casual',
      location: { lat: 37.4979, lng: 127.0276 }
    };

    const result = SlotSchema.safeParse(invalidSlot);
    expect(result.success).toBe(false);
  });

  it('should reject total time minutes outside the range of 20 to 60', () => {
    const lowTimeSlot = {
      mode: 'normal',
      mealPeriod: 'lunch',
      budgetPerPersonKrw: 10000,
      totalTimeMinutes: 19,
      transportMode: 'walk',
      excludedFoods: [],
      partyContext: '상사',
      vibe: 'casual',
      location: { lat: 37.4979, lng: 127.0276 }
    };

    const highTimeSlot = {
      mode: 'normal',
      mealPeriod: 'lunch',
      budgetPerPersonKrw: 10000,
      totalTimeMinutes: 61,
      transportMode: 'walk',
      excludedFoods: [],
      partyContext: '상사',
      vibe: 'casual',
      location: { lat: 37.4979, lng: 127.0276 }
    };

    expect(SlotSchema.safeParse(lowTimeSlot).success).toBe(false);
    expect(SlotSchema.safeParse(highTimeSlot).success).toBe(false);
  });

  it('should validate a complete and valid slot object', () => {
    const validSlot = {
      mode: 'normal',
      mealPeriod: 'lunch',
      budgetPerPersonKrw: 10000,
      totalTimeMinutes: 45,
      transportMode: 'walk',
      excludedFoods: ['오이'],
      partyContext: '상사',
      vibe: 'casual',
      location: { lat: 37.4979, lng: 127.0276 }
    };

    const result = SlotSchema.safeParse(validSlot);
    expect(result.success).toBe(true);
  });

  it('should successfully validate the invalid-time fixture', async () => {
    const fixture = await loadFixture('invalid-time.json');
    const result = RecommendationResponseSchema.safeParse(fixture);

    expect(result.success).toBe(true);
    expect(result.data.status).toBe('error');
    expect(result.data.code).toBe('INVALID_TOTAL_TIME');
  });

  it('should successfully validate the provider-failure fixture', async () => {
    const fixture = await loadFixture('provider-failure.json');
    const result = RecommendationResponseSchema.safeParse(fixture);

    expect(result.success).toBe(true);
    expect(result.data.status).toBe('error');
    expect(result.data.code).toBe('PROVIDER_ERROR');
  });

  it('should successfully validate Aleph parse output schema', () => {
    const mockOutput = {
      mode: 'normal',
      mealPeriod: 'lunch',
      budgetPerPersonKrw: null,
      totalTimeMinutes: 45,
      transportMode: 'walk',
      excludedFoods: [],
      partyContext: '친구',
      vibe: null,
      location: { lat: 37.5665, lng: 126.978 },
      jobContext: null,
      ageGroup: null
    };
    const result = AlephParseOutputSchema.safeParse(mockOutput);
    expect(result.success).toBe(true);
  });

  it('should successfully validate Aleph missing-slot output schema', () => {
    const mockOutput = {
      missingFields: ['budgetPerPersonKrw', 'vibe'],
      questions: [
        {
          field: 'budgetPerPersonKrw',
          label: '예산은 어느 정도로 생각하시나요?'
        },
        { field: 'vibe', label: '어떤 분위기를 원하시나요?' }
      ]
    };
    const result = AlephMissingSlotOutputSchema.safeParse(mockOutput);
    expect(result.success).toBe(true);
  });

  it('should successfully validate Bet candidate payload schema (NormalizedCandidateSchema)', async () => {
    const fixture = await loadFixture('normal-mode-happy.json');
    const candidate = fixture.results[0];
    const result = NormalizedCandidateSchema.safeParse(candidate);
    expect(result.success).toBe(true);
  });

  it('should successfully validate Gimel input allowlist schema with null fields', async () => {
    const fixture = await loadFixture('null-field-grounding.json');
    const result = GimelInputAllowlistSchema.safeParse(fixture);
    expect(result.success).toBe(true);
    const data = result.data;
    expect(data.openStatus).toBeNull();
  });

  it('should successfully validate Gimel reason output schema', () => {
    const mockOutput = {
      reasons: [
        {
          id: 'place123',
          reason: '도보 10분 거리에 있는 깔끔한 분위기의 식당입니다.'
        }
      ]
    };
    const result = GimelReasonOutputSchema.safeParse(mockOutput);
    expect(result.success).toBe(true);
  });
});
