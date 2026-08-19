import type { McpClientService } from './mcp.service.js';

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
  uptimeSeconds: number;
  service: string;
  mcp?: {
    connected: boolean;
    latencyMs?: number;
  };
}

export class HealthService {
  private readonly startTime = Date.now();

  constructor(private readonly mcpService?: McpClientService) {}

  async getHealth(): Promise<HealthStatus> {
    let mcpStatus: { connected: boolean; latencyMs?: number } | undefined = undefined;

    if (this.mcpService) {
      const t0 = Date.now();
      try {
        await this.mcpService.listTools();
        mcpStatus = {
          connected: true,
          latencyMs: Date.now() - t0,
        };
      } catch {
        mcpStatus = {
          connected: false,
        };
      }
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      service: 'ghostslate-server',
      ...(mcpStatus ? { mcp: mcpStatus } : {}),
    };
  }
}
