export function createSessionStore() {
  let sessionId = $state(null);
  let status = $state('initial');
  let query = $state('');
  let mode = $state('normal');
  let answers = $state({});
  let missingFields = $state([]);
  let questions = $state([]);
  let results = $state([]);
  let currentRecommendation = $state(null);
  let candidatePool = $state([]);
  let showFullPool = $state(false);
  let error = $state(null);
  let loading = $state(false);
  let userLocation = $state(null);
  let selectedLocation = $state(null);
  let searchQuery = $state('');
  let locationResults = $state([]);
  let activeResultIndex = $state(0);

  function reset() {
    sessionId = null;
    status = 'initial';
    query = '';
    mode = 'normal';
    answers = {};
    missingFields = [];
    questions = [];
    results = [];
    currentRecommendation = null;
    candidatePool = [];
    showFullPool = false;
    error = null;
    loading = false;
    userLocation = null;
    selectedLocation = null;
    searchQuery = '';
    locationResults = [];
    activeResultIndex = 0;
  }

  async function getGeolocation() {
    if (!navigator.geolocation) {
      error = {
        code: 'UNSUPPORTED_BROWSER',
        message: '이 브라우저는 위치 정보를 지원하지 않습니다.'
      };
      status = 'error';
      return null;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyMeters: position.coords.accuracy ?? null,
            source: 'browser-geolocation'
          };
          userLocation = loc;
          resolve(loc);
        },
        () => {
          error = {
            code: 'GEO_REQUIRED',
            message:
              '현재 위치 정보를 가져올 수 없습니다. 출장/여행 모드로 변경하여 검색해 보세요.'
          };
          status = 'error';
          resolve(null);
        },
        { timeout: 10000 }
      );
    });
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

  async function submitQuery() {
    if (!query.trim()) return;
    loading = true;
    error = null;

    let locationToUse = null;
    if (mode === 'normal') {
      locationToUse = await getGeolocation();
      if (!locationToUse) {
        loading = false;
        return;
      }
    } else {
      if (!selectedLocation) {
        error = {
          code: 'GEO_REQUIRED',
          message:
            '출장/여행 모드에서는 먼저 가실 위치를 검색 후 선택해 주세요.'
        };
        status = 'error';
        loading = false;
        return;
      }
      locationToUse = selectedLocation.coords;
    }

    try {
      const selectedLocationPayload =
        mode === 'travel' && selectedLocation
          ? {
              coords: {
                ...selectedLocation.coords,
                source: 'selected-location'
              },
              name: selectedLocation.name,
              address: selectedLocation.address
            }
          : null;

      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          mode,
          userLocation: mode === 'normal' ? locationToUse : null,
          selectedLocation: selectedLocationPayload,
          now: new Date().toISOString()
        })
      });

      const data = await response.json();
      if (response.ok || data.status) {
        handleApiResponse(data);
      } else {
        error = {
          code: data.code || 'PROVIDER_ERROR',
          message: data.message || '추천 서비스 호출에 실패했습니다.'
        };
        status = 'error';
      }
    } catch {
      error = {
        code: 'PROVIDER_ERROR',
        message:
          '서버와 통신하는 도중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
      };
      status = 'error';
    } finally {
      loading = false;
    }
  }

  async function submitAnswers() {
    if (!sessionId) return;
    loading = true;
    error = null;

    try {
      const response = await fetch(`/api/sessions/${sessionId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers })
      });

      const data = await response.json();
      if (response.ok || data.status) {
        handleApiResponse(data);
      } else {
        error = {
          code: data.code || 'PROVIDER_ERROR',
          message: data.message || '답변 제출에 실패했습니다.'
        };
        status = 'error';
      }
    } catch {
      error = {
        code: 'PROVIDER_ERROR',
        message:
          '서버와 통신하는 도중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
      };
      status = 'error';
    } finally {
      loading = false;
    }
  }

  function handleApiResponse(data) {
    if (data.status === 'questions') {
      sessionId = data.sessionId;
      status = 'questions';
      missingFields = data.missingFields || [];
      questions = data.questions || [];
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
      results = data.results || [];
      currentRecommendation = data.currentRecommendation || results[0] || null;
      candidatePool = data.candidatePool || results;
      showFullPool = Boolean(data.showFullPool);
      activeResultIndex = 0;
    } else if (data.status === 'error') {
      error = {
        code: data.code,
        message: data.message,
        missingFields: data.missingFields || []
      };
      status = 'error';
    }
  }

  async function submitFeedback(action, candidateId) {
    if (!sessionId || !candidateId) return;
    loading = true;
    error = null;

    try {
      const response = await fetch(`/api/sessions/${sessionId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, candidateId })
      });

      const data = await response.json();
      if (response.ok || data.status) {
        handleApiResponse(data);
      } else {
        error = {
          code: data.code || 'PROVIDER_ERROR',
          message: data.message || '피드백 제출에 실패했습니다.'
        };
        status = 'error';
      }
    } catch {
      error = {
        code: 'PROVIDER_ERROR',
        message:
          '서버와 통신하는 도중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
      };
      status = 'error';
    } finally {
      loading = false;
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
    get currentRecommendation() {
      return currentRecommendation;
    },
    get candidatePool() {
      return candidatePool;
    },
    get showFullPool() {
      return showFullPool;
    },
    get displayResults() {
      if (showFullPool) {
        return candidatePool;
      }
      if (currentRecommendation) {
        return [currentRecommendation];
      }
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
    reset,
    searchLocation,
    submitQuery,
    submitAnswers,
    submitFeedback
  };
}
