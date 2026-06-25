<script>
  const { session } = $props();

  let localSearchQuery = $state('');

  const normalLocationSearchEnabled = $derived(
    session.locationStatus !== 'ready'
  );

  const travelLocationSearchEnabled = $derived(!session.selectedLocation);

  function handleModeChange(newMode) {
    session.mode = newMode;
    if (newMode === 'normal') {
      session.selectedLocation = null;
      localSearchQuery = '';
      session.restartLocationAcquisition();
    } else {
      session.clearUserLocation();
      localSearchQuery = '';
    }
  }

  function handleSearchInput(e) {
    localSearchQuery = e.target.value;
    session.searchQuery = localSearchQuery;
    session.searchLocation(localSearchQuery);
  }

  function selectLocation(loc) {
    if (session.mode === 'travel') {
      session.selectedLocation = loc;
    } else {
      session.applyManualLocation(loc);
    }
    localSearchQuery = loc.name;
    session.searchQuery = loc.name;
    session.searchLocation('');
  }

  $effect(() => {
    if (session.mode === 'normal' && session.locationStatus === 'ready') {
      session.searchLocation('');
    }
  });

  $effect(() => {
    if (session.mode === 'travel' && session.selectedLocation) {
      session.searchLocation('');
    }
  });
</script>

<div class="query-form-container card-bone">
  <div class="mode-selector">
    <button
      type="button"
      class="pill-select {session.mode === 'normal' ? 'selected' : ''}"
      onclick={() => handleModeChange('normal')}
    >
      현재 위치 기준
    </button>
    <button
      type="button"
      class="pill-select {session.mode === 'travel' ? 'selected' : ''}"
      onclick={() => handleModeChange('travel')}
    >
      출장/여행 모드
    </button>
  </div>

  {#if session.mode === 'normal'}
    <div class="location-status" data-testid="location-status">
      <p
        class="location-status-text"
        class:location-status-text--active={session.locationStatus === 'acquiring'}
        class:location-status-text--failed={session.locationStatus === 'failed'}
      >
        {session.locationMessage || '위치를 확인하는 중...'}
      </p>
    </div>

    <div class="travel-location-search" class:search-disabled={!normalLocationSearchEnabled}>
      <label for="normal-location-search-input" class="search-label">위치 검색</label>
      <input
        id="normal-location-search-input"
        type="text"
        class="text-input search-input"
        placeholder="어디 근처 맛집을 찾을까요? (예: 순천역, 강남역)"
        value={localSearchQuery}
        oninput={handleSearchInput}
        disabled={!normalLocationSearchEnabled}
      />
      {#if normalLocationSearchEnabled && session.locationResults && session.locationResults.length > 0}
        <div class="search-results">
          {#each session.locationResults as loc}
            <button
              type="button"
              class="search-result-item"
              onclick={() => selectLocation(loc)}
            >
              <div class="result-name">{loc.name}</div>
              <div class="result-address">{loc.address}</div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if session.mode === 'travel'}
    <div class="travel-location-search" class:search-disabled={!travelLocationSearchEnabled}>
      <label for="location-search-input" class="search-label">목적지 검색</label>
      <input
        id="location-search-input"
        type="text"
        class="text-input search-input"
        placeholder="어디로 가시나요? (예: 판교역)"
        value={localSearchQuery}
        oninput={handleSearchInput}
        disabled={!travelLocationSearchEnabled}
      />
      {#if travelLocationSearchEnabled && session.locationResults && session.locationResults.length > 0}
        <div class="search-results">
          {#each session.locationResults as loc}
            <button
              type="button"
              class="search-result-item"
              onclick={() => selectLocation(loc)}
            >
              <div class="result-name">{loc.name}</div>
              <div class="result-address">{loc.address}</div>
            </button>
          {/each}
        </div>
      {/if}
      {#if session.selectedLocation}
        <div class="selected-location-badge badge-tag">
          선택됨: {session.selectedLocation.name}
        </div>
      {/if}
    </div>
  {/if}

  <div class="query-input-group">
    <label for="query-text-area" class="query-label">지금 어떤 상태인지 알려주세요</label>
    <textarea
      id="query-text-area"
      class="textarea-input"
      placeholder="예: 어제 술 마셔서 피곤해, 스트레스 받았어, 배는 고픈데 뭘 먹을지 모르겠어"
      bind:value={session.query}
      disabled={session.loading}
    ></textarea>
  </div>

  <button
    class="button-primary submit-btn"
    onclick={() => session.submitQuery()}
    disabled={session.loading || !session.query.trim() || (session.mode === 'travel' && !session.selectedLocation) || (session.mode === 'normal' && session.locationStatus !== 'ready')}
  >
    {#if session.loading}
      분석 중...
    {:else}
      음식 맞추기
    {/if}
  </button>
</div>

<style>
  .query-form-container {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    width: 100%;
  }

  .mode-selector {
    display: flex;
    gap: var(--spacing-sm);
  }

  .travel-location-search {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    position: relative;
  }

  .search-label, .query-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-charcoal);
  }

  .search-input {
    width: 100%;
  }

  .search-input:disabled {
    cursor: not-allowed;
    opacity: 0.55;
    background-color: var(--color-surface-bone);
  }

  .search-disabled .search-label {
    color: var(--color-ash);
  }

  .search-results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background-color: var(--color-surface-card);
    border: 1px solid var(--color-hairline-strong);
    border-radius: var(--rounded-md);
    max-height: 200px;
    overflow-y: auto;
    z-index: 5;
    box-shadow: 0 4px 12px color-mix(in oklch, var(--foreground) 8%, transparent);
  }

  .search-result-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: var(--spacing-sm) var(--spacing-md);
    width: 100%;
    text-align: left;
    border-bottom: 1px solid var(--color-hairline);
    background: none;
    cursor: pointer;
  }

  .search-result-item:last-child {
    border-bottom: none;
  }

  .search-result-item:hover {
    background-color: var(--color-surface-bone);
  }

  .result-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--color-ink);
  }

  .result-address {
    font-size: 12px;
    color: var(--color-ash);
  }

  .selected-location-badge {
    align-self: flex-start;
    font-size: 13px;
    padding: 6px 12px;
  }

  .location-status {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .location-status-text {
    font-size: 13px;
    color: var(--color-body);
    margin: 0;
    line-height: 1.5;
  }

  .location-status-text--active {
    color: var(--color-charcoal);
  }

  .location-status-text--failed {
    color: var(--color-primary);
  }

  .query-input-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .submit-btn {
    width: 100%;
    height: 48px;
    font-size: 18px;
  }
</style>
