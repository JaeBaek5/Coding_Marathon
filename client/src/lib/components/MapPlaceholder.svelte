<script>
  import { onMount } from 'svelte';
  import {
    TOTAL_TIME_MIN_MINUTES,
    computeMaxOneWayTravelMinutes,
    computeTravelRadiusMeters,
    formatTravelRadiusKm
  } from '../utils/travelRange.js';

  const { session } = $props();
  let mapRootEl = $state(null);
  let mapContainerEl = $state(null);
  let mapInitialized = $state(false);
  let loadError = $state(null);

  // Naver Maps 인스턴스는 $state로 두면 $effect 안에서 갱신 시 무한 루프가 납니다.
  let mapInstance = null;
  let originMarker = null;
  let resultMarkers = [];
  let activePolyline = null;
  let activeInfoWindow = null;
  let travelRangeCircle = null;
  let resizeObserver = null;

  const DEFAULT_MAP_CENTER = { lat: 36.5, lng: 127.5 };

  function getMapCenter() {
    return getOriginCoords() || DEFAULT_MAP_CENTER;
  }

  function getOriginMarkerHtml() {
    const background = resolveMapToken('--map-marker-origin-bg', 'backgroundColor');
    const border = resolveMapToken('--map-marker-border', 'borderColor');
    const shadow = resolveMapToken('--map-marker-origin-shadow', 'boxShadow');
    const foreground = resolveMapToken('--map-marker-foreground', 'color');

    return `<div style="width:28px;height:28px;background:${background};border:3px solid ${border};border-radius:50%;box-shadow:${shadow};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${foreground};">출</div>`;
  }

  function getResultMarkerHtml(index) {
    const background = resolveMapToken('--map-marker-result-bg', 'backgroundColor');
    const border = resolveMapToken('--map-marker-border', 'borderColor');
    const shadow = resolveMapToken('--map-marker-result-shadow', 'boxShadow');
    const foreground = resolveMapToken('--map-marker-foreground', 'color');

    return `<div style="width:26px;height:26px;background:${background};border:2px solid ${border};border-radius:50%;box-shadow:${shadow};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${foreground};cursor:pointer;">${index + 1}</div>`;
  }

  function getActiveMarkerHtml(index) {
    const background = resolveMapToken('--map-marker-result-bg', 'backgroundColor');
    const border = resolveMapToken('--map-marker-active-border', 'borderColor');
    const shadow = resolveMapToken('--map-marker-active-shadow', 'boxShadow');
    const foreground = resolveMapToken('--map-marker-foreground', 'color');

    return `<div style="width:32px;height:32px;background:${background};border:3px solid ${border};border-radius:50%;box-shadow:${shadow};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:${foreground};cursor:pointer;">${index + 1}</div>`;
  }

  function resolveMapToken(customProperty, styleProperty) {
    if (!mapRootEl) return `var(${customProperty})`;

    const probe = document.createElement('span');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style[styleProperty] = `var(${customProperty})`;
    mapRootEl.appendChild(probe);
    const resolvedValue = getComputedStyle(probe)[styleProperty];
    probe.remove();

    return resolvedValue;
  }

  async function loadNaverSdk() {
    if (window.naver && window.naver.maps) {
      return;
    }
    try {
      const res = await fetch('/api/config/public');
      const config = await res.json();
      const clientId = config.naverClientId;
      if (!config.mapReady || !clientId) {
        loadError =
          'NAVER 지도 API 키가 설정되지 않았습니다. server/.env에 NAVER_CLIENT_ID를 넣어 주세요.';
        return;
      }
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
          loadError = 'NAVER 지도 SDK를 불러오지 못했습니다.';
          reject(new Error('SDK load failed'));
        };
        document.head.appendChild(script);
      });
    } catch {
      loadError = '지도 설정을 불러오지 못했습니다.';
    }
  }

  function getOriginCoords() {
    if (session.mode === 'travel' && session.selectedLocation?.coords) {
      return session.selectedLocation.coords;
    }
    if (session.userLocation?.lat != null && session.userLocation?.lng != null) {
      return session.userLocation;
    }
    return null;
  }

  function getResultItems() {
    return Array.isArray(session.results) ? session.results : [];
  }

  function buildRoutePath(activeItem) {
    const origin = getOriginCoords();
    if (!origin || !activeItem?.location) {
      return [];
    }

    if (Array.isArray(activeItem.path) && activeItem.path.length >= 2) {
      return activeItem.path;
    }

    return [
      { lat: origin.lat, lng: origin.lng },
      { lat: activeItem.location.lat, lng: activeItem.location.lng }
    ];
  }

  function getTravelRadiusMeters() {
    return computeTravelRadiusMeters(
      session.mapTravelTimeMinutes,
      session.mapTransportMode
    );
  }

  function getOneWayTravelMinutes() {
    return computeMaxOneWayTravelMinutes(session.mapTravelTimeMinutes);
  }

  function clearTravelRangeCircle() {
    if (travelRangeCircle) {
      travelRangeCircle.setMap(null);
      travelRangeCircle = null;
    }
  }

  function renderTravelRange() {
    clearTravelRangeCircle();
    if (!mapInstance) return;

    const origin = getOriginCoords();
    const minutes = Number(session.mapTravelTimeMinutes);
    if (!origin || !Number.isFinite(minutes) || minutes < TOTAL_TIME_MIN_MINUTES) {
      return;
    }

    const radius = getTravelRadiusMeters();
    if (radius <= 0) return;

    travelRangeCircle = new window.naver.maps.Circle({
      map: mapInstance,
      center: new window.naver.maps.LatLng(origin.lat, origin.lng),
      radius,
      fillColor: resolveMapToken('--map-range-fill', 'backgroundColor'),
      fillOpacity: 0.16,
      strokeColor: resolveMapToken('--map-range-stroke', 'borderColor'),
      strokeOpacity: 0.75,
      strokeWeight: 2,
      zIndex: 10
    });
  }

  function fitMapToTravelRange() {
    if (!mapInstance) return;

    const origin = getOriginCoords();
    const radius = getTravelRadiusMeters();
    if (!origin || radius <= 0) return;

    const latDelta = radius / 111_320;
    const lngDelta =
      radius / (111_320 * Math.cos((origin.lat * Math.PI) / 180));

    const bounds = new window.naver.maps.LatLngBounds(
      new window.naver.maps.LatLng(origin.lat - latDelta, origin.lng - lngDelta),
      new window.naver.maps.LatLng(origin.lat + latDelta, origin.lng + lngDelta)
    );

    mapInstance.fitBounds(bounds, {
      top: 120,
      right: 72,
      bottom: 96,
      left: 72
    });
  }

  function buildRouteBounds(activeItem) {
    const origin = getOriginCoords();
    const routePath = activeItem ? buildRoutePath(activeItem) : [];
    const points = [];

    if (origin) {
      points.push({ lat: origin.lat, lng: origin.lng });
    }

    if (activeItem?.location) {
      points.push({
        lat: activeItem.location.lat,
        lng: activeItem.location.lng
      });
    }

    for (const point of routePath) {
      const exists = points.some(
        (entry) => entry.lat === point.lat && entry.lng === point.lng
      );
      if (!exists) {
        points.push(point);
      }
    }

    return points;
  }

  function createBoundsFromPoints(points) {
    if (!points.length || !window.naver?.maps) {
      return null;
    }

    const bounds = new window.naver.maps.LatLngBounds(
      new window.naver.maps.LatLng(points[0].lat, points[0].lng),
      new window.naver.maps.LatLng(points[0].lat, points[0].lng)
    );

    for (const point of points) {
      bounds.extend(new window.naver.maps.LatLng(point.lat, point.lng));
    }

    const southWest = bounds.getSW();
    const northEast = bounds.getNE();
    const minSpan = 0.0015;
    const latSpan = northEast.lat() - southWest.lat();
    const lngSpan = northEast.lng() - southWest.lng();

    if (latSpan < minSpan && lngSpan < minSpan) {
      const center = bounds.getCenter();
      const half = minSpan / 2;
      return new window.naver.maps.LatLngBounds(
        new window.naver.maps.LatLng(center.lat() - half, center.lng() - half),
        new window.naver.maps.LatLng(center.lat() + half, center.lng() + half)
      );
    }

    return bounds;
  }

  function fitMapToRoute(activeItem) {
    if (!mapInstance) return;

    const points = buildRouteBounds(activeItem);
    if (points.length === 0) return;

    if (points.length === 1) {
      mapInstance.setZoom(15);
      mapInstance.panTo(new window.naver.maps.LatLng(points[0].lat, points[0].lng));
      return;
    }

    const bounds = createBoundsFromPoints(points);
    if (!bounds) return;

    mapInstance.fitBounds(bounds, {
      top: 72,
      right: 72,
      bottom: 96,
      left: 72
    });

    window.requestAnimationFrame(() => {
      resizeMap();
      const zoom = mapInstance.getZoom();
      if (typeof zoom === 'number' && zoom > 16) {
        mapInstance.setZoom(16);
      }
    });
  }

  function syncMapViewport() {
    const items = getResultItems();
    const activeItem = items[session.activeResultIndex];
    const origin = getOriginCoords();

    if (activeItem?.location && origin) {
      fitMapToRoute(activeItem);
      return;
    }

    if (origin && getTravelRadiusMeters() > 0) {
      fitMapToTravelRange();
      return;
    }

    if (origin) {
      mapInstance.setZoom(15);
      mapInstance.panTo(new window.naver.maps.LatLng(origin.lat, origin.lng));
      return;
    }

    if (activeItem?.location) {
      mapInstance.setZoom(15);
      mapInstance.panTo(
        new window.naver.maps.LatLng(activeItem.location.lat, activeItem.location.lng)
      );
    }
  }

  function resizeMap() {
    if (!mapInstance) return;
    mapInstance.autoResize?.();
    window.naver?.maps?.Event?.trigger(mapInstance, 'resize');
  }

  function initMap() {
    if (!mapContainerEl || !window.naver?.maps || mapInitialized) {
      return;
    }

    const centerCoords = getMapCenter();
    const center = new window.naver.maps.LatLng(centerCoords.lat, centerCoords.lng);
    mapInstance = new window.naver.maps.Map(mapContainerEl, {
      center,
      zoom: getOriginCoords() ? 15 : 7,
      zoomControl: true,
      zoomControlOptions: {
        position: window.naver.maps.Position.TOP_RIGHT
      },
      mapDataControl: false,
      scaleControl: false
    });

    mapInitialized = true;

    const origin = getOriginCoords();
    if (origin) {
      renderOriginMarker(origin);
    }
    renderResultMarkers();
    renderActiveRoute();
    renderTravelRange();
    syncMapViewport();

    window.naver.maps.Event.once(mapInstance, 'init', () => {
      resizeMap();
    });

    if (typeof ResizeObserver !== 'undefined' && mapContainerEl) {
      resizeObserver = new ResizeObserver(() => {
        resizeMap();
        const items = getResultItems();
        const activeItem = items[session.activeResultIndex];
        if (activeItem?.location && getOriginCoords()) {
          fitMapToRoute(activeItem);
        }
      });
      resizeObserver.observe(mapContainerEl);
    }
  }

  function renderOriginMarker(origin) {
    if (!mapInstance || !origin) return;
    if (originMarker) originMarker.setMap(null);

    originMarker = new window.naver.maps.Marker({
      position: new window.naver.maps.LatLng(origin.lat, origin.lng),
      map: mapInstance,
      icon: {
        content: getOriginMarkerHtml(),
        anchor: new window.naver.maps.Point(14, 14)
      },
      zIndex: 100,
      title: '내 위치'
    });
  }

  function clearOriginMarker() {
    if (originMarker) {
      originMarker.setMap(null);
      originMarker = null;
    }
  }

  function renderResultMarkers() {
    if (!mapInstance) return;

    for (const marker of resultMarkers) {
      marker.setMap(null);
    }
    resultMarkers = [];

    const items = getResultItems();
    if (!items.length) return;

    items.forEach((item, index) => {
      if (!item?.location) return;

      const isActive = session.activeResultIndex === index;
      const position = new window.naver.maps.LatLng(item.location.lat, item.location.lng);

      const marker = new window.naver.maps.Marker({
        position,
        map: mapInstance,
        icon: {
          content: isActive ? getActiveMarkerHtml(index) : getResultMarkerHtml(index),
          anchor: new window.naver.maps.Point(isActive ? 16 : 13, isActive ? 16 : 13)
        },
        zIndex: isActive ? 50 : 30,
        title: item.name
      });

      window.naver.maps.Event.addListener(marker, 'click', () => {
        session.activeResultIndex = index;
      });

      resultMarkers.push(marker);
    });
  }

  function renderActiveRoute() {
    if (!mapInstance) return;

    if (activePolyline) {
      activePolyline.setMap(null);
      activePolyline = null;
    }
    if (activeInfoWindow) {
      activeInfoWindow.close();
      activeInfoWindow = null;
    }

    const items = getResultItems();
    const activeItem = items[session.activeResultIndex];
    if (!activeItem?.location) return;

    const routePath = buildRoutePath(activeItem);
    if (routePath.length >= 2) {
      const pathCoords = routePath.map(
        (point) => new window.naver.maps.LatLng(point.lat, point.lng)
      );
      activePolyline = new window.naver.maps.Polyline({
        map: mapInstance,
        path: pathCoords,
        strokeColor: resolveMapToken('--map-route-stroke', 'color'),
        strokeWeight: 4,
        strokeOpacity: 0.85,
        strokeStyle: 'solid'
      });
    }

    syncMapViewport();

    const infoForeground = resolveMapToken('--map-info-foreground', 'color');
    const infoMuted = resolveMapToken('--map-info-muted', 'color');
    const infoContent = `
      <div style="padding:8px 12px;font-family:var(--font-sans);max-width:200px;color:${infoForeground};">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${activeItem.name}</div>
        <div style="font-size:12px;color:${infoMuted};">${activeItem.category} · ${activeItem.totalExpectedMinutes}분</div>
      </div>
    `;
    activeInfoWindow = new window.naver.maps.InfoWindow({
      content: infoContent,
      borderWidth: 0,
      backgroundColor: resolveMapToken('--map-info-bg', 'backgroundColor'),
      borderRadius: resolveMapToken('--map-info-radius', 'borderRadius'),
      boxShadow: resolveMapToken('--map-info-shadow', 'boxShadow')
    });

    const anchorMarker = resultMarkers[session.activeResultIndex];
    if (anchorMarker) {
      activeInfoWindow.open(mapInstance, anchorMarker);
    } else {
      activeInfoWindow.open(
        mapInstance,
        new window.naver.maps.LatLng(activeItem.location.lat, activeItem.location.lng)
      );
    }
  }

  function focusOnOrigin() {
    const items = getResultItems();
    const activeItem = items[session.activeResultIndex];
    if (activeItem?.location && getOriginCoords()) {
      fitMapToRoute(activeItem);
      return;
    }

    const origin = getOriginCoords();
    if (!mapInstance || !origin) return;

    renderOriginMarker(origin);
    mapInstance.setZoom(15);
    mapInstance.panTo(new window.naver.maps.LatLng(origin.lat, origin.lng));
  }

  $effect(() => {
    session.results;
    session.status;
    session.activeResultIndex;
    if (mapInitialized) {
      renderResultMarkers();
      renderActiveRoute();
    }
  });

  $effect(() => {
    session.userLocation;
    session.selectedLocation;
    session.mode;
    session.locationStatus;
    session.results;
    session.activeResultIndex;
    if (!mapInitialized || !mapInstance) return;

    const origin = getOriginCoords();
    if (!origin) {
      clearOriginMarker();
      return;
    }

    renderOriginMarker(origin);
    syncMapViewport();
    resizeMap();
  });

  $effect(() => {
    if (!mapContainerEl || mapInitialized) return;

    void (async () => {
      try {
        await loadNaverSdk();
        if (!loadError && window.naver?.maps) {
          initMap();
        }
      } catch {
        if (!loadError) {
          loadError = 'NAVER 지도 SDK를 불러오지 못했습니다.';
        }
      }
    })();
  });

  onMount(() => {
    return () => {
      clearTravelRangeCircle();
      resizeObserver?.disconnect();
      resizeObserver = null;
    };
  });

  const travelRadiusKm = $derived(formatTravelRadiusKm(getTravelRadiusMeters()));
  const oneWayTravelMinutes = $derived(getOneWayTravelMinutes());
  const showTravelRange = $derived(
    Boolean(getOriginCoords()) &&
      Number(session.mapTravelTimeMinutes) >= TOTAL_TIME_MIN_MINUTES
  );

  function handleMapTimeInput(event) {
    session.mapTravelTimeMinutes = event.currentTarget.value;
  }

  function selectMapTransport(mode) {
    session.mapTransportMode = mode;
  }

  $effect(() => {
    const answerMinutes = Number(session.answers?.totalTimeMinutes);
    if (Number.isFinite(answerMinutes) && answerMinutes >= TOTAL_TIME_MIN_MINUTES) {
      session.mapTravelTimeMinutes = answerMinutes;
    }

    const answerTransport = session.answers?.transportMode;
    if (answerTransport === 'walk' || answerTransport === 'drive') {
      session.mapTransportMode = answerTransport;
    }
  });

  $effect(() => {
    session.mapTravelTimeMinutes;
    session.mapTransportMode;
    session.userLocation;
    session.selectedLocation;
    session.mode;
    if (!mapInitialized) return;

    renderTravelRange();
    const items = getResultItems();
    const activeItem = items[session.activeResultIndex];
    if (!activeItem?.location) {
      syncMapViewport();
    }
  });
