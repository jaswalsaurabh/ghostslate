export interface HealthStatus {
  status: 'ok';
  timestamp: string;
  uptimeSeconds: number;
  service: string;
}

export class HealthService {
  private readonly startTime = Date.now();

  getHealth(): HealthStatus {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      service: 'ghostslate-server',
    };
  }
}
