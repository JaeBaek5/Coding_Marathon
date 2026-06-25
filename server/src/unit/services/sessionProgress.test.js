import { describe, it, expect, beforeEach } from 'vitest';
import { sessions } from '../../services/sessions.js';
import {
  getSessionProgress,
  resetSessionProgress,
  setSessionProgress
} from '../../services/sessionProgress.js';
import {
  formatMissingFieldsDetail,
  formatSlotsProgressDetail
} from '../../services/progressFormat.js';

describe('sessionProgress', () => {
  let sessionId;

  beforeEach(() => {
    sessionId = `ses_test_${Math.random().toString(36).slice(2, 8)}`;
    sessions.create(sessionId, {});
    resetSessionProgress(sessionId);
  });

  it('stores phase labels, elapsed time, and meta on each step', () => {
    setSessionProgress(sessionId, {
      phase: 'aleph',
      message: '입력 내용 분석 중',
      detail: '고기 먹고 싶다',
      meta: { 모드: '현재 위치' }
    });

    setSessionProgress(sessionId, {
      phase: 'bet_search',
      message: '식당 검색 중',
      detail: '반경 1km'
    });

    const progress = getSessionProgress(sessionId);
    expect(progress.steps).toHaveLength(2);
    expect(progress.steps[0].phaseLabel).toBe('Aleph · 조건 분석');
    expect(progress.steps[0].status).toBe('done');
    expect(progress.steps[0].durationMs).toBeTypeOf('number');
    expect(progress.steps[0].meta).toEqual({ 모드: '현재 위치' });
    expect(progress.steps[1].elapsedMs).toBeTypeOf('number');
    expect(progress.steps[1].status).toBe('active');
  });
});

describe('progressFormat', () => {
  it('summarizes slots for progress detail', () => {
    expect(
      formatSlotsProgressDetail({
        desiredFoods: ['고기', '삼겹살'],
        transportMode: 'walk',
        totalTimeMinutes: 60,
        mealPeriod: 'lunch',
        budgetPerPersonKrw: 20000,
        partyContext: '친구',
        vibe: '조용한'
      })
    ).toContain('음식 고기, 삼겹살');
  });

  it('maps missing fields to Korean labels', () => {
    expect(formatMissingFieldsDetail(['mealPeriod', 'transportMode'])).toBe(
      '식사 시간, 이동 수단'
    );
  });
});
