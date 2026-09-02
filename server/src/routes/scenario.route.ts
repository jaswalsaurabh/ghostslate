import { Router } from 'express';
import type { ScenarioController } from '../controllers/scenario.controller.js';

export function createScenarioRouter(controller: ScenarioController): Router {
  const router = Router();
  router.get('/investigation-scenarios', controller.list);
  return router;
}
