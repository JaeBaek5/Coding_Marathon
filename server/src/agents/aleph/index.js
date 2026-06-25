import { createAgentChatCompletion } from '../../llm/client.js';
import { zodResponseFormat } from 'openai/helpers/zod';
import {
  AlephParseOutputSchema,
  AlephMissingSlotOutputSchema,
  SlotPriorityOrder,
  SlotSchema,
  ErrorCodes
} from '../../../../shared/contracts/schemas.js';
import {
  normalizeDesiredFoods,
  normalizeFoodPreferenceScores,
  buildSearchKeywords,
  buildSearchKeywordsFromScores,
  deriveFoodPreferenceScores
} from '../../utils/foodPreference.js';
import { buildDefaultQuestions } from './questionOptions.js';
import { generateFollowUpQuestions } from './followUpQuestions.js';
import { resolveSlotExceptions } from '../../services/slotExceptionResolver.js';
import { ALEPH_LLM_TIMEOUT_MS } from '../../config/performance.js';
import { fillMissingSlots, REFINEMENT_FIELDS } from './slotDefaults.js';
import { mergeSlotsWithLlmPriority } from './slotMerge.js';
import {
  parseDeterministicQueryText,
  parseSemanticQueryFallback
} from './queryFallback.js';
import {
  buildVenueTextSources,
  enrichSlotsWithVenueIntent
} from '../../utils/venueGating.js';
import { enrichSlotsWithHangoverIntent } from '../../utils/foodPreference.js';
import {
  applySelectedFoodCraving,
  buildExcludedFoodsFromInference,
  buildFoodCravingQuestion,
  buildFoodPreferenceScoresFromInference,
  inferFoodCravingsFromState,
  shouldOfferFoodCravingQuestion
} from './foodCravingInference.js';

const MAX_ROUNDS = 8;
const FIELD_SCHEMAS = {
  mode: SlotSchema.shape.mode,
  mealPeriod: SlotSchema.shape.mealPeriod,
  budgetPerPersonKrw: SlotSchema.shape.budgetPerPersonKrw,
  totalTimeMinutes: SlotSchema.shape.totalTimeMinutes,
  transportMode: SlotSchema.shape.transportMode,
  excludedFoods: SlotSchema.shape.excludedFoods,
  partyContext: SlotSchema.shape.partyContext,
  vibe: SlotSchema.shape.vibe,
  location: SlotSchema.shape.location,
  venuePreference: SlotSchema.shape.venuePreference,
  jobContext: SlotSchema.shape.jobContext,
  ageGroup: SlotSchema.shape.ageGroup,
  desiredFoods: SlotSchema.shape.desiredFoods,
  searchKeywords: SlotSchema.shape.searchKeywords,
  foodPreferenceScores: SlotSchema.shape.foodPreferenceScores
};

export async function parseQuery(query, currentState = {}, round = 1) {
  if (round > MAX_ROUNDS) {
    return validateAndProcessSlots(fillMissingSlots(currentState), {
      userQuery: query,
      skipQuestions: true
    });
  }

  const llmSlots = await parseQueryWithSharedClient(query);
  const llmSanitized = sanitizeSlotProposal(llmSlots, { allowLocation: false });
  const parsedSlots = mergeSlotsWithLlmPriority(
    llmSanitized,
    parseDeterministicQueryText(query),
    parseSemanticQueryFallback(query)
  );

  const mergedSlots = { ...currentState };
  for (const key of Object.keys(AlephParseOutputSchema.shape)) {
    if (parsedSlots[key] !== null && parsedSlots[key] !== undefined) {
      mergedSlots[key] = parsedSlots[key];
    }
  }

  return validateAndProcessSlots(mergedSlots, { userQuery: query });
}

export async function processAnswers(answers, currentState = {}, round = 1, options = {}) {
  if (round > MAX_ROUNDS) {
    return validateAndProcessSlots(fillMissingSlots(currentState), {
      userQuery: options.userQuery || '',
      skipQuestions: true
    });
  }

  const normalizedAnswers = normalizeAnswerSlots(answers);
  const mergedSlots = fillMissingSlots({
    ...currentState,
    ...normalizedAnswers
  });

  return validateAndProcessSlots(mergedSlots, {
    userQuery: options.userQuery || '',
    skipQuestions: options.skipQuestions === true
  });
}

