import { Type, type FunctionDeclaration } from '@google/genai';
import type { McpClientService } from './mcp.service.js';
import type { FrameClassification, VisionService } from './vision.service.js';
import {
  decodeDiagnosisRows,
  renderLossAttributionQuery,
  type DiagnosisRow,
  type InvestigationContext,
} from './evidence.helper.js';
import { ScenarioService } from './scenario.service.js';

export interface ToolOutcome {
  modelText: string;
  resultText: string;
  isError: boolean;
  frame?: FrameClassification;
  evidenceRows?: DiagnosisRow[];
  renderedSql?: string;
  rowsReturned?: number | undefined;
  rowsScanned?: number | undefined;
  resolvedArgs?: Record<string, unknown> | undefined;
}

const MAX_MODEL_RESULT_ROWS = 50;
const MAX_TRACE_RESULT_CHARS = 256 * 1_024;
const MODEL_TRUNCATION_NOTE = `Output truncated to first ${MAX_MODEL_RESULT_ROWS} rows. Use GROUP BY aggregation for full dataset analysis.`;
const BLOCKED_QUERY_PATTERN =
  /\b(?:file|hdfs|jdbc|mongodb|mysql|odbc|postgresql|redis|remote|remoteSecure|s3|s3Cluster|url|http|https|azureBlobStorage|gcs|iceberg|deltaLake|input|numbers|generateRandom|sleep)\s*\(|\b(?:system|information_schema)\s*\.|\bINTO\s+OUTFILE\b|\b(?:SETTINGS|FORMAT|INSERT|ALTER|TRUNCATE|DROP|CREATE|OPTIMIZE|SYSTEM)\b/i;

const ALLOWED_TABLES = new Set([
  'ghostslate.scte35_cue_events',
  'ghostslate.ssai_stitch_attempts',
  'ghostslate.slate_observations',
  'ghostslate.advertiser_inventory',
  'scte35_cue_events',
  'ssai_stitch_attempts',
  'slate_observations',
  'advertiser_inventory',
]);

function validateTableReferences(query: string): string | undefined {
  const references = [...query.matchAll(/\b(?:FROM|JOIN)\s+([a-zA-Z0-9_.]+)/gi)].map((match) =>
    match[1]?.toLowerCase(),
  );
  if (references.length === 0) return 'Exploratory SQL must read an approved application table';
  if (references.some((table) => !table || !ALLOWED_TABLES.has(table))) {
    return 'Exploratory SQL references a table outside the application allowlist';
  }
  return undefined;
}

function validateExploratoryQuery(value: unknown): string | undefined {
  if (typeof value !== 'string') return 'run_query requires a SQL string';
  const query = value.trim();
  if (!query || query.length > 20_000) return 'Exploratory SQL must be 1-20,000 characters';
  if (!/^(?:EXPLAIN\s+)?(?:SELECT|WITH)\b/i.test(query)) {
    return 'Only read-only SELECT, WITH, or EXPLAIN SELECT queries are allowed';
  }

  const withoutTerminator = query.endsWith(';') ? query.slice(0, -1) : query;
  if (withoutTerminator.includes(';')) return 'Multiple SQL statements are not allowed';
  if (BLOCKED_QUERY_PATTERN.test(query)) {
    return 'Query references a blocked external source or system namespace';
  }
  if (/--|\/\*/.test(query)) return 'SQL comments are not allowed';
  const tableError = validateTableReferences(query);
  if (tableError) return tableError;
  return undefined;
}

function applyQueryLimits(query: string): string {
  // The MCP ClickHouse user enforces resource limits in its read-only profile.
  // Query-level SETTINGS are intentionally not appended: ClickHouse rejects
  // attempts to override settings when readonly=1.
  return query;
}

function traceResult(resultText: string): string {
  const rowLimited = truncateQueryResultForModel(resultText);
  if (rowLimited.length <= MAX_TRACE_RESULT_CHARS) return rowLimited;
  return `${rowLimited.slice(0, MAX_TRACE_RESULT_CHARS)}\n[trace output truncated]`;
}

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
        'Execute a validated, read-only SQL query against approved GhostSlate ClickHouse tables. ' +
        'The server applies row, byte, memory, thread, and execution-time limits.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'A read-only query over approved GhostSlate tables.',
          },
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
        'Classify the active scenario\'s server-selected video frame as "slate", "ad", or ' +
        '"content". Accepts no arguments; the model cannot select a file or timestamp. Returns ' +
        'classification, confidence, slate type, detected text, and visual summary.',
      parameters: { type: Type.OBJECT, properties: {} },
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
    private readonly scenarioService: ScenarioService = new ScenarioService(),
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

    if (name === 'run_query') {
      const error = validateExploratoryQuery(args.query);
      if (error) return { modelText: error, resultText: error, isError: true };
      args = { query: applyQueryLimits(String(args.query).trim()) };
    } else if (name === 'list_tables') {
      args = { database: 'ghostslate' };
    } else {
      const error = `Unsupported investigation tool: ${name}`;
      return { modelText: error, resultText: error, isError: true };
    }

    const response = await this.mcpService.callTool(name, args);
    const resultText = response.content?.[0]?.text || JSON.stringify(response);
    const parsed = parseJson(resultText);
    return {
      modelText: truncateQueryResultForModel(resultText),
      resultText: traceResult(resultText),
      isError: response.isError || false,
      rowsReturned: rowsReturnedFrom(parsed),
      rowsScanned: rowsScannedFrom(parsed) ?? rowsScannedFrom(response),
      resolvedArgs: args,
    };
  }

  private async collectDiagnosisEvidence(context: InvestigationContext): Promise<ToolOutcome> {
    const renderedSql = renderLossAttributionQuery(context);
    const response = await this.mcpService.callTool('run_query', {
      query: applyQueryLimits(renderedSql),
    });
    const resultText = response.content?.[0]?.text || JSON.stringify(response);
    const parsed = parseJson(resultText);
    const rowsScanned = rowsScannedFrom(parsed) ?? rowsScannedFrom(response);

    if (response.isError) {
      return {
        modelText: resultText,
        resultText: traceResult(resultText),
        isError: true,
        renderedSql: applyQueryLimits(renderedSql),
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
        resultText: traceResult(resultText),
        isError: false,
        evidenceRows,
        renderedSql: applyQueryLimits(renderedSql),
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
        renderedSql: applyQueryLimits(renderedSql),
        rowsScanned,
      };
    }
  }

  private async classifyFrame(
    _args: Record<string, unknown>,
    context: InvestigationContext,
  ): Promise<ToolOutcome> {
    const scenario = this.scenarioService.findByContext(context);
    if (!scenario) {
      const errorText = `No synthetic stream media is mapped to investigation window ${context.from} to ${context.to} for channel ${context.channel}. Visual confirmation is only available for mapped incident windows.`;
      return { modelText: errorText, resultText: errorText, isError: true };
    }
    if (scenario.visionMode === 'disabled' || scenario.agentSampleTimestampSeconds === null) {
      const errorText = `Visual confirmation is disabled for scenario "${scenario.id}".`;
      return { modelText: errorText, resultText: errorText, isError: true };
    }

    const timestamp = scenario.agentSampleTimestampSeconds;
    const frame = await this.visionService.classifyVideoTimestamp(scenario.videoFile, timestamp);
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
    return {
      modelText,
      resultText: modelText,
      isError: false,
      frame: normalizedFrame,
      resolvedArgs: {
        scenario_id: scenario.id,
        video_file: scenario.videoFile,
        timestamp_seconds: timestamp,
      },
    };
  }
}
