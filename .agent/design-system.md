# GhostSlate — Design System & Token Architecture

Canonical reference for how visual decisions are encoded in `web/`. `AGENTS.md` is the engineering
contract and points here; this file owns the detail. Where the two appear to disagree, `AGENTS.md`
wins and this file is wrong and must be fixed.

## 1. Why a token system at all

Three properties are being bought, and every rule below exists to protect one of them:

1. **Single ownership of a visual decision.** "The colour of a critical anomaly" is decided once,
   in one line, and read everywhere else. This is the `AGENTS.md` single-ownership rule applied to
   presentation: if two components disagree about what critical looks like, the architecture is
   wrong.
2. **Runtime theming.** Multiple themes can be swapped live, by writing one attribute, without
   touching a single component file. Adding the fifth theme must cost a CSS block, not an audit.
3. **A finite vocabulary.** A closed palette makes "is this the same grey?" answerable by reading,
   not by sampling pixels. It is also what stops a fourteenth grey from being invented at 2am.

A token system that does not deliver all three is decoration. Judge any proposed change against
these, not against how tidy it looks.

## 2. The three-tier architecture

Every visual value resolves through a chain. Each tier may only reference the tier above it.

```
component            semantic token              primitive token        literal
GroundedDiagnosis →  --color-status-critical  →  --red-400          →  #f87171
  never changes         themes swap this           fixed palette        one place
```

### Tier 1 — Primitives (reference tokens)

Raw values with context-free names. `--slate-950`, `--sky-400`, `--space-4`, `--radius-md`.

- A primitive describes **what the value is**, never where it is used.
- Primitives are **theme-independent**. `--red-400` is the same hex in every theme; what changes is
  which primitive a semantic token points at.
- **A primitive is never referenced by a component.** This is the single most important rule in
  this document. One surviving `text-slate-400` in a component freezes that spot to one theme and
  silently breaks every other one.
- The palette is closed. Adding a primitive is a deliberate act, not a reflex — the same bar
  `AGENTS.md` sets for adding a dependency.

### Tier 2 — Semantic tokens (system tokens)

Named for **role**, valued as a primitive. `--color-surface-base`, `--color-text-muted`,
`--color-status-critical`. This is the only tier components consume, and the only tier a theme
redefines.

The test for a good semantic name: **it stays correct when its value changes.**
`--color-status-critical` survives a redesign. `--color-red-accent` does not — it names the value,
so it becomes a lie the first time critical stops being red.

A semantic token earns its place when a role is real and repeated. Do not mint one per component;
that is tier 3 wearing the wrong name.

### Tier 3 — Component tokens

A knob a single component owns, valued as a semantic token. `--sql-keyword-color:
var(--color-syntax-keyword)`.

**Not currently used in this repo, and not to be added speculatively.** A component token is
justified only when a component genuinely needs to vary independently of its role — the same bar
`AGENTS.md` sets for patterns. Absent a real variation to absorb, it is added indirection.

## 3. Naming

Ordered, predictable, lowercase kebab:

```
--{category}-{property}-{role}-{variant}-{state}
```

```
--color-text-primary
--color-bg-interactive-hover
--color-status-critical
--space-4
--ease-out-expo
```

Consistency of ordering matters more than the ordering chosen. `category` first is non-negotiable
because Tailwind v4 keys utility generation off it (`--color-*` produces `bg-*`, `text-*`,
`border-*`).

## 4. Tokens are not only colour

Colour is the loudest dimension, not the only one. Each of these is a scale, defined once:

| Dimension  | Tokens                                | Note                                              |
| ---------- | ------------------------------------- | ------------------------------------------------- |
| Colour     | `--color-*`                           | Three tiers as above.                             |
| Spacing    | `--space-*`                           | One base step (4px), multiples only. No `13px`.   |
| Radius     | `--radius-*`                          | `sm`/`md`/`lg`/`full`.                            |
| Typography | `--text-*`, `--font-*`, `--leading-*` | Size, family, weight, line height.                |
| Elevation  | `--shadow-*`                          | Semantic depth, not literal blur values.          |
| Motion     | `--duration-*`, `--ease-*`            | A curve used twice is a token.                    |
| Layering   | `--z-*`                               | Named layers. Never a bare `z-50` in a component. |

Motion deserves specific mention: a bespoke `cubic-bezier` written inline is a token that has not
been named yet. The second animation will want the same curve.

## 5. Theming contract

A theme is **a redefinition of tier 2 and nothing else**.

