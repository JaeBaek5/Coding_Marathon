import {
  ErrorCodes,
  SlotPriorityOrder
} from '../../../shared/contracts/schemas.js';
import { sessions } from './sessions.js';
import { logger } from '../utils/logger.js';
import { createAgentChatCompletion, getAgentHarness } from '../llm/client.js';
import { bet as defaultBet } from '../agents/bet/index.js';
import { gimel as defaultGimel } from '../agents/gimel/index.js';
import { detectExplicitVenueIntent } from '../utils/venueGating.js';

const QuestionLabels = {
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

function getSearchRadius(mode, transportMode) {
  if (mode === 'normal') {
    return transportMode === 'walk' ? 1000 : 5000;
  }

  return transportMode === 'walk' ? 2000 : 10000;
}

function collectSlotTextSources(slots = {}, query = '') {
  const sources = [query];
  for (const value of Object.values(slots)) {
    if (typeof value === 'string') {
      sources.push(value);
    } else if (Array.isArray(value)) {
      sources.push(...value.filter((item) => typeof item === 'string'));
    }
  }
  return sources;
}

function normalizeLocationPayload(location, fallbackSource = 'browser-geolocation') {
  if (!location) {
    return null;
  }

  return {
    lat: location.lat,
    lng: location.lng,
    accuracyMeters:
      location.accuracyMeters === undefined ? null : location.accuracyMeters,
    source: location.source || fallbackSource
  };
}

export function buildRecommendationPresentation(
  candidatePool,
  dislikedIds = [],
  showFullPool = false
) {
  const available = candidatePool.filter(
    (candidate) => !dislikedIds.includes(candidate.id)
  );
  const currentRecommendation = available[0] || null;

  if (showFullPool) {
    return {
      currentRecommendation,
      candidatePool,
      results: candidatePool,
      showFullPool: true
    };
  }

  return {
    currentRecommendation,
    candidatePool,
    results: currentRecommendation ? [currentRecommendation] : [],
    showFullPool: false
  };
}

function mapBetError(betResult) {
  return {
    status: 'error',
    code: betResult.code,
    message: betResult.message,
    missingFields: []
  };
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
  for (const p of partyList) {
    if (query.includes(p)) {
      slots.partyContext = p;
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
  for (const v of vibeList) {
    if (query.includes(v)) {
      slots.vibe = v === '편안한' ? 'casual' : v;
      break;
    }
  }

  return slots;
}

export async function parseQueryToSlotsLLM(query) {
  try {
    getAgentHarness('aleph');
  } catch {
    return parseQueryToSlotsRegex(query);
  }

  try {
    const completion = await createAgentChatCompletion('aleph', {
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: `Analyze the user's Korean natural language query and extract slots in JSON format.
Only output fields that are explicitly mentioned or clearly inferred. Do not speculate or guess values if not present.
Allowed fields:
- mode: "normal" | "travel"
- mealPeriod: "breakfast" | "lunch" | "dinner" | "late_night"
- budgetPerPersonKrw: number (integer, e.g. 10000)
- totalTimeMinutes: number (integer)
- transportMode: "walk" | "drive"
- excludedFoods: array of strings
- partyContext: string (e.g. "상사", "부모님", "아이", "친구", "연인", "혼밥")
- vibe: string ("casual", "조용한", "쾌적한", "왁자지껄", "격식있는", "감성적인")

Query: ${query}`
        }
      ]
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch {
    return parseQueryToSlotsRegex(query);
  }
}

export async function generateGroundedExplanationLLM(candidate, slots) {
  try {
    getAgentHarness('gimel');
  } catch {
    return generateGroundedExplanationFallback(candidate, slots);
  }

  try {
    const cleanCandidate = { ...candidate };
    delete cleanCandidate.location;

    const completion = await createAgentChatCompletion('gimel', {
      messages: [
        {
          role: 'user',
          content: `Generate a short Korean recommendation reason (1-2 sentences) explaining why this restaurant is suitable for the user based ONLY on the provided candidate metadata and slot constraints.
Do NOT hallucinate or assume any information that is null or not provided (e.g. ratings, review count, review summary, opening hours, or price if not present).
Strictly protect user privacy: do not refer to or output precise latitude and longitude. Only refer to relative distance, time, and category text fields.

${JSON.stringify({ candidate: cleanCandidate, slots })}`
        }
      ]
    });

    return completion.choices[0].message.content.trim();
  } catch {
    return generateGroundedExplanationFallback(candidate, slots);
  }
}

export function generateGroundedExplanationFallback(candidate, slots) {
  const {
    transportMode,
    oneWayRouteMinutes,
    totalExpectedMinutes,
    category,
    name
  } = candidate;
  const { partyContext, vibe } = slots;

  const transportStr = transportMode === 'walk' ? '도보' : '차로';
  const prefix = `현재 위치에서 ${transportStr} ${oneWayRouteMinutes}분 거리(왕복 ${oneWayRouteMinutes * 2}분)로, ${category} 음식점인 ${name}입니다.`;
  const suffix = `소요시간(${totalExpectedMinutes}분)과 예산에 잘 부합하여 추천합니다.`;

  if (partyContext && vibe) {
    return `${prefix} ${vibe} 분위기에서 ${partyContext}와 함께 식사하시기에 아주 적합하여 추천합니다.`;
  }
  if (partyContext) {
    return `${prefix} ${partyContext}와 함께 식사하시기에 알맞은 장소로 추천합니다.`;
  }
  if (vibe) {
    return `${prefix} ${vibe} 분위기에서 편안하게 식사하실 수 있어 추천합니다.`;
  }

  return `${prefix} ${suffix}`;
}

export class OrchestratorService {
  constructor(dependencies = {}) {
    this.bet = dependencies.bet ?? defaultBet;
    this.gimel = dependencies.gimel ?? defaultGimel;
  }

  async processRequest(requestPayload) {
    const {
      query,
      mode = 'normal',
      userLocation,
      selectedLocation,
      now
    } = requestPayload;
    let orchestratorModel = null;
    try {
      orchestratorModel = getAgentHarness('orchestrator').model;
    } catch {
      orchestratorModel = null;
    }
    logger.info('Orchestrator request received', {
      agent: 'orchestrator',
      llmModel: orchestratorModel
    });

    if (mode === 'normal' && !userLocation) {
      return {
        status: 'error',
        code: ErrorCodes.GEO_REQUIRED,
        message: '일반 모드에서는 현재 위치 정보가 필수입니다.',
        missingFields: []
      };
    }

    const parsedSlots = await parseQueryToSlotsLLM(query);

    const initialSlots = {
      mode,
      ...parsedSlots,
      venueIntentExplicit: detectExplicitVenueIntent(
        collectSlotTextSources(parsedSlots, query)
      )
    };

    if (mode === 'normal' && userLocation) {
      initialSlots.location = normalizeLocationPayload(
        userLocation,
        'browser-geolocation'
      );
    } else if (mode === 'travel' && selectedLocation) {
      const coords = selectedLocation.coords || selectedLocation;
      initialSlots.location = normalizeLocationPayload(
        coords,
        selectedLocation.coords ? 'selected-location' : 'manual-location'
      );
    }

    const missingFields = this.detectMissingFields(initialSlots);

    if (missingFields.length > 0) {
      const sessionId = `ses_${Math.random().toString(36).substring(2, 11)}`;
      sessions.create(sessionId, { ...initialSlots, _query: query });

      const questions = missingFields.map((field) => ({
        field,
        label: QuestionLabels[field] || `${field} 정보를 입력해 주세요.`
      }));

      return {
        status: 'questions',
        sessionId,
        missingFields,
        questions
      };
    }

    return this.executeRecommendation(initialSlots, now, { query });
  }

  async processAnswers(sessionId, answersPayload) {
    const session = sessions.get(sessionId);
    if (!session) {
      return {
        status: 'error',
        code: ErrorCodes.SESSION_EXPIRED,
        message: '세션이 만료되었거나 존재하지 않습니다.',
        missingFields: []
      };
    }

    const updatedTurnCount = session.turnCount + 1;
    sessions.update(sessionId, { turnCount: updatedTurnCount });

    const answers = answersPayload.answers || {};
    const updatedSlots = { ...session.slots, ...answers };

    if (typeof answers.excludedFoods === 'string') {
      if (
        answers.excludedFoods.includes('없음') ||
        answers.excludedFoods.includes('없어')
      ) {
        updatedSlots.excludedFoods = [];
      } else {
        updatedSlots.excludedFoods = [answers.excludedFoods];
      }
    }

    const missingFields = this.detectMissingFields(updatedSlots);

    if (missingFields.length > 0) {
      if (updatedTurnCount >= 2) {
        sessions.delete(sessionId);
        return {
          status: 'error',
          code: ErrorCodes.SESSION_EXPIRED,
          message: '대화 가능 횟수를 초과했습니다.',
          missingFields
        };
      }

      sessions.update(sessionId, { slots: updatedSlots });

      const questions = missingFields.map((field) => ({
        field,
        label: QuestionLabels[field] || `${field} 정보를 입력해 주세요.`
      }));

      return {
        status: 'questions',
        sessionId,
        missingFields,
        questions
      };
    }

    const result = await this.executeRecommendation(updatedSlots, null, {
      query: session.slots._query || ''
    });
    sessions.delete(sessionId);
    return result;
  }

  async processFeedback(sessionId, feedbackPayload) {
    const session = sessions.get(sessionId);
    if (!session?.candidatePool?.length) {
      return {
        status: 'error',
        code: ErrorCodes.SESSION_EXPIRED,
        message: '세션이 만료되었거나 존재하지 않습니다.',
        missingFields: []
      };
    }

    const { action, candidateId } = feedbackPayload;
    const likedIds = [...(session.likedIds || [])];
    const dislikedIds = [...(session.dislikedIds || [])];
    let dislikeCount = session.dislikeCount || 0;
    let showFullPool = session.showFullPool || false;

    if (action === 'like') {
      if (!likedIds.includes(candidateId)) {
        likedIds.push(candidateId);
      }
    } else if (!dislikedIds.includes(candidateId)) {
      dislikedIds.push(candidateId);
      dislikeCount += 1;
      if (dislikeCount >= 2) {
        showFullPool = true;
      }
    }

    sessions.update(sessionId, {
      likedIds,
      dislikedIds,
      dislikeCount,
      showFullPool
    });

    return {
      status: 'results',
      sessionId,
      eligibleCount: session.candidatePool.length,
      ...buildRecommendationPresentation(
        session.candidatePool,
        dislikedIds,
        showFullPool
      )
    };
  }

  detectMissingFields(slots) {
    const missing = [];
    for (const field of SlotPriorityOrder) {
      const val = slots[field];
      if (val === undefined || val === null) {
        missing.push(field);
      } else if (field === 'excludedFoods' && !Array.isArray(val)) {
        missing.push(field);
      }
    }
    return missing;
  }

  async executeRecommendation(slots, now, options = {}) {
    const query = options.query || '';
    const enrichedSlots = {
      ...slots,
      venueIntentExplicit: detectExplicitVenueIntent(
        collectSlotTextSources(slots, query)
      )
    };

    const betResult = await this.bet.search(enrichedSlots, { now });
    if (betResult.status === 'error') {
      return mapBetError(betResult);
    }

    const candidatePool = await this.gimel.generateReasons(betResult.results);
    const sessionId = `ses_${Math.random().toString(36).substring(2, 11)}`;

    sessions.create(sessionId, enrichedSlots);
    sessions.update(sessionId, {
      candidatePool,
      likedIds: [],
      dislikedIds: [],
      dislikeCount: 0,
      showFullPool: false
    });

    return {
      status: 'results',
      sessionId,
      eligibleCount: candidatePool.length,
      ...buildRecommendationPresentation(candidatePool, [], false)
    };
  }
}

export const orchestrator = new OrchestratorService();
export default orchestrator;
