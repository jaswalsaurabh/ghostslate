import React, { useState, useMemo } from 'react';
import { Copy, Check, Database } from 'lucide-react';
import type { McpQueryData } from '../types.js';
import { IconButton, SegmentedControl } from './ui/index.js';

interface ClickHouseResultViewerProps {
  rawResult: string;
  durationMs?: number | undefined;
  rowsReturned?: number | undefined;
  rowsScanned?: number | undefined;
}

export const ClickHouseResultViewer: React.FC<ClickHouseResultViewerProps> = ({
  rawResult,
  durationMs,
  rowsReturned,
  rowsScanned,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');

  const parsedData = useMemo<{
    queryData: McpQueryData | null;
    prettyJson: string;
    isStructured: boolean;
  }>(() => {
    try {
      const parsed = JSON.parse(rawResult);
      let queryData: McpQueryData | null = null;

      if (parsed && Array.isArray(parsed.columns) && Array.isArray(parsed.rows)) {
        queryData = parsed as McpQueryData;
      } else if (
        parsed?.result &&
        Array.isArray(parsed.result.columns) &&
        Array.isArray(parsed.result.rows)
      ) {
        queryData = parsed.result as McpQueryData;
      }

      const prettyJson = JSON.stringify(parsed, null, 2);
      return {
        queryData,
        prettyJson,
        isStructured: true,
      };
    } catch {
      return {
        queryData: null,
        prettyJson: rawResult,
        isStructured: false,
      };
    }
  }, [rawResult]);

  const handleCopy = () => {
    navigator.clipboard.writeText(parsedData.prettyJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rowsCount =
    typeof rowsReturned === 'number'
      ? rowsReturned
      : parsedData.queryData
        ? parsedData.queryData.rows.length
        : undefined;
  const colsCount = parsedData.queryData?.columns.length ?? 0;

  return (
    <section
      className="mt-2 overflow-hidden rounded-md border border-status-success-border/40 bg-surface-panel"
      aria-label="ClickHouse query result"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-status-success-surface px-2.5 py-2">
        <div className="flex items-center gap-1.5 font-sans text-forensic-meta font-bold uppercase tracking-wider text-status-success">
          <Database className="size-4" aria-hidden="true" />
          <span>ClickHouse result</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex flex-wrap items-center gap-1 font-mono text-forensic-meta text-text-muted">
            {typeof rowsCount === 'number' && (
              <span className="rounded-sm border border-border-subtle bg-surface-panel px-1.5 py-0.5">
                {rowsCount} row{rowsCount === 1 ? '' : 's'}
                {parsedData.queryData && colsCount > 0 ? ` × ${colsCount} cols` : ''}
              </span>
            )}
            {typeof durationMs === 'number' && (
              <span className="rounded-sm border border-border-subtle bg-surface-panel px-1.5 py-0.5">
                {durationMs} ms
              </span>
            )}
            {typeof rowsScanned === 'number' && (
              <span className="rounded-sm border border-border-subtle bg-surface-panel px-1.5 py-0.5">
                {rowsScanned.toLocaleString('en-US')} scanned
              </span>
            )}
          </div>

          {parsedData.queryData && (
            <SegmentedControl
              label="Result view"
              options={[
                { value: 'table', label: 'Table' },
                { value: 'json', label: 'JSON' },
              ]}
              value={viewMode}
              onValueChange={setViewMode}
              size="sm"
              className="font-sans text-xs"
            />
          )}

          <IconButton
            onClick={handleCopy}
            label={copied ? 'Result copied' : 'Copy result'}
            variant="secondary"
            className="size-6 text-text-muted"
            icon={
              copied ? (
                <Check className="size-3.5 text-status-success" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )
            }
          />
        </div>
      </div>

      {parsedData.queryData && viewMode === 'table' ? (
        <div className="max-h-51.25 overflow-auto">
          <table className="w-full min-w-190 border-collapse text-left font-mono text-forensic-code">
            <thead>
              <tr className="bg-surface-card text-status-success">
                {parsedData.queryData.columns.map((col, idx) => (
                  <th
                    key={idx}
                    className="sticky top-0 z-content whitespace-nowrap border-b border-border-strong bg-surface-card px-2.5 py-2 font-mono text-forensic-meta font-bold uppercase tracking-micro"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsedData.queryData.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={parsedData.queryData.columns.length}
                    className="p-4 text-center font-sans text-text-muted italic"
                  >
                    0 rows returned
                  </td>
                </tr>
              ) : (
                parsedData.queryData.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="transition-colors duration-fast hover:bg-surface-hover">
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="whitespace-nowrap border-b border-border-subtle px-2.5 py-2 text-text-secondary"
                      >
                        {cell === null || cell === undefined ? (
                          <span className="text-text-muted italic">null</span>
                        ) : (
                          String(cell)
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className="m-0 max-h-51.25 overflow-auto whitespace-pre p-3 font-mono text-forensic-code leading-relaxed text-status-success bg-surface-card/60">
          {parsedData.prettyJson}
        </pre>
      )}
    </section>
  );
};
