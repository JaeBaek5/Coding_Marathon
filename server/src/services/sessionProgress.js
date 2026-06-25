import { sessions } from './sessions.js';

export const PROGRESS_PHASE_LABELS = {
  aleph: 'Aleph · 조건 분석',
  aleph_llm: 'Aleph · AI 해석',
  aleph_food: 'Aleph · 음식 맞추기',
  aleph_questions: 'Aleph · 추가 질문',
  aleph_done: 'Aleph · 분석 완료',
  bet_search: 'Bet · 식당 검색',
  bet_search_done: 'Bet · 검색 완료',
  bet_routes: 'Bet · 경로 계산',
  bet_routes_done: 'Bet · 경로 완료',
  bet_reviews: 'Bet · 리뷰 분석',
  bet_reviews_done: 'Bet · 리뷰 완료',
  bet_llm_score: 'Bet · AI 적합도',
  bet_rank: 'Bet · 순위 산정',
  bet_rank_done: 'Bet · 선별 완료',
  gimel: 'Gimel · 추천 이유',
  gimel_candidate: 'Gimel · 이유 생성',
  complete: '완료'
};

function resolvePhaseLabel(phase) {
  if (typeof phase !== 'string' || !phase) {
    return '진행';
  }
  return PROGRESS_PHASE_LABELS[phase] || phase;
}

export function setSessionProgress(
  sessionId,
  { phase, message, detail = null, status = 'active', meta = null }
) {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  if (!Array.isArray(session.progressLog)) {
    session.progressLog = [];
  }

  const now = Date.now();
  let elapsedMs = null;

  for (const step of session.progressLog) {
    if (step.status === 'active') {
      step.status = 'done';
      if (typeof step.updatedAt === 'number') {
        step.durationMs = now - step.updatedAt;
      }
    }
  }

  const previous = session.progressLog[session.progressLog.length - 1];
  if (previous && typeof previous.updatedAt === 'number') {
    elapsedMs = now - previous.updatedAt;
  }

  const entry = {
    phase,
    phaseLabel: resolvePhaseLabel(phase),
    message,
    detail,
    status,
    updatedAt: now,
    ...(elapsedMs !== null ? { elapsedMs } : {}),
    ...(meta && typeof meta === 'object' ? { meta } : {})
  };

  session.progressLog.push(entry);
  session.progress = entry;
  session.updatedAt = now;
}

export function completeSessionProgress(sessionId, message = '완료', detail = null) {
  setSessionProgress(sessionId, {
    phase: 'complete',
    message,
    detail,
    status: 'done'
  });
}

export function getSessionProgress(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  return {
    current: session.progress || null,
    steps: session.progressLog || []
  };
}

export function resetSessionProgress(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  session.progress = null;
  session.progressLog = [];
}
