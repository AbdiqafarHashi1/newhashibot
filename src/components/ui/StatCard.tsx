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
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
        {icon && <span className={colorMap[color]}>{icon}</span>}
      </div>
      <div className={`text-2xl font-bold ${colorMap[color]}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
