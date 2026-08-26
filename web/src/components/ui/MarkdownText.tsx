import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Parses inline formatting tokens:
 * - `code` -> styled code pill (critical tokens styled with subtle red accent, normal tokens in clean card style)
 * - **bold** -> strong text
 * - [FORENSIC ALERT: ...] -> critical alert pill
 */
export const renderFormattedInline = (text: string): React.ReactNode => {
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\[(?:FORENSIC ALERT|ALERT)[^\]]*\])/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    if (part.startsWith('`') && part.endsWith('`')) {
      const code = part.slice(1, -1);
      const isCritical =
        /SLATE|FAIL|ERROR|TIMEOUT|CRITICAL/i.test(code) ||
        /\b(?:[1-9]\d{3,}|[5-9]\d{2})\s*ms\b/i.test(code);

      return (
        <code
          key={idx}
          className={`mx-0.5 inline-block max-w-full break-all rounded px-1.5 py-0.5 align-baseline font-mono text-forensic-code font-semibold tracking-tight ${
            isCritical
              ? 'bg-status-critical-surface text-status-critical border border-status-critical-border/50'
              : 'bg-surface-card text-text-primary border border-border-subtle'
          }`}
        >
          {code}
        </code>
      );
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-bold text-text-primary">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith('[') && part.endsWith(']') && part.toUpperCase().includes('ALERT')) {
      return (
        <span
          key={idx}
          className="inline-flex items-center px-2 py-0.5 mx-0.5 rounded-full bg-status-critical-surface text-status-critical border border-status-critical-border font-sans text-forensic-meta font-bold tracking-wide"
        >
          {part}
        </span>
      );
    }

    return <span key={idx}>{part}</span>;
  });
};

interface MarkdownTextProps {
  content: string;
  className?: string;
}

/**
 * Lightweight, zero-dependency Markdown renderer designed for
 * agent diagnoses and evidence traces.
 */
export const MarkdownText: React.FC<MarkdownTextProps> = ({ content, className = '' }) => {
  const lines = content.split('\n');

  const renderedBlocks: React.ReactNode[] = [];
  let currentList: { type: 'ordered' | 'unordered'; items: React.ReactNode[] } | null = null;
  let blockKey = 0;

  const flushList = () => {
    if (currentList) {
      if (currentList.type === 'ordered') {
        renderedBlocks.push(
          <div key={`list-${blockKey++}`} className="flex flex-col gap-1.5 my-1 pl-1">
            {currentList.items.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-2 font-sans text-diagnosis leading-diagnosis text-text-primary"
              >
                <span className="font-mono text-forensic-meta font-bold text-interactive shrink-0 mt-px min-w-4.5">
                  {i + 1}.
                </span>
                <div className="min-w-0 flex-1 wrap-break-word">{item}</div>
              </div>
            ))}
          </div>,
        );
      } else {
        renderedBlocks.push(
          <div key={`list-${blockKey++}`} className="flex flex-col gap-1.5 my-1 pl-1">
            {currentList.items.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-2 font-sans text-diagnosis leading-diagnosis text-text-primary"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-interactive shrink-0 mt-1.75" />
                <div className="min-w-0 flex-1 wrap-break-word">{item}</div>
              </div>
            ))}
          </div>,
        );
      }
      currentList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';
    if (!line) {
      flushList();
      continue;
    }

    // Header matching: "### Header", "## Header", or standalone "**Header:**"
    const headingMatch = line.match(/^#{1,4}\s+(.*)$/);
    const boldHeaderMatch = line.match(/^\*\*([^*]+)\*\*:?$/);

    if (headingMatch || boldHeaderMatch) {
      flushList();
      const title = headingMatch ? headingMatch[1] : boldHeaderMatch ? boldHeaderMatch[1] : '';
      renderedBlocks.push(
        <div
          key={`header-${blockKey++}`}
          className="flex min-w-0 items-center gap-1.5 border-b border-border-subtle/60 pt-2 pb-0.5 font-sans text-forensic-heading font-bold wrap-break-word text-interactive uppercase tracking-wider"
        >
          <span className="w-1 h-3 bg-interactive rounded-xs" />
          <span className="min-w-0">{title}</span>
        </div>,
      );
      continue;
    }

    // Ordered list item: "1. text"
    const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch && orderedMatch[2]) {
      if (!currentList || currentList.type !== 'ordered') {
        flushList();
        currentList = { type: 'ordered', items: [] };
      }
      currentList.items.push(renderFormattedInline(orderedMatch[2]));
      continue;
    }

    // Unordered list item: "- text" or "* text"
    const unorderedMatch = line.match(/^[-*]\s+(.*)$/);
    if (unorderedMatch && unorderedMatch[1]) {
      if (!currentList || currentList.type !== 'unordered') {
        flushList();
        currentList = { type: 'unordered', items: [] };
      }
      currentList.items.push(renderFormattedInline(unorderedMatch[1]));
      continue;
    }

    // Standard paragraph
    flushList();
    renderedBlocks.push(
      <p
        key={`p-${blockKey++}`}
        className="m-0 min-w-0 font-sans text-diagnosis leading-diagnosis wrap-break-word text-text-primary"
      >
        {renderFormattedInline(line)}
      </p>,
    );
  }

  flushList();

  return <div className={`flex min-w-0 flex-col gap-2 ${className}`}>{renderedBlocks}</div>;
};

/**
 * Enhanced OCR text display that extracts forensic alerts into prominent badges
 * and formats detected screen phrases with high contrast.
 */
export const OcrTextDisplay: React.FC<{ text: string; className?: string }> = ({
  text,
  className = '',
}) => {
  const alertMatch = text.match(/\[(FORENSIC ALERT:[^\]]+|[^\]]*ALERT[^\]]*)\]/i);
  const alertText = alertMatch ? alertMatch[1] : null;
  const cleanText = alertMatch ? text.replace(alertMatch[0], '').trim() : text.trim();

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {alertText && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-status-critical-surface text-status-critical border border-status-critical-border font-sans text-forensic-meta font-bold shadow-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-status-critical" />
          <span className="tracking-wide">[{alertText.trim()}]</span>
        </div>
      )}
      {cleanText && (
        <div className="font-mono text-forensic-code text-status-warning bg-surface-scrim p-2.5 rounded-md border border-status-warning-border/50 whitespace-pre-wrap wrap-break-word leading-relaxed font-medium">
          {renderFormattedInline(cleanText)}
        </div>
      )}
    </div>
  );
};

/**
 * Structured Multimodal Reasoning & Summary callout with left accent bar
 */
export const VisualSummaryDisplay: React.FC<{ summary: string; className?: string }> = ({
  summary,
  className = '',
}) => {
  return (
    <div
      className={`border-l-2 border-interactive bg-surface-panel/40 pl-3.5 pr-3 py-2.5 rounded-r-md flex flex-col gap-1.5 ${className}`}
    >
      <p className="m-0 font-sans text-forensic-body text-text-primary leading-relaxed wrap-break-word">
        {renderFormattedInline(summary)}
      </p>
    </div>
  );
};
