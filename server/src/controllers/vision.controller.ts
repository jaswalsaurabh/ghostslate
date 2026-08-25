import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { VisionService } from '../services/vision.service.js';
import { ValidationError } from '../errors/domain-error.js';

const ClassifyFrameSchema = z.object({
  video: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+\.mp4$/, 'Video must be a simple MP4 filename')
    .default('test_stream_slate.mp4'),
  timestamp: z.number().finite().min(0).max(60).default(15),
});

export class VisionController {
  constructor(private readonly visionService: VisionService) {}

  classifyFrame = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ClassifyFrameSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(', '));
      }

      const start = Date.now();
      const result = await this.visionService.classifyVideoTimestamp(
        parsed.data.video,
        parsed.data.timestamp,
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
