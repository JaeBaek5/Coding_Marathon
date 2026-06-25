<script>
  const { onReset } = $props();
</script>

<header class="nav-bar">
  <div class="header-container">
    <div class="logo-group">
      <span class="logo-icon">M</span>
      <h1 class="logo-text">머먹</h1>
    </div>
    <div class="actions">
      <button class="button-outline header-reset-btn" onclick={onReset}>
        처음으로
      </button>
    </div>
  </div>
</header>

<style>
  .nav-bar {
    background-color: var(--color-canvas);
    height: 60px;
    border-bottom: 1px solid var(--color-hairline);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .header-container {
    max-width: 1280px;
    width: 100%;
    padding: 0 var(--spacing-lg);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .logo-group {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .logo-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-primary);
    color: var(--color-on-primary);
    width: 32px;
    height: 32px;
    border-radius: var(--rounded-full);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 18px;
  }

  .logo-text {
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--color-ink);
  }

  .header-reset-btn {
    height: 36px;
    padding: 0 16px;
    font-size: 14px;
  }
</style>
