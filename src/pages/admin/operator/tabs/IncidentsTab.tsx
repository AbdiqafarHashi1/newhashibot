import React from 'react';
import { ShieldAlert, CheckCircle } from 'lucide-react';
import { IncidentBanner } from '../../../../components/operations';
import { OperatorActionResult } from '../../../../components/admin/ActionResult';

type Row = Record<string, unknown>;

export function IncidentsTab({
  tradeTruth = [],
  providerControls = [],
  onRunAction,
}: {
  tradeTruth?: Row[];
  operatorEvents?: Row[];
  providerControls?: Row[];
  onRunAction: (action: string) => Promise<OperatorActionResult | null>;
  runningAction?: string | null;
}) {
  const unprotected = tradeTruth.filter(
    (t) => String(t.protection_status ?? '').toUpperCase().includes('UNPROTECT')
  );

  const providerErrors = providerControls.filter((p) => p.last_error);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
          <ShieldAlert className="text-red-400" size={18} /> Operational Incidents & Alarms
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Real-time incident detection engine tracking position protection gaps, exchange errors, and stale heartbeats.
        </p>
      </div>

      {unprotected.length > 0 && (
        <IncidentBanner
          title={`${unprotected.length} Unprotected Position(s) Detected`}
          description="Open exchange positions missing active stop-loss order."
          severity="CRITICAL"
          actionLabel="Repair All Protection"
          onAction={() => onRunAction('repair_protection_now')}
        />
      )}

      {providerErrors.map((p, i) => (
        <IncidentBanner
          key={i}
          title={`Exchange API Error: ${String(p.provider_name ?? 'Exchange')}`}
          description={String(p.last_error ?? 'Connection error')}
          severity="WARNING"
          actionLabel="Sync Exchange"
          onAction={() => onRunAction('refresh_exchange')}
        />
      ))}

      {unprotected.length === 0 && providerErrors.length === 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-8 text-center space-y-2">
          <CheckCircle size={32} className="text-emerald-400 mx-auto" />
          <h3 className="font-bold text-sm text-emerald-200">All Operational Controls Normal</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            No active incidents, unprotected positions, or exchange provider errors detected in the current telemetry snapshot.
          </p>
        </div>
      )}
    </div>
  );
}
