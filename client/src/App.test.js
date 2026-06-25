import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readProjectFile(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function cssBlock(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(
    new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`)
  );
  return match?.groups?.body ?? '';
}

describe('mumuk shadcn design contract', () => {
  it('documents preset b7CSd9JdZ as the design source of truth', () => {
    const designPath = resolve(repoRoot, 'DESIGN.md');

    expect(existsSync(designPath)).toBe(true);

    const design = readProjectFile('DESIGN.md');
    expect(design).toContain('shadcn-svelte');
    expect(design).toContain('b7CSd9JdZ');
    expect(design).toContain('button-primary');
    expect(design).toContain('card');
    expect(design).toContain('text-input');
    expect(design).toContain('pill-select');
    expect(design).toContain('No behavior changes');
  });

  it('maps existing semantic utility classes to shadcn token variables', () => {
    const css = readProjectFile('client/src/global.css');

    for (const token of [
      '--background',
      '--foreground',
      '--card',
      '--card-foreground',
      '--primary',
      '--primary-foreground',
      '--secondary',
      '--muted',
      '--muted-foreground',
      '--border',
      '--input',
      '--ring',
      '--radius'
    ]) {
      expect(css).toContain(token);
    }

    expect(cssBlock(css, '.button-primary')).toContain('var(--primary)');
    expect(cssBlock(css, '.button-primary')).toContain(
      'var(--primary-foreground)'
    );
    expect(cssBlock(css, '.card')).toContain('var(--card)');
    expect(cssBlock(css, '.card')).toContain('var(--card-foreground)');
    expect(cssBlock(css, '.text-input')).toContain('var(--input)');
    expect(cssBlock(css, '.text-input:focus')).toContain('var(--ring)');
    expect(cssBlock(css, '.pill-select.selected')).toContain('var(--primary)');
  });

  it('preserves existing Korean user-facing copy during visual migration', () => {
    const app = readProjectFile('client/src/App.svelte');
    const header = readProjectFile('client/src/lib/components/Header.svelte');
    const queryForm = readProjectFile(
      'client/src/lib/components/QueryForm.svelte'
    );
    const questionForm = readProjectFile(
      'client/src/lib/components/QuestionForm.svelte'
    );
    const resultsList = readProjectFile(
      'client/src/lib/components/ResultsList.svelte'
    );
    const errorCard = readProjectFile(
      'client/src/lib/components/ErrorCard.svelte'
    );

    expect(header).toContain('머먹');
    expect(header).toContain('처음으로');
    expect(app).toContain('오늘 뭐 먹지?');
    expect(queryForm).toContain('현재 위치 기준');
    expect(queryForm).toContain('출장/여행 모드');
    expect(queryForm).toContain('식당 추천받기');
    expect(questionForm).toContain('추가 질문');
    expect(questionForm).toContain('답변 제출하고 추천받기');
    expect(resultsList).toContain('추천 식당');
    expect(resultsList).toContain('추천 이유');
    expect(errorCard).toContain('서비스 일시 장애');
  });
});

it('renders loading progress as centered sweep text without a visible spinner', () => {
  const app = readProjectFile('client/src/App.svelte');

  expect(app).toContain('workflow-status-text');
  expect(app).toContain('@keyframes workflow-sweep');
  expect(app).not.toContain('workflow-spinner');
  expect(cssBlock(app, '.workflow-banner')).toContain('justify-content: center');
});
