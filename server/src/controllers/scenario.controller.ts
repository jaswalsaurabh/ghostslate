import type { NextFunction, Request, Response } from 'express';
import type { ScenarioService } from '../services/scenario.service.js';

export class ScenarioController {
  constructor(private readonly scenarioService: ScenarioService) {}

  list = (_req: Request, res: Response, next: NextFunction): void => {
    try {
      res.status(200).json(this.scenarioService.catalog());
    } catch (error: unknown) {
      next(error);
    }
  };
}
