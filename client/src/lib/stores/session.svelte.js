export function createSessionStore() {
  let sessionId = $state(null);
  let status = $state('initial');
  let query = $state('');
  let mode = $state('normal');
  let answers = $state({});
  let missingFields = $state([]);
  let questions = $state([]);
  let results = $state([]);
  let error = $state(null);
  let loading = $state(false);
  let workflowStatus = $state('');
  let userLocation = $state(null);
  let selectedLocation = $state(null);
  let searchQuery = $state('');
  let locationResults = $state([]);
  let activeResultIndex = $state(0);
  let agentCommunicationLog = $state([]);
  let progressPollTimer = null;

  function createClientSessionId() {
    const randomPart =
      globalThis.crypto?.randomUUID?.().replaceAll('-', '').slice(0, 18) ||
      Math.random().toString(36).slice(2, 20);
    return `ses_${randomPart}`;
  }

  function workflowStatusFromLog(log) {
    const event = log?.event === 'bet_trace' ? log?.event || log?.phase : log?.event;
    const phase = log?.phase;
    if (!log) return '';

    if (event === 'request_entered') return '요청을 접수했습니다.';
    if (event === 'aleph_parse') return '요청 조건을 분석했습니다.';
    if (event === 'agent_hop' || event === 'bet_search_started') {
      return '주변 식당 후보를 검색하고 있습니다.';
    }
    if (event === 'bet_trace' && phase === 'radius_expansion') {
      return '후보가 부족해 검색 반경을 넓히고 있습니다.';
    }
    if (event === 'bet_route_lookup_started') {
      return '이동 시간과 경로를 계산하고 있습니다.';
    }
    if (event === 'bet_ranking_completed') {
      return '조건에 맞는 후보를 고르고 있습니다.';
    }
    if (event === 'gimel_worker_started') {
      return '네이버 리뷰를 병렬로 확인하고 있습니다.';
    }
    if (event === 'gimel_tool_started') {
      return '방문자 리뷰와 사진을 가져오고 있습니다.';
    }
    if (event === 'gimel_candidate_excluded_by_reviews') {
      return '부정 리뷰가 강한 후보를 제외했습니다.';
    }
    if (event === 'gimel_reasons' || event === 'gimel_reason_complete') {
      return '추천 근거를 정리하고 있습니다.';
    }
    if (event === 'feedback_applied') return '선호도를 반영하고 있습니다.';
    return workflowStatus;
  }

  function applyAgentLogs(logs) {
    if (!Array.isArray(logs)) return;
    agentCommunicationLog = logs;
    const latestStatus = logs
      .slice()
      .reverse()
      .map(workflowStatusFromLog)
      .find(Boolean);
    if (latestStatus) workflowStatus = latestStatus;
  }

  function stopProgressPolling() {
    if (progressPollTimer) {
      window.clearInterval(progressPollTimer);
      progressPollTimer = null;
    }
  }

  function startProgressPolling(targetSessionId) {
    stopProgressPolling();
    if (!targetSessionId) return;

    progressPollTimer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/sessions/${targetSessionId}/logs`);
        if (!response.ok) return;
        const data = await response.json();
        applyAgentLogs(data.agentCommunicationLog);
      } catch {
        return;
      }
    }, 700);
  }

  function reset() {
    sessionId = null;
    status = 'initial';
    query = '';
    mode = 'normal';
    answers = {};
    missingFields = [];
    questions = [];
    results = [];
    agentCommunicationLog = [];
    error = null;
    loading = false;
    workflowStatus = '';
    userLocation = null;
    selectedLocation = null;
    searchQuery = '';
    locationResults = [];
    activeResultIndex = 0;
    stopProgressPolling();
  }

  function switchToTravelMode() {
    status = 'initial';
    mode = 'travel';
    error = null;
    loading = false;
    workflowStatus = '';
    selectedLocation = null;
    userLocation = null;
    answers = {};
    missingFields = [];
    questions = [];
    results = [];
    agentCommunicationLog = [];
    locationResults = [];
    activeResultIndex = 0;
    stopProgressPolling();
  }

  async function getGeolocation({ silent = false } = {}) {
    if (!navigator.geolocation) {
      if (!silent) {
        error = {
          code: 'UNSUPPORTED_BROWSER',
          message:
            '브라우저가 위치 권한 API를 지원하지 않습니다. 이동/여행 모드에서 위치를 직접 선택해 주세요.'
        };
        status = 'error';
        workflowStatus = '';
      }
      return null;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = position.coords;
          const loc = {
            lat: coords.latitude,
            lng: coords.longitude,
            source: 'browser-geolocation'
          };
          if (typeof coords.accuracy === 'number') {
            loc.accuracyMeters = coords.accuracy;
          }
          userLocation = loc;
          resolve(loc);
        },
        () => {
          if (!silent) {
            error = {
              code: 'GEO_REQUIRED',
              message:
                '현재 위치 권한이 필요합니다. 권한을 허용하거나 이동/여행 모드에서 위치를 직접 선택해 주세요.'
            };
            status = 'error';
            workflowStatus = '';
          }
          resolve(null);
        },
        { timeout: 10000 }
      );
    });
  }

  function initializeLocation() {
    getGeolocation({ silent: true });
  }

  async function searchLocation(keyword) {
    if (!keyword) {
      locationResults = [];
      return;
    }
    try {
      const response = await fetch(
        `/api/location-search?q=${encodeURIComponent(keyword)}`
      );
      if (response.ok) {
        locationResults = await response.json();
      } else {
        locationResults = [];
      }
    } catch {
      locationResults = [];
    }
  }

  function buildLocationPayload() {
    if (mode === 'travel' && selectedLocation?.coords) {
      return {
        lat: selectedLocation.coords.lat,
        lng: selectedLocation.coords.lng,
        source: selectedLocation.source || 'manual-location',
        accuracyMeters: selectedLocation.accuracyMeters
      };
    }

    if (userLocation) {
      return {
        lat: userLocation.lat,
        lng: userLocation.lng,
        source: userLocation.source || 'browser-geolocation',
        accuracyMeters: userLocation.accuracyMeters
      };
    }

    return null;
  }

  async function submitQuery() {
    if (!query.trim()) return;
    loading = true;
    error = null;
    status = 'loading';
    workflowStatus = '요청을 보내고 있습니다.';
    results = [];
    activeResultIndex = 0;
    agentCommunicationLog = [];

    if (mode === 'normal') {
      const browserLocation = await getGeolocation();
      if (!browserLocation) {
        status = 'error';
        workflowStatus = '';
        loading = false;
        stopProgressPolling();
        return;
      }
    } else if (!selectedLocation) {
      error = {
        code: 'GEO_REQUIRED',
        message:
          '이동/여행 모드에서는 출발 위치 선택이 필요합니다. 출발지 후보를 먼저 선택해 주세요.'
      };
      status = 'error';
      workflowStatus = '';
      loading = false;
      stopProgressPolling();
      return;
    }

    const requestLocation = buildLocationPayload();
    if (!requestLocation) {
      error = {
        code: 'GEO_REQUIRED',
        message:
          '유효한 위치 정보를 가져오지 못했습니다. 위치를 다시 확인한 뒤 재요청해 주세요.'
      };
      status = 'error';
      workflowStatus = '';
      loading = false;
      stopProgressPolling();
      return;
    }

    const pendingSessionId = createClientSessionId();
    sessionId = pendingSessionId;
    startProgressPolling(pendingSessionId);

    try {
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          clientSessionId: pendingSessionId,
          mode,
          location: requestLocation,
          userLocation:
            mode === 'normal'
              ? {
                  lat: requestLocation.lat,
                  lng: requestLocation.lng
                }
              : null,
          selectedLocation:
            mode === 'travel' && selectedLocation
              ? {
                  ...selectedLocation.coords,
                  name: selectedLocation.name,
                  address: selectedLocation.address
                }
              : null,
          now: new Date().toISOString()
        })
      });

      const data = await response.json();
      if (response.ok || data.status) {
        handleApiResponse(data);
      } else {
        error = {
          code: data.code || 'PROVIDER_ERROR',
          message: data.message || '추천 요청 처리 중 문제가 발생했습니다.'
        };
        status = 'error';
        workflowStatus = '';
      }
    } catch {
      error = {
        code: 'PROVIDER_ERROR',
        message: '서버와 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'
      };
      status = 'error';
      workflowStatus = '';
    } finally {
      loading = false;
      if (!error) {
        workflowStatus = '';
      }
      stopProgressPolling();
    }
  }

  async function submitAnswersWithPayload(answerPayload) {
    if (!sessionId) return;
    loading = true;
    error = null;
    activeResultIndex = 0;
    results = [];
    agentCommunicationLog = [];
    const isFeedback = isFeedbackPayload(answerPayload);
    workflowStatus = isFeedback
      ? '선호도를 반영하고 있습니다.'
      : '답변을 보내고 있습니다.';
    startProgressPolling(sessionId);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answerPayload })
      });

      const data = await response.json();
      if (response.ok || data.status) {
        handleApiResponse(data);
      } else {
        error = {
          code: data.code || 'PROVIDER_ERROR',
          message: data.message || '답변 처리 중 문제가 발생했습니다.'
        };
        status = 'error';
        workflowStatus = '';
      }
    } catch {
      error = {
        code: 'PROVIDER_ERROR',
        message: '서버와 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'
      };
      status = 'error';
      workflowStatus = '';
    } finally {
      loading = false;
      if (!error) {
        workflowStatus = '';
      }
      stopProgressPolling();
    }
  }

  async function submitAnswers() {
    return submitAnswersWithPayload(answers);
  }

  function submitFeedback(action, candidateId) {
    return submitAnswersWithPayload({
      action: String(action || '').toLowerCase(),
      ...(candidateId ? { candidateId } : {})
    });
  }

  function isFeedbackPayload(payload = {}) {
    const action = String(payload?.action || '').toLowerCase();
    return action === 'like' || action === 'dislike';
  }

  function handleApiResponse(data) {
    if (data.status === 'questions') {
      sessionId = data.sessionId;
      status = 'questions';
      workflowStatus = '추가 질문에 답변해주세요.';
      missingFields = data.missingFields || [];
      questions = data.questions || [];
      agentCommunicationLog = data.agentCommunicationLog || [];
      data.questions.forEach((q) => {
        if (!(q.field in answers)) {
          answers[q.field] =
            q.field === 'excludedFoods'
              ? []
              : q.field === 'budgetPerPersonKrw'
                ? 10000
                : '';
        }
      });
    } else if (data.status === 'results') {
      sessionId = data.sessionId;
      status = 'results';
      workflowStatus = '';
      results = data.results || [];
      agentCommunicationLog = data.agentCommunicationLog || [];
      activeResultIndex = 0;
    } else if (data.status === 'error') {
      error = {
        code: data.code,
        message: data.message,
        missingFields: data.missingFields || []
      };
      status = 'error';
      workflowStatus = '';
    }
  }

  return {
    get sessionId() {
      return sessionId;
    },
    get status() {
      return status;
    },
    set status(val) {
      status = val;
    },
    get query() {
      return query;
    },
    set query(val) {
      query = val;
    },
    get mode() {
      return mode;
    },
    set mode(val) {
      mode = val;
    },
    get answers() {
      return answers;
    },
    get missingFields() {
      return missingFields;
    },
    get questions() {
      return questions;
    },
    get results() {
      return results;
    },
    get error() {
      return error;
    },
    set error(val) {
      error = val;
    },
    get loading() {
      return loading;
    },
    get workflowStatus() {
      return workflowStatus;
    },
    get userLocation() {
      return userLocation;
    },
    get selectedLocation() {
      return selectedLocation;
    },
    set selectedLocation(val) {
      selectedLocation = val;
    },
    get searchQuery() {
      return searchQuery;
    },
    set searchQuery(val) {
      searchQuery = val;
    },
    get locationResults() {
      return locationResults;
    },
    get activeResultIndex() {
      return activeResultIndex;
    },
    set activeResultIndex(val) {
      activeResultIndex = val;
    },
    get agentCommunicationLog() {
      return agentCommunicationLog;
    },
    reset,
    switchToTravelMode,
    initializeLocation,
    searchLocation,
    submitQuery,
    submitAnswers,
    submitFeedback,
    submitAnswersWithPayload
  };
}
