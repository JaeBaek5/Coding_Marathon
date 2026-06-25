<script>
  const { session } = $props();

  function formatDistance(distanceMeters) {
    if (!distanceMeters || typeof distanceMeters !== 'number') {
      return null;
    }
    return `${(distanceMeters / 1000).toFixed(1)}km`;
  }

  function resolveTransportLabel(item) {
    return item.transportMode === 'walk' ? '도보' : '차량';
  }

  function onDislike(item) {
    session.submitFeedback('dislike', item.id);
  }

  function onLike(item) {
    session.submitFeedback('like', item.id);
  }

  function isTruthyText(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  $effect(() => {
    if (session.activeResultIndex >= session.results.length) {
      session.activeResultIndex = 0;
    }
  });
</script>

<div class="results-list-container">
  <div class="results-header">
    <h2 class="title">추천 식당</h2>
    <p class="subtitle">
      {#if session.displayMode === 'triple'}
        마음에 드는 곳을 골라보세요. 후보 {session.results.length}곳입니다.
      {:else if session.results.length > 0}
        조건에 맞는 식당을 하나씩 보여드립니다. 마음에 들지 않으면 싫어요를 눌러주세요.
      {:else}
        추천 결과가 없습니다.
      {/if}
    </p>
  </div>

  <div class="results-grid">
    {#each session.results as item, i}
      <div
        class="result-card card {session.activeResultIndex === i ? 'active' : ''}"
        onclick={() => (session.activeResultIndex = i)}
        onkeydown={(e) => e.key === 'Enter' && (session.activeResultIndex = i)}
        role="button"
        tabindex="0"
      >
        <div class="card-header">
          <span class="badge-status number-badge">{i + 1}</span>
          <div class="name-group">
            <h3 class="restaurant-name">{item.name}</h3>
            <span class="category">{item.category}</span>
          </div>
        </div>

        <p class="address">{item.address}</p>

        <div class="route-info">
          <div class="info-item">
            <span class="label">이동수단</span>
            <span class="value">{resolveTransportLabel(item)}</span>
          </div>
          <div class="info-item">
            <span class="label">편도 시간</span>
            <span class="value">{item.oneWayRouteMinutes}분</span>
          </div>
          <div class="info-itemhighlighted">
            <span class="label">총 예상시간</span>
            <span class="value">{item.totalExpectedMinutes}분</span>
          </div>
          {#if formatDistance(item.distanceMeters)}
            <div class="info-item">
              <span class="label">거리</span>
              <span class="value">{formatDistance(item.distanceMeters)}</span>
            </div>
          {/if}
        </div>

        {#if item.placeUrl}
          <a
            class="place-link"
            href={item.placeUrl}
            target="_blank"
            rel="noreferrer"
          >
            상세 보기
          </a>
        {/if}

        <div class="card-section">
          <span class="card-section-title">추천 이유</span>
          <p class="reason-text">{item.reason}</p>
        </div>

        {#if item.reviewSummary && (item.reviewSummary.pros || item.reviewSummary.cons)}
          <div class="card-section review-summary">
            {#if isTruthyText(item.reviewSummary.pros)}
              <p class="review-line">
                <span class="review-label">장점</span>{item.reviewSummary.pros}
              </p>
            {/if}
            {#if isTruthyText(item.reviewSummary.cons)}
              <p class="review-line">
                <span class="review-label">단점</span>{item.reviewSummary.cons}
              </p>
            {/if}
          </div>
        {/if}

        {#if item.mainPhoto || item.menuBoardPhoto || (item.menuItems?.length || 0) > 0}
          <div class="media-section">
            <div class="card-section-title">지도/메뉴</div>

            {#if item.mainPhoto}
              <img
                class="media-thumb"
                src={item.mainPhoto}
                alt={`${item.name} 대표 사진`}
                loading="lazy"
              />
            {/if}
            {#if item.menuBoardPhoto}
              <img
                class="media-thumb"
                src={item.menuBoardPhoto}
                alt={`${item.name} 메뉴판 사진`}
                loading="lazy"
              />
            {/if}

            {#if item.menuItems?.length}
              <ul class="menu-list">
                {#each item.menuItems.slice(0, 3) as menu}
                  <li>
                    <span class="menu-name">{menu.name}</span>
                    {#if isTruthyText(menu.price)}
                      <span class="menu-price">{menu.price}</span>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}

        <div class="card-footer">
          <div class="badges-row">
            {#if item.confidenceBadge}
              <span class="badge-tag confidence-{item.confidenceBadge}">
                신뢰도:
                {item.confidenceBadge === 'high'
                  ? '높음'
                  : item.confidenceBadge === 'medium'
                    ? '보통'
                    : '낮음'}
              </span>
            {/if}
            {#if item.openStatus !== null}
              <span class="badge-tag status-{item.openStatus ? 'open' : 'closed'}">
                {item.openStatus ? '영업 중' : '영업 종료'}
              </span>
            {/if}
          </div>
          <span class="attribution">{item.providerAttribution}</span>
        </div>

        <div class="feedback-row">
          <button
            class="button-outline feedback-btn"
            type="button"
            disabled={session.loading}
            onclick={() => onDislike(item)}
          >
            싫어요
          </button>
          <button
            class="button-primary feedback-btn"
            type="button"
            disabled={session.loading}
            onclick={() => onLike(item)}
          >
            좋아요
          </button>
        </div>
      </div>
    {/each}
  </div>

  <button type="button" class="button-outline reset-btn" onclick={() => session.reset()}>
    새로 추천받기
  </button>
</div>

<style>
  .results-list-container {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    width: 100%;
  }

  .results-header {
    border-bottom: 1px solid var(--color-hairline);
    padding-bottom: var(--spacing-sm);
  }

  .title {
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 700;
    color: var(--color-ink);
  }

  .subtitle {
    font-size: 14px;
    color: var(--color-mute);
    margin-top: var(--spacing-xs);
  }

  .results-grid {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .result-card {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    cursor: pointer;
  }

  .result-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(32, 32, 32, 0.08);
  }

  .result-card.active {
    border-color: var(--color-primary);
    box-shadow: 0 4px 16px rgba(234, 40, 4, 0.12);
    outline: none;
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }

  .number-badge {
    background-color: var(--color-primary);
    width: 24px;
    height: 24px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    flex-shrink: 0;
  }

  .name-group {
    display: flex;
    flex-direction: column;
  }

  .restaurant-name {
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 700;
    color: var(--color-ink);
    line-height: 1.1;
  }

  .category {
    font-size: 12px;
    color: var(--color-ash);
    margin-top: 2px;
  }

  .address {
    font-size: 14px;
    color: var(--color-charcoal);
  }

  .route-info {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--spacing-xs);
    background-color: var(--color-surface-bone);
    padding: var(--spacing-sm);
    border-radius: var(--rounded-sm);
    border: 1px solid var(--color-hairline);
  }

  .info-item,
  .info-itemhighlighted {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 2px;
  }

  .info-itemhighlighted .value {
    color: var(--color-primary);
    font-weight: 700;
  }

  .route-info .label {
    font-size: 11px;
    color: var(--color-mute);
  }

  .route-info .value {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-ink);
  }

  .place-link {
    color: var(--color-primary);
    text-decoration: underline;
    width: fit-content;
    font-size: 13px;
  }

  .card-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .card-section-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--color-primary);
  }

  .reason-text {
    font-size: 14px;
    color: var(--color-body);
    line-height: 1.5;
  }

  .review-summary {
    border-top: 1px solid var(--color-hairline);
    border-bottom: 1px solid var(--color-hairline);
    padding: var(--spacing-sm) 0;
  }

  .review-line {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-xs);
    color: var(--color-charcoal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
    line-height: 1.4;
    margin: 0;
  }

  .review-label {
    color: var(--color-primary);
    font-weight: 700;
    width: 2.5rem;
    flex-shrink: 0;
  }

  .media-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .media-thumb {
    width: 100%;
    max-width: 360px;
    border-radius: var(--rounded-sm);
    border: 1px solid var(--color-hairline);
  }

  .menu-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    font-size: 12px;
  }

  .menu-list li {
    display: flex;
    justify-content: space-between;
    gap: var(--spacing-sm);
    width: 100%;
  }

  .menu-name {
    color: var(--color-charcoal);
    max-width: 260px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .menu-price {
    color: var(--color-mute);
    font-variant-numeric: tabular-nums;
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid var(--color-hairline);
    padding-top: var(--spacing-sm);
    margin-top: var(--spacing-xs);
  }

  .badges-row {
    display: flex;
    gap: var(--spacing-xs);
  }

  .attribution {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--color-ash);
  }

  .feedback-row {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-xs);
  }

  .feedback-btn {
    height: 40px;
    font-size: 14px;
    flex: 1;
  }

  .confidence-high {
    color: var(--color-badge-success);
    border-color: var(--color-badge-success);
  }

  .confidence-medium {
    color: var(--color-charcoal);
  }

  .confidence-low {
    color: var(--color-ash);
  }

  .reset-btn {
    width: 100%;
    height: 48px;
    font-size: 16px;
    margin-top: var(--spacing-md);
  }
</style>
