import { Router } from 'express';
import type { VisionController } from '../controllers/vision.controller.js';

export function createVisionRouter(controller: VisionController): Router {
  const router = Router();

  router.post('/vision/classify', controller.classifyFrame);

  return router;
}
