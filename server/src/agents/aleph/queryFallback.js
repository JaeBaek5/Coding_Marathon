import { parseDesiredFoodsFromText } from '../../utils/foodPreference.js';

function matchesAny(value, terms) {
  return terms.some((term) => value.includes(term));
}

export function parseTimeMinutes(query) {
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

export function parseBudgetKrw(query) {
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

/**
 * Deterministic extraction: numbers, enums, explicit units.
 * Safe to apply as fallback; LLM still wins on conflict.
 */
export function parseDeterministicQueryText(query) {
  const slots = {};
  if (!query) {
    return slots;
  }

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

  return slots;
}

/**
 * Semantic fallback when the LLM parse is empty or timed out.
 * Not exhaustive — covers high-signal Korean patterns only.
 */
export function parseSemanticQueryFallback(query) {
  const slots = {};
  if (!query) {
    return slots;
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

  const desiredFoods = parseDesiredFoodsFromText(query);
  if (desiredFoods.length > 0 && /(먹|먹고|먹을|먹어|끌|당기|시켜|주문|식사|한끼|땡기|하고\s*싶|먹자|드시|드실)/.test(query)) {
    slots.desiredFoods = desiredFoods;
  }

  return slots;
}
