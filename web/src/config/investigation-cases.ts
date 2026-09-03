import type { z } from 'zod';
import {
  investigationScenarioSchema,
  scenarioCatalogSchema,
  scenarioIdSchema,
} from '../api/schemas.js';

export type InvestigationCaseId = z.infer<typeof scenarioIdSchema>;
export type InvestigationCaseConfig = z.infer<typeof investigationScenarioSchema>;
export type InvestigationScenarioCatalog = z.infer<typeof scenarioCatalogSchema>;
