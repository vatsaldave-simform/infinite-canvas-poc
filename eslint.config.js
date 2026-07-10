import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // ── Architecture boundary ────────────────────────────────────────────────
  // The core engine MUST stay framework-agnostic. Anything under src/core/
  // is forbidden from importing React or reaching into the React layer.
  // This turns the "core never imports react" rule into a build-time error.
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message:
                'core/ must be framework-agnostic — no React imports allowed.',
            },
            {
              group: ['@react/*', '**/react/*', '**/react'],
              message:
                'core/ must not depend on the React layer. Dependencies flow react/ → core/, never the reverse.',
            },
          ],
        },
      ],
    },
  },
)
