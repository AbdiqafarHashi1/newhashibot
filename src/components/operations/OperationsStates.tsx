import React from 'react';
import { AlertTriangle, Clock, ShieldAlert, XCircle, ShieldCheck, RefreshCw } from 'lucide-react';

export function LoadingState({ message = 'Loading operational telemetry...' }: { message?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-12 text-center flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-zinc-400 font-mono">{message}</p>
    </div>
  );
}

export function EmptyState({
  title = 'No Data Available',
  message = 'No active records match the current operational filter.',
  actionLabel,
  onAction,
}: {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-12 text-center flex flex-col items-center justify-center gap-2">
      <ShieldCheck size={32} className="text-zinc-600 mb-1" />
      <h4 className="font-bold text-sm text-zinc-300">{title}</h4>
      <p className="text-xs text-zinc-500 max-w-sm">{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-3 px-3.5 py-1.5 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 font-semibold transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function StaleState({
  ageMs,
  onRefresh,
}: {
  ageMs: number;
  onRefresh: () => void;
}) {
  const minutes = Math.floor(ageMs / 60000);
  return (
    <div className="rounded-2xl border border-yellow-500/30 bg-yellow-950/20 p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Clock size={20} className="text-yellow-400 shrink-0" />
        <div>
          <h4 className="font-bold text-xs text-yellow-200">TELEMETRY STALE ({minutes}m ago)</h4>
          <p className="text-[11px] text-zinc-400">
            Current view telemetry exceeds freshness threshold. Sync required.
          </p>
        </div>
      </div>
      <button
        onClick={onRefresh}
        className="px-3 py-1.5 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-black text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5"
      >
        <RefreshCw size={12} /> Sync Now
      </button>
    </div>
  );
}

export function ErrorState({
  title = 'Operational Ledger Error',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-red-500/40 bg-red-950/20 p-6 text-center flex flex-col items-center gap-3">
      <XCircle size={32} className="text-red-400" />
      <div>
        <h4 className="font-bold text-sm text-red-200">{title}</h4>
        <p className="text-xs text-red-300 font-mono mt-1 max-w-md mx-auto">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors shadow-lg shadow-red-950/50"
        >
          Retry Connection
        </button>
      )}
    </div>
  );
}

export function DegradedState({
  reason,
  onRepair,
}: {
  reason: string;
  onRepair?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-orange-500/40 bg-orange-950/20 p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <AlertTriangle size={20} className="text-orange-400 shrink-0" />
        <div>
          <h4 className="font-bold text-xs text-orange-200">RUNTIME DEGRADED</h4>
          <p className="text-[11px] text-zinc-300">{reason}</p>
        </div>
      </div>
      {onRepair && (
        <button
          onClick={onRepair}
          className="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-colors shrink-0"
        >
          Run Auto-Repair
        </button>
      )}
    </div>
  );
}

export function AccessDeniedState({ message = 'Admin role required to view operations console.' }: { message?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-12 text-center flex flex-col items-center justify-center gap-3">
      <ShieldAlert size={36} className="text-red-400" />
      <h3 className="font-bold text-base text-zinc-100">Access Denied</h3>
      <p className="text-xs text-zinc-400 max-w-sm">{message}</p>
    </div>
  );
}
