<script>
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
</script>

<div class="app-shell">
  <Header onReset={handleReset} />

  <main class="main-content">
    <div class="content-pane">
      {#if session.status === 'initial'}
        <div class="hero-section">
          <h2 class="display-title">오늘 뭐 먹지?</h2>
          <p class="hero-subtitle">
            인공지능 비서가 당신의 현재 상황에 딱 맞는 최적의 식사와 완벽한 이동 경로를 제안합니다.
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

  .display-title {
    font-family: var(--font-display);
    font-size: 48px;
    font-weight: 700;
    line-height: 1.0;
    letter-spacing: -0.03em;
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
</style>
