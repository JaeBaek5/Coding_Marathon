<script>
  const { session } = $props();

  let localSearchQuery = $state('');

  function handleModeChange(newMode) {
    session.mode = newMode;
    if (newMode === 'normal') {
      session.selectedLocation = null;
    }
  }

  function handleSearchInput(e) {
    localSearchQuery = e.target.value;
    session.searchQuery = localSearchQuery;
    session.searchLocation(localSearchQuery);
  }

  function selectLocation(loc) {
    session.selectedLocation = loc;
    localSearchQuery = loc.name;
    session.searchQuery = loc.name;
    session.searchLocation('');
  }
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

  {#if session.mode === 'travel'}
    <div class="travel-location-search">
      <label for="location-search-input" class="search-label">목적지 검색</label>
      <input
        id="location-search-input"
        type="text"
        class="text-input search-input"
        placeholder="어디로 가시나요? (예: 판교역)"
        value={localSearchQuery}
        oninput={handleSearchInput}
      />
      {#if session.locationResults && session.locationResults.length > 0}
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
    <label for="query-text-area" class="query-label">원하는 식사 조건을 입력하세요</label>
    <textarea
      id="query-text-area"
      class="textarea-input"
      placeholder="예: 회사 상사랑 점심, 식대 1만원, 1시간 이내, 도보 가능"
      bind:value={session.query}
      disabled={session.loading}
    ></textarea>
  </div>

  <button
    class="button-primary submit-btn"
    onclick={() => session.submitQuery()}
    disabled={session.loading || !session.query.trim() || (session.mode === 'travel' && !session.selectedLocation)}
  >
    {#if session.loading}
      추천받는 중...
    {:else}
      식당 추천받기
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
