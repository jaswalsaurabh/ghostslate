import { Router } from 'express';
import type { InvestigationController } from '../controllers/investigation.controller.js';

export function createInvestigationRouter(controller: InvestigationController): Router {
  const router = Router();

  router.post('/investigate/spike', controller.investigateSpike);

  return router;
}
