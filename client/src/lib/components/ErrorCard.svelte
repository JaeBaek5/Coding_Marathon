<script>
  const { error, session } = $props();

  function switchToTravelMode() {
    session.reset();
    session.mode = 'travel';
  }

  function handleReset() {
    session.reset();
  }

  function handleRetry() {
    if (session.questions.length > 0) {
      session.submitAnswers();
    } else {
      session.submitQuery();
    }
  }
</script>

<div class="error-card card">
  <div class="error-icon">⚠️</div>
  <h3 class="error-title">
    {#if error?.code === 'GEO_REQUIRED'}
      위치 정보가 필요합니다
    {:else if error?.code === 'INVALID_TOTAL_TIME'}
      잘못된 소요 시간입니다
    {:else if error?.code === 'SCHEDULED_MEAL_UNSUPPORTED'}
      실시간 식사만 가능합니다
    {:else if error?.code === 'NO_RESULTS'}
      추천할 식당이 없습니다
    {:else if error?.code === 'ROUTE_UNAVAILABLE'}
      경로를 찾을 수 없습니다
    {:else if error?.code === 'PROVIDER_QUOTA' || error?.code === 'PROVIDER_ERROR'}
      서비스 일시 장애
    {:else if error?.code === 'UNSUPPORTED_BROWSER'}
      지원하지 않는 브라우저입니다
    {:else if error?.code === 'SESSION_EXPIRED'}
      세션이 만료되었습니다
    {:else}
      오류가 발생했습니다
    {/if}
  </h3>

  <p class="error-message">
    {error?.message || '추천 처리 중 알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'}
  </p>

  <div class="error-actions">
    {#if error?.code === 'GEO_REQUIRED'}
      <button type="button" class="button-primary action-btn" onclick={switchToTravelMode}>
        출장/여행 모드로 전환
      </button>
      <button type="button" class="button-outline action-btn" onclick={handleReset}>
        처음으로
      </button>
    {:else if error?.code === 'NO_RESULTS'}
      <button type="button" class="button-primary action-btn" onclick={handleReset}>
        조건 수정하기
      </button>
      <button type="button" class="button-outline action-btn" onclick={switchToTravelMode}>
        출장/여행 모드로 전환
      </button>
    {:else}
      <button type="button" class="button-primary action-btn" onclick={handleRetry}>
        다시 시도하기
      </button>
      <button type="button" class="button-outline action-btn" onclick={handleReset}>
        처음으로
      </button>
    {/if}
  </div>
</div>

<style>
  .error-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--spacing-md);
    padding: var(--spacing-xl);
    border: 2px solid var(--color-primary);
    width: 100%;
  }

  .error-icon {
    font-size: 40px;
  }

  .error-title {
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 700;
    color: var(--color-primary);
  }

  .error-message {
    font-size: 15px;
    color: var(--color-charcoal);
    line-height: 1.6;
    max-width: 400px;
  }

  .error-actions {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    width: 100%;
    margin-top: var(--spacing-sm);
  }

  :global(.error-actions .action-btn) {
    width: 100%;
    height: 44px;
    font-size: 15px;
  }
</style>
