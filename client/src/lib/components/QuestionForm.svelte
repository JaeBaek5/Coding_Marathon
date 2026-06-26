<script>
  import { getDefaultOptionsForField } from '@shared/contracts/questionPresets.js';

  const { session } = $props();

  let tempFood = $state('');

  const TEXT_INPUT_FIELDS = new Set([
    'budgetPerPersonKrw',
    'totalTimeMinutes',
    'partyContext',
    'vibe',
    'excludedFoods'
  ]);

  const BUTTON_ONLY_FIELDS = new Set([
    'mode',
    'mealPeriod',
    'transportMode',
    'desiredFoods'
  ]);

  // 복수 선택(토글)이 가능한 배열 필드
  const MULTI_SELECT_FIELDS = new Set(['desiredFoods', 'excludedFoods']);

  function resolveOptions(question) {
    if (question.options?.length) {
      return question.options;
    }
    return getDefaultOptionsForField(
      question.field,
      session.answers,
      session.query || ''
    ) || [];
  }

  function valuesEqual(field, left, right) {
    if (Array.isArray(left) || Array.isArray(right)) {
      return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
    }
    return left === right;
  }

  function toValueList(value) {
    return Array.isArray(value) ? value : [value];
  }

  function isOptionSelected(field, value) {
    if (MULTI_SELECT_FIELDS.has(field)) {
      const current = Array.isArray(session.answers[field])
        ? session.answers[field]
        : [];
      return toValueList(value).every((entry) => current.includes(entry));
    }
    return valuesEqual(field, session.answers[field], value);
  }

  function selectOption(field, value) {
    if (MULTI_SELECT_FIELDS.has(field)) {
      const current = Array.isArray(session.answers[field])
        ? [...session.answers[field]]
        : [];
      const incoming = toValueList(value);
      const allSelected = incoming.every((entry) => current.includes(entry));

      session.answers[field] = allSelected
        ? current.filter((entry) => !incoming.includes(entry))
        : [...current, ...incoming.filter((entry) => !current.includes(entry))];
      return;
    }
    session.answers[field] = value;
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

  function showTextInput(field, options = []) {
    if (BUTTON_ONLY_FIELDS.has(field)) {
      return false;
    }
    if (field === 'location') {
      return false;
    }
    return TEXT_INPUT_FIELDS.has(field) || options.length === 0;
  }
  const isFoodCravingStep = $derived(
    session.questions.length === 1 && session.questions[0]?.field === 'desiredFoods'
  );

  const canSubmitAnswers = $derived.by(() => {
    if (!isFoodCravingStep) {
      return true;
    }
    const selected = session.answers.desiredFoods;
    return Array.isArray(selected) && selected.length > 0;
  });
</script>

<div class="question-form card">
  <div class="question-header">
    <h3 class="title">{isFoodCravingStep ? '음식 맞추기' : '추가 질문'}</h3>
    <p class="subtitle">
      {#if isFoodCravingStep}
        AI가 지금 상태에 맞는 음식을 골라봤어요. 여러 개 선택할 수 있어요.
      {:else}
        입력하지 않은 항목은 기본값으로 진행됩니다.
      {/if}
    </p>
  </div>

  <div class="questions-list">
    {#each session.questions as q}
      {@const options = resolveOptions(q)}
      <div class="question-item">
        <label class="question-label" for="input-{q.field}">
          {q.label}
          {#if MULTI_SELECT_FIELDS.has(q.field) && options.length}
            <span class="multi-hint">복수 선택 가능</span>
          {/if}
        </label>

        {#if isFoodCravingStep && q.avoidSuggestions?.length}
          <div class="avoid-foods">
            <span class="avoid-label">비추천 음식</span>
            <div class="avoid-tags">
              {#each q.avoidSuggestions as avoid}
                <span class="badge-tag avoid-tag">{avoid.label}</span>
              {/each}
            </div>
          </div>
        {/if}

        {#if options.length}
          <div class="pill-group">
            {#each options as opt}
              <button
                type="button"
                class="pill-select {isOptionSelected(q.field, opt.value) ? 'selected' : ''}"
                aria-pressed={isOptionSelected(q.field, opt.value)}
                onclick={() => selectOption(q.field, opt.value)}
              >
                {opt.label}
              </button>
            {/each}
          </div>
        {/if}

        {#if q.field === 'location'}
          <p class="location-hint">
            위치가 필요합니다. 처음 화면으로 돌아가 위치를 선택한 뒤 다시 검색해 주세요.
          </p>
          <button type="button" class="button-dark location-reset-btn" onclick={() => session.reset()}>
            처음으로 돌아가기
          </button>
        {:else if showTextInput(q.field, options)}
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
          {:else if q.field === 'totalTimeMinutes'}
            <div class="input-preset-container">
              <input
                id="input-totalTimeMinutes"
                type="number"
                min="20"
                class="text-input"
                placeholder="20분 이상 (제한 없음)"
                bind:value={session.answers.totalTimeMinutes}
              />
              <span class="unit">분</span>
            </div>
          {:else if q.field === 'partyContext'}
            <input
              id="input-partyContext"
              type="text"
              class="text-input"
              placeholder="예: 회사 상사, 친구 등"
              bind:value={session.answers.partyContext}
            />
          {:else if q.field === 'vibe'}
            <input
              id="input-vibe"
              type="text"
              class="text-input"
              placeholder="예: 조용한, 캐주얼한 등"
              bind:value={session.answers.vibe}
            />
          {:else if q.field === 'excludedFoods'}
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
      </div>
    {/each}
  </div>

  <div class="form-actions">
    <button
      class="button-primary submit-answers-btn"
      onclick={() => session.submitAnswers()}
      disabled={session.loading || !canSubmitAnswers}
    >
      {#if session.loading}
        처리 중...
      {:else if isFoodCravingStep}
        이 음식으로 추천받기
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
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .multi-hint {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-primary);
    background: color-mix(in oklch, var(--color-primary) 12%, var(--color-surface-card));
    border-radius: var(--rounded-full);
    padding: 2px 8px;
  }

  .pill-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
  }

  .avoid-foods {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    margin-bottom: var(--spacing-xs);
  }

  .avoid-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-mute);
  }

  .avoid-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }

  .avoid-tag {
    color: var(--color-ash);
    border-color: var(--color-hairline-strong);
    background-color: var(--color-surface-bone);
    font-size: 12px;
  }

  .input-preset-container {
    display: flex;
    align-items: center;
    position: relative;
    width: 100%;
    margin-top: var(--spacing-xs);
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
    margin-top: var(--spacing-xs);
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

  .location-hint {
    font-size: 14px;
    color: var(--color-mute);
    line-height: 1.5;
    margin-top: var(--spacing-xs);
  }

  .location-reset-btn {
    align-self: flex-start;
    margin-top: var(--spacing-sm);
    height: 40px;
    padding: 0 16px;
  }
</style>
