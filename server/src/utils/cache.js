export class InMemoryCache {
  constructor(nowProvider = () => Date.now()) {
    this.store = new Map();
    this.now = nowProvider;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    if (this.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key, value, ttlMs) {
    const expiresAt = this.now() + ttlMs;
    this.store.set(key, { value, expiresAt });
  }

  async wrap(key, ttlMs, fn) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const result = await fn();
    this.set(key, result, ttlMs);
    return result;
  }

  clear() {
    this.store.clear();
  }
}

export const cacheTTLs = {
  LOCATION: 24 * 60 * 60 * 1000,
  NEARBY: 10 * 60 * 1000,
  ROUTE: 3 * 60 * 1000
};

export const cache = new InMemoryCache();
