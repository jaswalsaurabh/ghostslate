import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { VisionService } from '../services/vision.service.js';
import { ValidationError } from '../errors/domain-error.js';
import type { ScenarioService } from '../services/scenario.service.js';

const ClassifyFrameSchema = z
  .object({
    scenarioId: z.string().trim().min(1).max(64),
    timestamp: z.number().finite().min(0),
  })
  .strict();

export class VisionController {
  constructor(
    private readonly visionService: VisionService,
    private readonly scenarioService: ScenarioService,
  ) {}

  classifyFrame = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ClassifyFrameSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(', '));
      }

      const visionRequest = this.scenarioService.resolveVisionRequest(
        parsed.data.scenarioId,
        parsed.data.timestamp,
      );

      const start = Date.now();
      const result = await this.visionService.classifyVideoTimestamp(
        visionRequest.videoFile,
        visionRequest.timestamp,
      );
      const latencyMs = Date.now() - start;

      res.json({
        success: true,
        latencyMs,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };
}
