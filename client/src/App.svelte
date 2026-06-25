<script>
  import { onMount } from 'svelte';
  import { createSessionStore } from './lib/stores/session.svelte.js';
  import Header from './lib/components/Header.svelte';
  import QueryForm from './lib/components/QueryForm.svelte';
  import QuestionForm from './lib/components/QuestionForm.svelte';
  import ErrorCard from './lib/components/ErrorCard.svelte';
  import MapPlaceholder from './lib/components/MapPlaceholder.svelte';
  import ResultsList from './lib/components/ResultsList.svelte';

  const session = createSessionStore();

  function handleReset() {
    session.reset();
  }

  onMount(() => {
    session.initializeLocation();
  });
</script>

<div class="app-shell">
  <Header onReset={handleReset} />

  <main class="main-content">
    <div class="content-pane">
      {#if session.status === 'initial'}
        <div class="hero-section">
          <h2 class="display-title">오늘 뭐 먹지?</h2>
          <p class="hero-subtitle">
            현재 위치, 시간, 예산, 분위기를 기준으로 실제 이동 가능한 식당을 추천합니다.
          </p>
        </div>
        <QueryForm {session} />
      {:else if session.status === 'questions'}
        <QuestionForm {session} />
      {:else if session.status === 'results'}
        <ResultsList {session} />
      {:else if session.status === 'error'}
        <ErrorCard error={session.error} {session} />
      {/if}

      {#if session.loading}
        <div class="workflow-banner" aria-live="polite">
          {#key session.workflowStatus}
            <p class="workflow-status-text">
              {session.workflowStatus || '요청을 처리하고 있습니다.'}
            </p>
          {/key}
        </div>
      {/if}
    </div>

    <div class="map-pane">
      <MapPlaceholder {session} />
    </div>
  </main>
</div>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background-color: var(--color-canvas);
  }

  .main-content {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--spacing-lg);
    padding: var(--spacing-lg);
    max-width: 1280px;
    width: 100%;
    margin: 0 auto;
    flex: 1;
  }

  .content-pane {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xl);
    width: 100%;
  }

  .map-pane {
    width: 100%;
    border-radius: var(--rounded-md);
    overflow: hidden;
  }

  .hero-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .workflow-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--rounded-md);
    background-color: color-mix(in oklch, var(--color-primary) 10%, var(--color-surface));
    color: var(--color-ink);
    border: 1px solid color-mix(in oklch, var(--color-primary) 35%, transparent);
    font-size: 14px;
    min-height: 44px;
    overflow: hidden;
    text-align: center;
  }

  .workflow-status-text {
    margin: 0;
    animation: workflow-sweep 420ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .display-title {
    font-family: var(--font-display);
    font-size: 48px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0;
    color: var(--color-ink);
  }

  .hero-subtitle {
    font-size: 16px;
    color: var(--color-body);
    line-height: 1.5;
    max-width: 600px;
    word-break: keep-all;
    overflow-wrap: break-word;
    text-wrap: pretty;
  }

  @media (min-width: 768px) {
    .main-content {
      gap: var(--spacing-xl);
      padding: var(--spacing-xl);
    }
  }

  @media (min-width: 1024px) {
    .main-content {
      grid-template-columns: 550px 1fr;
      height: calc(100vh - 60px);
      overflow: hidden;
      padding: var(--spacing-xl);
      max-width: 100%;
      margin: 0;
    }

    .content-pane {
      overflow-y: auto;
      padding-right: var(--spacing-md);
    }

    .map-pane {
      height: 100%;
    }
  }

  @keyframes workflow-sweep {
    from {
      opacity: 0;
      filter: blur(2px);
      transform: translateY(16px);
    }

    to {
      opacity: 1;
      filter: blur(0);
      transform: translateY(0);
    }
  }
</style>
