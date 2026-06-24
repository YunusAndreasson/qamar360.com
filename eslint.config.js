// ESLint flat config — https://docs.expo.dev/guides/using-eslint/
//
// Base = eslint-config-expo (React Native globals, platform-aware import
// resolution, react-hooks, @typescript-eslint, and expo/* rules). On top of it
// we layer a curated set of modern rules. Every plugin referenced here already
// ships as a dependency of eslint-config-expo, so there are no extra installs.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const tsParser = require('@typescript-eslint/parser');

module.exports = defineConfig([
  expoConfig,

  {
    // `supabase/functions` are Deno edge functions, not part of the RN/TS app.
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'supabase/**', 'expo-env.d.ts'],
  },

  // ── Rules for all source files (no type information required) ────────────
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      // Modern JS hygiene
      'prefer-const': 'warn',
      'object-shorthand': ['warn', 'always'],
      eqeqeq: ['warn', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Tidy, deterministic imports (all auto-fixable with `--fix`)
      'import/no-duplicates': 'warn',
      'import/newline-after-import': 'warn',
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          pathGroups: [{ pattern: '@/**', group: 'internal', position: 'after' }],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // React / JSX
      'react/self-closing-comp': 'warn',
      'react/jsx-boolean-value': ['warn', 'never'],
    },
  },

  // ── TypeScript-specific (no type info) ──────────────────────────────────
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Prefer `import type` so Metro/Babel can fully strip type-only imports.
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'warn',
      // Catch unused params too (expo's base allows all args); `_`-prefixed are ok.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // ── Type-aware rules (the high-value modern bit) ─────────────────────────
  // Scoped to app source so the TypeScript program stays inside tsconfig and
  // JS config files (eslint.config.js, babel.config.js, scripts/*) are skipped.
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // Forgetting to await async work (e.g. a Supabase call) is the #1 RN bug.
      '@typescript-eslint/no-floating-promises': 'warn',
      // Allow async functions as JSX event handlers (onPress) but flag the rest.
      '@typescript-eslint/no-misused-promises': [
        'warn',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-misused-spread': 'warn',
    },
  },

  // ── Node-side config & scripts (not app source) ─────────────────────────
  // Must come LAST so it wins over the app-source block above (flat config is
  // last-match-wins). These run in Node, not the RN runtime: give them Node
  // globals and relax app-oriented rules (console is a real output channel).
  {
    files: ['*.config.js', 'eslint.config.js', 'scripts/**/*.{js,cjs,mjs}'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'import/order': 'off',
    },
  },
]);
