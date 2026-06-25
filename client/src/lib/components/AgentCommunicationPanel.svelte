<script>
  const { logs = [] } = $props();

  function formatTimestamp(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return '';
    }
  }

</script>

<section class="agent-comm-panel">
  <h3>에이전트 통신 로그</h3>
  <p class="agent-comm-subtitle">
    Bet/Fallback/Orchestrator의 내부 요청 흐름을 확인합니다.
  </p>

  {#if !logs?.length}
    <p class="agent-comm-empty">아직 로그가 없습니다.</p>
  {:else}
    <ul class="agent-comm-list">
      {#each logs as log (log.seq)}
        <li class="agent-comm-item">
          <div class="agent-comm-meta">
            <span>{log.event}</span>
            <span class="agent-comm-time">{formatTimestamp(log.timestamp)}</span>
          </div>
          <p class="agent-comm-detail">
            from={log.fromAgent || '-'} / to={log.toAgent || '-'}
            {#if log.phase}
              · phase={log.phase}
            {/if}
            {#if log.candidateId}
              · candidate={log.candidateId}
            {/if}
          </p>
          {#if log.message}
            <p class="agent-comm-message">{log.message}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .agent-comm-panel {
    border: 1px solid var(--color-hairline);
    border-radius: var(--rounded-md);
    padding: var(--spacing-md);
    background: var(--color-surface);
  }

  .agent-comm-panel h3 {
    margin: 0;
    font-size: 14px;
    color: var(--color-ink);
    margin-bottom: 4px;
  }

  .agent-comm-subtitle {
    margin: 0 0 var(--spacing-sm);
    font-size: 12px;
    color: var(--color-mute);
  }

  .agent-comm-empty {
    margin: 0;
    font-size: 12px;
    color: var(--color-ash);
  }

  .agent-comm-list {
    margin: 0;
    padding-left: var(--spacing-md);
    list-style: disc;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    max-height: 220px;
    overflow-y: auto;
  }

  .agent-comm-item {
    color: var(--color-body);
    font-size: 12px;
  }

  .agent-comm-meta {
    display: flex;
    gap: var(--spacing-sm);
    color: var(--color-charcoal);
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .agent-comm-time {
    color: var(--color-mute);
  }

  .agent-comm-detail,
  .agent-comm-message {
    margin: 2px 0 0;
    color: var(--color-body);
  }

  .agent-comm-message {
    word-break: break-word;
    white-space: normal;
    font-size: 11px;
    color: var(--color-mute);
  }
</style>
