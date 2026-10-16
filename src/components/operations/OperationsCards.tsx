import React from 'react';
import { Activity, AlertTriangle, Lock, RefreshCw, XCircle } from 'lucide-react';
import { HealthBadge, Health, FreshnessBadge } from './StatusBadges';

export function MetricCard({
  label,
  value,
  subtext,
  tone = 'zinc',
  icon: Icon = Activity,
}: {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  tone?: 'zinc' | 'green' | 'yellow' | 'red' | 'blue';
  icon?: typeof Activity;
}) {
  const toneStyle = {
    zinc: 'border-zinc-800/80 bg-zinc-900/80 text-zinc-100',
    green: 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300',
    yellow: 'border-yellow-500/30 bg-yellow-950/20 text-yellow-300',
    red: 'border-red-500/30 bg-red-950/20 text-red-300',
    blue: 'border-blue-500/30 bg-blue-950/20 text-blue-300',
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 shadow-lg shadow-black/20 space-y-2 ${toneStyle}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{label}</span>
        <Icon size={16} className="text-zinc-500" />
      </div>
      <div className="text-2xl font-mono font-bold tracking-tight">{value}</div>
      {subtext && <div className="text-xs text-zinc-400 font-mono">{subtext}</div>}
    </div>
  );
}

export function HealthCard({
  title,
  health,
  lastSyncMs,
  details = [],
  lastError,
  onRefresh,
  loading = false,
}: {
  title: string;
  health: Health;
  lastSyncMs?: number | null;
  details?: Array<{ label: string; value: React.ReactNode }>;
  lastError?: string | null;
  onRefresh?: () => void;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 space-y-3 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2">
        <h3 className="font-bold text-sm text-zinc-100 truncate">{title}</h3>
        <HealthBadge health={health} />
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
        <span>Freshness:</span>
        <FreshnessBadge ageMs={lastSyncMs ?? null} />
      </div>

      {details.length > 0 && (
        <div className="space-y-1 pt-1 text-xs border-t border-zinc-800/60 font-mono">
          {details.map((d, i) => (
            <div key={i} className="flex justify-between items-center text-zinc-300">
              <span className="text-zinc-500">{d.label}:</span>
              <span className="font-semibold">{d.value}</span>
            </div>
          ))}
        </div>
      )}

      {lastError && (
        <div className="text-[11px] font-mono text-red-300 bg-red-500/10 border border-red-500/20 p-2 rounded-xl flex items-start gap-1.5">
          <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <span className="truncate">{lastError}</span>
        </div>
      )}

      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="w-full mt-2 py-1.5 px-3 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing...' : 'Sync Provider'}
        </button>
      )}
    </div>
  );
}

export function IncidentBanner({
  title,
  description,
  severity = 'WARNING',
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  severity?: 'CRITICAL' | 'WARNING' | 'INFO';
  actionLabel?: string;
  onAction?: () => void;
}) {
  const styles = {
    CRITICAL: 'border-red-500/50 bg-red-950/30 text-red-200',
    WARNING: 'border-yellow-500/50 bg-yellow-950/30 text-yellow-200',
    INFO: 'border-blue-500/50 bg-blue-950/30 text-blue-200',
  }[severity];

  return (
    <div className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 shadow-xl ${styles}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <h4 className="font-bold text-sm tracking-tight">{title}</h4>
          <p className="text-xs opacity-90 leading-relaxed font-mono">{description}</p>
        </div>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold transition-all shrink-0"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function LockBanner({
  title = 'Live Execution Safety Lock Active',
  reason,
  onUnlockRequest,
}: {
  title?: string;
  reason: string;
  onUnlockRequest?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-red-500/40 bg-red-950/20 p-4 flex flex-wrap items-center justify-between gap-3 shadow-xl">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30">
          <Lock size={18} />
        </div>
        <div>
          <h4 className="font-bold text-sm text-red-200">{title}</h4>
          <p className="text-xs text-red-300 font-mono mt-0.5">{reason}</p>
        </div>
      </div>
      {onUnlockRequest && (
        <button
          type="button"
          onClick={onUnlockRequest}
          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-lg shadow-red-950/50"
        >
          Unlock Live Mode
        </button>
      )}
    </div>
  );
}

export function RuntimeBanner({
  status,
  version = 'v2026.07.23-root',
  mode = 'AUTOMATIC',
  pendingActions = 0,
}: {
  status: 'LIVE' | 'STALE' | 'FAILED' | 'DISABLED';
  version?: string;
  mode?: 'AUTOMATIC' | 'MANUAL';
  pendingActions?: number;
}) {
  const statusBg = {
    LIVE: 'border-emerald-500/40 bg-emerald-950/20',
    STALE: 'border-yellow-500/40 bg-yellow-950/20',
    FAILED: 'border-red-500/40 bg-red-950/20',
    DISABLED: 'border-zinc-800 bg-zinc-950/80',
  }[status];

  return (
    <div className={`rounded-2xl border p-4 shadow-xl flex flex-wrap items-center justify-between gap-4 ${statusBg}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-3 w-3 relative">
          {status === 'LIVE' && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex rounded-full h-3 w-3 ${
              status === 'LIVE'
                ? 'bg-emerald-500'
                : status === 'STALE'
                ? 'bg-yellow-500'
                : status === 'FAILED'
                ? 'bg-red-500'
                : 'bg-zinc-600'
            }`}
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-base text-zinc-100">HashiBot Master Runtime</h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">{version}</span>
          </div>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            Single Scanner Architecture • Crypto & Forex Market Adapters Active
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs font-mono">
        <div className="text-right">
          <span className="text-zinc-500 block">Scheduler:</span>
          <span className="text-zinc-200 font-bold">{mode}</span>
        </div>
        <div className="text-right border-l border-zinc-800 pl-4">
          <span className="text-zinc-500 block">Queue Status:</span>
          <span className="text-blue-400 font-bold">{pendingActions} Pending</span>
        </div>
      </div>
    </div>
  );
}

