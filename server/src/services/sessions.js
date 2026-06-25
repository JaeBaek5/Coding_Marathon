const SESSION_TTL_MS = 30 * 60 * 1000;

class SessionStore {
  constructor() {
    this.sessions = new Map();
    this.maxAgentLogsPerSession = 100;
  }

  create(sessionId, initialSlots = {}) {
    const now = Date.now();
    const session = {
      id: sessionId,
      slots: { ...initialSlots },
      turnCount: 0,
      feedbackDislikeCount: 0,
      feedbackLikeCount: 0,
      agentCommunicationLog: [],
      likedCandidateIds: [],
      dislikedCandidateIds: [],
      currentRecommendationIndex: 0,
      candidates: [],
      candidatePool: [],
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
    if (updates.feedbackDislikeCount !== undefined) {
      session.feedbackDislikeCount = updates.feedbackDislikeCount;
    }
    if (updates.feedbackLikeCount !== undefined) {
      session.feedbackLikeCount = updates.feedbackLikeCount;
    }
    if (updates.currentRecommendationIndex !== undefined) {
      session.currentRecommendationIndex = updates.currentRecommendationIndex;
    }
    if (updates.likedCandidateIds !== undefined) {
      session.likedCandidateIds = updates.likedCandidateIds;
    }
    if (updates.dislikedCandidateIds !== undefined) {
      session.dislikedCandidateIds = updates.dislikedCandidateIds;
    }
    if (updates.agentCommunicationLog !== undefined) {
      session.agentCommunicationLog = updates.agentCommunicationLog;
    }

    session.updatedAt = Date.now();
    return session;
  }

  appendAgentCommunicationLog(sessionId, event) {
    const session = this.get(sessionId);
    if (!session) return null;
    const entry = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
      seq: typeof session.agentCommunicationLog?.length === 'number'
        ? session.agentCommunicationLog.length + 1
        : 1
    };

    if (!Array.isArray(session.agentCommunicationLog)) {
      session.agentCommunicationLog = [];
    }

    session.agentCommunicationLog.push(entry);
    if (session.agentCommunicationLog.length > this.maxAgentLogsPerSession) {
      session.agentCommunicationLog.splice(
        0,
        session.agentCommunicationLog.length - this.maxAgentLogsPerSession
      );
    }

    session.updatedAt = Date.now();
    return entry;
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
