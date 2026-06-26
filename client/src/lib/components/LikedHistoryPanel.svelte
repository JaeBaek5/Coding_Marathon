<script>
  const { session, open = false, onClose = () => {} } = $props();

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(iso));
    } catch {
      return '';
    }
  }
</script>

{#if open}
  <div
    class="panel-backdrop"
    role="presentation"
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
  ></div>
  <aside class="liked-panel card" aria-label="좋아요 기록">
    <div class="panel-header">
      <h2 class="panel-title">저장한 식당</h2>
      <button type="button" class="button-outline close-btn" onclick={onClose}>
        닫기
      </button>
    </div>

    {#if session.likedRestaurants.length === 0}
      <p class="empty-text">아직 좋아요한 식당이 없습니다. 마음에 드는 곳에 좋아요를 눌러 보세요.</p>
    {:else}
      <ul class="liked-list">
        {#each session.likedRestaurants as item}
          <li class="liked-item">
            {#if item.mainPhoto}
              <img class="liked-thumb" src={item.mainPhoto} alt="" loading="lazy" />
            {/if}
            <div class="liked-body">
              <div class="liked-name">{item.name}</div>
              <div class="liked-meta">
                {#if item.category}
                  <span>{item.category}</span>
                {/if}
                {#if formatDate(item.likedAt)}
                  <span>{formatDate(item.likedAt)}</span>
                {/if}
              </div>
              {#if item.address}
                <div class="liked-address">{item.address}</div>
              {/if}
              <div class="liked-actions">
                {#if item.placeUrl}
                  <a
                    class="place-link"
                    href={item.placeUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    네이버에서 보기
                  </a>
                {/if}
                <button
                  type="button"
                  class="remove-btn"
                  onclick={() => session.removeLikedRestaurant(item.id)}
                >
                  삭제
                </button>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>
{/if}

<style>
  .panel-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in oklch, var(--foreground) 28%, transparent);
    z-index: 40;
  }

  .liked-panel {
    position: fixed;
    top: 72px;
    right: var(--spacing-lg);
    width: min(420px, calc(100vw - 2 * var(--spacing-lg)));
    max-height: calc(100vh - 96px);
    overflow-y: auto;
    z-index: 50;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
  }

  .panel-title {
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 700;
    color: var(--color-ink);
  }

  .close-btn {
    height: 32px;
    padding: 0 12px;
    font-size: 13px;
  }

  .empty-text {
    font-size: 14px;
    color: var(--color-mute);
    line-height: 1.5;
  }

  .liked-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    margin: 0;
    padding: 0;
  }

  .liked-item {
    display: flex;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    border: 1px solid var(--color-hairline);
    border-radius: var(--rounded-sm);
    background: var(--color-surface-bone);
  }

  .liked-thumb {
    width: 72px;
    height: 72px;
    object-fit: cover;
    border-radius: var(--rounded-sm);
    flex-shrink: 0;
  }

  .liked-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }

  .liked-name {
    font-weight: 700;
    color: var(--color-ink);
    font-size: 15px;
  }

  .liked-meta {
    display: flex;
    gap: var(--spacing-xs);
    font-size: 12px;
    color: var(--color-mute);
  }

  .liked-address {
    font-size: 12px;
    color: var(--color-charcoal);
    line-height: 1.4;
  }

  .liked-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-top: 2px;
  }

  .place-link {
    font-size: 12px;
    color: var(--color-primary);
    text-decoration: underline;
  }

  .remove-btn {
    border: none;
    background: none;
    color: var(--color-mute);
    font-size: 12px;
    cursor: pointer;
    padding: 0;
  }

  .remove-btn:hover {
    color: var(--color-primary);
  }
</style>
