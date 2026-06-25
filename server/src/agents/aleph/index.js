import { createAgentChatCompletion } from '../../llm/client.js';
import { zodResponseFormat } from 'openai/helpers/zod';
import {
  AlephParseOutputSchema,
  AlephMissingSlotOutputSchema,
  SlotPriorityOrder,
  SlotSchema,
  ErrorCodes
} from '../../../../shared/contracts/schemas.js';

const MAX_ROUNDS = 2;
const QUESTION_LABELS = {
  mode: '현재 위치 기준 추천인지, 여행/선택 위치 기준 추천인지 알려주세요.',
  location: '현재 위치 또는 선택한 위치 정보가 필요합니다.',
  mealPeriod: '언제 드실 건가요? (아침/점심/저녁/야식)',
  totalTimeMinutes: '전체 식사 가능 시간은 몇 분인가요? (20~60분)',
  transportMode: '이동 수단을 알려주세요. (도보/차량)',
  budgetPerPersonKrw: '1인당 예산은 얼마인가요?',
  partyContext: '누구와 함께 식사하시나요?',
  vibe: '원하는 분위기를 알려주세요.',
  excludedFoods: '피하고 싶은 음식이 있으신가요? 없다면 없음이라고 알려주세요.'
};
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
  ageGroup: SlotSchema.shape.ageGroup
};

export async function parseQuery(query, currentState = {}, round = 1) {
  if (round > MAX_ROUNDS) {
    return {
      status: 'error',
      code: ErrorCodes.SESSION_EXPIRED,
      message: 'Max rounds exceeded',
      missingFields: []
    };
  }

  const llmSlots = await parseQueryWithSharedClient(query);
  const parsedSlots = {
    ...sanitizeSlotProposal(llmSlots, { allowLocation: false }),
    ...parseQueryText(query)
  };

  const mergedSlots = { ...currentState };
  for (const key of Object.keys(AlephParseOutputSchema.shape)) {
    if (parsedSlots[key] !== null && parsedSlots[key] !== undefined) {
      mergedSlots[key] = parsedSlots[key];
    }
  }

  return validateAndProcessSlots(mergedSlots);
}

export async function processAnswers(answers, currentState = {}, round = 1) {
  if (round > MAX_ROUNDS) {
    return {
      status: 'error',
      code: ErrorCodes.SESSION_EXPIRED,
      message: 'Max rounds exceeded',
      missingFields: []
    };
  }

  const mergedSlots = { ...currentState };
  const normalizedAnswers = normalizeAnswerSlots(answers);
  for (const [key, value] of Object.entries(normalizedAnswers)) {
    mergedSlots[key] = value;
  }

  return validateAndProcessSlots(mergedSlots);
}

