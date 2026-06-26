import { zodResponseFormat } from 'openai/helpers/zod';
import { createAgentChatCompletion } from '../../llm/client.js';
import { AlephFoodCravingInferenceSchema } from '../../../../shared/contracts/schemas.js';
import {
  buildFoodCatalogPromptSummary,
  buildRelatedFoodOptionsForSuggestions,
  getFoodById,
  resolveFoodId,
  validateFoodCravingSuggestions
} from '../../../../shared/contracts/foodCatalog.js';
import { ALEPH_FOOD_INFERENCE_TIMEOUT_MS } from '../../config/performance.js';
import {
  buildSearchKeywordsFromScores,
  normalizeFoodPreferenceScores,
  parseDesiredFoodsFromText
} from '../../utils/foodPreference.js';

const FOOD_CRAVING_SYSTEM_PROMPT = [
  'You infer what Korean foods a user might want to eat from their mood, body state, or situation.',
  'Use ONLY food ids from the Mumuk food catalog provided in the user message.',
  'Return exactly 3 diverse positive food suggestions as tap-friendly button options.',
  'Each positive suggestion needs food (catalog id), label (friendly Korean button text), score (50-100 craving fit).',
  'Also return 2-4 avoidSuggestions for catalog foods that clearly mismatch the state (score 0-49).',
  'Avoid suggestions need catalog food id, label (short Korean), and score below 50.',
  'Prefer everyday Korean foods (hangover soup, noodles, rice, grilled meat, stew).',
  'Do not suggest southeast_asian catalog foods unless the user clearly wants Vietnamese/Thai cuisine.',
  'Infer hangover, stress, comfort food, light vs heavy, hot soup, grilled meat, noodles, etc. from context.',
  'Never invent budget, transport, coordinates, or party details.',
  'For hangover recovery, suggest soup/noodle recovery catalog foods and avoid fried chicken, pizza, greasy foods.',
  'Positive labels should be short (under 12 Korean chars) and distinct from each other.'
].join(' ');

const EXCLUDED_FOOD_SCORE_THRESHOLD = 35;

export function shouldOfferFoodCravingQuestion(slots = {}, userQuery = '', context = {}) {
  if (context.skipFoodCravingQuestion === true || context.skipQuestions === true) {
    return false;
  }

  const query = typeof userQuery === 'string' ? userQuery.trim() : '';
  if (query.length < 2) {
    return false;
  }

  if (Array.isArray(slots.desiredFoods) && slots.desiredFoods.length > 0) {
    return false;
  }

  if (slots.venuePreference === 'bar') {
    return false;
  }

  if (hasExplicitEatIntent(query)) {
    return false;
  }

  return true;
}

function hasExplicitEatIntent(query) {
  const foods = parseDesiredFoodsFromText(query);
  if (foods.length === 0) {
    return false;
  }

  return /(먹|먹고|먹을|먹어|끌|당기|시켜|주문|식사|한끼|땡기|하고\s*싶|먹자|드시|드실)/.test(query);
}

function summarizeSlots(slots = {}) {
  return Object.entries(slots)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .filter(([key]) => key !== 'location')
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return value.length ? `${key}: ${value.join(', ')}` : null;
      }
      if (typeof value === 'object') {
        return null;
      }
      return `${key}: ${value}`;
    })
    .filter(Boolean)
    .join('\n');
}

