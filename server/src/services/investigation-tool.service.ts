import { Type, type FunctionDeclaration } from '@google/genai';
import type { McpClientService } from './mcp.service.js';
import type { FrameClassification, VisionService } from './vision.service.js';
import {
  decodeDiagnosisRows,
  renderLossAttributionQuery,
  type DiagnosisRow,
  type InvestigationContext,
} from './evidence.helper.js';
import { getPermittedMediaMapping, PRIMARY_INCIDENT_MEDIA_MAPPING } from './incident.constants.js';

export interface ToolOutcome {
  modelText: string;
  resultText: string;
  isError: boolean;
  frame?: FrameClassification;
  evidenceRows?: DiagnosisRow[];
  renderedSql?: string;
  rowsReturned?: number | undefined;
  rowsScanned?: number | undefined;
}

const MAX_MODEL_RESULT_ROWS = 50;
const MODEL_TRUNCATION_NOTE = `Output truncated to first ${MAX_MODEL_RESULT_ROWS} rows. Use GROUP BY aggregation for full dataset analysis.`;

export const INSPECTABLE_MEDIA_DURATIONS_SECONDS = {
  [PRIMARY_INCIDENT_MEDIA_MAPPING.permittedMediaFile]:
    PRIMARY_INCIDENT_MEDIA_MAPPING.maxTimestampSeconds,
  'ad.mp4': 15,
  'content.mp4': 10,
} as const;

function parseJson(resultText: string): unknown {
  try {
    return JSON.parse(resultText);
  } catch {
    return undefined;
  }
}

function queryResult(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const wrapper = raw as Record<string, unknown>;
  return wrapper.result && typeof wrapper.result === 'object' && !Array.isArray(wrapper.result)
    ? (wrapper.result as Record<string, unknown>)
    : wrapper;
}

function rowsReturnedFrom(raw: unknown): number | undefined {
  const result = queryResult(raw);
  return result && Array.isArray(result.rows) ? result.rows.length : undefined;
}

function rowsScannedFrom(raw: unknown): number | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const wrapper = raw as Record<string, unknown>;
  const candidates: unknown[] = [wrapper.rows_read, wrapper.read_rows];

  for (const key of ['statistics', 'stats', 'meta']) {
    const value = wrapper[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      candidates.push(record.rows_read, record.read_rows, record.rowsRead);
    }
  }

  for (const key of ['result', 'structuredContent']) {
    const nested = wrapper[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      candidates.push(rowsScannedFrom(nested));
    } else if (typeof nested === 'string') {
      candidates.push(rowsScannedFrom(parseJson(nested)));
    }
  }

  for (const candidate of candidates) {
    const parsed = typeof candidate === 'number' ? candidate : Number(candidate);
    if (candidate !== null && candidate !== '' && Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
}

function truncateQueryResultForModel(resultText: string): string {
  const parsed = parseJson(resultText);
  const result = queryResult(parsed);
  if (!result || !Array.isArray(result.rows) || result.rows.length <= MAX_MODEL_RESULT_ROWS) {
    return resultText;
  }

  const truncatedResult = {
    ...result,
    rows: result.rows.slice(0, MAX_MODEL_RESULT_ROWS),
    total_rows: result.rows.length,
    note: MODEL_TRUNCATION_NOTE,
  };
  return JSON.stringify(
    result === parsed ? truncatedResult : { ...(parsed as object), result: truncatedResult },
  );
}

export function createInvestigationToolDeclarations(): FunctionDeclaration[] {
  return [
    {
      name: 'run_query',
      description:
        'Execute a read-only SQL query against ClickHouse database for exploratory analysis.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'The ClickHouse SQL query to execute.' },
        },
        required: ['query'],
      },
    },
    {
      name: 'list_tables',
      description: 'List tables available in a ClickHouse database.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          database: { type: Type.STRING, description: 'The database name (default: ghostslate).' },
        },
        required: ['database'],
      },
    },
    {
      name: 'classify_frame',
      description:
        'Inspect the actual video frame at a given timestamp and classify what is on screen as ' +
        '"slate", "ad", or "content". Use this to confirm visually whether an ad break bled filler ' +
        'slate to air. Returns classification, confidence, slate type, detected text, and visual summary.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          video_file: {
            type: Type.STRING,
            description: `The demo stream to inspect for this incident (e.g. ${PRIMARY_INCIDENT_MEDIA_MAPPING.permittedMediaFile}).`,
          },
          timestamp_seconds: {
            type: Type.NUMBER,
            description: `Offset into the synthetic demo stream, in seconds. Must be >= 0 and strictly less than media clip duration (${PRIMARY_INCIDENT_MEDIA_MAPPING.permittedMediaFile}: ${PRIMARY_INCIDENT_MEDIA_MAPPING.maxTimestampSeconds}s).`,
          },
        },
        required: ['video_file', 'timestamp_seconds'],
      },
    },
    {
      name: 'collect_diagnosis_evidence',
      description:
        'Execute the server-rendered canonical loss attribution query for the investigation context ' +
        'to snapshot authoritative forensic evidence. Accepts no arguments. Must be called before finalization.',
      parameters: { type: Type.OBJECT, properties: {} },
    },
    {
      name: 'finalize_investigation',
      description:
        'Conclude the investigation and publish the final grounded forensic diagnosis based on collected evidence. ' +
        'Accepts no arguments. Must be called alone in its turn as the final action.',
      parameters: { type: Type.OBJECT, properties: {} },
    },
  ];
}

