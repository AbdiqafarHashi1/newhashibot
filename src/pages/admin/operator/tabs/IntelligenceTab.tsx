import React from 'react';
import { Newspaper, RefreshCw } from 'lucide-react';
import { DataTable } from '../../../../components/operations';
import { OperatorActionResult } from '../../../../components/admin/ActionResult';

type Row = Record<string, unknown>;

export function IntelligenceTab({
  intelligenceEvents = [],
  onRunAction,
  runningAction,
}: {
  intelligenceEvents?: Row[];
  onRunAction: (action: string) => Promise<OperatorActionResult | null>;
  runningAction: string | null;
}) {
  const columns = [
    {
      header: 'Headline / Title',
      accessor: (r: Row) => <span className="font-bold text-zinc-100">{String(r.title ?? 'Market News Digest')}</span>,
    },
    {
      header: 'Event Type',
      accessor: (r: Row) => <span className="text-blue-300 font-mono text-xs">{String(r.event_type ?? 'news_digest')}</span>,
    },
    {
      header: 'Confidence Score',
      accessor: (r: Row) => <span className="text-emerald-400 font-mono font-bold">{String(r.confidence ?? 80)}%</span>,
    },
    {
      header: 'Timestamp',
      accessor: (r: Row) => (
        <span className="text-zinc-500 font-mono text-[10px]">
          {r.created_at ? new Date(String(r.created_at)).toLocaleString() : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-900/80 p-5 rounded-2xl border border-zinc-800 shadow-xl">
        <div>
          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Newspaper className="text-blue-400" size={18} /> News Brain & Market Intelligence
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Macro economic news parsing, sentiment impact scoring, and volatility event guards.
          </p>
        </div>

        <button
          onClick={() => onRunAction('run_news_brain')}
          disabled={Boolean(runningAction)}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-blue-950/50 flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={14} className={runningAction === 'run_news_brain' ? 'animate-spin' : ''} />
          Run News Brain Engine
        </button>
      </div>

      <DataTable columns={columns} data={intelligenceEvents} emptyMessage="No market intelligence digests logged." />
    </div>
  );
}
