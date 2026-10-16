import { useState } from 'react';
import { Users } from 'lucide-react';
import { DataTable, SearchInput, FilterBar } from '../../../../components/operations';

type Row = Record<string, unknown>;

export function CustomersTab({
  customers = [],
}: {
  customers?: Row[];
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = customers.filter((c) => {
    const email = String(c.email ?? c.username ?? '').toUpperCase();
    const role = String(c.role ?? '').toUpperCase();

    if (searchTerm) {
      const q = searchTerm.toUpperCase();
      return email.includes(q) || role.includes(q);
    }
    return true;
  });

  const columns = [
    {
      header: 'Customer / User',
      accessor: (r: Row) => <span className="font-bold text-zinc-100">{String(r.email ?? r.id ?? 'Customer')}</span>,
    },
    {
      header: 'Role',
      accessor: (r: Row) => (
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
            String(r.role) === 'admin'
              ? 'bg-purple-500/10 border border-purple-500/30 text-purple-300'
              : 'bg-zinc-800 text-zinc-300'
          }`}
        >
          {String(r.role ?? 'trader').toUpperCase()}
        </span>
      ),
    },
    {
      header: 'Subscription Status',
      accessor: (r: Row) => (
        <span className="text-emerald-400 font-mono text-xs font-bold">
          {String(r.subscription_status ?? 'ACTIVE_PRO')}
        </span>
      ),
    },
    {
      header: 'Joined Date',
      accessor: (r: Row) => (
        <span className="text-zinc-500 font-mono text-[10px]">
          {r.created_at ? new Date(String(r.created_at)).toLocaleDateString() : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
          <Users className="text-blue-400" size={18} /> Customers & Subscriber Management
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          User access entitlements, subscription packages, and signal access permissions.
        </p>
      </div>

      <FilterBar>
        <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Filter customers by email or role..." />
      </FilterBar>

      <DataTable columns={columns} data={filtered} emptyMessage="No customer accounts registered." />
    </div>
  );
}
