import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.vite/**', '**/coverage/**', '**/*.d.ts'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Literal[value=/(?:[a-z-]*-)?(?:slate|sky|amber|emerald|red|zinc|gray|grey|blue|green|yellow|rose|cyan|indigo|violet|purple|orange|teal|lime|pink|fuchsia|stone)-(?:50|\\d{3})\\b/]',
          message:
            'Stock Tailwind palette classes are banned. Use a semantic token — see .agent/design-system.md.',
        },
        {
          selector:
            'TemplateElement[value.raw=/(?:[a-z-]*-)?(?:slate|sky|amber|emerald|red|zinc|gray|grey|blue|green|yellow|rose|cyan|indigo|violet|purple|orange|teal|lime|pink|fuchsia|stone)-(?:50|\\d{3})\\b/]',
          message:
            'Stock Tailwind palette classes are banned. Use a semantic token — see .agent/design-system.md.',
        },
        {
          selector:
            'Literal[value=/\\b(?:bg|text|border|ring|fill|stroke|divide|from|via|to)-(?:white|black)\\b/]',
          message:
            'Bare white/black is banned. Use --color-text-primary, --color-surface-* or an on-fill token.',
        },
        {
          selector:
            'TemplateElement[value.raw=/\\b(?:bg|text|border|ring|fill|stroke|divide|from|via|to)-(?:white|black)\\b/]',
          message:
            'Bare white/black is banned. Use --color-text-primary, --color-surface-* or an on-fill token.',
        },
        {
          selector: 'Literal[value=/--gs-/]',
          message:
            'Primitive tokens (--gs-*) must never appear in a component. Use a semantic token.',
        },
        {
          selector: 'TemplateElement[value.raw=/--gs-/]',
          message:
            'Primitive tokens (--gs-*) must never appear in a component. Use a semantic token.',
        },
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
          message: 'Raw hex colours are banned in components. Use a semantic token.',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]',
          message: 'Raw hex colours are banned in components. Use a semantic token.',
        },
      ],
    },
  },
);
