import {
  getDefaultDesiredFoodOptions,
  getExcludedFoodOptions,
  inferDesiredFoodOptions
} from './foodCatalog.js';

const TOTAL_TIME_MIN_MINUTES = 20;

export const QUESTION_LABELS = {
  mode: '현재 위치 기준 추천인지, 여행/선택 위치 기준 추천인지 알려주세요.',
  location: '현재 위치 또는 선택한 위치 정보가 필요합니다.',
  mealPeriod: '언제 드실 건가요?',
  totalTimeMinutes: `식사에 쓸 수 있는 시간은 얼마나 되나요? (${TOTAL_TIME_MIN_MINUTES}분 이상)`,
  transportMode: '어떻게 이동하실 건가요?',
  budgetPerPersonKrw: '1인당 예산은 얼마로 생각하시나요?',
  partyContext: '누구와 함께 식사하시나요?',
  vibe: '어떤 분위기를 원하시나요?',
  excludedFoods: '피하고 싶은 음식이 있으신가요?',
  desiredFoods: '어떤 음식이 끌리시나요?'
};

export const DEFAULT_FIELD_OPTIONS = {
  mode: [
    { value: 'normal', label: '지금 위치 기준' },
    { value: 'travel', label: '다른 위치/여행지' }
  ],
  mealPeriod: [
    { value: 'breakfast', label: '아침' },
    { value: 'lunch', label: '점심' },
    { value: 'dinner', label: '저녁' },
    { value: 'late_night', label: '야식' }
  ],
  transportMode: [
    { value: 'walk', label: '도보' },
    { value: 'drive', label: '차량' }
  ],
  totalTimeMinutes: [
    { value: 30, label: '30분' },
    { value: 45, label: '45분' },
    { value: 60, label: '1시간' },
    { value: 120, label: '2시간' },
    { value: 240, label: '4시간' },
    { value: 480, label: '8시간' }
  ],
  budgetPerPersonKrw: [
    { value: 10000, label: '1만원' },
    { value: 15000, label: '1.5만원' },
    { value: 20000, label: '2만원' },
    { value: 30000, label: '3만원' },
    { value: 50000, label: '5만원' }
  ],
  partyContext: [
    { value: '혼밥', label: '혼밥' },
    { value: '친구', label: '친구' },
    { value: '연인', label: '연인/데이트' },
    { value: '직장 동료', label: '직장 동료' },
    { value: '상사', label: '상사' },
    { value: '가족', label: '가족' }
  ],
  vibe: [
    { value: '캐주얼', label: '캐주얼' },
    { value: '조용한', label: '조용한' },
    { value: '분위기 좋은', label: '분위기 좋은' },
    { value: '격식 있는', label: '격식 있는' },
    { value: '활기찬', label: '활기찬' }
  ],
  get excludedFoods() {
    return getExcludedFoodOptions();
  },
  get desiredFoods() {
    return getDefaultDesiredFoodOptions().map((item) => ({
      value: item.value,
      label: item.label
    }));
  }
};

export { inferDesiredFoodOptions };

export function getDefaultOptionsForField(field, partialSlots = {}, userQuery = '') {
  if (field === 'desiredFoods') {
    return inferDesiredFoodOptions(partialSlots, userQuery).map((item) => ({
      value: item.value,
      label: item.label
    }));
  }
  if (field === 'excludedFoods') {
    return getExcludedFoodOptions();
  }
  return DEFAULT_FIELD_OPTIONS[field] || null;
}
