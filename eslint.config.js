import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', 'dist-electron', 'release', 'test-artifacts']),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
  },
  {
    files: ['src/clipscore/**/*.{ts,tsx}', 'electron/clip-files.ts', 'electron/clipscore-settings.ts', 'tests/**/*.ts'],
    extends: [tseslint.configs.recommended],
    rules: { 'no-control-regex': 'off' },
  },
  {
    files: ['tests/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
