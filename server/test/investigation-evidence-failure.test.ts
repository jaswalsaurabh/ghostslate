import { describe, expect, it, vi } from 'vitest';
import {
  InvestigationService,
  type InvestigationEvent,
} from '../src/services/investigation.service.js';
import type { McpClientService } from '../src/services/mcp.service.js';
import type { FrameClassification, VisionService } from '../src/services/vision.service.js';

const context = {
  channel: 'ch-01',
  from: '2026-08-14T19:00:00.000Z',
  to: '2026-08-14T23:00:00.000Z',
};

const validEvidence = JSON.stringify({
  columns: [
    'channel_id',
    'ssp_id',
    'device_class',
    'codec',
    'daypart',
    'cues',
    'total_attempts',
    'unmonetized_impressions',
    'unmonetized_pct',
    'p95_auction_ms',
    'cpm_usd',
  ],
  rows: [
    ['ch-01', 'ssp-beta', 'connected_tv', 'hevc', 'primetime', 80, 10000, 9000, 90, 1812, 32.5],
    ['ch-01', 'ssp-alpha', 'connected_tv', 'hevc', 'primetime', 80, 10000, 200, 2, 300, 32.5],
  ],
});

const slateFrame: FrameClassification = {
  classification: 'slate',
  confidence: 0.98,
  slate_type: 'looping_card',
  text_detected: 'We will be right back',
  visual_summary: 'Model-authored visual prose',
  contentHash: 'hash-slate',
  cached: false,
  timestampSeconds: 12,
};

function functionCall(name: string, args: Record<string, unknown> = {}) {
  return {
    candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }],
  };
}

describe('InvestigationService evidence failure handling', () => {
  it('keeps finalization blocked until a canonical response validates', async () => {
    const mcpService = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      listTools: vi.fn(),
      callTool: vi
        .fn()
        .mockResolvedValueOnce({
          content: [
            {
              type: 'text',
              text: JSON.stringify({ columns: ['channel_id', 'avg_latency_ms'], rows: [] }),
            },
          ],
          isError: false,
        })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: validEvidence }],
          isError: false,
        }),
    } as unknown as McpClientService;
    const visionService = {
      classifyVideoTimestamp: vi.fn().mockResolvedValue(slateFrame),
    } as unknown as VisionService;
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce(functionCall('collect_diagnosis_evidence'))
      .mockResolvedValueOnce(functionCall('finalize_investigation'))
      .mockResolvedValueOnce(functionCall('collect_diagnosis_evidence'))
      .mockResolvedValueOnce(
        functionCall('classify_frame', { video_file: 'slate.mp4', timestamp_seconds: 12 }),
      )
      .mockResolvedValueOnce(functionCall('finalize_investigation'));
    const service = new InvestigationService(mcpService, visionService);
    (service as unknown as { ai: { models: { generateContent: typeof generateContent } } }).ai = {
      models: { generateContent },
    };

    const events: InvestigationEvent[] = [];
    for await (const event of service.investigateSpike('Investigate channel spike', context)) {
      events.push(event);
    }

    const failedCollection = events.find(
      (event) =>
        event.type === 'tool_result' &&
        event.data.name === 'collect_diagnosis_evidence' &&
        event.data.isError === true,
    );
    expect(failedCollection?.data.result).toContain('Canonical evidence validation failed');

    const finalizeBeforeRecovery = events.find(
      (event) =>
        event.type === 'tool_result' &&
        event.data.name === 'finalize_investigation' &&
        event.data.isError === true,
    );
    expect(finalizeBeforeRecovery?.data.result).toContain(
      'You must call collect_diagnosis_evidence',
    );
    expect(events.filter((event) => event.type === 'diagnosis')).toHaveLength(1);
  });
});
