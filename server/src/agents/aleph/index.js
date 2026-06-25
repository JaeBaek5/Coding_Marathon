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
  mode: '식사 모드',
  location: '위치',
  mealPeriod: '식사 시간',
  totalTimeMinutes: '총 소요 시간(분)',
  transportMode: '이동 수단',
  budgetPerPersonKrw: '1인 예산(원)',
  partyContext: '동행 구성',
  vibe: '원하는 분위기',
  excludedFoods: '피하고 싶은 음식'
};

const NO_PREFERENCE_TERMS = [
  '상관없',
  '상관 없',
  '아무거나',
  '괜찮',
  '무난',
  '특별히 없',
  '없어',
  '?곴?',
  '?곴??놁뼱'
];

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

  const llmSlots = sanitizeSlotProposal(await parseQueryWithSharedClient(query), {
    allowLocation: false
  });
  const fallbackSlots = sanitizeSlotProposal(parseQueryText(query), {
    allowLocation: false
  });
  const mergedSlots = mergeSlotLayers(currentState, fallbackSlots, llmSlots);

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

  return validateAndProcessSlots({
    ...currentState,
    ...normalizeAnswerSlots(answers)
  });
}

function mergeSlotLayers(currentState, fallbackSlots, llmSlots) {
  const mergedSlots = { ...currentState };
  for (const key of Object.keys(AlephParseOutputSchema.shape)) {
    if (fallbackSlots[key] !== undefined) mergedSlots[key] = fallbackSlots[key];
    if (llmSlots[key] !== undefined) mergedSlots[key] = llmSlots[key];
  }
  return mergedSlots;
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
    const completion = await createAgentChatCompletion('aleph', {
      messages: [
        {
          role: 'user',
          content: [
            'Parse the Korean restaurant recommendation request into slots.',
            'Return null only when a slot is genuinely missing.',
            'Interpret no-preference phrases such as "상관없다" as vibe "any".',
            'Never trust or return coordinates from the user text.',
            query
          ].join('\n')
        }
      ],
      response_format: zodResponseFormat(AlephParseOutputSchema, 'slot_parsing')
    });
    const parsed = AlephParseOutputSchema.safeParse(
      completion?.choices?.[0]?.message?.parsed
    );
    if (parsed.success) return parsed.data;
  } catch {
    return {};
  }
  return {};
}

function parseQueryText(query) {
  const slots = {};
  if (!query) return slots;

  const rawText = String(query);
  const text = normalizeQueryText(query);
  const compact = text.replace(/\s+/g, '');

  if (includesAny(text, ['여행', '출장', 'travel', '?ы뻾'])) {
    slots.mode = 'travel';
  } else if (
    includesAny(text, ['현재 위치', '근처', '주변', '도보', 'normal', '?꾩옱', '洹쇱쿂'])
  ) {
    slots.mode = 'normal';
  }

  if (includesAny(text, ['아침', '조식', 'breakfast', '?꾩묠'])) {
    slots.mealPeriod = 'breakfast';
  } else if (includesAny(text, ['점심', '점심식사', 'lunch', '?먯떖'])) {
    slots.mealPeriod = 'lunch';
  } else if (includesAny(text, ['저녁', '저녁식사', 'dinner', '???'])) {
    slots.mealPeriod = 'dinner';
  } else if (includesAny(text, ['야식', '늦은 밤', 'late night', '?쇱떇'])) {
    slots.mealPeriod = 'late_night';
  } else if (includesAny(text, ['밥 먹', '식사', '諛'])) {
    slots.mealPeriod = 'lunch';
  }

  const totalTimeMinutes = parseTimeMinutes(text);
  if (totalTimeMinutes !== null) slots.totalTimeMinutes = totalTimeMinutes;

  const budgetPerPersonKrw = parseBudgetKrw(text);
  if (budgetPerPersonKrw !== null) slots.budgetPerPersonKrw = budgetPerPersonKrw;

  if (includesAny(text, ['도보', '걸어서', 'walk', '?꾨낫'])) {
    slots.transportMode = 'walk';
  } else if (includesAny(text, ['차로', '차량', '자동차', 'drive'])) {
    slots.transportMode = 'drive';
  }

  const partyContext = parsePartyContext(text, compact);
  if (partyContext) slots.partyContext = partyContext;

  const vibe = parseVibe(text);
  if (vibe) slots.vibe = vibe;

  const spicyKeyword = rawText.includes('매운') || rawText.includes('留ㅼ슫');
  const avoidKeyword =
    rawText.includes('싫') ||
    rawText.includes('빼') ||
    rawText.includes('제외') ||
    rawText.includes('レ뼱');
  if (spicyKeyword && avoidKeyword) {
    slots.excludedFoods = rawText.includes('留ㅼ슫') ? ['留ㅼ슫'] : ['매운'];
  } else if (includesAny(text, ['피할 음식 없음', '제외 없음', '못 먹는 것 없음'])) {
    slots.excludedFoods = [];
  }

  if (
    slots.excludedFoods === undefined &&
    slots.mealPeriod &&
    slots.totalTimeMinutes &&
    slots.transportMode &&
    slots.budgetPerPersonKrw &&
    slots.partyContext &&
    slots.vibe
  ) {
    slots.excludedFoods = [];
  }

  if (includesAny(text, ['카페', '커피'])) {
    slots.venuePreference = 'cafe';
  } else if (includesAny(text, ['술집', '혼술', '맥주', 'bar'])) {
    slots.venuePreference = 'bar';
  }

  return slots;
}