```css
/* Tier 1 — primitives. Theme-independent. Components never touch these. */
@layer theme {
  :root {
    --slate-950: #070b12;
    --sky-400: #38bdf8;
    /* …closed palette */
  }
}

/* Tier 2 — semantic. The default (dark) theme. */
@theme static {
  --color-surface-base: var(--slate-950);
  --color-text-primary: var(--slate-50);
  --color-status-critical: var(--red-400);
  --color-confidence-high: var(--emerald-400);
}

/* A theme redefines tier 2 only. No component file is touched. */
[data-theme='light'] {
  --color-surface-base: var(--slate-50);
  --color-text-primary: var(--slate-950);
  --color-status-critical: var(--red-600);
  --color-confidence-high: var(--emerald-600);
}
```

Toggling is one attribute write:

```ts
document.documentElement.dataset.theme = 'light';
```

Custom properties cascade and re-resolve live, so this is genuinely runtime: no rebuild, no
re-render, no JS restyling pass, no flash of the previous theme.

**Rules that keep this working:**

- **Every theme defines the complete semantic set.** A missing token does not error — it inherits
  the previous theme's value. That is how one card ends up white-on-white while everything else
  looks fine.
- **Themes swap tier 2 only.** A theme that redefines a primitive has broken the model: it changes
  the meaning of `--red-400` for every other theme that shares it.
- **Contrast is verified per theme.** Body text meets WCAG AA (4.5:1), large text and non-text UI
  meet 3:1. A palette that passes in dark and fails in light is not a theme, it is a bug.
- Respect `prefers-reduced-motion` at the token layer: collapse `--duration-*` to `0ms` rather than
  auditing individual animations.

## 6. Tailwind v4 mechanics

- The semantic tier lives in `@theme`, which is what makes tokens generate real utilities —
  `--color-surface-base` yields `bg-surface-base`, `text-surface-base`, `border-surface-base`, with
  autocomplete. Tokens that are not registered with `@theme` produce no utilities, which is exactly
  why unregistered tokens get bypassed in favour of stock palette classes.
- **Use `@theme static`.** Tailwind v4 tree-shakes unused `@theme` variables, emitting custom
  properties only for utilities actually used. For runtime theming this silently breaks you: a
  variable your `[data-theme]` block overrides may not exist on `:root` at all. Themes then appear
  to work in dev and half-fail in the production build. `static` emits every token unconditionally.
- Primitives belong in `@layer theme`, **not** in `@theme` — they must not generate utilities.
  A generated `bg-slate-950` is a loaded gun pointed at tier 1.
- With tokens registered, prefer the generated utility (`bg-surface-base`) over arbitrary-property
  syntax (`bg-(--surface-base)`). The arbitrary form remains correct for tokens deliberately kept
  out of `@theme`.

## 7. Domain tokens

Four role groups encode meaning this product repeats, and therefore belong in tier 2 rather than
being re-decided per component:

- **Agent confidence** — `--color-confidence-high` / `-medium` / `-low`. `AGENTS.md` requires
  confidence thresholds to have one definition; their visual encoding is part of that definition.
- **Telemetry severity** — `--color-severity-nominal` / `-degraded` / `-anomalous`. Shared by the
  war-room, the diagnosis card and the vision section.
- **Frame classification** — `--color-classification-slate` (critical red),
  `--color-classification-ad` (info blue), `--color-classification-content` (success emerald).
  Mirrors `ClassificationType` in `web/src/types.ts`.
- **Agent reasoning** — `--color-reasoning-fg` / `-surface` / `-border` / `-subtle` (purple). Shared
  by cognitive hypothesis logging and agent thought traces in the war-room.

These are semantic tokens, not component tokens: the role is the product's, not any one view's.

## 8. Anti-patterns

- A stock palette class (`text-slate-400`, `bg-sky-500`) anywhere under `web/src/components/`.
- A raw hex or arbitrary colour (`bg-[#141f36]`) in a component.
- A semantic token named after its value (`--color-blue-border`).
- A theme block that redefines a primitive.
- A token minted for exactly one usage — that is a literal with extra steps.
- A magic number for spacing, radius, duration or z-index that bypasses its scale.
- Dark-mode values defined on bare `:root` with no theme seam.

## 9. Enforcement

The properties in §1 are only real if they cannot quietly decay:

- Lint bans stock palette classes and raw hex under `web/src/components/`. A rule is cheaper than
  remembering.
- Every theme is diffed against the default for missing semantic tokens before it ships.
- Adding a primitive, or a tier-3 token, is called out in review with the reason it was needed.

## 10. Checklist for any visual change

1. Does a semantic token for this role already exist? Use it.
2. If not, is the role real and repeated? Add a semantic token pointing at an existing primitive.
3. Does it need a new primitive? Justify it — the palette is closed by default.
4. Does every theme define the new token?
5. Is the component free of primitives, hexes and magic numbers?
