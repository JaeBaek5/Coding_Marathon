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
    error = null;
    loading = false;
    userLocation = null;
    selectedLocation = null;
    searchQuery = '';
    locationResults = [];
    activeResultIndex = 0;
  }

  function switchToTravelMode() {
    status = 'initial';
    mode = 'travel';
    error = null;
    loading = false;
    selectedLocation = null;
    userLocation = null;
    answers = {};
    missingFields = [];
    questions = [];
    results = [];
    locationResults = [];
    activeResultIndex = 0;
  }

  async function getGeolocation({ silent = false } = {}) {
    if (!navigator.geolocation) {
      if (!silent) {
        error = {
          code: 'UNSUPPORTED_BROWSER',
          message:
            '이 브라우저는 위치 권한 API를 지원하지 않습니다. 수동 위치 선택으로 진행하세요.'
        };
        status = 'error';
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
                '현재 위치 권한이 거부되어 추천을 시작할 수 없습니다. 이동/여행 모드로 전환해 수동으로 위치를 선택하세요.'
            };
            status = 'error';
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

    if (mode === 'normal') {
      const browserLocation = await getGeolocation();
      if (!browserLocation) {
        loading = false;
        return;
      }
    } else if (!selectedLocation) {
      error = {
        code: 'GEO_REQUIRED',
        message:
          '이동/여행 모드에서는 수동 위치 선택이 필요합니다. 출발지 후보를 먼저 선택하세요.'
      };
      status = 'error';
      loading = false;
      return;
    }

    const requestLocation = buildLocationPayload();
    if (!requestLocation) {
      error = {
        code: 'GEO_REQUIRED',
        message:
          '유효한 위치 정보를 가져오지 못했습니다. 위치를 다시 확인 후 재요청하세요.'
      };
      status = 'error';
      loading = false;
      return;
    }

    try {
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
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
      }
    } catch {
      error = {
        code: 'PROVIDER_ERROR',
        message: '서버와 연결할 수 없습니다. 잠시 후 다시 시도하세요.'
      };
      status = 'error';
    } finally {
      loading = false;
    }
  }

  async function submitAnswersWithPayload(answerPayload) {
    if (!sessionId) return;
    loading = true;
    error = null;

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
      }
    } catch {
      error = {
        code: 'PROVIDER_ERROR',
        message: '서버와 연결할 수 없습니다. 잠시 후 다시 시도하세요.'
      };
      status = 'error';
    } finally {
      loading = false;
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
    switchToTravelMode,
    initializeLocation,
    searchLocation,
    submitQuery,
    submitAnswers,
    submitFeedback,
    submitAnswersWithPayload
  };
}
