import React from 'react';
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle, Clock, Zap, Lock, Shield } from 'lucide-react';
import { RuntimeTruthStatus, statusClasses } from '../../lib/operatorRuntime';

export type Health = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'OFFLINE';
export type Severity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
export type CertificationLevel = 'UNVERIFIED' | 'STAGE_1_PASSED' | 'STAGE_2_PASSED' | 'FULLY_CERTIFIED';

export function StatusBadge({ status }: { status: RuntimeTruthStatus | string }) {
  const normStatus = (typeof status === 'string' ? status : 'DISABLED') as RuntimeTruthStatus;
  const cls = statusClasses(normStatus) || 'bg-zinc-800 text-zinc-400 border-zinc-700';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {normStatus}
    </span>
  );
}

export function HealthBadge({ health }: { health: Health }) {
  const config: Record<Health, { cls: string; icon: typeof CheckCircle; label: string }> = {
    HEALTHY: { cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', icon: CheckCircle, label: 'HEALTHY' },
    WARNING: { cls: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300', icon: AlertTriangle, label: 'WARNING' },
    CRITICAL: { cls: 'border-red-500/30 bg-red-500/10 text-red-300', icon: XCircle, label: 'CRITICAL' },
    OFFLINE: { cls: 'border-zinc-700 bg-zinc-900 text-zinc-400', icon: Clock, label: 'OFFLINE' },
  };

  const item = config[health] || config.OFFLINE;
  const Icon = item.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${item.cls}`}>
      <Icon size={12} />
      {item.label}
    </span>
  );
}

export function FreshnessBadge({ ageMs, thresholdMs = 180000 }: { ageMs: number | null; thresholdMs?: number }) {
  if (ageMs === null || ageMs < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-500 font-mono">
        <Clock size={10} /> NO DATA
      </span>
    );
  }

  const isFresh = ageMs <= thresholdMs;
  const seconds = Math.floor(ageMs / 1000);
  const minutes = Math.floor(seconds / 60);

  const display = minutes > 0 ? `${minutes}m ago` : `${seconds}s ago`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium ${
        isFresh
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
          : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
      }`}
    >
      <Clock size={10} />
      {display}
    </span>
  );
}

export function EnvironmentBadge({ env }: { env: 'TESTNET' | 'DEMO' | 'PAPER' | 'LIVE' | string }) {
  const norm = env ? env.toUpperCase() : 'PAPER';
  const isLive = norm === 'LIVE';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider ${
        isLive
          ? 'border-red-500/40 bg-red-500/15 text-red-300 shadow-sm shadow-red-900/30'
          : 'border-blue-500/30 bg-blue-500/10 text-blue-300'
      }`}
    >
      {isLive ? <Zap size={11} className="text-red-400" /> : <Shield size={11} className="text-blue-400" />}
      {norm}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    INFO: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    WARNING: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
    HIGH: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
    CRITICAL: 'border-red-500/30 bg-red-500/15 text-red-300 animate-pulse',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${styles[severity] || styles.INFO}`}>
      {severity}
    </span>
  );
}

export function CertificationBadge({ level }: { level: CertificationLevel | string }) {
  const isCertified = level === 'FULLY_CERTIFIED';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
        isCertified
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-zinc-700 bg-zinc-900 text-zinc-400'
      }`}
    >
      {isCertified ? <ShieldCheck size={12} className="text-emerald-400" /> : <Lock size={12} className="text-zinc-500" />}
      {level.replace(/_/g, ' ')}
    </span>
  );
}
