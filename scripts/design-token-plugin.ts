type AstNode = {
  type: string;
  value?: string | { raw?: string } | null;
};

type RuleContext = {
  report(diagnostic: { node: AstNode; message: string }): void;
};

type Rule = {
  create(context: RuleContext): Record<string, (node: AstNode) => void>;
};

const violations: Array<[RegExp, string]> = [
  [
    /(?:[a-z-]*-)?(?:slate|sky|amber|emerald|red|zinc|gray|grey|blue|green|yellow|rose|cyan|indigo|violet|purple|orange|teal|lime|pink|fuchsia|stone)-(?:50|\d{3})\b/,
    'Stock Tailwind palette classes are banned. Use a semantic token — see .agent/design-system.md.',
  ],
  [
    /\b(?:bg|text|border|ring|fill|stroke|divide|from|via|to)-(?:white|black)\b/,
    'Bare white/black is banned. Use --color-text-primary, --color-surface-* or an on-fill token.',
  ],
  [/--gs-/, 'Primitive tokens (--gs-*) must never appear in a component. Use a semantic token.'],
  [/#[0-9a-fA-F]{3,8}\b/, 'Raw hex colours are banned in components. Use a semantic token.'],
];

export function findDesignTokenViolation(value: string): string | null {
  for (const [pattern, message] of violations) {
    if (pattern.test(value)) {
      return message;
    }
  }

  return null;
}

const rule: Rule = {
  create(context) {
    const checkNode = (node: AstNode) => {
      const value =
        typeof node.value === 'string'
          ? node.value
          : node.type === 'TemplateElement'
            ? node.value?.raw
            : null;
      const message =
        value === undefined || value === null ? null : findDesignTokenViolation(value);

      if (message !== null) {
        context.report({ node, message });
      }
    };

    return {
      Literal: checkNode,
      TemplateElement: checkNode,
    };
  },
};

export default {
  meta: { name: 'ghostslate-design-tokens' },
  rules: { 'no-stock-palette': rule },
};
