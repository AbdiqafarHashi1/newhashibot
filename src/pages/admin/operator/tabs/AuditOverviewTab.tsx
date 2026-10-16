import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { DataTable, SearchInput, FilterBar, ResponsiveDrawer, DetailPanel } from '../../../../components/operations';

type Row = Record<string, unknown>;

export function AuditOverviewTab({
  operatorEvents = [],
}: {
  operatorEvents?: Row[];
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);

  const filtered = operatorEvents.filter((evt) => {
    const action = String(evt.action ?? '').toUpperCase();
    const source = String(evt.source ?? '').toUpperCase();
    const summary = String(evt.summary ?? '').toUpperCase();

    if (searchTerm) {
      const q = searchTerm.toUpperCase();
      return action.includes(q) || source.includes(q) || summary.includes(q);
    }
    return true;
  });

  const columns = [
    {
      header: 'Action',
      accessor: (r: Row) => <span className="font-bold text-zinc-100">{String(r.action ?? 'Operator Action')}</span>,
    },
    {
      header: 'Result',
      accessor: (r: Row) => {
        const res = String(r.result ?? 'SUCCESS').toUpperCase();
        const isOk = res === 'SUCCESS';
        return (
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              isOk
                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                : 'bg-red-500/10 text-red-300 border border-red-500/30'
            }`}
          >
            {res}
          </span>
        );
      },
    },
    {
      header: 'Summary',
      accessor: (r: Row) => <span className="text-zinc-400 font-mono text-xs">{String(r.summary ?? '—')}</span>,
    },
    {
      header: 'Duration',
      accessor: (r: Row) => <span className="text-zinc-400 font-mono">{r.duration_ms ? `${r.duration_ms}ms` : '—'}</span>,
    },
    {
      header: 'Started At',
      accessor: (r: Row) => (
        <span className="text-zinc-500 font-mono text-[10px]">
          {r.started_at ? new Date(String(r.started_at)).toLocaleString() : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
          <ClipboardList className="text-blue-400" size={18} /> Operator Runtime Audit Trail
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Immutable system log capturing every manual command, automated background cycle, and configuration transition.
        </p>
      </div>

      <FilterBar>
        <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Filter audit trail by action, source, or summary..." />
      </FilterBar>

      <DataTable
        columns={columns}
        data={filtered}
        onRowClick={(row) => setSelectedRow(row)}
        emptyMessage="No operator runtime events match search criteria."
      />

      <ResponsiveDrawer
        isOpen={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
        title="Audit Event Specification"
      >
        {selectedRow && (
          <DetailPanel
            title="Event Payload"
            items={[
              { label: 'Action Name', value: String(selectedRow.action ?? '—') },
              { label: 'Source', value: String(selectedRow.source ?? '—') },
              { label: 'Result Status', value: String(selectedRow.result ?? '—') },
              { label: 'Duration', value: `${selectedRow.duration_ms ?? 0} ms` },
              { label: 'Actor User ID', value: String(selectedRow.actor_user_id ?? 'System / Admin') },
              { label: 'Started At', value: String(selectedRow.started_at ?? '—') },
              { label: 'Summary', value: String(selectedRow.summary ?? '—'), fullWidth: true },
              { label: 'Error Detail', value: String(selectedRow.error ?? 'None'), fullWidth: true },
            ]}
          />
        )}
      </ResponsiveDrawer>
    </div>
  );
}
