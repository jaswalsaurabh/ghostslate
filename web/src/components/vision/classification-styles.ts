import type { ClassificationType } from '../../types.js';

interface ClassificationStyles {
  border: string;
  dot: string;
  label: string;
  selected: string;
  surface: string;
  text: string;
}

export const classificationStyles: Record<ClassificationType, ClassificationStyles> = {
  slate: {
    border: 'border-classification-slate-border',
    dot: 'bg-classification-slate',
    label: 'border-classification-slate-border text-classification-slate',
    selected: 'border-classification-slate ring-1 ring-classification-slate',
    surface: 'border-classification-slate-border bg-classification-slate-surface',
    text: 'text-classification-slate',
  },
  ad: {
    border: 'border-classification-ad-border',
    dot: 'bg-classification-ad',
    label: 'border-classification-ad-border text-classification-ad',
    selected: 'border-classification-ad ring-1 ring-classification-ad',
    surface: 'border-classification-ad-border bg-classification-ad-surface',
    text: 'text-classification-ad',
  },
  content: {
    border: 'border-classification-content-border',
    dot: 'bg-classification-content',
    label: 'border-classification-content-border text-classification-content',
    selected: 'border-classification-content ring-1 ring-classification-content',
    surface: 'border-classification-content-border bg-classification-content-surface',
    text: 'text-classification-content',
  },
};
