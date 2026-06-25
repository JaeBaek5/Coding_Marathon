export async function mapWithConcurrencyLimit(items, limit, mapper) {
  if (items.length === 0) {
    return [];
  }

  const normalizedLimit = Math.min(
    items.length,
    Number.isInteger(limit) && limit > 0 ? limit : 1
  );
  const results = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: normalizedLimit }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}
