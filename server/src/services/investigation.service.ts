import { GoogleGenAI, Type, type FunctionDeclaration, type Part } from '@google/genai';
import { McpClientService, type McpToolResult } from './mcp.service.js';
import { ServiceUnavailableError } from '../errors/domain-error.js';

export interface InvestigationEvent {
  type: 'status' | 'tool_call' | 'tool_result' | 'reasoning' | 'diagnosis' | 'error';
  timestamp: string;
  data: Record<string, unknown>;
}

export interface InvestigationResult {
  diagnosis: string;
  steps: InvestigationEvent[];
  toolCallsCount: number;
}

export class InvestigationService {
  private readonly ai: GoogleGenAI;
  private readonly modelName: string;

  constructor(
    private readonly mcpService: McpClientService,
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
    ];
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

Rules:
1. Always query ClickHouse using \`run_query\` to inspect actual cue events and stitch attempts.
2. Ground every single claim, latency figure, and failure count in exact data returned from ClickHouse.
3. Identify root causes (such as slow SSPs, high latency, or timeout thresholds).
4. Provide a clear, concise forensic diagnosis with specific metrics.
`.trim();

    const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];

    let toolCallsCount = 0;
    let finalDiagnosis = '';
    const maxTurns = 8;

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

          yield emit('tool_call', {
            name: call.name,
            args: call.args,
          });

          let result: McpToolResult;
          try {
            result = await this.mcpService.callTool(call.name, call.args || {});
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            result = {
              content: [{ type: 'text', text: `Tool error: ${errorMsg}` }],
              isError: true,
            };
          }

          const responseText = result.content?.[0]?.text || JSON.stringify(result);

          yield emit('tool_result', {
            name: call.name,
            result: responseText,
            isError: result.isError || false,
          });

          responseParts.push({
            functionResponse: {
              name: call.name,
              response: {
                content: responseText,
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
