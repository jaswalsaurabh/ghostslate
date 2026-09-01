import type { ClassificationType } from '../types.js';

const classificationLabels: Record<ClassificationType, string> = {
  slate: 'Slate',
  ad: 'Ad',
  content: 'Content',
};

export function formatClassificationLabel(classification: ClassificationType): string {
  return classificationLabels[classification];
}
