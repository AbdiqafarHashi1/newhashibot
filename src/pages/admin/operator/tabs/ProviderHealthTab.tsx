import React from 'react';
import { Activity } from 'lucide-react';
import { HealthCard, Health } from '../../../../components/operations';
import { OperatorActionResult } from '../../../../components/admin/ActionResult';

type Row = Record<string, unknown>;

export function ProviderHealthTab({
  providerControls = [],
  heartbeats = [],
  onRunAction,
  runningAction,
}: {
  providerControls?: Row[];
  heartbeats?: Row[];
  onRunAction: (action: string, provider?: string) => Promise<OperatorActionResult | null>;
  runningAction: string | null;
}) {
  const providers = [
    { name: 'Binance USD-M Futures', providerKey: 'binance', monitorAction: 'run_binance_monitor_now' },
    { name: 'Bybit Unified Account', providerKey: 'bybit', monitorAction: 'run_bybit_monitor_now' },
    { name: 'MetaTrader 5 Bridge', providerKey: 'mt5', monitorAction: 'run_supervisor_now' },
  ];

  const getHbAge = (key: string) => {
    const hb = heartbeats.find((h) => String(h.provider ?? '').toLowerCase() === key.toLowerCase());
    if (!hb?.started_at) return null;
    return Date.now() - new Date(String(hb.started_at)).getTime();
  };

  const getHealth = (ageMs: number | null): Health => {
    if (ageMs === null) return 'OFFLINE';
    if (ageMs <= 180000) return 'HEALTHY';
    if (ageMs <= 600000) return 'WARNING';
    return 'CRITICAL';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
          <Activity className="text-blue-400" size={18} /> Exchange Provider Health & Supervisors
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Exchange API connectivity, background supervisor polling health, and sync freshness.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {providers.map((p, i) => {
          const age = getHbAge(p.providerKey);
          const ctrl = providerControls.find((c) => String(c.provider_name ?? '').toLowerCase() === p.providerKey);
          const lastErr = ctrl?.last_error ? String(ctrl.last_error) : null;

          return (
            <HealthCard
              key={i}
              title={p.name}
              health={getHealth(age)}
              lastSyncMs={age}
              lastError={lastErr}
              details={[
                { label: 'Monitor Polling', value: ctrl?.monitor_enabled !== false ? 'Enabled' : 'Paused' },
                { label: 'Status Flag', value: String(ctrl?.status ?? 'ACTIVE').toUpperCase() },
              ]}
              onRefresh={() => onRunAction(p.monitorAction, p.providerKey)}
              loading={runningAction === p.monitorAction}
            />
          );
        })}
      </div>
    </div>
  );
}