export async function inferFoodCravingsFromState(userQuery, partialSlots = {}) {
  const query = typeof userQuery === 'string' ? userQuery.trim() : '';
  if (!query) {
    return null;
  }

  try {
    const completion = await Promise.race([
      createAgentChatCompletion(
        'aleph',
        {
          messages: [
            { role: 'system', content: FOOD_CRAVING_SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                `User state / situation:\n${query}`,
                partialSlots.venuePreference
                  ? `Known venue preference: ${partialSlots.venuePreference}`
                  : null,
                summarizeSlots(partialSlots)
                  ? `Other known context:\n${summarizeSlots(partialSlots)}`
                  : null,
                `Mumuk food catalog by category:\n${buildFoodCatalogPromptSummary()}`
              ]
                .filter(Boolean)
                .join('\n\n')
            }
          ],
          response_format: zodResponseFormat(
            AlephFoodCravingInferenceSchema,
            'food_craving_inference'
          )
        },
        { useBestModel: true }
      ),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('aleph_food_craving_timeout')),
          ALEPH_FOOD_INFERENCE_TIMEOUT_MS
        )
      )
    ]);

    const parsed = AlephFoodCravingInferenceSchema.safeParse(
      completion?.choices?.[0]?.message?.parsed
    );
    if (!parsed.success) {
      return null;
    }

    const validated = validateFoodCravingSuggestions(
      parsed.data.suggestions,
      parsed.data.avoidSuggestions
    );

    if (validated.suggestions.length !== 3 || validated.avoidSuggestions.length < 2) {
      return null;
    }

    return {
      stateSummary: parsed.data.stateSummary,
      suggestions: validated.suggestions.map((item) => ({
        ...item,
        label: item.label || getFoodById(item.food)?.label || item.food
      })),
      avoidSuggestions: validated.avoidSuggestions.map((item) => ({
        ...item,
        label: item.label || getFoodById(item.food)?.label || item.food
      }))
    };
  } catch {
    return null;
  }
}

export function buildFoodPreferenceScoresFromInference(inference) {
  return [
    ...inference.suggestions.map((item) => ({
      food: item.food,
      score: item.score
    })),
    ...inference.avoidSuggestions.map((item) => ({
      food: item.food,
      score: item.score
    }))
  ];
}

export function buildExcludedFoodsFromInference(inference) {
  return inference.avoidSuggestions
    .filter((item) => item.score <= EXCLUDED_FOOD_SCORE_THRESHOLD)
    .map((item) => item.food);
}

export function buildFoodCravingQuestion(inference) {
  const label = inference.stateSummary
    ? `지금 상태라면 이런 음식은 어떠세요? (${inference.stateSummary})`
    : '지금 상태라면 이런 음식은 어떠세요?';

  const primaryOptions = [...inference.suggestions]
    .sort((left, right) => right.score - left.score)
    .map((item) => ({
      value: item.food,
      label: item.label
    }));

  const relatedOptions = buildRelatedFoodOptionsForSuggestions(
    inference.suggestions,
    { maxExtra: 3 }
  ).map((item) => ({
    value: item.value,
    label: item.label
  }));

  const seen = new Set();
  const options = [];
  for (const option of [...primaryOptions, ...relatedOptions]) {
    if (seen.has(option.value)) {
      continue;
    }
    seen.add(option.value);
    options.push(option);
    if (options.length >= 6) {
      break;
    }
  }

  return {
    field: 'desiredFoods',
    label,
    options,
    avoidSuggestions: inference.avoidSuggestions.map((item) => ({
      food: item.food,
      label: item.label,
      score: item.score
    }))
  };
}

export function applySelectedFoodCraving(slots = {}, selectedFoods = []) {
  const selected = Array.isArray(selectedFoods)
    ? selectedFoods.find((item) => typeof item === 'string' && item.trim())
    : selectedFoods;
  if (!selected || typeof selected !== 'string') {
    return slots;
  }

  const food = resolveFoodId(selected.trim()) || selected.trim();
  const existingScores = normalizeFoodPreferenceScores(slots.foodPreferenceScores);
  const scoreByFood = new Map(
    existingScores.map((item) => [item.food, item.score])
  );
  scoreByFood.set(food, 100);
  for (const [name, score] of scoreByFood.entries()) {
    if (name !== food && score >= 100) {
      scoreByFood.set(name, Math.min(score, 70));
    }
  }

  const foodPreferenceScores = Array.from(scoreByFood.entries()).map(
    ([itemFood, score]) => ({
      food: itemFood,
      score
    })
  );

  const excludedFoods = Array.isArray(slots.excludedFoods)
    ? [...slots.excludedFoods]
    : foodPreferenceScores
        .filter((item) => item.score <= EXCLUDED_FOOD_SCORE_THRESHOLD)
        .map((item) => item.food);

  return {
    ...slots,
    desiredFoods: [food],
    excludedFoods,
    foodPreferenceScores,
    searchKeywords: buildSearchKeywordsFromScores(
      foodPreferenceScores,
      Array.isArray(slots.searchKeywords) ? slots.searchKeywords : []
    )
  };
}
