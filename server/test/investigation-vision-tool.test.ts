import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  InvestigationService,
  type InvestigationEvent,
} from '../src/services/investigation.service.js';
import type { McpClientService } from '../src/services/mcp.service.js';
import type { VisionService, FrameClassification } from '../src/services/vision.service.js';

interface ContentTurn {
  role: string;
  parts: Array<{
    text?: string;
    functionResponse?: {
      name: string;
      response: {
        content: string;
      };
    };
  }>;
}

describe('InvestigationService — Vision Tool Wiring', () => {
  let mockMcpService: McpClientService;
  let mockVisionService: VisionService;
  let mockGenerateContent: ReturnType<typeof vi.fn>;

  const mockFrameResult: FrameClassification = {
    classification: 'slate',
    confidence: 0.95,
    slate_type: 'looping_card',
    text_detected: 'We will be right back',
    visual_summary: 'Commercial break slate screen visible on stream',
    contentHash: 'hash-abc-123',
    cached: false,
    timestampSeconds: 12,
    frameBase64: 'data:image/jpeg;base64,BASE64_IMAGE_PAYLOAD_TEST',
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockMcpService = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'query result rows' }],
        isError: false,
      }),
      listTools: vi.fn(),
    } as unknown as McpClientService;

    mockVisionService = {
      classifyVideoTimestamp: vi.fn().mockResolvedValue(mockFrameResult),
    } as unknown as VisionService;

    mockGenerateContent = vi.fn();
  });

  function createServiceWithMockedAI() {
    const service = new InvestigationService(mockMcpService, mockVisionService);
    // Stub the internal GoogleGenAI generateContent method
    (service as unknown as { ai: { models: { generateContent: typeof mockGenerateContent } } }).ai =
      {
        models: {
          generateContent: mockGenerateContent,
        },
      };
    return service;
  }

  it('offers classify_frame to the model alongside run_query and list_tables', () => {
    const service = new InvestigationService(mockMcpService, mockVisionService);
    const declarations = (
      service as unknown as {
        getToolDeclarations: () => Array<{ name: string; parameters: { required: string[] } }>;
      }
    ).getToolDeclarations();

    expect(declarations).toHaveLength(3);
    const names = declarations.map((d) => d.name);
    expect(names).toEqual(['run_query', 'list_tables', 'classify_frame']);

    const classifyTool = declarations.find((d) => d.name === 'classify_frame');
    expect(classifyTool).toBeDefined();
    expect(classifyTool?.parameters.required).toEqual(['video_file', 'timestamp_seconds']);
  });

  it('routes classify_frame calls to VisionService, not MCP', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'classify_frame',
                    args: { video_file: 'slate.mp4', timestamp_seconds: 12 },
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ text: 'Visual confirmation: Slate bleed confirmed at 12s.' }],
            },
          },
        ],
      });

    const service = createServiceWithMockedAI();
    const generator = service.investigateSpike('Check if slate bled');

    const events: InvestigationEvent[] = [];
    for await (const ev of generator) {
      events.push(ev);
    }

    expect(mockVisionService.classifyVideoTimestamp).toHaveBeenCalledTimes(1);
    expect(mockVisionService.classifyVideoTimestamp).toHaveBeenCalledWith('slate.mp4', 12);
    expect(mockMcpService.callTool).not.toHaveBeenCalled();

    const visionCallEvent = events.find((e) => e.type === 'vision_call');
    expect(visionCallEvent).toBeDefined();
    expect(visionCallEvent?.data).toEqual({
      name: 'classify_frame',
      args: { video_file: 'slate.mp4', timestamp_seconds: 12 },
    });

    const frameClassifiedEvent = events.find((e) => e.type === 'frame_classified');
    expect(frameClassifiedEvent).toBeDefined();
    expect(frameClassifiedEvent?.data.classification).toBe('slate');
  });

  it('still routes non-vision calls to MCP', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'run_query',
                    args: { query: 'SELECT count() FROM ghostslate.spike_cue_events' },
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ text: 'Telemetry confirmed 100 cue events.' }],
            },
          },
        ],
      });

    const service = createServiceWithMockedAI();
    const generator = service.investigateSpike('Check telemetry');

    const events: InvestigationEvent[] = [];
    for await (const ev of generator) {
      events.push(ev);
    }

    expect(mockMcpService.callTool).toHaveBeenCalledTimes(1);
    expect(mockMcpService.callTool).toHaveBeenCalledWith('run_query', {
      query: 'SELECT count() FROM ghostslate.spike_cue_events',
    });
    expect(mockVisionService.classifyVideoTimestamp).not.toHaveBeenCalled();

    const toolCallEvent = events.find((e) => e.type === 'tool_call');
    expect(toolCallEvent).toBeDefined();
    expect(toolCallEvent?.data.name).toBe('run_query');

    const toolResultEvent = events.find((e) => e.type === 'tool_result');
    expect(toolResultEvent).toBeDefined();
    expect(toolResultEvent?.data.result).toBe('query result rows');
  });

  it('never sends the frame image (base64) to the model, but emits it to the client', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'classify_frame',
                    args: { video_file: 'slate.mp4', timestamp_seconds: 12 },
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ text: 'Diagnosis completed.' }],
            },
          },
        ],
      });

    const service = createServiceWithMockedAI();
    const generator = service.investigateSpike('Inspect frame at 12s');

    const events: InvestigationEvent[] = [];
    for await (const ev of generator) {
      events.push(ev);
    }

    // 1. Verify that the turn-2 call to Gemini receives functionResponse with NO base64
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    const secondCallArgs = mockGenerateContent.mock.calls[1][0];
    const userTurn = secondCallArgs.contents.find(
      (c: ContentTurn) => c.role === 'user' && Boolean(c.parts?.[0]?.functionResponse),
    ) as ContentTurn | undefined;
    expect(userTurn).toBeDefined();

    const functionResponseContent = userTurn?.parts[0]?.functionResponse?.response.content;
    expect(typeof functionResponseContent).toBe('string');
    expect(functionResponseContent).not.toContain('BASE64_IMAGE_PAYLOAD_TEST');
    expect(functionResponseContent).not.toContain('data:image/jpeg;base64');
    expect(functionResponseContent).toContain('"classification":"slate"');
    expect(functionResponseContent).toContain('"confidence":0.95');

    // 2. Verify that the SSE event emitted to the client DOES contain the frameBase64
    const frameClassifiedEvent = events.find((e) => e.type === 'frame_classified');
    expect(frameClassifiedEvent).toBeDefined();
    expect(frameClassifiedEvent?.data.frameBase64).toBe(
      'data:image/jpeg;base64,BASE64_IMAGE_PAYLOAD_TEST',
    );
  });

  it('refuses an unknown video_file without calling VisionService and returns a recoverable error', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'classify_frame',
                    args: { video_file: 'malicious.mp4', timestamp_seconds: 5 },
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ text: 'Recovered from unknown video file.' }],
            },
          },
        ],
      });

    const service = createServiceWithMockedAI();
    const generator = service.investigateSpike('Check malicious file');

    const events: InvestigationEvent[] = [];
    for await (const ev of generator) {
      events.push(ev);
    }

    expect(mockVisionService.classifyVideoTimestamp).not.toHaveBeenCalled();

    const toolResultEvent = events.find((e) => e.type === 'tool_result');
    expect(toolResultEvent).toBeDefined();
    expect(toolResultEvent?.data.isError).toBe(true);
    expect(String(toolResultEvent?.data.result)).toContain('Unknown video_file "malicious.mp4"');

    // Second Gemini turn receives the error message
    const secondCallArgs = mockGenerateContent.mock.calls[1][0];
    const userTurn = secondCallArgs.contents.find(
      (c: ContentTurn) => c.role === 'user' && Boolean(c.parts?.[0]?.functionResponse),
    ) as ContentTurn | undefined;
    expect(userTurn?.parts[0]?.functionResponse?.response.content).toContain(
      'Unknown video_file "malicious.mp4"',
    );
  });

  it('refuses a negative timestamp without calling VisionService and returns a recoverable error', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'classify_frame',
                    args: { video_file: 'slate.mp4', timestamp_seconds: -10 },
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ text: 'Recovered from invalid timestamp.' }],
            },
          },
        ],
      });

    const service = createServiceWithMockedAI();
    const generator = service.investigateSpike('Check negative timestamp');

    const events: InvestigationEvent[] = [];
    for await (const ev of generator) {
      events.push(ev);
    }

    expect(mockVisionService.classifyVideoTimestamp).not.toHaveBeenCalled();

    const toolResultEvent = events.find((e) => e.type === 'tool_result');
    expect(toolResultEvent).toBeDefined();
    expect(toolResultEvent?.data.isError).toBe(true);
    expect(String(toolResultEvent?.data.result)).toContain('Invalid timestamp_seconds "-10"');
  });
});
