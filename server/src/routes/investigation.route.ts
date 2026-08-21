import { Router } from 'express';
import type { InvestigationController } from '../controllers/investigation.controller.js';

export function createInvestigationRouter(controller: InvestigationController): Router {
  const router = Router();

  router.post('/investigate/spike', controller.investigateSpike);
  router.get('/investigate/runs/:runKey/stream', controller.streamRun);
  router.get('/investigate/runs/:runKey/remediation', controller.getRemediation);
  router.post('/investigate/runs/:runKey/remediation/approve', controller.approveRemediation);

  return router;
}
