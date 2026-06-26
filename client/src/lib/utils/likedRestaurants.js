const STORAGE_KEY = 'mumuk-liked-restaurants';
const MAX_ITEMS = 50;

function normalizeEntry(item) {
  if (!item?.id || !item?.name) {
    return null;
  }

  return {
    id: String(item.id),
    name: String(item.name),
    category: item.category ? String(item.category) : '',
    address: item.address ? String(item.address) : '',
    placeUrl: item.placeUrl ? String(item.placeUrl) : null,
    mainPhoto: item.mainPhoto ? String(item.mainPhoto) : null,
    likedAt: new Date().toISOString()
  };
}

export function loadLikedRestaurants() {
  if (typeof localStorage === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistLikedRestaurants(items) {
  if (typeof localStorage === 'undefined') {
    return items;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  return items;
}

export function saveLikedRestaurant(item) {
  const entry = normalizeEntry(item);
  if (!entry) {
    return loadLikedRestaurants();
  }

  const current = loadLikedRestaurants().filter(
    (saved) => saved.id !== entry.id
  );
  const next = [entry, ...current].slice(0, MAX_ITEMS);
  return persistLikedRestaurants(next);
}

export function removeLikedRestaurant(candidateId) {
  const next = loadLikedRestaurants().filter(
    (saved) => saved.id !== String(candidateId)
  );
  return persistLikedRestaurants(next);
}

export function isRestaurantLiked(candidateId, items = loadLikedRestaurants()) {
  return items.some((saved) => saved.id === String(candidateId));
}
