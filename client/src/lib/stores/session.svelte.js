function createSessionStoreInternal() {
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
  let activitySteps = $state([]);
  let userLocation = $state(null);
  let selectedLocation = $state(null);
  let searchQuery = $state('');
  let locationResults = $state([]);
  let activeResultIndex = $state(0);
  let displayMode = $state('single');
  let locationStatus = $state('idle');
  let locationMessage = $state('');
  let locationFetchPromise = null;
  let mapTravelTimeMinutes = $state(60);
  let mapTransportMode = $state('walk');

  const GEOLOCATION_OPTIONS = {
    timeout: 12000,
    maximumAge: 60000,
    enableHighAccuracy: true
  };
  const GPS_ATTEMPT_MS = 14000;
  const PROGRESS_POLL_MS = 500;

  let progressPollTimer = null;

  function stopProgressPolling() {
    if (progressPollTimer) {
      clearInterval(progressPollTimer);
      progressPollTimer = null;
    }
  }

  async function pollProgressOnce(id) {
    if (!id) {
      return;
    }

    try {
      const response = await fetch(`/api/sessions/${id}/progress`);
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      if (Array.isArray(data.steps)) {
        activitySteps = data.steps;
      }
    } catch {
      // 서버 진행 상태만 표시 — 폴링 실패 시 기존 단계 유지
    }
  }

  function startProgressPolling(id) {
    stopProgressPolling();
    activitySteps = [];
    if (!id) {
      return;
    }

    void pollProgressOnce(id);
    progressPollTimer = setInterval(() => {
      void pollProgressOnce(id);
    }, PROGRESS_POLL_MS);
  }

  function reset() {
    stopProgressPolling();
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
    activitySteps = [];
    userLocation = null;
    selectedLocation = null;
    searchQuery = '';
    locationResults = [];
    activeResultIndex = 0;
    displayMode = 'single';
    locationStatus = 'idle';
    locationMessage = '';
    locationFetchPromise = null;
    mapTravelTimeMinutes = 60;
    mapTransportMode = 'walk';
    void bootstrapLocation();
  }

  function switchToTravelMode() {
    stopProgressPolling();
    status = 'initial';
    mode = 'travel';
    error = null;
    loading = false;
    activitySteps = [];
    selectedLocation = null;
    userLocation = null;
    answers = {};
    missingFields = [];
    questions = [];
    results = [];
    locationResults = [];
    activeResultIndex = 0;
    displayMode = 'single';
    locationStatus = 'idle';
    locationMessage = '';
    locationFetchPromise = null;
  }

  function formatLocationSummary(location) {
    if (!location) return '';
    if (location.label) {
      return location.label;
    }
    const lat = location.lat.toFixed(4);
    const lng = location.lng.toFixed(4);
    const accuracy =
      typeof location.accuracyMeters === 'number'
        ? ` · 정확도 약 ${Math.round(location.accuracyMeters)}m`
        : '';
    return `${lat}, ${lng}${accuracy}`;
  }

  function applyManualLocation(loc) {
    const coords = loc?.coords || loc?.location;
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
      return false;
    }

    userLocation = {
      lat: coords.lat,
      lng: coords.lng,
      source: 'manual-location',
      label: loc.name || loc.address || null
    };
    locationStatus = 'ready';
    locationMessage = loc.name
      ? `선택한 위치 · ${loc.name}`
      : `선택한 위치 · ${formatLocationSummary(userLocation)}`;
    return true;
  }

  function clearUserLocation() {
    userLocation = null;
    locationStatus = 'idle';
    locationMessage = '';
    locationFetchPromise = null;
  }

  function normalizeIpLocationPayload(data) {
    if (!data) {
      return null;
    }

    const lat = Number(data.lat);
    const lng = Number(data.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    return {
      lat,
      lng,
      source: 'ip-geolocation',
      label: data.label || 'IP 추정 위치',
      accuracyMeters: data.accuracyMeters ?? 5000
    };
  }

  async function fetchReverseLabel(lat, lng) {
    try {
      const response = await fetch(
        `/api/location/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&_=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return typeof data.label === 'string' && data.label.trim()
        ? data.label.trim()
        : null;
    } catch {
      return null;
    }
  }

  async function fetchIpLocation() {
    const response = await fetch(`/api/location/ip?_=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      }
    });
    const data = await response.json();
    return normalizeIpLocationPayload(data);
  }

  async function tryGpsLocation() {
    if (!window.isSecureContext || !navigator.geolocation) {
      return null;
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), GPS_ATTEMPT_MS);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timer);
          const coords = position.coords;
          resolve({
            lat: coords.latitude,
            lng: coords.longitude,
            source: 'browser-geolocation',
            ...(typeof coords.accuracy === 'number'
              ? { accuracyMeters: coords.accuracy }
              : {})
          });
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        },
        GEOLOCATION_OPTIONS
      );
    });
  }

  function applyResolvedLocation(location, { viaGps = false, viaIp = false } = {}) {
    userLocation = location;
    locationStatus = 'ready';
    if (viaGps) {
      locationMessage = location.label
        ? `내 위치 · ${location.label}${formatAccuracySuffix(location)}`
        : `내 위치 · ${formatLocationSummary(location)}`;
    } else if (viaIp) {
      locationMessage = location.label
        ? `대략 위치 · ${location.label} (IP 추정)`
        : `대략 위치 · ${formatLocationSummary(location)} (IP 추정)`;
    } else {
      locationMessage = `위치 선택됨 · ${formatLocationSummary(location)}`;
    }
    return location;
  }

  function formatAccuracySuffix(location) {
    if (typeof location.accuracyMeters !== 'number') {
      return '';
    }
    return ` · 정확도 약 ${Math.round(location.accuracyMeters)}m`;
  }

  async function bootstrapLocation() {
    if (mode !== 'normal') {
      return null;
    }

    if (locationStatus === 'ready' && userLocation) {
      return userLocation;
    }

    if (locationFetchPromise) {
      return locationFetchPromise;
    }

    locationStatus = 'acquiring';
    locationMessage =
      '내 위치 확인 중... 브라우저에서 위치 허용을 눌러 주세요.';

    locationFetchPromise = (async () => {
      try {
        const gpsLocation = await tryGpsLocation();
        if (gpsLocation) {
          const label = await fetchReverseLabel(gpsLocation.lat, gpsLocation.lng);
          return applyResolvedLocation(
            label ? { ...gpsLocation, label } : gpsLocation,
            { viaGps: true }
          );
        }

        locationMessage = 'GPS를 사용할 수 없어 대략 위치를 확인 중...';
        const ipLocation = await fetchIpLocation();
        if (ipLocation) {
          return applyResolvedLocation(ipLocation, { viaIp: true });
        }

        locationStatus = 'failed';
        locationMessage =
          '자동 위치 확인에 실패했습니다. 아래 검색창에 지역명(예: 순천역, 강남역)을 입력해 주세요.';
        return null;
      } catch {
        locationStatus = 'failed';
        locationMessage =
          '자동 위치 확인에 실패했습니다. 아래 검색창에 지역명(예: 순천역, 강남역)을 입력해 주세요.';
        return null;
      } finally {
        locationFetchPromise = null;
      }
    })();

    return locationFetchPromise;
  }

  function restartLocationAcquisition() {
    if (mode !== 'normal') {
      return;
    }

    clearUserLocation();
    void bootstrapLocation();
  }

  async function getGeolocation() {
    return bootstrapLocation();
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

  async function prepareProgressSession() {
    try {
      const response = await fetch('/api/sessions', { method: 'POST' });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return typeof data.sessionId === 'string' ? data.sessionId : null;
    } catch {
      return null;
    }
  }

  async function finalizeProgressSnapshot(id) {
    if (!id) {
      return;
    }
    stopProgressPolling();
    await pollProgressOnce(id);
  }

  async function submitQuery() {
    if (!query.trim()) return;
    loading = true;
    error = null;

    if (mode === 'normal') {
      if (locationStatus !== 'ready') {
        error = {
          code: 'GEO_REQUIRED',
          message:
            locationStatus === 'acquiring'
              ? '위치 확인이 끝날 때까지 잠시만 기다려 주세요.'
              : '위치를 먼저 확인하거나 아래 검색창에서 지역을 선택해 주세요.'
        };
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
      const progressSessionId = await prepareProgressSession();
      if (progressSessionId) {
        sessionId = progressSessionId;
        startProgressPolling(progressSessionId);
      }

      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          mode,
          ...(progressSessionId ? { sessionId: progressSessionId } : {}),
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
      await finalizeProgressSnapshot(sessionId);
      loading = false;
    }
  }

  async function submitAnswersWithPayload(answerPayload) {
    if (!sessionId) return;
    loading = true;
    error = null;

    try {
      startProgressPolling(sessionId);
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
      await finalizeProgressSnapshot(sessionId);
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
            q.field === 'excludedFoods' || q.field === 'desiredFoods'
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
      displayMode = data.displayMode || 'single';
      activeResultIndex = 0;
    displayMode = 'single';
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
    get activitySteps() {
      return activitySteps;
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
    get displayMode() {
      return displayMode;
    },
    get locationStatus() {
      return locationStatus;
    },
    get locationMessage() {
      return locationMessage;
    },
    get mapTravelTimeMinutes() {
      return mapTravelTimeMinutes;
    },
    set mapTravelTimeMinutes(val) {
      const minutes = Number(val);
      mapTravelTimeMinutes = Number.isFinite(minutes) ? minutes : mapTravelTimeMinutes;
    },
    get mapTransportMode() {
      return mapTransportMode;
    },
    set mapTransportMode(val) {
      if (val === 'walk' || val === 'drive') {
        mapTransportMode = val;
      }
    },
    get locationSummary() {
      return formatLocationSummary(userLocation);
    },
    reset,
    switchToTravelMode,
    searchLocation,
    bootstrapLocation,
    restartLocationAcquisition,
    applyManualLocation,
    clearUserLocation,
    submitQuery,
    submitAnswers,
    submitFeedback,
    submitAnswersWithPayload
  };
}

export const session = createSessionStoreInternal();

export function createSessionStore() {
  return session;
}
