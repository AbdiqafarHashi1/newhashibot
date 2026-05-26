import { ReactNode } from 'react';

type Variant = 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'orange' | 'cyan' | 'purple';

const variantClasses: Record<Variant, string> = {
  green:  'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  red:    'bg-red-500/15 text-red-400 border border-red-500/30',
  yellow: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  blue:   'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  gray:   'bg-zinc-700/50 text-zinc-400 border border-zinc-600/50',
  orange: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  cyan:   'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30',
  purple: 'bg-violet-500/15 text-violet-400 border border-violet-500/30',
};

export function Badge({ children, variant = 'gray', className = '' }: {
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}

export function gradeBadge(grade: string) {
  if (grade === 'A+') return <Badge variant="green">A+</Badge>;
  if (grade === 'A')  return <Badge variant="blue">A</Badge>;
  if (grade === 'B')  return <Badge variant="yellow">B</Badge>;
  return <Badge variant="gray">{grade}</Badge>;
}

export function directionBadge(dir: string) {
  return dir === 'buy'
    ? <Badge variant="green">BUY</Badge>
    : <Badge variant="red">SELL</Badge>;
}

export function statusBadge(status: string) {
  const map: Record<string, Variant> = {
    waiting: 'yellow',
    active: 'blue',
    tp1_hit: 'cyan',
    tp2_hit: 'green',
    sl_hit: 'red',
    expired: 'gray',
    cancelled: 'gray',
    running: 'blue',
    completed: 'green',
    error: 'red',
    sent: 'green',
    failed: 'red',
    pending: 'yellow',
    active_provider: 'green',
    not_configured: 'orange',
    unknown: 'gray',
  };
  return <Badge variant={map[status] ?? 'gray'}>{status.replace(/_/g, ' ').toUpperCase()}</Badge>;
}
