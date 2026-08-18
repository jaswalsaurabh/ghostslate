import type { Request, Response } from 'express';
import type { HealthService } from '../services/health.service.js';

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  getHealth = (_req: Request, res: Response): void => {
    const health = this.healthService.getHealth();
    res.status(200).json(health);
  };
}
