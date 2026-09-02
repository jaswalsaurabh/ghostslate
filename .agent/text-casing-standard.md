# GhostSlate UI Text Casing Standard

This standard governs user-visible text in `web/`, including static copy, dynamic labels, status
messages, tooltips, accessibility names, scenario metadata, and server-provided strings rendered by
the UI.

## Default casing

- Use sentence case for page headings, section headings, buttons, body copy, statuses, tooltips,
  errors, and accessibility labels.
- Use uppercase or small caps only for compact metadata, telemetry labels, table headers, badges,
  and media/HUD overlays where the visual treatment is intentional.
- Do not apply an uppercase CSS class to a container that also contains a user-selected name,
  scenario label, long-form sentence, or technical value.
- Prefer CSS for a deliberate visual treatment. Do not call `toUpperCase()` on a user-facing value
  unless the value is explicitly part of an all-caps metadata treatment.
- Use one spelling and hyphenation for repeated actions and terms. For example, the action is
  always `Reclassify`, not `Re-classify` in one place and `Reclassify` in another.

## Technical names and acronyms

Preserve established casing for formal names and technical identifiers:

`API`, `MCP`, `SSP`, `SSAI`, `OCR`, `SQL`, `JSON`, `AI`, `ClickHouse`, `Vertex AI`, `Gemini Vision`,
`mcp-clickhouse`, channel IDs such as `ch-01`, and machine-readable names such as
`finalize_investigation`.

Human-facing domain values use title casing when presented as labels:

`slate` → `Slate`, `ad` → `Ad`, and `content` → `Content`.

## Exceptions

All-caps metadata is allowed when it improves scanability and is limited to the visual element that
owns the metadata role. This includes metric labels, compact status badges, table headers, evidence
tags, and broadcast overlays. The underlying accessible name and long-form explanatory copy should
still use sentence case unless the technical name itself requires uppercase.

When a server-owned or scenario-owned string is rendered by the UI, it follows this same standard;
the source of the string does not create a casing exception.
