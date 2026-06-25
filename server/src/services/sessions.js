const SESSION_TTL_MS = 30 * 60 * 1000;

class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  create(sessionId, initialSlots = {}) {
    const now = Date.now();
    const session = {
      id: sessionId,
      slots: { ...initialSlots },
      turnCount: 0,
      candidates: [],
      candidatePool: [],
      likedIds: [],
      dislikedIds: [],
      dislikeCount: 0,
      showFullPool: false,
      createdAt: now,
      updatedAt: now
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId) {
    this.cleanExpired();
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const now = Date.now();
    if (now - session.updatedAt > SESSION_TTL_MS) {
      this.sessions.delete(sessionId);
      return null;
    }

    session.updatedAt = now;
    return session;
  }

  update(sessionId, updates) {
    const session = this.get(sessionId);
    if (!session) return null;

    if (updates.slots) {
      session.slots = { ...session.slots, ...updates.slots };
    }
    if (updates.turnCount !== undefined) {
      session.turnCount = updates.turnCount;
    }
    if (updates.candidates !== undefined) {
      session.candidates = updates.candidates;
    }
    if (updates.candidatePool !== undefined) {
      session.candidatePool = updates.candidatePool;
    }
    if (updates.likedIds !== undefined) {
      session.likedIds = updates.likedIds;
    }
    if (updates.dislikedIds !== undefined) {
      session.dislikedIds = updates.dislikedIds;
    }
    if (updates.dislikeCount !== undefined) {
      session.dislikeCount = updates.dislikeCount;
    }
    if (updates.showFullPool !== undefined) {
      session.showFullPool = updates.showFullPool;
    }

    session.updatedAt = Date.now();
    return session;
  }

  delete(sessionId) {
    return this.sessions.delete(sessionId);
  }

  clear() {
    this.sessions.clear();
  }

  cleanExpired() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.updatedAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }

  size() {
    this.cleanExpired();
    return this.sessions.size;
  }
}

export const sessions = new SessionStore();
export default sessions;