export class InvestigationToolService {
  constructor(
    private readonly mcpService: McpClientService,
    private readonly visionService: VisionService,
  ) {}

  async execute(
    name: string,
    args: Record<string, unknown>,
    context: InvestigationContext,
  ): Promise<ToolOutcome> {
    if (name === 'collect_diagnosis_evidence') {
      return this.collectDiagnosisEvidence(context);
    }
    if (name === 'classify_frame') {
      return this.classifyFrame(args, context);
    }
    if (name === 'finalize_investigation') {
      return {
        modelText: 'Finalizing investigation...',
        resultText: 'Finalizing investigation...',
        isError: false,
      };
    }

    const response = await this.mcpService.callTool(name, args);
    const resultText = response.content?.[0]?.text || JSON.stringify(response);
    const parsed = parseJson(resultText);
    return {
      modelText: truncateQueryResultForModel(resultText),
      resultText,
      isError: response.isError || false,
      rowsReturned: rowsReturnedFrom(parsed),
      rowsScanned: rowsScannedFrom(parsed) ?? rowsScannedFrom(response),
    };
  }

  private async collectDiagnosisEvidence(context: InvestigationContext): Promise<ToolOutcome> {
    const renderedSql = renderLossAttributionQuery(context);
    const response = await this.mcpService.callTool('run_query', { query: renderedSql });
    const resultText = response.content?.[0]?.text || JSON.stringify(response);
    const parsed = parseJson(resultText);
    const rowsScanned = rowsScannedFrom(parsed) ?? rowsScannedFrom(response);

    if (response.isError) {
      return {
        modelText: resultText,
        resultText,
        isError: true,
        renderedSql,
        rowsScanned,
      };
    }

    try {
      const evidenceRows = decodeDiagnosisRows(parsed, context.channel);
      let modelText = truncateQueryResultForModel(resultText);
      if (evidenceRows.length === 0) {
        modelText = JSON.stringify({
          columns: [],
          rows: [],
          notice:
            'Canonical evidence returned no cohort meeting the cues >= 20 guard. Insufficient qualifying evidence exists to evaluate incident failure thresholds. All exploratory candidates are invalidated. Conclude insufficient qualifying evidence and finalize without asserting a root cause, slate bleed, loss, or remediation.',
        });
      }
      return {
        modelText,
        resultText,
        isError: false,
        evidenceRows,
        renderedSql,
        rowsReturned: evidenceRows.length,
        rowsScanned,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const errorText = `Canonical evidence validation failed: ${message}`;
      return {
        modelText: errorText,
        resultText: errorText,
        isError: true,
        renderedSql,
        rowsScanned,
      };
    }
  }

  private async classifyFrame(
    args: Record<string, unknown>,
    context: InvestigationContext,
  ): Promise<ToolOutcome> {
    const mapping = getPermittedMediaMapping(context);
    if (!mapping) {
      const errorText = `No synthetic stream media is mapped to investigation window ${context.from} to ${context.to} for channel ${context.channel}. Visual confirmation is only available for mapped incident windows.`;
      return { modelText: errorText, resultText: errorText, isError: true };
    }

    const videoFile = String(args.video_file ?? '');
    if (videoFile !== mapping.permittedMediaFile) {
      const errorText = `Media file "${videoFile}" is not mapped to the active incident context. Permitted media for this investigation is "${mapping.permittedMediaFile}".`;
      return { modelText: errorText, resultText: errorText, isError: true };
    }

    const timestamp = Number(args.timestamp_seconds);
    if (
      !Number.isFinite(timestamp) ||
      timestamp < mapping.minTimestampSeconds ||
      timestamp >= mapping.maxTimestampSeconds
    ) {
      const errorText = `Invalid timestamp_seconds "${String(args.timestamp_seconds)}" for ${mapping.permittedMediaFile}. Provide a number >= ${mapping.minTimestampSeconds} and strictly less than ${mapping.maxTimestampSeconds}.`;
      return { modelText: errorText, resultText: errorText, isError: true };
    }

    const frame = await this.visionService.classifyVideoTimestamp(videoFile, timestamp);
    if (
      !['slate', 'ad', 'content'].includes(frame.classification) ||
      (frame.slate_type !== null &&
        !['looping_card', 'black_screen', 'static_logo'].includes(frame.slate_type)) ||
      !Number.isFinite(frame.confidence) ||
      frame.confidence < 0 ||
      frame.confidence > 1
    ) {
      const errorText = 'Frame classifier returned an invalid structured result.';
      return { modelText: errorText, resultText: errorText, isError: true };
    }
    const normalizedFrame = { ...frame, timestampSeconds: timestamp };
    const { frameBase64: _frameBase64, ...modelFacing } = normalizedFrame;
    const modelText = JSON.stringify(modelFacing);
    return { modelText, resultText: modelText, isError: false, frame: normalizedFrame };
  }
}
