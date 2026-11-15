// ESLint flat config — https://docs.expo.dev/guides/using-eslint/
//
// Base = eslint-config-expo (React Native globals, platform-aware import
// resolution, react-hooks, @typescript-eslint, and expo/* rules). On top of it
// we layer a curated set of modern rules. Every plugin referenced here already
// ships as a dependency of eslint-config-expo, so there are no extra installs.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const tsParser = require('@typescript-eslint/parser');

const HERMES_V1_MISSING =
  'Missing from the Hermes v1 VM RN 0.88 ships: typechecks and passes Jest, crashes on device;';

module.exports = defineConfig([
  expoConfig,

  {
    // `supabase/functions` are Deno edge functions; `plugins/` are Node build-time
    // config plugins — neither is part of the RN/TS app.
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'supabase/**', 'plugins/**', 'web/**', 'expo-env.d.ts'],
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

      // Errors that carry a stack. A thrown or rejected PostgREST error object
      // (or a string) reaches the error boundary and the logs with no stack.
      '@typescript-eslint/only-throw-error': 'warn',
      '@typescript-eslint/prefer-promise-reject-errors': 'warn',
      // A `.catch(e => …)` parameter is `any` by default, which re-opens the hole
      // `useUnknownInCatchVariables` closes for `try`/`catch`.
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'warn',
      // An object in a template literal or string concatenation renders as
      // "[object Object]"; a number plus a string concatenates. Nearly every value
      // here is an epoch, an offset or a degree, where that is a wrong answer
      // that looks plausible.
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/restrict-plus-operands': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      // `.sort()` with no comparator compares strings, so [2, 10] sorts to [10, 2].
      '@typescript-eslint/require-array-sort-compare': 'warn',
      // `delete arr[i]` leaves a hole; splice() was meant.
      '@typescript-eslint/no-array-delete': 'warn',
      // `onPress={obj.method}` loses `this`.
      '@typescript-eslint/unbound-method': 'warn',
      // A new member of a union must be handled wherever it is switched on; a
      // `default` arm counts as handling it.
      '@typescript-eslint/switch-exhaustiveness-check': [
        'warn',
        { considerDefaultExhaustiveForUnions: true },
      ],
      // Not `no-deprecated`: it flags react-native-svg's `<Rect x y>`, which
      // `api:check` correctly allows.
    },
  },

  // ── Hermes v1 guard ──────────────────────────────────────────────────────
  // TypeScript's ESNext lib types these and Jest runs them on Node, so a call
  // passes both and then throws on device. App source only: tests and scripts
  // run on Node. Deliberately absent because Hermes v1 has them: Object.groupBy,
  // the ES2025 Set methods, String#isWellFormed, and structuredClone (Expo's
  // winter runtime polyfills it). Errors, not warnings: each one is a crash.
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    ignores: ['src/**/__tests__/**', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        // No `object`, so it matches every receiver, `a?.toSorted()` and
        // `const { toSorted } = a` included.
        { property: 'toSorted', message: `${HERMES_V1_MISSING} use [...array].sort().` },
        {
          object: 'Array',
          property: 'fromAsync',
          message: `${HERMES_V1_MISSING} use Promise.all() or a for await...of loop.`,
        },
        {
          object: 'Map',
          property: 'groupBy',
          message: `${HERMES_V1_MISSING} build the Map in a loop (Object.groupBy is fine).`,
        },
        {
          object: 'Promise',
          property: 'try',
          message: `${HERMES_V1_MISSING} use new Promise(resolve => resolve(fn())).`,
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'DisposableStack', message: `${HERMES_V1_MISSING} use try/finally.` },
        { name: 'AsyncDisposableStack', message: `${HERMES_V1_MISSING} use try/finally.` },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "VariableDeclaration[kind='using']",
          message: `\`using\`: ${HERMES_V1_MISSING} use try/finally.`,
        },
        {
          selector: "VariableDeclaration[kind='await using']",
          message: `\`await using\`: ${HERMES_V1_MISSING} use try/finally.`,
        },
      ],
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
