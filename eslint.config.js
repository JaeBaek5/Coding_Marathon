import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default [
  js.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        $state: 'readonly',
        $derived: 'readonly',
        $effect: 'readonly',
        $props: 'readonly',
        $inspect: 'readonly',
        $host: 'readonly'
      }
    }
  },
  {
    ignores: [
      '**/dist/',
      '**/.svelte-kit/',
      '**/build/',
      '**/node_modules/',
      'playwright-report/',
      '.playwright-tests/'
    ]
  }
];
