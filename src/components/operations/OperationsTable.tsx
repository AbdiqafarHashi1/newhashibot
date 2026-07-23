import React from 'react';
import { ChevronRight, Search } from 'lucide-react';

export type Column<T> = {
  header: React.ReactNode;
  accessor: (item: T) => React.ReactNode;
  className?: string;
};

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  emptyMessage = 'No operational records available.',
}: {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-8 text-center space-y-2">
        <p className="text-xs text-zinc-400 font-mono">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-zinc-950/80 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
            <tr>
              {columns.map((col, idx) => (
                <th key={idx} className={`py-3.5 px-4 font-bold ${col.className || ''}`}>
                  {col.header}
                </th>
              ))}
              {onRowClick && <th className="py-3.5 px-4 w-10" />}
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
            {data.map((item, rowIdx) => (
              <tr
                key={rowIdx}
                onClick={() => onRowClick && onRowClick(item)}
                className={`transition-colors ${
                  onRowClick ? 'cursor-pointer hover:bg-zinc-800/60' : 'hover:bg-zinc-800/30'
                }`}
              >
                {columns.map((col, colIdx) => (
                  <td key={colIdx} className={`py-3 px-4 ${col.className || ''}`}>
                    {col.accessor(item)}
                  </td>
                ))}
                {onRowClick && (
                  <td className="py-3 px-4 text-right text-zinc-600">
                    <ChevronRight size={14} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/60">
      {children}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Filter records...',
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative flex-1 min-w-[200px]">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-zinc-800 bg-zinc-950 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}
