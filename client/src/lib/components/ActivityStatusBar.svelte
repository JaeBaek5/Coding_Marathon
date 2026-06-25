<script>
  import {
    formatProgressClock,
    formatProgressElapsed,
    formatProgressMeta
  } from '../utils/progressFormat.js';

  let { session } = $props();

  let sheetOpen = $state(false);

  const allSteps = $derived(session.activitySteps);
  const isRunning = $derived(session.loading);
  const stepCount = $derived(allSteps.length);
  const completedSteps = $derived(
    isRunning && allSteps.length > 0 ? allSteps.slice(0, -1) : allSteps
  );
  const activeStep = $derived(
    isRunning && allSteps.length > 0 ? allSteps[allSteps.length - 1] : null
  );
  const peekTitle = $derived(
    activeStep?.message ??
      (allSteps.length > 0
        ? allSteps[allSteps.length - 1]?.message
        : '작동 로그')
  );
  const peekDetail = $derived(activeStep?.detail ?? null);
  const peekPhase = $derived(
    activeStep?.phaseLabel ?? allSteps[allSteps.length - 1]?.phaseLabel ?? null
  );

  function toggleSheet() {
    sheetOpen = !sheetOpen;
  }

  function stepTimingLabel(step) {
    const parts = [];
    const clock = formatProgressClock(step?.updatedAt);
    if (clock) {
      parts.push(clock);
    }
    const elapsed = formatProgressElapsed(step?.durationMs ?? step?.elapsedMs);
    if (elapsed) {
      parts.push(`+${elapsed}`);
    }
    return parts.join(' · ');
  }
</script>

