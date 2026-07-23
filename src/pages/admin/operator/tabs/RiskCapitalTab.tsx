import React from 'react';
import { Shield, AlertTriangle } from 'lucide-react';
import { HeatmapContainer, MetricCard } from '../../../../components/operations';

type Row = Record<string, unknown>;

export function RiskCapitalTab({
  quarantineRows = [],
  tradeTruth = [],
}: {
  quarantineRows?: Row[];
  tradeTruth?: Row[];
}) {
  const totalExposure = tradeTruth.reduce((acc, t) => acc + Number(t.position_size ?? 0), 0);
  const unprotectedCount = tradeTruth.filter((t) =>
    String(t.protection_status ?? '').toUpperCase().includes('UNPROTECT')
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
          <Shield className="text-blue-400" size={18} /> Portfolio Risk & Capital Allocation
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Real-time capital concentration, leverage exposure ceilings, and symbol quarantine controls.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Total Risk Exposure"
          value={`$${totalExposure.toLocaleString()}`}
          subtext="Active position size across all exchanges"
          tone="blue"
          icon={Shield}
        />
        <MetricCard
          label="Quarantined Symbols"
          value={quarantineRows.length}
          subtext="Excluded from candidate selection"
          tone={quarantineRows.length > 0 ? 'yellow' : 'green'}
          icon={AlertTriangle}
        />
        <MetricCard
          label="Unprotected Trades"
          value={unprotectedCount}
          subtext={unprotectedCount > 0 ? 'High Risk Exposure' : 'All Trades Protected'}
          tone={unprotectedCount > 0 ? 'red' : 'green'}
          icon={AlertTriangle}
        />
      </div>

      <HeatmapContainer
        title="Position Capital Allocation Heatmap"
        cells={tradeTruth.map((t) => ({
          symbol: String(t.symbol ?? 'UNKNOWN'),
          side: String(t.side ?? 'LONG').toUpperCase(),
          exposureUsd: Number(t.position_size ?? 1000),
          pnlPct: Number(t.unrealized_pnl ?? 0),
          protectionStatus: String(t.protection_status ?? 'PROTECTED'),
        }))}
      />
    </div>
  );
}