</script>

<div
  bind:this={mapRootEl}
  class="map-placeholder"
  class:map-loaded={mapInitialized}
  data-testid="naver-map"
>
  <div bind:this={mapContainerEl} class="map-container"></div>

  {#if loadError}
    <div class="map-error-overlay" data-testid="map-error">
      <p class="map-error-text">{loadError}</p>
    </div>
  {/if}

  {#if !mapInitialized && !loadError}
    <div class="map-loading-overlay" data-testid="map-loading">
      <div class="map-loading-spinner"></div>
      <p class="map-loading-text">지도를 불러오는 중...</p>
    </div>
  {/if}

  {#if mapInitialized && getOriginCoords()}
    <div class="map-time-controls" data-testid="map-time-controls">
      <div class="map-time-row">
        <label class="map-time-label" for="map-travel-time">여유 시간</label>
        <input
          id="map-travel-time"
          type="number"
          class="map-time-input"
          min={TOTAL_TIME_MIN_MINUTES}
          step="5"
          value={session.mapTravelTimeMinutes}
          oninput={handleMapTimeInput}
        />
        <span class="map-time-unit">분</span>
      </div>
      <div class="map-transport-row">
        <button
          type="button"
          class="map-transport-btn {session.mapTransportMode === 'walk' ? 'selected' : ''}"
          onclick={() => selectMapTransport('walk')}
        >
          도보
        </button>
        <button
          type="button"
          class="map-transport-btn {session.mapTransportMode === 'drive' ? 'selected' : ''}"
          onclick={() => selectMapTransport('drive')}
        >
          차량
        </button>
      </div>
      {#if showTravelRange}
        <p class="map-range-hint" data-testid="map-range-hint">
          편도 약 {oneWayTravelMinutes}분 · {travelRadiusKm}km 이내 이동 범위
        </p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .map-placeholder {
    --map-marker-origin-bg: color-mix(in oklch, var(--primary) 72%, var(--background));
    --map-marker-result-bg: var(--destructive);
    --map-marker-foreground: var(--destructive-foreground);
    --map-marker-border: var(--background);
    --map-marker-active-border: var(--ring);
    --map-marker-origin-shadow: 0 2px 8px color-mix(in oklch, var(--foreground) 30%, transparent);
    --map-marker-result-shadow: 0 2px 6px color-mix(in oklch, var(--foreground) 25%, transparent);
    --map-marker-active-shadow: 0 3px 12px color-mix(in oklch, var(--destructive) 40%, transparent);
    --map-route-stroke: var(--destructive);
    --map-range-fill: color-mix(in oklch, var(--primary) 28%, transparent);
    --map-range-stroke: color-mix(in oklch, var(--primary) 72%, var(--background));
    --map-info-bg: var(--card);
    --map-info-foreground: var(--card-foreground);
    --map-info-muted: var(--muted-foreground);
    --map-info-radius: var(--rounded-md);
    --map-info-shadow: 0 4px 16px color-mix(in oklch, var(--foreground) 12%, transparent);
    --map-overlay-bg: color-mix(in oklch, var(--background) 85%, transparent);

    position: relative;
    height: 100%;
    min-height: 400px;
    width: 100%;
    overflow: hidden;
    border-radius: var(--rounded-md);
    background-color: var(--color-surface-bone);
    border: 1px solid var(--color-hairline);
  }

  .map-container {
    width: 100%;
    height: 100%;
    min-height: 400px;
  }

  .map-loading-overlay,
  .map-error-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    background-color: var(--map-overlay-bg);
    z-index: 10;
  }

  .map-loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-hairline);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .map-loading-text {
    font-size: 14px;
    color: var(--color-mute);
  }

  .map-error-text {
    font-size: 14px;
    color: var(--color-primary);
    font-weight: 600;
    text-align: center;
    padding: var(--spacing-md);
  }

  .map-time-controls {
    position: absolute;
    top: var(--spacing-sm);
    left: var(--spacing-sm);
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--rounded-md);
    background-color: color-mix(in oklch, var(--card) 92%, transparent);
    border: 1px solid var(--color-hairline-strong);
    box-shadow: 0 4px 16px color-mix(in oklch, var(--foreground) 10%, transparent);
    max-width: calc(100% - 2 * var(--spacing-sm));
  }

  .map-time-row,
  .map-transport-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .map-time-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--color-charcoal);
    white-space: nowrap;
  }

  .map-time-input {
    width: 72px;
    height: 32px;
    border: 1px solid var(--color-hairline-strong);
    border-radius: var(--rounded-sm);
    padding: 0 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-ink);
    background: var(--color-surface-card);
  }

  .map-time-unit {
    font-size: 12px;
    color: var(--color-mute);
    font-weight: 600;
  }

  .map-transport-btn {
    height: 30px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid var(--color-hairline-strong);
    background: var(--color-surface-card);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-charcoal);
    cursor: pointer;
  }

  .map-transport-btn.selected {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-surface-card);
  }

  .map-range-hint {
    margin: 0;
    font-size: 11px;
    color: var(--color-mute);
    line-height: 1.4;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
