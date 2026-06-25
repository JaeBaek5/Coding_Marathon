import {
  ErrorCodes,
  SlotPriorityOrder
} from '../../../shared/contracts/schemas.js';
import { sessions } from './sessions.js';
import { KakaoLocalAdapter } from '../adapters/kakaoLocalAdapter.js';
import { KakaoMobilityAdapter } from '../adapters/kakaoMobilityAdapter.js';
import { NaverDirectionsAdapter } from '../adapters/naverDirectionsAdapter.js';
import {
  normalizeKakaoLocalCandidate,
  mergeCandidateWithRoute
} from '../adapters/normalization.js';
import { deduplicateCandidates } from '../utils/dedupe.js';
import { rankCandidates, validateTimeBudget } from './ranking.js';
import { cache, cacheTTLs } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { createAgentChatCompletion, getAgentHarness } from '../llm/client.js';

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
  } else {
    return transportMode === 'walk' ? 2000 : 10000;
  }
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
      ...parsedSlots
    };

    if (mode === 'normal' && userLocation) {
      initialSlots.location = userLocation;
    } else if (mode === 'travel' && selectedLocation?.coords) {
      initialSlots.location = selectedLocation.coords;
    }

    const missingFields = this.detectMissingFields(initialSlots);

    if (missingFields.length > 0) {
      const sessionId = `ses_${Math.random().toString(36).substring(2, 11)}`;
      sessions.create(sessionId, initialSlots);

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

    return this.executeRecommendation(initialSlots, now);
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

    const result = await this.executeRecommendation(updatedSlots, null);
    sessions.delete(sessionId);
    return result;
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

  async executeRecommendation(slots, now) {
    const { mode, transportMode, location, totalTimeMinutes } = slots;

    try {
      validateTimeBudget(totalTimeMinutes);
    } catch (err) {
      logger.info('Time budget validation failed', { totalTimeMinutes });
      return {
        status: 'error',
        code: err.code || ErrorCodes.INVALID_TOTAL_TIME,
        message: err.message,
        missingFields: []
      };
    }

    const kakaoLocal = new KakaoLocalAdapter();
    const radius = getSearchRadius(mode, transportMode);

    let searchResult;
    const nearbyCacheKey = `nearby:${location.lat.toFixed(5)}:${location.lng.toFixed(5)}:${radius}`;
    try {
      const cached = cache.get(nearbyCacheKey);
      if (cached) {
        logger.info('Cache HIT for nearby restaurants', {
          cacheKey: nearbyCacheKey
        });
        searchResult = cached;
      } else {
        logger.info('Cache MISS for nearby restaurants', {
          cacheKey: nearbyCacheKey
        });
        logger.info('Provider Call: Kakao Local category search', {
          lat: location.lat,
          lng: location.lng,
          radius
        });
        searchResult = await kakaoLocal.searchNearbyRestaurants(
          location.lat,
          location.lng,
          radius
        );
        cache.set(nearbyCacheKey, searchResult, cacheTTLs.NEARBY);
      }
    } catch (err) {
      logger.error('Provider Error: Kakao Local category search failed', err, {
        location,
        radius
      });
      return {
        status: 'error',
        code: ErrorCodes.PROVIDER_ERROR,
        message: '식당 검색에 실패했습니다.',
        missingFields: []
      };
    }

    const rawDocs = searchResult?.documents || [];
    logger.info('Restaurant candidates found', {
      rawCandidatesCount: rawDocs.length
    });
    if (rawDocs.length === 0) {
      return {
        status: 'results',
        sessionId: '',
        eligibleCount: 0,
        results: []
      };
    }

    const normalizedCandidates = rawDocs
      .slice(0, 20)
      .map((doc) => normalizeKakaoLocalCandidate(doc));
    const deduped = deduplicateCandidates(normalizedCandidates).slice(0, 15);
    logger.info('Candidates after normalization and deduplication', {
      dedupedCandidatesCount: deduped.length
    });

    const walkingAdapter = new KakaoMobilityAdapter();
    const drivingAdapter = new NaverDirectionsAdapter();

    const candidatesWithRoutes = [];

    for (const candidate of deduped) {
      const routeCacheKey = `route:${transportMode}:${location.lat.toFixed(5)}:${location.lng.toFixed(5)}:${candidate.location.lat.toFixed(5)}:${candidate.location.lng.toFixed(5)}`;
      try {
        let route;
        const cachedRoute = cache.get(routeCacheKey);
        if (cachedRoute) {
          logger.info('Cache HIT for route summary', { routeCacheKey });
          route = cachedRoute;
        } else {
          logger.info('Cache MISS for route summary', { routeCacheKey });
          if (transportMode === 'walk') {
            logger.info('Provider Call: Kakao Mobility walking route', {
              start: location,
              goal: candidate.location
            });
            const rawRoute = await walkingAdapter.getWalkingRoute(
              location.lat,
              location.lng,
              candidate.location.lat,
              candidate.location.lng
            );
            route = {
              durationMinutes: Math.round(
                rawRoute.routes[0].summary.duration / 60
              ),
              distanceMeters: Math.round(rawRoute.routes[0].summary.distance),
              path: []
            };
            if (rawRoute.routes[0].sections?.[0]?.roads) {
              for (const road of rawRoute.routes[0].sections[0].roads) {
                if (road.vertexes) {
                  for (let i = 0; i < road.vertexes.length; i += 2) {
                    route.path.push({
                      lng: road.vertexes[i],
                      lat: road.vertexes[i + 1]
                    });
                  }
                }
              }
            }
          } else {
            logger.info('Provider Call: NAVER Directions driving route', {
              start: location,
              goal: candidate.location
            });
            const rawRoute = await drivingAdapter.getDrivingRoute(
              location.lat,
              location.lng,
              candidate.location.lat,
              candidate.location.lng
            );
            route = {
              durationMinutes: Math.round(
                rawRoute.route.trafast[0].summary.duration / 1000 / 60
              ),
              distanceMeters: Math.round(
                rawRoute.route.trafast[0].summary.distance
              ),
              path: rawRoute.route.trafast[0].path.map((coord) => ({
                lng: coord[0],
                lat: coord[1]
              }))
            };
          }
          cache.set(routeCacheKey, route, cacheTTLs.ROUTE);
        }

        const merged = mergeCandidateWithRoute(candidate, route, transportMode);
        candidatesWithRoutes.push(merged);
      } catch (err) {
        logger.error('Provider Error: Route summary calculation failed', err, {
          candidateName: candidate.name,
          transportMode
        });
      }
    }

    logger.info('Candidates with successfully computed routes', {
      routedCandidatesCount: candidatesWithRoutes.length
    });

    if (candidatesWithRoutes.length === 0) {
      return {
        status: 'error',
        code: ErrorCodes.ROUTE_UNAVAILABLE,
        message: '경로 탐색에 실패했습니다.',
        missingFields: []
      };
    }

    const ranked = rankCandidates(candidatesWithRoutes, slots, now);
    logger.info('Candidates after deterministic ranking and filtering', {
      rankedCandidatesCount: ranked.length
    });

    ranked.forEach((item, index) => {
      logger.info(`Ranking breakdown for rank #${index + 1}`, {
        id: item.id,
        name: item.name,
        scoreTotal: item.scoreTotal,
        scoreComponents: item.scoreComponents,
        totalExpectedMinutes: item.totalExpectedMinutes,
        confidenceBadge: item.confidenceBadge
      });
    });

    const finalResults = [];
    for (const item of ranked) {
      const reason = await generateGroundedExplanationLLM(item, slots);
      finalResults.push({
        ...item,
        reason
      });
    }

    return {
      status: 'results',
      sessionId: '',
      eligibleCount: finalResults.length,
      results: finalResults
    };
  }
}

export const orchestrator = new OrchestratorService();
export default orchestrator;
