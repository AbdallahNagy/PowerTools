import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Colors come from theme tokens (desktop/.agents/skills/ui-colors/SKILL.md).
    files: ['src/ui/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...hardcodedColorRules()],
    },
  },
)

function hardcodedColorRules() {
  const patterns = [
    ['\\[#[0-9a-fA-F]{3,8}\\]', 'Use a theme token class (bg-surface, text-fg-muted) instead of an arbitrary hex color.'],
    ['#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\\b', 'Use var(--color-<token>) instead of a hex color.'],
    ['rgba?\\(', 'Use a theme token, with an opacity modifier or color-mix(), instead of rgb()/rgba().'],
    [
      '\\b(bg|text|border|ring|fill|stroke|outline|divide|placeholder|accent|from|via|to)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white)\\b',
      'Use a theme token class instead of a Tailwind palette color.',
    ],
  ]
  return patterns.flatMap(([pattern, message]) => [
    { selector: `Literal[value=/${pattern}/]`, message },
    { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
  ])
}