async function validateAndProcessSlots(mergedSlots, context = {}) {
  const userQuery = context.userQuery || '';
  let workingSlots = mergedSlots;

  if (Array.isArray(workingSlots.desiredFoods) && workingSlots.desiredFoods.length > 0) {
    workingSlots = applySelectedFoodCraving(
      workingSlots,
      workingSlots.desiredFoods
    );
  }

  const venueSources = buildVenueTextSources(workingSlots, userQuery);
  const hangoverEnrichedSlots = enrichSlotsWithHangoverIntent(
    workingSlots,
    venueSources,
    { onlyIfMissing: true }
  );
  const venueEnrichedSlots = enrichSlotsWithVenueIntent(
    hangoverEnrichedSlots,
    venueSources,
    { onlyIfMissing: true }
  );
  const { slots: resolvedSlots } = await resolveSlotExceptions(
    venueEnrichedSlots,
    userQuery,
    { useAi: context.useAi !== false }
  );
  const normalizedSlots = sanitizeSlotProposal(resolvedSlots, {
    allowLocation: true
  });

  if (
    context.skipQuestions !== true &&
    shouldOfferFoodCravingQuestion(normalizedSlots, userQuery, context)
  ) {
    const inference = await inferFoodCravingsFromState(userQuery, normalizedSlots);
    if (inference?.suggestions?.length === 3) {
      const foodPreferenceScores = buildFoodPreferenceScoresFromInference(inference);
      const excludedFoods = buildExcludedFoodsFromInference(inference);
      return {
        status: 'questions',
        missingFields: ['desiredFoods'],
        questions: [buildFoodCravingQuestion(inference)],
        currentState: {
          ...normalizedSlots,
          foodPreferenceScores,
          ...(excludedFoods.length ? { excludedFoods } : {})
        }
      };
    }
  }

  const missingOrInvalidFields = getMissingOrInvalidFields(normalizedSlots);
  const validationResult = SlotSchema.safeParse(normalizedSlots);

  if (validationResult.success) {
    return {
      status: 'complete',
      slots: {
        ...validationResult.data,
        location: normalizedSlots.location
      }
    };
  }

  if (missingOrInvalidFields.length === 0) {
    return {
      status: 'complete',
      slots: normalizedSlots
    };
  }

  if (context.skipQuestions !== true && normalizedSlots.location) {
    const withDefaults = fillMissingSlots(normalizedSlots);
    const defaultedValidation = SlotSchema.safeParse(withDefaults);
    if (defaultedValidation.success) {
      return {
        status: 'complete',
        slots: {
          ...defaultedValidation.data,
          location: withDefaults.location
        }
      };
    }
  }

  if (context.skipQuestions === true) {
    const withDefaults = fillMissingSlots(normalizedSlots);
    const defaultedValidation = SlotSchema.safeParse(withDefaults);
    if (defaultedValidation.success) {
      return {
        status: 'complete',
        slots: {
          ...defaultedValidation.data,
          location: withDefaults.location
        }
      };
    }
  }

  if (context.refinementFields?.length) {
    const questionData = await buildQuestionData(
      context.refinementFields,
      normalizedSlots,
      context.userQuery || ''
    );

    return {
      status: 'questions',
      missingFields: questionData.missingFields,
      questions: questionData.questions,
      currentState: normalizedSlots
    };
  }

  const questionData = await buildQuestionData(
    missingOrInvalidFields,
    normalizedSlots,
    context.userQuery || ''
  );

  return {
    status: 'questions',
    missingFields: questionData.missingFields,
    questions: questionData.questions,
    currentState: normalizedSlots
  };
}

async function parseQueryWithSharedClient(query) {
  try {
    const parseCompletion = await Promise.race([
      createAgentChatCompletion('aleph', {
        messages: [
          {
            role: 'user',
            content: query
          }
        ],
        response_format: zodResponseFormat(AlephParseOutputSchema, 'slot_parsing')
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('aleph_parse_timeout')), ALEPH_LLM_TIMEOUT_MS)
      )
    ]);
    const parseResult = AlephParseOutputSchema.safeParse(
      parseCompletion?.choices?.[0]?.message?.parsed
    );
    if (parseResult.success) {
      return parseResult.data;
    }
  } catch {
    return {};
  }
  return {};
}

