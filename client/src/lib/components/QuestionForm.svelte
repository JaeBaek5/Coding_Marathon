<script>
  const { session } = $props();

  let tempFood = $state('');

  const mealOptions = [
    { value: 'breakfast', label: '아침' },
    { value: 'lunch', label: '점심' },
    { value: 'dinner', label: '저녁' },
    { value: 'late_night', label: '야식' }
  ];

  const transportOptions = [
    { value: 'walk', label: '도보' },
    { value: 'drive', label: '차량' }
  ];

  const budgetPresets = [
    { value: 10000, label: '1만원' },
    { value: 15000, label: '1.5만원' },
    { value: 20000, label: '2만원' },
    { value: 30000, label: '3만원' }
  ];

  const timePresets = [
    { value: 30, label: '30분' },
    { value: 45, label: '45분' },
    { value: 60, label: '60분 (1시간)' }
  ];

  const partyPresets = ['혼밥', '친구', '데이트', '직장 동료', '상사', '가족'];
  const vibePresets = ['캐주얼', '조용한', '분위기 좋은', '격식 있는', '활기찬'];

  function selectMeal(val) {
    session.answers.mealPeriod = val;
  }

  function selectTransport(val) {
    session.answers.transportMode = val;
  }

  function selectBudget(val) {
    session.answers.budgetPerPersonKrw = val;
  }

  function selectTime(val) {
    session.answers.totalTimeMinutes = val;
  }

  function selectParty(val) {
    session.answers.partyContext = val;
  }

  function selectVibe(val) {
    session.answers.vibe = val;
  }

  function addExcludedFood() {
    if (!tempFood.trim()) return;
    if (!session.answers.excludedFoods) {
      session.answers.excludedFoods = [];
    }
    if (!session.answers.excludedFoods.includes(tempFood.trim())) {
      session.answers.excludedFoods = [...session.answers.excludedFoods, tempFood.trim()];
    }
    tempFood = '';
  }

  function removeExcludedFood(food) {
    session.answers.excludedFoods = session.answers.excludedFoods.filter((f) => f !== food);
  }
</script>

