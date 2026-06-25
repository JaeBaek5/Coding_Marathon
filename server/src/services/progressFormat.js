const MEAL_PERIOD_LABELS = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
  late_night: '야식'
};

const FIELD_LABELS = {
  mealPeriod: '식사 시간',
  transportMode: '이동 수단',
  totalTimeMinutes: '총 소요 시간',
  budgetPerPersonKrw: '1인 예산',
  partyContext: '동행',
  vibe: '분위기',
  desiredFoods: '원하는 음식',
  excludedFoods: '제외 음식',
  location: '위치'
};

export function truncateProgressText(text, maxLength = 56) {
  if (typeof text !== 'string') {
    return '';
  }
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

export function formatTransportLabel(transportMode) {
  if (transportMode === 'walk') {
    return '도보';
  }
  if (transportMode === 'drive') {
    return '차량';
  }
  return null;
}

export function formatBudgetLabel(budgetPerPersonKrw) {
  if (!Number.isFinite(budgetPerPersonKrw) || budgetPerPersonKrw <= 0) {
    return null;
  }
  if (budgetPerPersonKrw >= 10000) {
    const man = budgetPerPersonKrw / 10000;
    return Number.isInteger(man) ? `${man}만원` : `${man.toFixed(1)}만원`;
  }
  return `${budgetPerPersonKrw.toLocaleString('ko-KR')}원`;
}

export function formatSlotsProgressDetail(slots = {}) {
  const parts = [];

  if (Array.isArray(slots.desiredFoods) && slots.desiredFoods.length > 0) {
    parts.push(`음식 ${slots.desiredFoods.join(', ')}`);
  }

  const transport = formatTransportLabel(slots.transportMode);
  if (transport) {
    parts.push(transport);
  }

  if (Number.isFinite(slots.totalTimeMinutes) && slots.totalTimeMinutes > 0) {
    parts.push(`총 ${slots.totalTimeMinutes}분`);
  }

  if (slots.mealPeriod && MEAL_PERIOD_LABELS[slots.mealPeriod]) {
    parts.push(MEAL_PERIOD_LABELS[slots.mealPeriod]);
  }

  const budget = formatBudgetLabel(slots.budgetPerPersonKrw);
  if (budget) {
    parts.push(`예산 ${budget}`);
  }

  if (typeof slots.partyContext === 'string' && slots.partyContext.trim()) {
    parts.push(slots.partyContext.trim());
  }

  if (typeof slots.vibe === 'string' && slots.vibe.trim()) {
    parts.push(`분위기 ${slots.vibe.trim()}`);
  }

  if (Array.isArray(slots.excludedFoods) && slots.excludedFoods.length > 0) {
    parts.push(`제외 ${slots.excludedFoods.join(', ')}`);
  }

  if (Array.isArray(slots.searchKeywords) && slots.searchKeywords.length > 0) {
    const keywords = slots.searchKeywords.slice(0, 6).join(', ');
    parts.push(`검색어 ${keywords}`);
  }

  return parts.join(' · ');
}

export function formatMissingFieldsDetail(missingFields = []) {
  if (!Array.isArray(missingFields) || missingFields.length === 0) {
    return null;
  }

  const labels = missingFields.map((field) => FIELD_LABELS[field] || field);
  return labels.join(', ');
}

export function formatSearchContextDetail({
  desiredFoods = [],
  searchKeywords = [],
  transportMode,
  searchRadiusMeters
}) {
  const parts = [];

  if (Number.isFinite(searchRadiusMeters) && searchRadiusMeters > 0) {
    const km = searchRadiusMeters / 1000;
    parts.push(`반경 ${Number.isInteger(km) ? km : km.toFixed(1)}km`);
  }

  const transport = formatTransportLabel(transportMode);
  if (transport) {
    parts.push(transport);
  }

  if (Array.isArray(desiredFoods) && desiredFoods.length > 0) {
    parts.push(`음식 ${desiredFoods.join(', ')}`);
  }

  if (Array.isArray(searchKeywords) && searchKeywords.length > 0) {
    parts.push(`검색어 ${searchKeywords.slice(0, 8).join(', ')}`);
  }

  return parts.join(' · ');
}
