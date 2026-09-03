import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Copy, Check, Database } from 'lucide-react';
import type { McpQueryData } from '../types.js';
import { IconButton, SegmentedControl } from './ui/index.js';

interface ClickHouseResultViewerProps {
  rawResult: string;
  durationMs?: number | undefined;
  rowsReturned?: number | undefined;
  rowsScanned?: number | undefined;
}

const TABLE_ROW_HEIGHT_PX = 36;
const TABLE_VIEWPORT_HEIGHT_PX = 205;
const TABLE_OVERSCAN_ROWS = 8;
const TABLE_RENDER_WINDOW =
  Math.ceil(TABLE_VIEWPORT_HEIGHT_PX / TABLE_ROW_HEIGHT_PX) + TABLE_OVERSCAN_ROWS * 2;

export const ClickHouseResultViewer: React.FC<ClickHouseResultViewerProps> = ({
  rawResult,
  durationMs,
  rowsReturned,
  rowsScanned,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');
  const [tableScrollTop, setTableScrollTop] = useState(0);

  useEffect(() => {
    setTableScrollTop(0);
  }, [rawResult]);

  const parsedData = useMemo<{
    queryData: McpQueryData | null;
    parsedValue: unknown;
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

      return {
        queryData,
        parsedValue: parsed,
        isStructured: true,
      };
    } catch {
      return {
        queryData: null,
        parsedValue: rawResult,
        isStructured: false,
      };
    }
  }, [rawResult]);

  const prettyJson = useMemo(() => {
    if (viewMode !== 'json') return '';
    if (!parsedData.isStructured) return rawResult;
    return JSON.stringify(parsedData.parsedValue, null, 2);
  }, [parsedData.isStructured, parsedData.parsedValue, rawResult, viewMode]);

  const getCopyText = useCallback(() => {
    if (!parsedData.isStructured) return rawResult;
    return JSON.stringify(parsedData.parsedValue, null, 2);
  }, [parsedData.isStructured, parsedData.parsedValue, rawResult]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(getCopyText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTableScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const nextScrollTop = Math.floor(event.currentTarget.scrollTop);
    setTableScrollTop((previous) => (previous === nextScrollTop ? previous : nextScrollTop));
  }, []);

  const rowsCount =
    typeof rowsReturned === 'number'
      ? rowsReturned
      : parsedData.queryData
        ? parsedData.queryData.rows.length
        : undefined;
  const colsCount = parsedData.queryData?.columns.length ?? 0;
  const tableRows = parsedData.queryData?.rows ?? [];
  const firstVisibleRow = Math.max(
    0,
    Math.floor(tableScrollTop / TABLE_ROW_HEIGHT_PX) - TABLE_OVERSCAN_ROWS,
  );
  const lastVisibleRow = Math.min(tableRows.length, firstVisibleRow + TABLE_RENDER_WINDOW);
  const visibleRows = tableRows.slice(firstVisibleRow, lastVisibleRow);
  const topSpacerHeight = firstVisibleRow * TABLE_ROW_HEIGHT_PX;
  const bottomSpacerHeight = (tableRows.length - lastVisibleRow) * TABLE_ROW_HEIGHT_PX;

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
        <div
          className="max-h-51.25 overflow-auto"
          onScroll={handleTableScroll}
          role="region"
          aria-label={`Query result table with ${rowsCount ?? 0} rows`}
        >
          <table
            className="w-full min-w-190 border-collapse text-left font-mono text-forensic-code"
            aria-rowcount={tableRows.length}
          >
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
              {tableRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={parsedData.queryData.columns.length}
                    className="p-4 text-center font-sans text-text-muted italic"
                  >
                    0 rows returned
                  </td>
                </tr>
              ) : (
                <>
                  <tr aria-hidden="true">
                    <td colSpan={colsCount} style={{ height: topSpacerHeight, padding: 0 }} />
                  </tr>
                  {visibleRows.map((row, visibleIndex) => {
                    const rowIndex = firstVisibleRow + visibleIndex;
                    return (
                      <tr
                        key={rowIndex}
                        aria-rowindex={rowIndex + 2}
                        className="h-9 transition-colors duration-fast hover:bg-surface-hover"
                      >
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
                    );
                  })}
                  <tr aria-hidden="true">
                    <td colSpan={colsCount} style={{ height: bottomSpacerHeight, padding: 0 }} />
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className="m-0 max-h-51.25 overflow-auto whitespace-pre p-3 font-mono text-forensic-code leading-relaxed text-status-success bg-surface-card/60">
          {prettyJson}
        </pre>
      )}
    </section>
  );
};
