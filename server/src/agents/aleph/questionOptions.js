import { TOTAL_TIME_MIN_MINUTES } from '../../../../shared/contracts/schemas.js';
import {
  QUESTION_LABELS,
  getDefaultOptionsForField
} from '../../../../shared/contracts/questionPresets.js';

export { QUESTION_LABELS, getDefaultOptionsForField };

function normalizeOptionValue(field, value) {
  if (
    (field === 'totalTimeMinutes' || field === 'budgetPerPersonKrw') &&
    typeof value === 'string'
  ) {
    const parsedNumber = Number.parseInt(value.replace(/[^\d]/g, ''), 10);
    return Number.isNaN(parsedNumber) ? value : parsedNumber;
  }
  if (field === 'excludedFoods' && typeof value === 'string') {
    if (['없음', '없어', '다 잘먹'].includes(value.trim())) {
      return [];
    }
    return [value];
  }
  if (field === 'desiredFoods' && typeof value === 'string') {
    return [value];
  }
  return value;
}

export function validateQuestionOption(field, fieldSchema, rawValue) {
  if (!fieldSchema) {
    return null;
  }

  const normalized = normalizeOptionValue(field, rawValue);
  const result = fieldSchema.safeParse(normalized);
  if (!result.success) {
    return null;
  }

  if (field === 'totalTimeMinutes') {
    const minutes = result.data;
    if (minutes < TOTAL_TIME_MIN_MINUTES) {
      return null;
    }
  }

  return result.data;
}

export function validateQuestionOptions(field, fieldSchema, options = []) {
  const validated = [];
  const seen = new Set();

  for (const option of options) {
    if (!option?.label || option.value === undefined || option.value === null) {
      continue;
    }

    const value = validateQuestionOption(field, fieldSchema, option.value);
    if (value === null) {
      continue;
    }

    const key = JSON.stringify(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    validated.push({
      label: String(option.label).trim(),
      value
    });
  }

  return validated;
}

function normalizeDefaultOptions(field, options = [], fieldSchema) {
  if (!options.length) {
    return [];
  }

  if (!fieldSchema) {
    return options;
  }

  const validated = validateQuestionOptions(field, fieldSchema, options);
  return validated.length ? validated : options;
}

export function buildDefaultQuestion(
  field,
  partialSlots = {},
  userQuery = '',
  fieldSchemas = {}
) {
  const rawOptions = getDefaultOptionsForField(field, partialSlots, userQuery);
  const options = normalizeDefaultOptions(
    field,
    rawOptions || [],
    fieldSchemas[field]
  );
  const question = {
    field,
    label: QUESTION_LABELS[field] || `${field} 정보를 입력해 주세요.`
  };

  if (options.length) {
    question.options = options;
  }

  return question;
}

export function buildDefaultQuestions(
  missingFields,
  partialSlots = {},
  userQuery = '',
  fieldSchemas = {}
) {
  return missingFields.map((field) =>
    buildDefaultQuestion(field, partialSlots, userQuery, fieldSchemas)
  );
}

function resolveQuestionOptions({
  field,
  baseOptions,
  llmOptions,
  partialSlots,
  userQuery,
  fieldSchema
}) {
  if (
    field === 'desiredFoods' &&
    Array.isArray(partialSlots.foodPreferenceScores) &&
    partialSlots.foodPreferenceScores.length > 0 &&
    baseOptions?.length >= 2
  ) {
    return baseOptions;
  }

  if (llmOptions.length >= 2) {
    return llmOptions;
  }

  if (baseOptions?.length) {
    return baseOptions;
  }

  const fallback = getDefaultOptionsForField(field, partialSlots, userQuery);
  if (!fallback?.length) {
    return llmOptions.length ? llmOptions : undefined;
  }

  return normalizeDefaultOptions(field, fallback, fieldSchema);
}

export function mergeFollowUpQuestions(
  missingFields,
  defaultQuestions,
  llmQuestions,
  fieldSchemas,
  partialSlots = {},
  userQuery = ''
) {
  const defaultsByField = new Map(defaultQuestions.map((q) => [q.field, q]));
  const llmByField = new Map((llmQuestions || []).map((q) => [q.field, q]));

  return missingFields.map((field) => {
    const base =
      defaultsByField.get(field) ||
      buildDefaultQuestion(field, partialSlots, userQuery, fieldSchemas);
    const llm = llmByField.get(field);
    const fieldSchema = fieldSchemas[field];
    const llmOptions = validateQuestionOptions(
      field,
      fieldSchema,
      llm?.options
    );
    const label =
      typeof llm?.label === 'string' && llm.label.trim()
        ? llm.label.trim()
        : base.label;
    const options = resolveQuestionOptions({
      field,
      baseOptions: base.options,
      llmOptions,
      partialSlots,
      userQuery,
      fieldSchema
    });

    return {
      field,
      label,
      ...(options?.length ? { options } : {})
    };
  });
}
