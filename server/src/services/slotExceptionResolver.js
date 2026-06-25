import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { TOTAL_TIME_MIN_MINUTES } from '../../../shared/contracts/schemas.js';
import { createAgentChatCompletion } from '../llm/client.js';
import { SLOT_AI_TIMEOUT_MS } from '../config/performance.js';

const SlotFixOutputSchema = z.object({
  totalTimeMinutes: z.number().int().positive().nullable().optional(),
  rationale: z.string().optional()
});

function inferTimeFromQuery(userQuery = '') {
  if (/(한|1)\s*시간/.test(userQuery)) {
    return 60;
  }
  const hourMatch = userQuery.match(/(\d+)\s*시간/);
  if (hourMatch) {
    return Number.parseInt(hourMatch[1], 10) * 60;
  }
  const minuteMatch = userQuery.match(/(\d+)\s*분/);
  if (minuteMatch) {
    return Number.parseInt(minuteMatch[1], 10);
  }
  if (/반나절|오전.*오후|하루/.test(userQuery)) {
    return 240;
  }
  return null;
}

export function resolveTotalTimeMinutesHeuristic(minutes, userQuery = '') {
  if (typeof minutes === 'string') {
    const parsed = Number.parseInt(minutes.replace(/[^\d]/g, ''), 10);
    minutes = Number.isNaN(parsed) ? null : parsed;
  }

  if (typeof minutes === 'number' && Number.isFinite(minutes)) {
    const rounded = Math.round(minutes);
    if (rounded >= TOTAL_TIME_MIN_MINUTES) {
      return {
        value: rounded,
        adjusted: rounded !== minutes,
        reason: 'accepted'
      };
    }
    if (rounded > 0) {
      return {
        value: TOTAL_TIME_MIN_MINUTES,
        adjusted: true,
        reason: 'clamped_to_min'
      };
    }
  }

  const inferred = inferTimeFromQuery(userQuery);
  if (inferred !== null) {
    return {
      value: Math.max(TOTAL_TIME_MIN_MINUTES, inferred),
      adjusted: true,
      reason: 'inferred_from_query'
    };
  }

  return {
    value: 60,
    adjusted: true,
    reason: 'default_fallback'
  };
}

async function resolveTotalTimeWithAI(minutes, userQuery = '') {
  try {
    const completion = await Promise.race([
      createAgentChatCompletion('aleph', {
        messages: [
          {
            role: 'system',
            content:
              'Pick the best total meal time budget in minutes for the user. No upper limit. Minimum 20 minutes unless the user clearly has less time, then use 20. Return JSON only.'
          },
          {
            role: 'user',
            content: JSON.stringify({
              userQuery,
              parsedMinutes: minutes ?? null,
              minimumMinutes: TOTAL_TIME_MIN_MINUTES
            })
          }
        ],
        response_format: zodResponseFormat(SlotFixOutputSchema, 'slot_fix')
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('slot_ai_timeout')), SLOT_AI_TIMEOUT_MS)
      )
    ]);

    const parsed = SlotFixOutputSchema.safeParse(
      completion?.choices?.[0]?.message?.parsed
    );
    if (
      parsed.success &&
      typeof parsed.data.totalTimeMinutes === 'number' &&
      parsed.data.totalTimeMinutes >= TOTAL_TIME_MIN_MINUTES
    ) {
      return {
        value: parsed.data.totalTimeMinutes,
        adjusted: true,
        reason: 'ai_resolved',
        rationale: parsed.data.rationale || null
      };
    }
  } catch {
    // fall through to heuristic
  }

  return resolveTotalTimeMinutesHeuristic(minutes, userQuery);
}

export async function resolveSlotExceptions(slots, userQuery = '', options = {}) {
  const resolved = { ...slots };
  const adjustments = [];
  const useAi = options.useAi !== false;

  if (
    resolved.totalTimeMinutes !== undefined &&
    resolved.totalTimeMinutes !== null &&
    resolved.totalTimeMinutes < TOTAL_TIME_MIN_MINUTES
  ) {
    const fix = useAi
      ? await resolveTotalTimeWithAI(resolved.totalTimeMinutes, userQuery)
      : resolveTotalTimeMinutesHeuristic(
          resolved.totalTimeMinutes,
          userQuery
        );
    resolved.totalTimeMinutes = fix.value;
    adjustments.push({ field: 'totalTimeMinutes', ...fix });
  } else if (typeof resolved.totalTimeMinutes === 'number') {
    const rounded = Math.round(resolved.totalTimeMinutes);
    if (rounded !== resolved.totalTimeMinutes) {
      resolved.totalTimeMinutes = rounded;
      adjustments.push({
        field: 'totalTimeMinutes',
        value: rounded,
        adjusted: true,
        reason: 'rounded'
      });
    }
  }

  return { slots: resolved, adjustments };
}