async function validateAndProcessSlots(mergedSlots) {
  const normalizedSlots = sanitizeSlotProposal(mergedSlots, {
    allowLocation: true
  });

  if (isInvalidTotalTime(normalizedSlots.totalTimeMinutes)) {
    return {
      status: 'error',
      code: ErrorCodes.INVALID_TOTAL_TIME,
      message: 'Total time must be between 20 and 60 minutes.',
      missingFields: []
    };
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

  const questionData = buildQuestionData(missingOrInvalidFields);

  return {
    status: 'questions',
    missingFields: questionData.missingFields,
    questions: questionData.questions,
    currentState: normalizedSlots
  };
}

async function parseQueryWithSharedClient(query) {
  try {
    const parseCompletion = await createAgentChatCompletion('aleph', {
      messages: [
        {
          role: 'user',
          content: query
        }
      ],
      response_format: zodResponseFormat(AlephParseOutputSchema, 'slot_parsing')
    });
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

function parseQueryText(query) {
  const slots = {};
  if (!query) return slots;

  if (matchesAny(query, ['출장', '여행', 'travel', '선택 위치'])) {
    slots.mode = 'travel';
  } else if (matchesAny(query, ['현재 위치', '지금 위치', 'normal'])) {
    slots.mode = 'normal';
  }

  if (matchesAny(query, ['아침', '조식', 'breakfast', '오전'])) {
    slots.mealPeriod = 'breakfast';
  } else if (matchesAny(query, ['점심', '중식', 'lunch'])) {
    slots.mealPeriod = 'lunch';
  } else if (matchesAny(query, ['저녁', '석식', 'dinner'])) {
    slots.mealPeriod = 'dinner';
  } else if (matchesAny(query, ['야식', 'late_night', '새벽', '늦은 밤'])) {
    slots.mealPeriod = 'late_night';
  }

  const totalTimeMinutes = parseTimeMinutes(query);
  if (totalTimeMinutes !== null) {
    slots.totalTimeMinutes = totalTimeMinutes;
  }

  const budgetPerPersonKrw = parseBudgetKrw(query);
  if (budgetPerPersonKrw !== null) {
    slots.budgetPerPersonKrw = budgetPerPersonKrw;
  }

  if (matchesAny(query, ['도보', '걸어서', '뚜벅이', '걸을'])) {
    slots.transportMode = 'walk';
  } else if (matchesAny(query, ['차로', '운전', '자동차', '차량'])) {
    slots.transportMode = 'drive';
  }

  if (query.includes('친구')) {
    slots.partyContext = '친구';
  } else if (query.includes('연인')) {
    slots.partyContext = '연인';
  } else if (query.includes('가족')) {
    slots.partyContext = '가족';
  } else if (query.includes('혼밥')) {
    slots.partyContext = '혼밥';
  }

  if (query.includes('대학생')) {
    slots.ageGroup = '대학생';
  }

  if (
    query.includes('캐주얼') &&
    (query.includes('얘기') || query.includes('대화'))
  ) {
    slots.vibe = '캐주얼하고 편하게 대화 가능한 분위기';
  } else if (query.includes('캐주얼')) {
    slots.vibe = '캐주얼';
  } else if (query.includes('조용')) {
    slots.vibe = '조용한';
  }

  if (query.includes('매운') && matchesAny(query, ['빼고', '제외', '피하고'])) {
    slots.excludedFoods = ['매운 음식'];
  } else if (matchesAny(query, ['없음', '없어', '다 잘먹'])) {
    slots.excludedFoods = [];
  }

  // Venue intent — explicit user request overrides the default restaurant filter
  if (matchesAny(query, ['카페', '커피', '디저트'])) {
    slots.venuePreference = 'cafe';
  } else if (matchesAny(query, ['술집', '술 한잔', '맥주', '와인', '호프', '포차', '펍'])) {
    slots.venuePreference = 'bar';
  }

  return slots;
}

function sanitizeSlotProposal(slots, { allowLocation }) {
  const sanitized = {};
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

function isInvalidTotalTime(totalTimeMinutes) {
  return (
    totalTimeMinutes !== undefined &&
    totalTimeMinutes !== null &&
    (totalTimeMinutes < 20 || totalTimeMinutes > 60)
  );
}

function buildQuestionData(missingFields) {
  const payload = {
    missingFields,
    questions: missingFields.map((field) => ({
      field,
      label: QUESTION_LABELS[field] || `${field} 정보를 입력해 주세요.`
    }))
  };
  const result = AlephMissingSlotOutputSchema.safeParse(payload);
  return result.success ? result.data : payload;
}

function parseTimeMinutes(query) {
  if (/(한|1)\s*시간/.test(query)) {
    return 60;
  }
  const hourMatch = query.match(/(\d+)\s*시간/);
  if (hourMatch) {
    return Number.parseInt(hourMatch[1], 10) * 60;
  }
  const minuteMatch = query.match(/(\d+)\s*분/);
  if (minuteMatch) {
    return Number.parseInt(minuteMatch[1], 10);
  }
  return null;
}

function parseBudgetKrw(query) {
  const rawWonMatch = query.match(/(\d{4,})\s*원/);
  if (rawWonMatch) {
    return Number.parseInt(rawWonMatch[1], 10);
  }
  const manWonMatch = query.match(/(\d+)\s*만\s*원/);
  if (manWonMatch) {
    return Number.parseInt(manWonMatch[1], 10) * 10000;
  }
  return null;
}

function matchesAny(value, terms) {
  return terms.some((term) => value.includes(term));
}