function parsePartyContext(text, compact) {
  if (
    includesAny(compact, [
      '혼밥',
      '혼술',
      '혼자',
      '1인',
      '한명',
      '?쇰갈',
      '?쇱닠',
      '?쇱옄'
    ])
  ) {
    return 'solo';
  }
  if (includesAny(text, ['친구', '친한 사람', '移쒓뎄'])) return 'friends';
  if (includesAny(text, ['데이트', '연인', '커플'])) return 'date';
  if (includesAny(text, ['가족'])) return 'family';
  if (includesAny(text, ['동료', '회사', '상사', '팀원'])) return 'colleague';
  return null;
}

function parseVibe(text) {
  if (includesAny(text, NO_PREFERENCE_TERMS)) return 'any';
  if (includesAny(text, ['조용', '시끄럽지', '대화', '편하게 오래', '議곗슜'])) {
    return 'quiet';
  }
  if (includesAny(text, ['캐주얼', '편안', '무난'])) return 'casual';
  if (includesAny(text, ['깔끔', '고급', '감성'])) return 'stylish';
  return null;
}

function sanitizeSlotProposal(slots, { allowLocation }) {
  const sanitized = {};
  for (const [key, value] of Object.entries(slots || {})) {
    if (value === null || value === undefined || !FIELD_SCHEMAS[key]) continue;
    if (key === 'location' && !allowLocation) continue;
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
  return sanitizeSlotProposal(answers, { allowLocation: true });
}

function normalizeSlotValue(key, value) {
  if (
    (key === 'totalTimeMinutes' || key === 'budgetPerPersonKrw') &&
    typeof value === 'string'
  ) {
    const parsed = Number.parseInt(value.replace(/[^\d]/g, ''), 10);
    return Number.isNaN(parsed) ? value : parsed;
  }

  if (key === 'excludedFoods' && typeof value === 'string') {
    const normalized = normalizeQueryText(value);
    if (includesAny(normalized, ['없음', '없어', '상관없', '아무거나', '?놁뼱'])) {
      return [];
    }
    return [value];
  }

  if (key === 'vibe' && typeof value === 'string') {
    const normalized = normalizeQueryText(value);
    const vibe = parseVibe(normalized);
    return vibe ?? value;
  }

  return value;
}

function getMissingOrInvalidFields(slots) {
  const missing = [];
  for (const field of SlotPriorityOrder) {
    const result = FIELD_SCHEMAS[field].safeParse(slots[field]);
    if (!result.success) missing.push(field);
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
      label: QUESTION_LABELS[field] || `${field} 정보가 필요합니다`
    }))
  };
  const result = AlephMissingSlotOutputSchema.safeParse(payload);
  return result.success ? result.data : payload;
}

function parseTimeMinutes(text) {
  if (includesAny(text, ['한 시간', '한시간', '1시간'])) return 60;
  if (includesAny(text, ['반 시간', '30분'])) return 30;

  const hourMatch = text.match(/(\d+)\s*(시간|hour|hours)/i);
  if (hourMatch) return Number.parseInt(hourMatch[1], 10) * 60;

  const minuteMatch = text.match(/(\d+)\s*(분|minute|minutes|遺)/i);
  if (minuteMatch) return Number.parseInt(minuteMatch[1], 10);

  const mojibakeHourMatch = text.match(/(\d+)\s*.{0,2}쒓컙/);
  if (mojibakeHourMatch) return Number.parseInt(mojibakeHourMatch[1], 10) * 60;

  return null;
}

function parseBudgetKrw(text) {
  const manWonMatch = text.match(/(\d+)\s*만\s*원/);
  if (manWonMatch) return Number.parseInt(manWonMatch[1], 10) * 10000;

  const wonMatch = text.match(/(\d{4,})\s*(원|krw)?/i);
  if (!wonMatch) return null;

  const parsed = Number.parseInt(wonMatch[1], 10);
  return parsed >= 3000 ? parsed : null;
}

function normalizeQueryText(query) {
  return String(query || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\r/g, ' ')
    .replace(/[\p{P}\p{S}\p{Pe}\p{Ps}\p{Pi}\p{Pf}\p{Sk}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(value, terms) {
  const normalizedValue = normalizeQueryText(value);
  const compactValue = normalizedValue.replace(/\s+/g, '');
  return terms.some((term) => {
    const normalizedTerm = normalizeQueryText(term);
    return (
      normalizedValue.includes(normalizedTerm) ||
      compactValue.includes(normalizedTerm.replace(/\s+/g, ''))
    );
  });
}