<div class="question-form card">
  <div class="question-header">
    <h3 class="title">추가 질문</h3>
    <p class="subtitle">더 만족스러운 추천을 위해 아래 정보를 알려주세요.</p>
  </div>

  <div class="questions-list">
    {#each session.questions as q}
      <div class="question-item">
        <label class="question-label" for="input-{q.field}">{q.label}</label>

        {#if q.field === 'mealPeriod'}
          <div class="pill-group">
            {#each mealOptions as opt}
              <button
                type="button"
                class="pill-select {session.answers.mealPeriod === opt.value ? 'selected' : ''}"
                onclick={() => selectMeal(opt.value)}
              >
                {opt.label}
              </button>
            {/each}
          </div>

        {:else}
          {#if q.field === 'transportMode'}
            <div class="pill-group">
              {#each transportOptions as opt}
                <button
                  type="button"
                  class="pill-select {session.answers.transportMode === opt.value ? 'selected' : ''}"
                  onclick={() => selectTransport(opt.value)}
                >
                  {opt.label}
                </button>
              {/each}
            </div>

          {:else}
            {#if q.field === 'budgetPerPersonKrw'}
              <div class="input-preset-container">
                <input
                  id="input-budgetPerPersonKrw"
                  type="number"
                  class="text-input"
                  placeholder="예: 10000"
                  bind:value={session.answers.budgetPerPersonKrw}
                />
                <span class="unit">원</span>
              </div>
              <div class="pill-group presets">
                {#each budgetPresets as preset}
                  <button
                    type="button"
                    class="badge-tag preset-pill {session.answers.budgetPerPersonKrw === preset.value ? 'active' : ''}"
                    onclick={() => selectBudget(preset.value)}
                  >
                    {preset.label}
                  </button>
                {/each}
              </div>

            {:else}
              {#if q.field === 'totalTimeMinutes'}
                <div class="input-preset-container">
                  <input
                    id="input-totalTimeMinutes"
                    type="number"
                    min="20"
                    max="60"
                    class="text-input"
                    placeholder="20~60분 사이"
                    bind:value={session.answers.totalTimeMinutes}
                  />
                  <span class="unit">분</span>
                </div>
                <div class="pill-group presets">
                  {#each timePresets as preset}
                    <button
                      type="button"
                      class="badge-tag preset-pill {session.answers.totalTimeMinutes === preset.value ? 'active' : ''}"
                      onclick={() => selectTime(preset.value)}
                    >
                      {preset.label}
                    </button>
                  {/each}
                </div>

              {:else}
                {#if q.field === 'partyContext'}
                  <input
                    id="input-partyContext"
                    type="text"
                    class="text-input"
                    placeholder="예: 회사 상사, 친구 등"
                    bind:value={session.answers.partyContext}
                  />
                  <div class="pill-group presets">
                    {#each partyPresets as preset}
                      <button
                        type="button"
                        class="badge-tag preset-pill {session.answers.partyContext === preset ? 'active' : ''}"
                        onclick={() => selectParty(preset)}
                      >
                        {preset}
                      </button>
                    {/each}
                  </div>

                {:else}
                  {#if q.field === 'vibe'}
                    <input
                      id="input-vibe"
                      type="text"
                      class="text-input"
                      placeholder="예: 조용한, 캐주얼한 등"
                      bind:value={session.answers.vibe}
                    />
                    <div class="pill-group presets">
                      {#each vibePresets as preset}
                        <button
                          type="button"
                          class="badge-tag preset-pill {session.answers.vibe === preset ? 'active' : ''}"
                          onclick={() => selectVibe(preset)}
                        >
                          {preset}
                        </button>
                      {/each}
                    </div>

                  {:else}
                    {#if q.field === 'excludedFoods'}
                      <div class="food-input-group">
                        <input
                          id="input-excludedFoods"
                          type="text"
                          class="text-input food-input"
                          placeholder="피하고 싶은 음식 (예: 오이, 당근)"
                          bind:value={tempFood}
                          onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addExcludedFood())}
                        />
                        <button type="button" class="button-dark add-food-btn" onclick={addExcludedFood}>
                          추가
                        </button>
                      </div>
                      {#if session.answers.excludedFoods && session.answers.excludedFoods.length > 0}
                        <div class="excluded-tags">
                          {#each session.answers.excludedFoods as food}
                            <span class="badge-tag food-tag">
                              {food}
                              <button type="button" class="remove-food" onclick={() => removeExcludedFood(food)}>×</button>
                            </span>
                          {/each}
                        </div>
                      {/if}

                    {:else}
                      <input
                        id="input-{q.field}"
                        type="text"
                        class="text-input"
                        bind:value={session.answers[q.field]}
                      />
                    {/if}
                  {/if}
                {/if}
              {/if}
            {/if}
          {/if}
        {/if}
      </div>
    {/each}
  </div>

  <div class="form-actions">
    <button
      class="button-primary submit-answers-btn"
      onclick={() => session.submitAnswers()}
      disabled={session.loading}
    >
      {#if session.loading}
        답변 제출 중...
      {:else}
        답변 제출하고 추천받기
      {/if}
    </button>
  </div>
</div>

<style>
  .question-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xl);
    width: 100%;
  }

  .question-header {
    border-bottom: 1px solid var(--color-hairline);
    padding-bottom: var(--spacing-sm);
  }

  .title {
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 700;
    color: var(--color-ink);
  }

  .subtitle {
    font-size: 14px;
    color: var(--color-mute);
    margin-top: var(--spacing-xs);
  }

  .questions-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .question-item {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .question-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-charcoal);
  }

  .pill-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
  }

  .pill-group.presets {
    margin-top: var(--spacing-xs);
  }

  .preset-pill {
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }

  .preset-pill.active {
    background-color: var(--color-surface-dark);
    color: var(--color-on-dark);
    border-color: var(--color-surface-dark);
  }

  .input-preset-container {
    display: flex;
    align-items: center;
    position: relative;
    width: 100%;
  }

  .input-preset-container .text-input {
    padding-right: 40px;
  }

  .unit {
    position: absolute;
    right: 16px;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-charcoal);
  }

  .food-input-group {
    display: flex;
    gap: var(--spacing-sm);
  }

  .food-input {
    flex: 1;
  }

  .add-food-btn {
    height: 44px;
    padding: 0 16px;
  }

  .excluded-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
    margin-top: var(--spacing-xs);
  }

  .food-tag {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xxs) var(--spacing-sm);
  }

  .remove-food {
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    color: var(--color-ash);
    line-height: 1;
  }

  .remove-food:hover {
    color: var(--color-primary);
  }

  .form-actions {
    margin-top: var(--spacing-md);
  }

  .submit-answers-btn {
    width: 100%;
    height: 48px;
    font-size: 16px;
  }
</style>
