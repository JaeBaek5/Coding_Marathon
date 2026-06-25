import { SlotPriorityOrder } from '../../../shared/contracts/schemas.js';

export const QuestionLabels = {
  mode: '식사 모드를 선택해 주세요. (일반 모드 또는 출장/여행 모드)',
  location: '위치 정보를 제공해 주세요.',
  mealPeriod: '식사 시간대를 알려주세요. (아침, 점심, 저녁, 야식)',
  totalTimeMinutes: '식사에 가능한 총 소요시간은 몇 분인가요? (20분~60분)',
  transportMode: '도보로 갈까요, 차로 갈까요?',
  budgetPerPersonKrw: '1인 예산은 얼마인가요?',
  partyContext: '누구와 함께 식사하시나요? (예: 상사, 친구, 연인, 혼밥 등)',
  vibe: '식사 분위기는 어떤가요?',
  excludedFoods:
    '피하고 싶은 음식이 있으신가요? (없다면 없음 또는 피할 음식 명시)'
};

export function buildQuestions(missingFields = []) {
  return missingFields.map((field) => ({
    field,
    label: QuestionLabels[field] || `${field} 정보를 입력해 주세요.`
  }));
}

export function normalizeAnswers(answers = {}) {
  const normalizedAnswers = { ...answers };

  if (typeof answers.excludedFoods === 'string') {
    if (
      answers.excludedFoods.includes('없음') ||
      answers.excludedFoods.includes('없어')
    ) {
      normalizedAnswers.excludedFoods = [];
    } else {
      normalizedAnswers.excludedFoods = [answers.excludedFoods];
    }
  }

  return normalizedAnswers;
}

export function mergeDefinedSlots(currentState = {}, incomingSlots = {}) {
  const mergedSlots = { ...currentState };

  for (const [key, value] of Object.entries(incomingSlots)) {
    if (value !== undefined && value !== null) {
      mergedSlots[key] = value;
    }
  }

  return mergedSlots;
}

export function detectMissingFields(slots = {}) {
  const missingFields = [];

  for (const field of SlotPriorityOrder) {
    const value = slots[field];

    if (value === undefined || value === null) {
      missingFields.push(field);
      continue;
    }

    if (field === 'excludedFoods' && !Array.isArray(value)) {
      missingFields.push(field);
    }
  }

  return missingFields;
}

export function parseQueryToSlotsRegex(query) {
  const slots = {};

  if (!query) return slots;

  if (
    query.includes('출장') ||
    query.includes('여행') ||
    query.includes('travel')
  ) {
    slots.mode = 'travel';
  } else if (
    query.includes('일반') ||
    query.includes('normal') ||
    query.includes('현재 위치')
  ) {
    slots.mode = 'normal';
  }

  if (
    query.includes('아침') ||
    query.includes('조식') ||
    query.includes('breakfast') ||
    query.includes('오전')
  ) {
    slots.mealPeriod = 'breakfast';
  } else if (
    query.includes('점심') ||
    query.includes('중식') ||
    query.includes('lunch') ||
    query.includes('낮')
  ) {
    slots.mealPeriod = 'lunch';
  } else if (
    query.includes('저녁') ||
    query.includes('석식') ||
    query.includes('dinner') ||
    query.includes('밤')
  ) {
    slots.mealPeriod = 'dinner';
  } else if (
    query.includes('야식') ||
    query.includes('late_night') ||
    query.includes('새벽') ||
    query.includes('늦은 밤')
  ) {
    slots.mealPeriod = 'late_night';
  }

  const budgetMatch = query.match(/(\d+)\s*만\s*원?/);
  if (budgetMatch) {
    slots.budgetPerPersonKrw = parseInt(budgetMatch[1], 10) * 10000;
  } else {
    const budgetRawMatch = query.match(/(\d{4,})\s*원?/);
    if (budgetRawMatch) {
      slots.budgetPerPersonKrw = parseInt(budgetRawMatch[1], 10);
    }
  }

  const hourMatch = query.match(/(\d+)\s*시간/);
  if (hourMatch) {
    slots.totalTimeMinutes = parseInt(hourMatch[1], 10) * 60;
  } else {
    const minMatch = query.match(/(\d+)\s*분/);
    if (minMatch) {
      slots.totalTimeMinutes = parseInt(minMatch[1], 10);
    }
  }

  if (
    query.includes('도보') ||
    query.includes('걸어서') ||
    query.includes('뚜벅이') ||
    query.includes('도보로') ||
    query.includes('걸음')
  ) {
    slots.transportMode = 'walk';
  } else if (
    query.includes('차로') ||
    query.includes('운전') ||
    query.includes('자동차') ||
    query.includes('드라이브') ||
    query.includes('차량') ||
    query.includes('차 ')
  ) {
    slots.transportMode = 'drive';
  }

  const excludedMatch = query.match(
    /([^\s,]+)\s*(제외|빼고|피하고|안 먹|못 먹)/
  );
  if (excludedMatch) {
    slots.excludedFoods = [excludedMatch[1]];
  } else if (
    query.includes('없음') ||
    query.includes('없어') ||
    query.includes('다 잘먹')
  ) {
    slots.excludedFoods = [];
  }

  const partyList = [
    '상사',
    '부모님',
    '아이',
    '친구',
    '연인',
    '혼밥',
    '가족',
    '동료',
    '직원'
  ];
  for (const partyContext of partyList) {
    if (query.includes(partyContext)) {
      slots.partyContext = partyContext;
      break;
    }
  }

  const vibeList = [
    'casual',
    '조용한',
    '쾌적한',
    '왁자지껄',
    '격식있는',
    '감성적인',
    '편안한',
    '분위기 있는'
  ];
  for (const vibe of vibeList) {
    if (query.includes(vibe)) {
      slots.vibe = vibe === '편안한' ? 'casual' : vibe;
      break;
    }
  }

  return slots;
}
