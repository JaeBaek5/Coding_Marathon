<script>
  const { session } = $props();
  let mapRootEl = $state(null);
  let mapContainerEl = $state(null);
  let mapInstance = $state(null);
  let mapInitialized = $state(false);
  let loadError = $state(null);
  let naverMapsLoaded = $state(false);
  let originMarker = null;
  let resultMarkers = [];
  let activePolyline = null;
  let activeInfoWindow = null;
  let renderProbeTimer = null;

  function getOriginMarkerHtml() {
    const background = resolveMapToken('--map-marker-origin-bg', 'backgroundColor');
    const border = resolveMapToken('--map-marker-border', 'borderColor');
    const shadow = resolveMapToken('--map-marker-origin-shadow', 'boxShadow');
    const foreground = resolveMapToken('--map-marker-foreground', 'color');

    return `<div style="width:28px;height:28px;background:${background};border:3px solid ${border};border-radius:50%;box-shadow:${shadow};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${foreground};">O</div>`;
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

  function getDisplayResults() {
    return session.results ?? [];
  }

  function getActiveResultIndex(itemsLength) {
    const rawIndex = Number(session.activeResultIndex);
    if (!Number.isInteger(rawIndex) || rawIndex < 0 || rawIndex >= itemsLength) {
      return 0;
    }
    return rawIndex;
  }

  function hasCoords(item) {
    return (
      item &&
      item.location &&
      Number.isFinite(item.location.lat) &&
      Number.isFinite(item.location.lng)
    );
  }

  function setMapError(message) {
    if (!loadError) {
      loadError = message;
      if (renderProbeTimer) {
        clearTimeout(renderProbeTimer);
        renderProbeTimer = null;
      }
      console.error('[MapPlaceholder] mapError:', message);
    }
  }

  function resetMapState() {
    if (renderProbeTimer) {
      clearTimeout(renderProbeTimer);
      renderProbeTimer = null;
    }
    if (activeInfoWindow) {
      activeInfoWindow.close();
      activeInfoWindow = null;
    }
    if (activePolyline) {
      activePolyline.setMap(null);
      activePolyline = null;
    }
    for (const marker of resultMarkers) {
      marker.setMap(null);
    }
    resultMarkers = [];
    if (originMarker) {
      originMarker.setMap(null);
      originMarker = null;
    }
  }

  async function loadNaverSdk() {
    if (window.naver && window.naver.maps) {
      naverMapsLoaded = true;
      return;
    }

    try {
      const res = await fetch('/api/config/public');
      const config = await res.json();
      const clientId = config.naverClientId;
      if (!config.mapReady || !clientId) {
        loadError =
          'Naver 지도 API 키 설정이 없습니다. server/.env의 NAVER_CLIENT_ID를 확인하세요.';
        return;
      }

      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${clientId}`;
        script.async = true;
        script.onload = () => {
          if (window.naver?.maps) {
            console.debug('[MapPlaceholder] NAVER SDK loaded');
            naverMapsLoaded = true;
          } else {
            setMapError(
              'NAVER Maps SDK가 로드되었지만 API 객체를 사용할 수 없습니다. 키/도메인 인증을 확인하세요.'
            );
          }
          resolve();
        };
        script.onerror = () => {
          setMapError('Naver Maps SDK 로드에 실패했습니다.');
          reject(new Error('SDK load failed'));
        };
        document.head.appendChild(script);
      });
    } catch {
      setMapError('지도 설정을 불러오지 못했습니다.');
    }
  }

  function getOriginCoords() {
    if (session.mode === 'travel' && session.selectedLocation) {
      return session.selectedLocation.coords;
    }
    return session.userLocation;
  }

  function initMap() {
    if (!mapContainerEl || !window.naver || !window.naver.maps) {
      return;
    }

    const origin = getOriginCoords();
    if (!origin) {
      console.debug('[MapPlaceholder] initMap waiting for origin coordinates');
      return;
    }

    try {
      const center = new window.naver.maps.LatLng(origin.lat, origin.lng);
      mapInstance = new window.naver.maps.Map(mapContainerEl, {
        center,
        zoom: 15,
        zoomControl: true,
        zoomControlOptions: {
          position: window.naver.maps.Position.TOP_RIGHT
        },
        mapDataControl: false,
        scaleControl: false
      });

      mapInitialized = true;
      renderOriginMarker(origin);
      renderResultMarkers();
      renderActiveRoute();
      console.debug('[MapPlaceholder] map initialized');

      renderProbeTimer = setTimeout(() => {
        if (mapInitialized && mapContainerEl && mapContainerEl.children.length === 0) {
          setMapError('지도가 렌더링되지 않습니다. NAVER Maps API 인증 상태를 확인하세요.');
        }
      }, 1800);
    } catch (error) {
      setMapError('지도 초기화 중 오류가 발생했습니다.');
      console.error('[MapPlaceholder] initMap error', error);
    }
  }

  function renderOriginMarker(origin) {
    if (!mapInstance) return;
    if (originMarker) {
      originMarker.setMap(null);
    }

    originMarker = new window.naver.maps.Marker({
      position: new window.naver.maps.LatLng(origin.lat, origin.lng),
      map: mapInstance,
      icon: {
        content: getOriginMarkerHtml(),
        anchor: new window.naver.maps.Point(14, 14)
      },
      zIndex: 100
    });
  }

  function renderResultMarkers() {
    const results = getDisplayResults();
    if (!mapInstance || !results.length) return;

    for (const marker of resultMarkers) {
      marker.setMap(null);
    }
    resultMarkers = [];

    const activeIndex = getActiveResultIndex(results.length);

    results.forEach((item, i) => {
      if (!hasCoords(item)) return;
      const isActive = activeIndex === i;
      const position = new window.naver.maps.LatLng(item.location.lat, item.location.lng);

      const marker = new window.naver.maps.Marker({
        position,
        map: mapInstance,
        icon: {
          content: isActive ? getActiveMarkerHtml(i) : getResultMarkerHtml(i),
          anchor: new window.naver.maps.Point(isActive ? 16 : 13, isActive ? 16 : 13)
        },
        zIndex: isActive ? 50 : 30,
        title: item.name
      });

      window.naver.maps.Event.addListener(marker, 'click', () => {
        session.activeResultIndex = i;
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

    const results = getDisplayResults();
    const activeIndex = getActiveResultIndex(results.length);
    const activeItem = results[activeIndex];
    if (!activeItem || !hasCoords(activeItem)) return;

    if (activeItem.path && activeItem.path.length > 1) {
      const pathCoords = activeItem.path.map(
        (point) => new window.naver.maps.LatLng(point.lat, point.lng)
      );
      activePolyline = new window.naver.maps.Polyline({
        map: mapInstance,
        path: pathCoords,
        strokeColor: resolveMapToken('--map-route-stroke', 'color'),
        strokeWeight: 3,
        strokeOpacity: 0.8,
        strokeStyle: 'solid'
      });
    }

    const origin = getOriginCoords();
    if (origin && activeItem.path?.length > 0) {
      const bounds = new window.naver.maps.LatLngBounds(
        new window.naver.maps.LatLng(origin.lat, origin.lng),
        new window.naver.maps.LatLng(activeItem.location.lat, activeItem.location.lng)
      );
      for (const point of activeItem.path) {
        bounds.extend(new window.naver.maps.LatLng(point.lat, point.lng));
      }
      mapInstance.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 });
    } else {
      mapInstance.panTo(new window.naver.maps.LatLng(activeItem.location.lat, activeItem.location.lng));
    }

    const infoForeground = resolveMapToken('--map-info-foreground', 'color');
    const infoMuted = resolveMapToken('--map-info-muted', 'color');
    const infoContent = `
      <div style="padding:8px 12px;font-family:var(--font-sans);max-width:220px;color:${infoForeground};">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${activeItem.name}</div>
        <div style="font-size:12px;color:${infoMuted};">${activeItem.category} / 소요 ${activeItem.totalExpectedMinutes}분</div>
      </div>
    `;
    activeInfoWindow = new window.naver.maps.InfoWindow({
      content: infoContent,
      borderWidth: 0,
      backgroundColor: resolveMapToken('--map-info-bg', 'backgroundColor'),
      borderRadius: resolveMapToken('--map-info-radius', 'borderRadius'),
      boxShadow: resolveMapToken('--map-info-shadow', 'boxShadow')
    });
    const activeMarker = resultMarkers[activeIndex];
    if (activeMarker) {
      activeInfoWindow.open(mapInstance, activeMarker);
    }
  }

  function ensureValidActiveIndex() {
    const results = getDisplayResults();
    const activeIndex = getActiveResultIndex(results.length);
    if (results.length === 0 && session.activeResultIndex !== 0) {
      session.activeResultIndex = 0;
      return;
    }
    if (session.activeResultIndex !== activeIndex) {
      session.activeResultIndex = activeIndex;
    }
  }

  $effect(() => {
    session.results;
    ensureValidActiveIndex();
    if (mapInitialized) {
      renderResultMarkers();
      renderActiveRoute();
    }
  });

  $effect(() => {
    session.activeResultIndex;
    if (mapInitialized) {
      renderResultMarkers();
      renderActiveRoute();
    }
  });

  $effect(() => {
    const origin = getOriginCoords();
    if (origin && mapInitialized) {
      renderOriginMarker(origin);
    }
  });

  $effect(() => {
    const origin = getOriginCoords();
    if (mapContainerEl && !mapInitialized && !loadError && origin) {
      resetMapState();
      loadNaverSdk().then(() => {
        if (!loadError) {
          initMap();
        }
      });
    }
  });

  $effect(() => {
    return () => {
      resetMapState();
      if (renderProbeTimer) {
        clearTimeout(renderProbeTimer);
        renderProbeTimer = null;
      }
    };
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

  {#if !naverMapsLoaded && !loadError}
    <div class="map-loading-overlay" data-testid="map-loading">
      <div class="map-loading-spinner"></div>
      <p class="map-loading-text">지도를 불러오는 중입니다.</p>
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
    padding: var(--spacing-md);
    text-align: center;
  }

  .map-loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-hairline);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .map-loading-text,
  .map-error-text {
    font-size: 14px;
    color: var(--color-mute);
  }

  .map-error-text {
    color: var(--color-primary);
    font-weight: 600;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
