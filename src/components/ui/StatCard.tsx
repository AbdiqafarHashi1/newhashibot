import { ReactNode } from 'react';

export function StatCard({ label, value, sub, icon, color = 'blue' }: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'gray' | 'cyan';
}) {
  const colorMap = {
    blue:   'text-blue-400',
    green:  'text-emerald-400',
    red:    'text-red-400',
    yellow: 'text-yellow-400',
    gray:   'text-zinc-400',
    cyan:   'text-cyan-400',
  };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 sm:p-4 flex min-w-0 flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] sm:text-xs text-zinc-500 uppercase tracking-wider leading-snug">{label}</span>
        {icon && <span className={colorMap[color]}>{icon}</span>}
      </div>
      <div className={`text-xl sm:text-2xl font-bold ${colorMap[color]}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
