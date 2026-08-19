import React, { useState, useMemo } from 'react';
import { Table, Code2, Copy, Check, Database } from 'lucide-react';
import type { McpQueryData } from '../types.js';

interface ClickHouseResultViewerProps {
  rawResult: string;
}

export const ClickHouseResultViewer: React.FC<ClickHouseResultViewerProps> = ({ rawResult }) => {
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
    <div className="bg-emerald-950/25 rounded-lg border border-emerald-500/30 overflow-hidden shadow-inner flex flex-col my-1">
      {/* Result Header Bar */}
      <div className="bg-emerald-950/50 px-3 py-2 border-b border-emerald-500/20 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-bold text-emerald-300 tracking-wide font-mono">
            ClickHouse Query Result
          </span>
          {parsedData.queryData && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-600/30">
              {parsedData.queryData.rows.length} row
              {parsedData.queryData.rows.length === 1 ? '' : 's'} ×{' '}
              {parsedData.queryData.columns.length} cols
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {parsedData.queryData && (
            <div className="flex items-center bg-black/40 rounded p-0.5 border border-emerald-500/20 text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2 py-0.5 rounded flex items-center gap-1 font-mono transition-colors ${
                  viewMode === 'table'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-emerald-300 hover:text-white'
                }`}
              >
                <Table className="w-3 h-3" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('json')}
                className={`px-2 py-0.5 rounded flex items-center gap-1 font-mono transition-colors ${
                  viewMode === 'json'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-emerald-300 hover:text-white'
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
            className="p-1 rounded bg-black/40 hover:bg-emerald-900/50 border border-emerald-500/20 text-emerald-300 hover:text-white transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
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
              <tr className="bg-emerald-950/70 border-b border-emerald-500/20 text-emerald-300">
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
            <tbody className="divide-y divide-emerald-900/30">
              {parsedData.queryData.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={parsedData.queryData.columns.length}
                    className="px-3 py-4 text-center text-emerald-400/60 italic"
                  >
                    0 rows returned (empty result set)
                  </td>
                </tr>
              ) : (
                parsedData.queryData.rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="hover:bg-emerald-900/20 transition-colors odd:bg-black/10 even:bg-transparent"
                  >
                    {row.map((cell, cIdx) => {
                      const colName = parsedData.queryData?.columns[cIdx] || '';
                      const isStitchOkCol = colName.toLowerCase().includes('stitch_ok');
                      const isLatencyCol = colName.toLowerCase().includes('latency');

                      return (
                        <td
                          key={cIdx}
                          className="px-3 py-2 text-emerald-100 whitespace-nowrap text-[12px]"
                        >
                          {isStitchOkCol ? (
                            cell === 0 || cell === '0' || cell === false ? (
                              <span className="px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 border border-red-500/40 text-[10px] font-bold">
                                0 (FAILED)
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                                1 (OK)
                              </span>
                            )
                          ) : isLatencyCol && typeof cell === 'number' ? (
                            <span
                              className={`font-semibold ${
                                cell >= 400
                                  ? 'text-red-400 font-bold'
                                  : cell >= 250
                                    ? 'text-amber-400'
                                    : 'text-emerald-300'
                              }`}
                            >
                              {cell} ms
                            </span>
                          ) : cell === null || cell === undefined ? (
                            <span className="text-gray-500 italic">null</span>
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
        <pre className="p-3 text-xs font-mono text-emerald-200 bg-black/40 overflow-x-auto max-h-60 leading-relaxed whitespace-pre-wrap wrap-break-word">
          {parsedData.prettyJson}
        </pre>
      )}
    </div>
  );
};
