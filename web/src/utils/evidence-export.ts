import type {
  GroundingReport,
  InvestigationEvidenceSummary,
  InvestigationTraceEvent,
  RemediationState,
} from '../types.js';

export const EVIDENCE_EXPORT_SCHEMA_VERSION = '1.0';

export interface EvidenceExportInput {
  scenario: {
    id: string;
    label: string;
    prompt: string;
    channel: string;
    from: string;
    to: string;
  };
  runKey: string;
  executionMode?: 'live' | 'cached_replay' | undefined;
  trace: InvestigationTraceEvent[];
  finalDiagnosis: string;
  grounding?: GroundingReport | undefined;
  evidenceSummary?: InvestigationEvidenceSummary | undefined;
  remediation?: RemediationState | null | undefined;
  metrics?: unknown;
  exportedAt?: string | undefined;
}

export interface EvidenceExportBundle {
  schemaVersion: string;
  exportedAt: string;
  run: {
    runKey: string;
    executionMode: 'live' | 'cached_replay' | 'unknown';
  };
  scenario: EvidenceExportInput['scenario'];
  investigation: {
    prompt: string;
    trace: InvestigationTraceEvent[];
    finalDiagnosis: string;
  };
  evidence: {
    summary?: InvestigationEvidenceSummary | undefined;
    grounding?: GroundingReport | undefined;
    metrics?: unknown;
  };
  remediation: RemediationState | null;
}

const SECRET_KEY =
  /(authorization|cookie|credential|password|privatekey|secret|token|api[-_]?key)/i;
const FRAME_PAYLOAD_KEY = /^(frameBase64|frame_base64|imageBase64|image_base64)$/i;

function sanitize(value: unknown, key?: string): unknown {
  if (key && (SECRET_KEY.test(key) || FRAME_PAYLOAD_KEY.test(key))) return undefined;
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const cleaned = sanitize(childValue, childKey);
      if (cleaned !== undefined) result[childKey] = cleaned;
    }
    return result;
  }
  return value;
}

export function createEvidenceExportBundle(input: EvidenceExportInput): EvidenceExportBundle {
  const bundle: EvidenceExportBundle = {
    schemaVersion: EVIDENCE_EXPORT_SCHEMA_VERSION,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    run: {
      runKey: input.runKey,
      executionMode: input.executionMode ?? 'unknown',
    },
    scenario: input.scenario,
    investigation: {
      prompt: input.scenario.prompt,
      trace: input.trace,
      finalDiagnosis: input.finalDiagnosis,
    },
    evidence: {
      summary: input.evidenceSummary,
      grounding: input.grounding,
      metrics: input.metrics,
    },
    remediation: input.remediation ?? null,
  };
  return sanitize(bundle) as EvidenceExportBundle;
}

export function serializeEvidenceExport(input: EvidenceExportInput): string {
  return JSON.stringify(createEvidenceExportBundle(input), null, 2) + '\n';
}

function markdownValue(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? '—');
}

export function renderEvidenceMarkdown(input: EvidenceExportInput): string {
  const bundle = createEvidenceExportBundle(input);
  const queryEvents = bundle.investigation.trace.filter(
    (event) => event.type === 'tool_call' || event.type === 'tool_result',
  );
  const queryAppendix = queryEvents.length
    ? queryEvents
        .map(
          (event) =>
            `### ${event.type} · ${event.timestamp}\n\n\`\`\`json\n${markdownValue(event.data)}\n\`\`\``,
        )
        .join('\n\n')
    : 'No ClickHouse tool events recorded.';

  return [
    '# GhostSlate forensic evidence',
    '',
    `- Exported: ${bundle.exportedAt} (UTC)`,
    `- Schema: ${bundle.schemaVersion}`,
    `- Run: ${bundle.run.runKey} (${bundle.run.executionMode})`,
    `- Scenario: ${bundle.scenario.label} · ${bundle.scenario.id}`,
    `- Window: ${bundle.scenario.from} → ${bundle.scenario.to} (UTC)`,
    '',
    '## Operator prompt',
    '',
    bundle.investigation.prompt,
    '',
    '## Diagnosis',
    '',
    bundle.investigation.finalDiagnosis,
    '',
    '## Evidence summary',
    '',
    '```json',
    markdownValue(bundle.evidence.summary ?? null),
    '```',
    '',
    '## Grounding report',
    '',
    '```json',
    markdownValue(bundle.evidence.grounding ?? null),
    '```',
    '',
    '## Remediation',
    '',
    '```json',
    markdownValue(bundle.remediation),
    '```',
    '',
    '## MCP / SQL trace',
    '',
    queryAppendix,
    '',
  ].join('\n');
}

function download(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadEvidenceJson(input: EvidenceExportInput): void {
  download(
    serializeEvidenceExport(input),
    `ghostslate-${input.runKey.slice(0, 12)}.json`,
    'application/json',
  );
}

export function downloadEvidenceMarkdown(input: EvidenceExportInput): void {
  download(
    renderEvidenceMarkdown(input),
    `ghostslate-${input.runKey.slice(0, 12)}.md`,
    'text/markdown',
  );
}
