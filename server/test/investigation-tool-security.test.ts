import { describe, expect, it, vi } from 'vitest';
import { InvestigationToolService } from '../src/services/investigation-tool.service.js';
import type { McpClientService } from '../src/services/mcp.service.js';
import type { VisionService } from '../src/services/vision.service.js';

const context = {
  channel: 'ch-01',
  from: '2026-08-14T19:00:00.000Z',
  to: '2026-08-14T23:00:00.000Z',
};

function createToolService() {
  const callTool = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({ columns: [], rows: [] }) }],
    isError: false,
  });
  const mcp = { callTool } as unknown as McpClientService;
  const vision = {} as VisionService;
  return { service: new InvestigationToolService(mcp, vision), callTool };
}

describe('InvestigationToolService security boundary', () => {
  it.each([
    'DROP TABLE ghostslate.ssai_stitch_attempts',
    'SELECT 1; SELECT 2',
    "SELECT * FROM url('http://metadata.google.internal')",
    'SELECT * FROM system.users',
    "SELECT 1 INTO OUTFILE '/tmp/result'",
  ])('rejects unsafe exploratory SQL before MCP: %s', async (query) => {
    const { service, callTool } = createToolService();
    const outcome = await service.execute('run_query', { query }, context);

    expect(outcome.isError).toBe(true);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('pins schema discovery to the application database', async () => {
    const { service, callTool } = createToolService();
    const outcome = await service.execute('list_tables', { database: 'system' }, context);

    expect(outcome.isError).toBe(false);
    expect(callTool).toHaveBeenCalledWith('list_tables', { database: 'ghostslate' });
  });

  it('rejects tool names outside the declared allowlist', async () => {
    const { service, callTool } = createToolService();
    const outcome = await service.execute('unknown_tool', {}, context);

    expect(outcome.isError).toBe(true);
    expect(callTool).not.toHaveBeenCalled();
  });
});
