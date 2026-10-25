import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '.scratch/**',
      '.aws-sam*/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    files: [
      'backend/**/*.js',
      'scripts/**/*.mjs',
      'frontend/js/**/*.js',
      '*.js',
    ],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['frontend/js/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      'web/**/*.ts',
      'web/**/*.tsx',
      'e2e/**/*.ts',
      'playwright.config.ts',
    ],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['web/vite.config.ts', 'e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['web/src/**/*.tsx', 'web/src/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  prettier,
);
