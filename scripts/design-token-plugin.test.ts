import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';
import designTokenPlugin from './design-token-plugin.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'tsx' } },
});

const rule = designTokenPlugin.rules['no-stock-palette'] as unknown as Parameters<
  RuleTester['run']
>[1];

ruleTester.run('no-stock-palette', rule, {
  valid: [
    "const className = 'bg-surface-base';",
    'const className = `text-text-primary`;',
    '// bg-red-500 in a comment must not be reported\nconst className = "bg-surface-base";',
  ],
  invalid: [
    {
      code: "const className = 'bg-red-500';",
      errors: [{ message: /Stock Tailwind palette classes are banned/ }],
    },
    {
      code: 'const className = `text-white`;',
      errors: [{ message: /Bare white\/black is banned/ }],
    },
    {
      code: "const colour = '--gs-surface-base';",
      errors: [{ message: /Primitive tokens/ }],
    },
    {
      code: "const colour = '#fff';",
      errors: [{ message: /Raw hex colours are banned/ }],
    },
  ],
});