function matchesAny(value, terms) {
  return terms.some((term) => value.includes(term));
}

function sanitizeSlotProposal(slots, { allowLocation }) {
  const sanitized = {};
  const mergedDesiredFoods = normalizeDesiredFoods(slots?.desiredFoods);
  const mergedFoodScores = normalizeFoodPreferenceScores(slots?.foodPreferenceScores);
  for (const [key, value] of Object.entries(slots || {})) {
    if (value === null || value === undefined || !FIELD_SCHEMAS[key]) {
      continue;
    }
    if (key === 'location' && !allowLocation) {
      continue;
    }
    const normalizedValue = normalizeSlotValue(key, value);
    if (key === 'totalTimeMinutes' && Number.isInteger(normalizedValue)) {
      sanitized[key] = normalizedValue;
      continue;
    }
    const result = FIELD_SCHEMAS[key].safeParse(normalizedValue);
    if (result.success) {
      sanitized[key] = key === 'location' ? normalizedValue : result.data;
    }
  }
  if (mergedDesiredFoods.length > 0) {
    sanitized.desiredFoods = mergedDesiredFoods;
  }
  if (mergedFoodScores.length > 0) {
    sanitized.foodPreferenceScores = mergedFoodScores;
  }
  if (!sanitized.searchKeywords?.length) {
    if (mergedFoodScores.length > 0) {
      sanitized.searchKeywords = buildSearchKeywordsFromScores(
        mergedFoodScores,
        Array.isArray(slots?.searchKeywords) ? slots.searchKeywords : []
      );
    } else if (mergedDesiredFoods.length > 0) {
      sanitized.searchKeywords = buildSearchKeywords(mergedDesiredFoods);
    }
  }
  return sanitized;
}

function normalizeAnswerSlots(answers) {
  const normalized = {};
  for (const [key, value] of Object.entries(answers || {})) {
    if (!FIELD_SCHEMAS[key]) continue;
    const normalizedValue = normalizeSlotValue(key, value);
    if (key === 'totalTimeMinutes' && Number.isInteger(normalizedValue)) {
      normalized[key] = normalizedValue;
      continue;
    }
    const result = FIELD_SCHEMAS[key].safeParse(normalizedValue);
    if (result.success) {
      normalized[key] = key === 'location' ? normalizedValue : result.data;
    }
  }
  return normalized;
}

function normalizeSlotValue(key, value) {
  if (
    (key === 'totalTimeMinutes' || key === 'budgetPerPersonKrw') &&
    typeof value === 'string'
  ) {
    const parsedNumber = Number.parseInt(value.replace(/[^\d]/g, ''), 10);
    return Number.isNaN(parsedNumber) ? value : parsedNumber;
  }
  if (key === 'excludedFoods' && typeof value === 'string') {
    if (matchesAny(value, ['없음', '없어', '다 잘먹'])) {
      return [];
    }
    return [value];
  }
  return value;
}

function getMissingOrInvalidFields(slots) {
  const missing = [];
  for (const field of SlotPriorityOrder) {
    const result = FIELD_SCHEMAS[field].safeParse(slots[field]);
    if (!result.success) {
      missing.push(field);
    }
  }
  return missing;
}


function buildDefaultQuestionsWithSchemas(missingFields, partialSlots, userQuery) {
  return buildDefaultQuestions(
    missingFields,
    partialSlots,
    userQuery,
    FIELD_SCHEMAS
  );
}

async function buildQuestionData(missingFields, partialSlots, userQuery) {
  const questions = await generateFollowUpQuestions({
    missingFields,
    partialSlots,
    userQuery,
    fieldSchemas: FIELD_SCHEMAS,
    buildDefaultQuestions: buildDefaultQuestionsWithSchemas
  });
  const payload = {
    missingFields,
    questions
  };
  const result = AlephMissingSlotOutputSchema.safeParse(payload);
  return result.success ? result.data : payload;
}

export async function buildRefinementQuestionResponse(slots, userQuery = '') {
  const questionData = await buildQuestionData(
    REFINEMENT_FIELDS,
    slots,
    userQuery
  );

  return {
    status: 'questions',
    missingFields: questionData.missingFields,
    questions: questionData.questions,
    currentState: slots
  };
}
