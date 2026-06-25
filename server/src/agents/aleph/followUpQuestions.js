import { zodResponseFormat } from 'openai/helpers/zod';
import { createAgentChatCompletion } from '../../llm/client.js';
import { AlephFollowUpQuestionsSchema } from '../../../../shared/contracts/schemas.js';
import { mergeFollowUpQuestions } from './questionOptions.js';
import { FAST_MODE } from '../../config/performance.js';

function summarizeSlots(slots = {}) {
  return Object.entries(slots)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: ${value.join(', ')}`;
      }
      if (typeof value === 'object') {
        return `${key}: set`;
      }
      return `${key}: ${value}`;
    })
    .join('\n');
}

export async function generateFollowUpQuestions({
  missingFields,
  partialSlots = {},
  userQuery = '',
  fieldSchemas,
  buildDefaultQuestions
}) {
  const defaultQuestions = buildDefaultQuestions(
    missingFields,
    partialSlots,
    userQuery
  );

  if (missingFields.length === 0 || FAST_MODE) {
    return defaultQuestions;
  }

  try {
    const completion = await createAgentChatCompletion('aleph', {
      messages: [
        {
          role: 'system',
          content: [
            'You generate Korean follow-up questions for a restaurant recommendation app.',
            'Return one question per missing field with 2-6 tap-friendly button options.',
            'Each option value must be schema-valid for its field.',
            'mealPeriod values: breakfast, lunch, dinner, late_night.',
            'transportMode values: walk, drive.',
            'totalTimeMinutes must be an integer of at least 20 with no upper limit.',
            'budgetPerPersonKrw must be a positive integer in KRW.',
            'excludedFoods option values are either [] for none or a single food string.',
            'desiredFoods option values must be a single Mumuk catalog food id string (e.g. 삼겹살, 국밥, 짜장면).',
            'Tailor labels to the user query context without inventing unknown constraints.'
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            `User query: ${userQuery || '(없음)'}`,
            `Known slots:\n${summarizeSlots(partialSlots) || '(없음)'}`,
            `Missing fields: ${missingFields.join(', ')}`
          ].join('\n\n')
        }
      ],
      response_format: zodResponseFormat(
        AlephFollowUpQuestionsSchema,
        'follow_up_questions'
      )
    });

    const parsed = AlephFollowUpQuestionsSchema.safeParse(
      completion?.choices?.[0]?.message?.parsed
    );

    if (!parsed.success) {
      return defaultQuestions;
    }

    return mergeFollowUpQuestions(
      missingFields,
      defaultQuestions,
      parsed.data.questions,
      fieldSchemas,
      partialSlots,
      userQuery
    );
  } catch {
    return defaultQuestions;
  }
}
