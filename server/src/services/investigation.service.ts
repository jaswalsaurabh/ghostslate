import { GoogleGenAI, Type, type FunctionDeclaration, type Part } from '@google/genai';
import { McpClientService } from './mcp.service.js';
import { VisionService, type FrameClassification } from './vision.service.js';
import { ServiceUnavailableError } from '../errors/domain-error.js';

export interface InvestigationEvent {
  type:
    | 'status'
    | 'tool_call'
    | 'tool_result'
    | 'vision_call'
    | 'frame_classified'
    | 'reasoning'
    | 'diagnosis'
    | 'error';
  timestamp: string;
  data: Record<string, unknown>;
}

export interface InvestigationResult {
  diagnosis: string;
  steps: InvestigationEvent[];
  toolCallsCount: number;
}

// The synthetic demo streams in web/public/media. The agent may only inspect these.
const INSPECTABLE_MEDIA = ['slate.mp4', 'ad.mp4', 'content.mp4'] as const;

export class InvestigationService {
  private readonly ai: GoogleGenAI;
  private readonly modelName: string;

  constructor(
    private readonly mcpService: McpClientService,
    private readonly visionService: VisionService,
    config?: { projectId?: string; region?: string; model?: string },
  ) {
    const project = config?.projectId || process.env.GCP_PROJECT_ID || 'agentic-cinema-ch-2026';
    const location = config?.region || process.env.GCP_REGION || 'us-central1';
    this.modelName = config?.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    this.ai = new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });
  }

  private getToolDeclarations(): FunctionDeclaration[] {
    return [
      {
        name: 'run_query',
        description: 'Execute a read-only SQL query against ClickHouse database.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: 'The ClickHouse SQL query to execute.',
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
            database: {
              type: Type.STRING,
              description: 'The database name (default: ghostslate).',
            },
          },
          required: ['database'],
        },
      },
      {
        name: 'classify_frame',
        description:
          'Inspect the actual video frame at a given timestamp and classify what is on screen as ' +
          '"slate", "ad", or "content". Use this to confirm visually whether a suspicious ad break ' +
          'found in the telemetry actually bled a filler slate to air, when the ClickHouse data alone ' +
          'is ambiguous. Returns the classification, a confidence score, the slate type, any text ' +
          'visible on screen, and a short visual summary.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            video_file: {
              type: Type.STRING,
              description: `The demo stream to inspect. One of: ${INSPECTABLE_MEDIA.join(', ')}.`,
            },
            timestamp_seconds: {
              type: Type.NUMBER,
              description: 'Offset into the stream, in seconds. Must be non-negative.',
            },
          },
          required: ['video_file', 'timestamp_seconds'],
        },
      },
    ];
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ modelText: string; isError: boolean; frame?: FrameClassification }> {
    if (name !== 'classify_frame') {
      const result = await this.mcpService.callTool(name, args);
      return {
        modelText: result.content?.[0]?.text || JSON.stringify(result),
        isError: result.isError || false,
      };
    }

    const videoFile = String(args.video_file ?? '');
    const timestamp = Number(args.timestamp_seconds);

    if (!INSPECTABLE_MEDIA.includes(videoFile as (typeof INSPECTABLE_MEDIA)[number])) {
      return {
        modelText: `Unknown video_file "${videoFile}". Choose one of: ${INSPECTABLE_MEDIA.join(', ')}.`,
        isError: true,
      };
    }

    if (!Number.isFinite(timestamp) || timestamp < 0) {
      return {
        modelText: `Invalid timestamp_seconds "${String(args.timestamp_seconds)}". Provide a non-negative number.`,
        isError: true,
      };
    }

    const frame = await this.visionService.classifyVideoTimestamp(videoFile, timestamp);

    // The frame image goes to the war room, never to the model — it would cost tens of
    // thousands of tokens per turn and add nothing the classification fields do not already say.
    const { frameBase64: _frameBase64, ...modelFacing } = frame;

    return { modelText: JSON.stringify(modelFacing), isError: false, frame };
  }

  async *investigateSpike(
    prompt: string,
  ): AsyncGenerator<InvestigationEvent, InvestigationResult, void> {
    const events: InvestigationEvent[] = [];

    const emit = (
      type: InvestigationEvent['type'],
      data: Record<string, unknown>,
    ): InvestigationEvent => {
      const ev: InvestigationEvent = {
        type,
        timestamp: new Date().toISOString(),
        data,
      };
      events.push(ev);
      return ev;
    };

    yield emit('status', { message: 'Connecting to ClickHouse via MCP protocol...' });
    try {
      await this.mcpService.connect();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      yield emit('error', { error: `MCP connection failed: ${msg}` });
      throw new ServiceUnavailableError(`MCP service unavailable: ${msg}`);
    }

    yield emit('status', { message: 'Initialized MCP tools. Starting Gemini reasoning loop...' });

    const systemInstruction = `
You are the GhostSlate Forensic Investigator agent specializing in broadcast television, SSAI (Server-Side Ad Insertion), and SCTE-35 ad break telemetry.

Database Context:
- Database: \`ghostslate\`
- Primary table: \`ghostslate.spike_cue_events\` (event_time DateTime, channel_id LowCardinality(String), ssp_id LowCardinality(String), latency_ms UInt32, stitch_ok UInt8)

Available tools:
- \`run_query\` / \`list_tables\`: read ClickHouse telemetry.
- \`classify_frame\`: look at the actual video frame at a timestamp and classify it as slate, ad, or content.

Rules:
1. Always start from ClickHouse using \`run_query\` to inspect actual cue events and stitch attempts.
2. Ground every single claim, latency figure, and failure count in exact data returned from ClickHouse.
3. When the telemetry points to a suspicious ad break but cannot prove what actually reached the
   viewer, call \`classify_frame\` on the relevant stream and timestamp to confirm visually.
4. Visual evidence describes what is on screen. It is never the source of a number — every count,
   rate, latency and financial figure must still come from a ClickHouse query.
5. Identify root causes (such as slow SSPs, high latency, or timeout thresholds).
6. Provide a clear, concise forensic diagnosis with specific metrics, citing both the telemetry and,
   where you used it, the visual confirmation.
`.trim();

    const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];

    let toolCallsCount = 0;
    let finalDiagnosis = '';
    const maxTurns = 10;

    for (let turn = 0; turn < maxTurns; turn++) {
      yield emit('status', { message: `Reasoning turn ${turn + 1}...` });

      let response;
      try {
        response = await this.ai.models.generateContent({
          model: this.modelName,
          contents,
          config: {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            tools: [{ functionDeclarations: this.getToolDeclarations() }],
            temperature: 0.1,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        yield emit('error', { error: `Gemini generation error: ${msg}` });
        throw err;
      }

      const candidate = response.candidates?.[0];
      const modelParts = candidate?.content?.parts || [];

      // Check for function calls
      const functionCalls = modelParts.filter((p: { functionCall?: unknown }) =>
        Boolean(p.functionCall),
      );

      if (functionCalls.length > 0) {
        contents.push({
          role: 'model',
          parts: modelParts as Array<Record<string, unknown>>,
        });

        const responseParts: Array<Record<string, unknown>> = [];

        for (const part of functionCalls) {
          const call = (part as { functionCall: { name: string; args: Record<string, unknown> } })
            .functionCall;
          toolCallsCount++;

          const isVision = call.name === 'classify_frame';

          yield emit(isVision ? 'vision_call' : 'tool_call', {
            name: call.name,
            args: call.args,
          });

          let outcome: { modelText: string; isError: boolean; frame?: FrameClassification };
          try {
            outcome = await this.executeTool(call.name, call.args || {});
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            outcome = { modelText: `Tool error: ${errorMsg}`, isError: true };
          }

          if (outcome.frame) {
            yield emit('frame_classified', {
              name: call.name,
              args: call.args,
              ...outcome.frame,
            });
          } else {
            yield emit('tool_result', {
              name: call.name,
              result: outcome.modelText,
              isError: outcome.isError,
            });
          }

          responseParts.push({
            functionResponse: {
              name: call.name,
              response: {
                content: outcome.modelText,
              },
            },
          });
        }

        contents.push({
          role: 'user',
          parts: responseParts,
        });
      } else {
        // Model returned final text response
        const textParts = (modelParts as Part[])
          .map((p) => p.text)
          .filter((t): t is string => Boolean(t))
          .join('\n');

        finalDiagnosis = textParts || 'Investigation complete.';
        yield emit('diagnosis', { diagnosis: finalDiagnosis });
        break;
      }
    }

    if (!finalDiagnosis || !finalDiagnosis.trim()) {
      const errorMsg = `Investigation turn budget exhausted (${maxTurns} turns) without reaching a grounded conclusion.`;
      yield emit('error', { error: errorMsg });
      throw new ServiceUnavailableError(errorMsg);
    }

    return {
      diagnosis: finalDiagnosis,
      steps: events,
      toolCallsCount,
    };
  }
}
