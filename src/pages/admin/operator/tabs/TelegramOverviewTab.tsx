import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { DataTable, SearchInput, FilterBar } from '../../../../components/operations';
import { OperatorActionResult } from '../../../../components/admin/ActionResult';

type Row = Record<string, unknown>;

export function TelegramOverviewTab({
  deliveries = [],
  onRunAction,
  runningAction,
}: {
  deliveries?: Row[];
  onRunAction: (action: string) => Promise<OperatorActionResult | null>;
  runningAction: string | null;
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = deliveries.filter((d) => {
    const channel = String(d.destination_channel ?? d.channel_id ?? '').toUpperCase();
    const type = String(d.delivery_type ?? '').toUpperCase();
    if (searchTerm && !channel.includes(searchTerm.toUpperCase()) && !type.includes(searchTerm.toUpperCase())) {
      return false;
    }
    return true;
  });

  const columns = [
    {
      header: 'Destination Channel',
      accessor: (r: Row) => <span className="font-bold text-zinc-100">{String(r.destination_channel ?? r.channel_id ?? 'VIP Channel')}</span>,
    },
    {
      header: 'Delivery Type',
      accessor: (r: Row) => (
        <span className="text-xs font-mono text-blue-300">
          {String(r.delivery_type ?? 'signal_notification')}
        </span>
      ),
    },
    {
      header: 'Delivery Status',
      accessor: (r: Row) => {
        const st = String(r.status ?? 'sent').toLowerCase();
        const isSent = st === 'sent';
        return (
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
              isSent
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border border-red-500/30 text-red-300'
            }`}
          >
            {st.toUpperCase()}
          </span>
        );
      },
    },
    {
      header: 'Dispatched At',
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
            <Send className="text-blue-400" size={18} /> Telegram Dispatch Gateway
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time signal broadcasting, operator digests, and VIP channel routing.
          </p>
        </div>

        <button
          onClick={() => onRunAction('run_telegram_test')}
          disabled={Boolean(runningAction)}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-blue-950/50 flex items-center gap-2 disabled:opacity-50"
        >
          <Send size={14} className={runningAction === 'run_telegram_test' ? 'animate-spin' : ''} />
          Send Test Telegram Digest
        </button>
      </div>

      <FilterBar>
        <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Filter by channel or delivery type..." />
      </FilterBar>

      <DataTable
        columns={columns}
        data={filtered}
        emptyMessage="No Telegram delivery logs in the ledger."
      />
    </div>
  );
}
