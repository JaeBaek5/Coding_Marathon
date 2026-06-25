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

<details class="agent-comm-panel">
  <summary class="agent-comm-summary">
    <span>에이전트 통신 로그</span>
    <span class="agent-comm-count">{logs?.length || 0}개</span>
  </summary>
  <p class="agent-comm-subtitle">
    Orchestrator, Aleph, Bet, Gimel worker가 주고받은 작업 상태입니다.
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
            from={log.fromAgent || log.agent || '-'} / to={log.toAgent || '-'}
            {#if log.worker}
              · worker={log.worker}
            {/if}
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
</details>

<style>
  .agent-comm-panel {
    border: 1px solid var(--color-hairline);
    border-radius: var(--rounded-md);
    padding: var(--spacing-md);
    background: var(--color-surface-card);
    box-shadow: var(--shadow-xs);
    flex-shrink: 0;
  }

  .agent-comm-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    font-size: 14px;
    font-weight: 700;
    color: var(--color-ink);
    list-style: none;
  }

  .agent-comm-summary::-webkit-details-marker {
    display: none;
  }

  .agent-comm-summary::after {
    content: '펼치기';
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 700;
  }

  .agent-comm-panel[open] .agent-comm-summary::after {
    content: '접기';
  }

  .agent-comm-count {
    margin-left: auto;
    margin-right: var(--spacing-md);
    color: var(--color-mute);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
  }

  .agent-comm-subtitle {
    margin: var(--spacing-sm) 0;
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
    padding-left: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    max-height: 220px;
    overflow-y: auto;
  }

  .agent-comm-item {
    color: var(--color-body);
    font-size: 12px;
    border-left: 2px solid var(--color-hairline);
    padding-left: var(--spacing-sm);
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
