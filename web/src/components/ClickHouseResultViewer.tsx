import React, { useState, useMemo } from 'react';
import { Table, Code2, Copy, Check, Database, Clock } from 'lucide-react';
import type { McpQueryData } from '../types.js';
import { Badge } from './ui/index.js';

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

  // Try parsing structured ClickHouse query results
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

  return (
    <div className="bg-data-surface rounded-lg border border-data-border overflow-hidden shadow-inner flex flex-col my-1">
      {/* Result Header Bar */}
      <div className="bg-data-surface px-3 py-2 border-b border-data-border flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Database className="w-3.5 h-3.5 text-data-fg" />
          <span className="text-xs font-bold text-data-fg tracking-wide font-mono">
            ClickHouse Query Result
          </span>
          {(rowsReturned !== undefined || parsedData.queryData) && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-card text-data-fg border border-data-border">
              {rowsReturned ?? parsedData.queryData?.rows.length ?? 0} row
              {(rowsReturned ?? parsedData.queryData?.rows.length ?? 0) === 1 ? '' : 's'}
              {parsedData.queryData ? ` × ${parsedData.queryData.columns.length} cols` : ''}
            </span>
          )}
          {typeof durationMs === 'number' && (
            <Badge variant="data" size="sm" icon={<Clock className="w-2.5 h-2.5" />}>
              {durationMs} ms
            </Badge>
          )}
          {typeof rowsScanned === 'number' && (
            <Badge variant="data" size="sm">
              {rowsScanned.toLocaleString('en-US')} rows scanned
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {parsedData.queryData && (
            <div className="flex items-center bg-surface-scrim rounded p-0.5 border border-data-border text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2 py-0.5 rounded flex items-center gap-1 font-mono transition-colors duration-fast ${
                  viewMode === 'table'
                    ? 'bg-data-fg text-data-fg-on font-semibold'
                    : 'text-data-fg hover:text-text-primary'
                }`}
              >
                <Table className="w-3 h-3" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('json')}
                className={`px-2 py-0.5 rounded flex items-center gap-1 font-mono transition-colors duration-fast ${
                  viewMode === 'json'
                    ? 'bg-data-fg text-data-fg-on font-semibold'
                    : 'text-data-fg hover:text-text-primary'
                }`}
              >
                <Code2 className="w-3 h-3" />
                JSON
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleCopy}
            title="Copy ClickHouse Result"
            className="p-1 rounded bg-surface-scrim hover:bg-surface-hover border border-data-border text-data-fg hover:text-text-primary transition-colors duration-fast"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-status-success" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Structured Table View */}
      {parsedData.queryData && viewMode === 'table' ? (
        <div className="overflow-x-auto max-h-60">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="bg-surface-card border-b border-data-border text-data-fg">
                {parsedData.queryData.columns.map((col, idx) => (
                  <th
                    key={idx}
                    className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-data-border">
              {parsedData.queryData.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={parsedData.queryData.columns.length}
                    className="px-3 py-4 text-center text-text-muted italic"
                  >
                    0 rows returned (empty result set)
                  </td>
                </tr>
              ) : (
                parsedData.queryData.rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="hover:bg-surface-hover transition-colors duration-fast odd:bg-surface-panel/40 even:bg-transparent"
                  >
                    {row.map((cell, cIdx) => {
                      const colName = parsedData.queryData?.columns[cIdx] || '';
                      const isStitchOkCol = colName.toLowerCase().includes('stitch_ok');
                      const isLatencyCol = colName.toLowerCase().includes('latency');

                      return (
                        <td
                          key={cIdx}
                          className="px-3 py-2 text-text-primary whitespace-nowrap text-[12px]"
                        >
                          {isStitchOkCol ? (
                            cell === 0 || cell === '0' || cell === false ? (
                              <span className="px-1.5 py-0.5 rounded bg-status-critical-surface text-status-critical border border-status-critical-border text-[10px] font-bold">
                                0 (FAILED)
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-status-success-surface text-status-success border border-status-success-border text-[10px] font-bold">
                                1 (OK)
                              </span>
                            )
                          ) : isLatencyCol && typeof cell === 'number' ? (
                            <span
                              className={`font-semibold ${
                                cell >= 400
                                  ? 'text-severity-anomalous font-bold'
                                  : cell >= 250
                                    ? 'text-severity-degraded'
                                    : 'text-severity-nominal'
                              }`}
                            >
                              {cell} ms
                            </span>
                          ) : cell === null || cell === undefined ? (
                            <span className="text-text-muted italic">null</span>
                          ) : (
                            String(cell)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Formatted Monospace Code View */
        <pre className="p-3 text-xs font-mono text-data-fg bg-surface-scrim overflow-x-auto max-h-60 leading-relaxed whitespace-pre-wrap wrap-break-word">
          {parsedData.prettyJson}
        </pre>
      )}
    </div>
  );
};
