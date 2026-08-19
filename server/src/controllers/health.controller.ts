import type { Request, Response, NextFunction } from 'express';
import type { HealthService } from '../services/health.service.js';

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  getHealth = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const health = await this.healthService.getHealth();
      res.status(200).json(health);
    } catch (err) {
      next(err);
    }
  };
}