{#if stepCount > 0}
  <aside
    class="activity-sheet card-bone"
    class:activity-sheet--open={sheetOpen}
    aria-live="polite"
    aria-busy={isRunning}
    data-testid="activity-status-bar"
  >
    <button
      type="button"
      class="sheet-peek"
      onclick={toggleSheet}
      aria-expanded={sheetOpen}
      aria-controls="activity-sheet-panel"
    >
      <span class="sheet-handle" aria-hidden="true"></span>

      <span class="sheet-peek-main">
        {#if isRunning}
          <span class="activity-spinner" aria-hidden="true"></span>
        {:else}
          <span class="sheet-peek-icon" aria-hidden="true">✓</span>
        {/if}

        <span class="sheet-peek-text">
          {#if peekPhase && !sheetOpen}
            <span class="sheet-peek-phase">{peekPhase}</span>
          {/if}
          <span class="sheet-peek-title">{peekTitle}</span>
          {#if peekDetail && !sheetOpen}
            <span class="sheet-peek-detail">{peekDetail}</span>
          {/if}
        </span>
      </span>

      <span class="sheet-peek-meta">
        <span class="sheet-step-count">{stepCount}단계</span>
        <span class="sheet-chevron" class:sheet-chevron--open={sheetOpen} aria-hidden="true"
          >⌃</span
        >
      </span>
    </button>

    {#if sheetOpen}
      <div id="activity-sheet-panel" class="sheet-panel">
        <h2 class="sheet-panel-title">작동 로그</h2>

        <ol class="activity-log">
          {#each completedSteps as step, index (index)}
            <li class="activity-log-item done">
              <span class="activity-log-mark" aria-hidden="true">✓</span>
              <span class="activity-log-text">
                <span class="activity-log-head">
                  {#if step.phaseLabel}
                    <span class="activity-log-phase">{step.phaseLabel}</span>
                  {/if}
                  {#if stepTimingLabel(step)}
                    <span class="activity-log-time">{stepTimingLabel(step)}</span>
                  {/if}
                </span>
                <span class="activity-log-message">{step.message}</span>
                {#if step.detail}
                  <span class="activity-log-detail">{step.detail}</span>
                {/if}
                {#each formatProgressMeta(step.meta) as metaLine}
                  <span class="activity-log-meta">{metaLine}</span>
                {/each}
              </span>
            </li>
          {/each}

          {#if activeStep}
            <li class="activity-log-item active">
              <span class="activity-spinner activity-spinner--inline" aria-hidden="true"></span>
              <span class="activity-log-text">
                <span class="activity-log-head">
                  {#if activeStep.phaseLabel}
                    <span class="activity-log-phase">{activeStep.phaseLabel}</span>
                  {/if}
                  {#if stepTimingLabel(activeStep)}
                    <span class="activity-log-time">{stepTimingLabel(activeStep)}</span>
                  {/if}
                </span>
                <span class="activity-log-message">{activeStep.message}</span>
                {#if activeStep.detail}
                  <span class="activity-log-detail">{activeStep.detail}</span>
                {/if}
                {#each formatProgressMeta(activeStep.meta) as metaLine}
                  <span class="activity-log-meta">{metaLine}</span>
                {/each}
              </span>
            </li>
          {/if}
        </ol>
      </div>
    {/if}
  </aside>
{/if}

<style>
  .activity-sheet {
    width: 100%;
    overflow: hidden;
    border: 1px solid var(--color-hairline-strong, #e5e7eb);
    border-radius: var(--rounded-md, 12px);
    background: var(--color-surface-card, #fff);
  }

  .sheet-peek {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: 18px var(--spacing-md) var(--spacing-md);
    text-align: left;
    cursor: pointer;
    background: none;
    border: none;
    color: inherit;
  }

  .sheet-handle {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 40px;
    height: 4px;
    border-radius: 999px;
    background: var(--color-hairline-strong, #d1d5db);
  }

  .sheet-peek-main {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-sm);
    flex: 1;
    min-width: 0;
  }

  .sheet-peek-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .sheet-peek-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-ink, #111827);
    line-height: 1.35;
  }

  .sheet-peek-phase {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-primary, #2563eb);
    line-height: 1.3;
  }

  .sheet-peek-detail {
    font-size: 12px;
    color: var(--color-body, #6b7280);
    line-height: 1.4;
  }

  .sheet-peek-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .sheet-step-count {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-ash, #9ca3af);
    white-space: nowrap;
  }

  .sheet-chevron {
    display: inline-block;
    font-size: 14px;
    color: var(--color-ash, #9ca3af);
    transform: rotate(180deg);
    transition: transform 0.2s ease;
  }

  .sheet-chevron--open {
    transform: rotate(0deg);
  }

  .sheet-peek-icon {
    width: 18px;
    height: 18px;
    margin-top: 1px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: #16a34a;
    flex-shrink: 0;
  }

  .sheet-panel {
    border-top: 1px solid var(--color-hairline, #f3f4f6);
    padding: 0 var(--spacing-md) var(--spacing-md);
    animation: slide-down 0.2s ease;
  }

  .sheet-panel-title {
    margin: 0;
    padding: var(--spacing-sm) 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--color-charcoal, #374151);
  }

  .activity-log {
    margin: 0;
    padding: 0 0 var(--spacing-xs);
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 360px;
    overflow-y: auto;
  }

  .activity-log-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .activity-log-item.done .activity-log-message {
    color: var(--color-body, #6b7280);
  }

  .activity-log-item.active .activity-log-message {
    color: var(--color-ink, #111827);
    font-weight: 600;
  }

  .activity-log-mark {
    color: #16a34a;
    font-weight: 700;
    flex-shrink: 0;
    width: 18px;
    text-align: center;
    line-height: 1.4;
  }

  .activity-log-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .activity-log-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .activity-log-phase {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-primary, #2563eb);
    line-height: 1.3;
  }

  .activity-log-time {
    font-size: 11px;
    color: var(--color-ash, #9ca3af);
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
  }

  .activity-log-message {
    font-size: 13px;
    line-height: 1.45;
  }

  .activity-log-detail {
    font-size: 12px;
    color: var(--color-ash, #9ca3af);
    line-height: 1.4;
  }

  .activity-log-meta {
    font-size: 11px;
    color: var(--color-body, #6b7280);
    line-height: 1.35;
  }

  .activity-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid #d1d5db;
    border-top-color: var(--color-primary, #2563eb);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  .activity-spinner--inline {
    margin-top: 1px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes slide-down {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
