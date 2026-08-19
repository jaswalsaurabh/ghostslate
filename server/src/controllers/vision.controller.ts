import type { Request, Response, NextFunction } from 'express';
import { VisionService } from '../services/vision.service.js';
import { ValidationError } from '../errors/domain-error.js';

export class VisionController {
  constructor(private readonly visionService: VisionService) {}

  classifyFrame = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const video = (req.body?.video as string) || 'test_stream_slate.mp4';
      const timestamp = Number(req.body?.timestamp ?? 15);

      if (isNaN(timestamp) || timestamp < 0) {
        throw new ValidationError('Invalid timestamp provided');
      }

      const start = Date.now();
      const result = await this.visionService.classifyVideoTimestamp(video, timestamp);
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
