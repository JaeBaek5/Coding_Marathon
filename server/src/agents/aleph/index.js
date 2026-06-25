import { createAgentChatCompletion } from '../../llm/client.js';
import { zodResponseFormat } from 'openai/helpers/zod';
import {
  AlephParseOutputSchema,
  AlephMissingSlotOutputSchema,
  SlotPriorityOrder,
  SlotSchema,
  ErrorCodes
} from '../../../../shared/contracts/schemas.js';

const MAX_ROUNDS = 2;

export async function parseQuery(query, currentState = {}, round = 1) {
  if (round > MAX_ROUNDS) {
    return {
      status: 'error',
      code: ErrorCodes.SESSION_EXPIRED,
      message: 'Max rounds exceeded',
      missingFields: []
    };
  }

  const parseCompletion = await createAgentChatCompletion('aleph', {
    messages: [
      {
        role: 'user',
        content: query
      }
    ],
    response_format: zodResponseFormat(AlephParseOutputSchema, 'slot_parsing')
  });

  const parsedSlots = parseCompletion.choices[0].message.parsed;

  const mergedSlots = { ...currentState };
  for (const key of Object.keys(AlephParseOutputSchema.shape)) {
    if (parsedSlots[key] !== null && parsedSlots[key] !== undefined) {
      mergedSlots[key] = parsedSlots[key];
    }
  }

  return validateAndProcessSlots(mergedSlots);
}

export async function processAnswers(answers, currentState = {}) {
  const mergedSlots = { ...currentState };
  for (const [key, value] of Object.entries(answers)) {
    mergedSlots[key] = value;
  }

  return validateAndProcessSlots(mergedSlots);
}

async function validateAndProcessSlots(mergedSlots) {
  const validationResult = SlotSchema.safeParse(mergedSlots);

  if (validationResult.success) {
    return {
      status: 'complete',
      slots: validationResult.data
    };
  }

  const errors = validationResult.error.format();
  const missingOrInvalidFields = [];

  for (const field of SlotPriorityOrder) {
    if (errors[field]) {
      missingOrInvalidFields.push(field);
    }
  }

  if (
    mergedSlots.totalTimeMinutes !== undefined &&
    mergedSlots.totalTimeMinutes !== null
  ) {
    if (
      mergedSlots.totalTimeMinutes < 20 ||
      mergedSlots.totalTimeMinutes > 60
    ) {
      return {
        status: 'error',
        code: ErrorCodes.INVALID_TOTAL_TIME,
        message: 'Total time must be between 20 and 60 minutes.',
        missingFields: []
      };
    }
  }

  if (missingOrInvalidFields.length === 0) {
    return {
      status: 'complete',
      slots: mergedSlots
    };
  }

  const questionCompletion = await createAgentChatCompletion('aleph', {
    messages: [
      {
        role: 'user',
        content: `Ask the user for the following missing information: ${missingOrInvalidFields.join(', ')}`
      }
    ],
    response_format: zodResponseFormat(
      AlephMissingSlotOutputSchema,
      'missing_slots'
    )
  });

  const questionData = questionCompletion.choices[0].message.parsed;

  return {
    status: 'questions',
    missingFields: questionData.missingFields,
    questions: questionData.questions,
    currentState: mergedSlots
  };
}
