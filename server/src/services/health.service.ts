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
  private mcpCheck: { checkedAt: number; connected: boolean; latencyMs?: number } | null = null;

  constructor(private readonly mcpService?: McpClientService) {}

  async getHealth(): Promise<HealthStatus> {
    let mcpStatus: { connected: boolean; latencyMs?: number } | undefined = undefined;

    if (this.mcpService) {
      if (this.mcpCheck && Date.now() - this.mcpCheck.checkedAt < 15_000) {
        mcpStatus = {
          connected: this.mcpCheck.connected,
          ...(this.mcpCheck.latencyMs !== undefined ? { latencyMs: this.mcpCheck.latencyMs } : {}),
        };
      } else {
        const t0 = Date.now();
        try {
          await this.mcpService.listTools();
          this.mcpCheck = { checkedAt: Date.now(), connected: true, latencyMs: Date.now() - t0 };
        } catch {
          this.mcpCheck = { checkedAt: Date.now(), connected: false };
        }
        mcpStatus = {
          connected: this.mcpCheck.connected,
          ...(this.mcpCheck.latencyMs !== undefined ? { latencyMs: this.mcpCheck.latencyMs } : {}),
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
