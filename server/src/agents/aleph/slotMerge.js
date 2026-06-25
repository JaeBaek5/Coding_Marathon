/**
 * Merge slot layers with LLM output winning over rule-based fallbacks.
 * Earlier layers fill gaps; the LLM layer always wins when it provides a value.
 */
export function mergeSlotsWithLlmPriority(llmSlots = {}, ...fallbackLayers) {
  const merged = {};

  for (const layer of fallbackLayers) {
    if (!layer) {
      continue;
    }
    for (const [key, value] of Object.entries(layer)) {
      if (value !== null && value !== undefined && merged[key] === undefined) {
        merged[key] = value;
      }
    }
  }

  for (const [key, value] of Object.entries(llmSlots)) {
    if (value !== null && value !== undefined) {
      merged[key] = value;
    }
  }

  return merged;
}
