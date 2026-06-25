import { SlotSchema } from '../../../../shared/contracts/schemas.js';

export const SLOT_DEFAULTS = {
  mode: 'normal',
  mealPeriod: 'lunch',
  totalTimeMinutes: 60,
  transportMode: 'walk',
  budgetPerPersonKrw: 15000,
  partyContext: '친구',
  vibe: '캐주얼',
  excludedFoods: [],
  desiredFoods: [],
  searchKeywords: []
};

export const REFINEMENT_FIELDS = [
  'desiredFoods',
  'vibe',
  'budgetPerPersonKrw',
  'excludedFoods'
];

function isEmptySlotValue(field, value) {
  if (value === undefined || value === null) {
    return true;
  }
  if (field === 'excludedFoods' || field === 'desiredFoods' || field === 'searchKeywords') {
    return !Array.isArray(value) || value.length === 0;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  return false;
}

export function fillMissingSlots(slots = {}, defaults = SLOT_DEFAULTS) {
  const filled = { ...slots };

  for (const [field, defaultValue] of Object.entries(defaults)) {
    if (isEmptySlotValue(field, filled[field])) {
      filled[field] = Array.isArray(defaultValue)
        ? [...defaultValue]
        : defaultValue;
    }
  }

  return filled;
}

export function slotsAreComplete(slots) {
  return SlotSchema.safeParse(slots).success;
}
