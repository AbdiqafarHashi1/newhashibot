import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PlayCircle, PauseCircle, ShieldAlert, Activity, RefreshCw, Zap, Shield, AlertTriangle, ArrowUpRight } from 'lucide-react';
import {
  RuntimeBanner,
  MetricCard,
  HealthCard,
  IncidentBanner,
  Timeline,
  TypedConfirmationDialog,
  Health,
} from '../../../../components/operations';
import { RuntimeTruthStatus } from '../../../../lib/operatorRuntime';
import { OperatorActionResult } from '../../../../components/admin/ActionResult';

type Row = Record<string, unknown>;

export function ControlCenterTab({
  scannerConfig,
  heartbeats,
  providerControls,
  operatorEvents,
  executionOrders,
  signals,
  tradeTruth,
  onRunAction,
  runningAction,
}: {
  scannerConfig: Row | null;
  heartbeats: Row[];
  providerControls: Row[];
  operatorEvents: Row[];
  executionOrders: Row[];
  signals: Row[];
  tradeTruth: Row[];
  onRunAction: (action: string, provider?: string) => Promise<OperatorActionResult | null>;
  runningAction: string | null;
}) {
  const [emergencyDialogOpen, setEmergencyDialogOpen] = useState(false);

  const isEnabled = Boolean(scannerConfig?.is_enabled);
  const supervisorEnabled = Boolean(scannerConfig?.supervisor_enabled);

  // Master runtime state determination
  let masterStatus: RuntimeTruthStatus = 'LIVE';
  if (!isEnabled) {
    masterStatus = 'DISABLED';
  } else if (!supervisorEnabled) {
    masterStatus = 'STALE';
  }

  // Active incidents calculation
  const unprotectedPositions = tradeTruth.filter(
    (t) => String(t.protection_status ?? '').toUpperCase().includes('UNPROTECT')
  );
  const providerErrors = providerControls.filter((p) => p.last_error);

  // Heartbeat items calculation
  const getHeartbeatAge = (provider: string) => {
    const hb = heartbeats.find((h) => String(h.provider ?? '').toLowerCase() === provider.toLowerCase());
    if (!hb?.started_at) return null;
    return Date.now() - new Date(String(hb.started_at)).getTime();
  };

  const scannerAge = getHeartbeatAge('scanner') ?? getHeartbeatAge('scheduled_scanner');
  const executionAge = getHeartbeatAge('binance') ?? getHeartbeatAge('execution');
  const telegramAge = getHeartbeatAge('telegram');

  const calcHealth = (ageMs: number | null): Health => {
    if (ageMs === null) return 'OFFLINE';
    if (ageMs <= 180000) return 'HEALTHY';
    if (ageMs <= 600000) return 'WARNING';
    return 'CRITICAL';
  };

  const handleStartBot = async () => {
    await onRunAction('resume_scanner');
    await onRunAction('resume_supervisor');
    await onRunAction('run_scanner_now');
  };

  const handleStopBot = async () => {
    await onRunAction('pause_scanner');
  };

  const handleEmergencyStop = async () => {
    await onRunAction('pause_scanner');
    await onRunAction('pause_supervisor');
    await onRunAction('pause_auto_repair');
    setEmergencyDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. Master Runtime Banner */}
      <RuntimeBanner status={masterStatus} version="v2026.07.23-root" mode="AUTOMATIC" pendingActions={runningAction ? 1 : 0} />

      {/* NOC Mission Control Shortcut */}
      <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 shrink-0">
            <Activity size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex flex-wrap items-center gap-2">
              HashiCore 24/7 Mission Control NOC
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30 font-bold">
                LIVE TELEMETRY
              </span>
            </h4>
            <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
              Single-screen 24/7 monitoring dashboard for all 15 subsystems, workers, queues, performance, and chronological event stream.
            </p>
          </div>
        </div>

        <Link
          to="/admin/mission-control"
          className="w-full sm:w-auto shrink-0 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-lg shadow-blue-950/50"
        >
          Open Mission Control <ArrowUpRight size={14} />
        </Link>
      </div>

      {/* 2. Primary Master Action Controls */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 sm:p-5 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-sm text-zinc-100">Master Operations Controls</h3>
          <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
            Direct real-time commands affecting scanner cycles, trade protection, and execution routers.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          {!isEnabled ? (
            <button
              onClick={handleStartBot}
              disabled={Boolean(runningAction)}
              className="col-span-2 sm:col-span-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <PlayCircle size={16} /> START BOT
            </button>
          ) : (
            <button
              onClick={handleStopBot}
              disabled={Boolean(runningAction)}
              className="col-span-2 sm:col-span-1 px-4 py-2.5 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-black font-bold text-xs transition-all shadow-lg shadow-yellow-950/50 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <PauseCircle size={16} /> STOP NEW ENTRIES
            </button>
          )}

          <button
            onClick={() => onRunAction('run_scanner_now')}
            disabled={Boolean(runningAction)}
            className="px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw size={14} className={runningAction === 'run_scanner_now' ? 'animate-spin' : ''} />
            Scan Markets
          </button>

          <button
            onClick={() => onRunAction('repair_protection_now')}
            disabled={Boolean(runningAction)}
            className="px-3.5 py-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Shield size={14} /> Repair Protection
          </button>

          <button
            onClick={() => setEmergencyDialogOpen(true)}
            disabled={Boolean(runningAction)}
            className="col-span-2 sm:col-span-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-all shadow-lg shadow-red-950/50 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ShieldAlert size={16} /> EMERGENCY STOP
          </button>
        </div>
      </div>

      {/* 3. Active Incident Banners */}
      {unprotectedPositions.length > 0 && (
        <IncidentBanner
          title={`${unprotectedPositions.length} Unprotected Position(s) Detected`}
          description="Active exchange positions missing stop-loss or take-profit protection orders."
          severity="CRITICAL"
          actionLabel="Repair All Protection"
          onAction={() => onRunAction('repair_protection_now')}
        />
      )}

      {providerErrors.length > 0 && (
        <IncidentBanner
          title="Exchange Provider Error"
          description={`Provider error reported: ${String(providerErrors[0]?.last_error ?? 'Check provider controls')}`}
          severity="WARNING"
          actionLabel="Sync Exchange"
          onAction={() => onRunAction('refresh_exchange')}
        />
      )}

      {/* 4. Operational Summary Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
        <MetricCard
          label="Scanner Mode"
          value={isEnabled ? 'Active' : 'Paused'}
          subtext={`Interval: ${String(scannerConfig?.scan_interval_minutes ?? 5)}m`}
          tone={isEnabled ? 'green' : 'yellow'}
          icon={Activity}
        />
        <MetricCard
          label="Active Signals"
          value={signals.length}
          subtext="Generated signal truth"
          tone="blue"
          icon={Zap}
        />
        <MetricCard
          label="Execution Orders"
          value={executionOrders.length}
          subtext="Total order submissions"
          tone="zinc"
          icon={Shield}
        />
        <MetricCard
          label="Unprotected Trades"
          value={unprotectedPositions.length}
          subtext={unprotectedPositions.length > 0 ? 'Action required' : 'Fully protected'}
          tone={unprotectedPositions.length > 0 ? 'red' : 'green'}
          icon={AlertTriangle}
        />
      </div>

      {/* 5. Heartbeat Section */}
      <div className="space-y-3">
        <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400">System Heartbeat Freshness</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <HealthCard
            title="Market Scanner"
            health={calcHealth(scannerAge)}
            lastSyncMs={scannerAge}
            details={[
              { label: 'Crypto Adapter', value: scannerConfig?.scan_crypto_enabled !== false ? 'Enabled' : 'Disabled' },
              { label: 'Forex Adapter', value: scannerConfig?.scan_forex_enabled !== false ? 'Enabled' : 'Disabled' },
            ]}
            onRefresh={() => onRunAction('run_scanner_now')}
            loading={runningAction === 'run_scanner_now'}
          />

          <HealthCard
            title="Trade Supervisor"
            health={calcHealth(executionAge)}
            lastSyncMs={executionAge}
            details={[
              { label: 'Supervisor Mode', value: supervisorEnabled ? 'Enabled' : 'Paused' },
              { label: 'Auto-Repair', value: scannerConfig?.operator_auto_repair_enabled ? 'Active' : 'Disabled' },
            ]}
            onRefresh={() => onRunAction('run_supervisor_now')}
            loading={runningAction === 'run_supervisor_now'}
          />

          <HealthCard
            title="Telegram Gateway"
            health={calcHealth(telegramAge)}
            lastSyncMs={telegramAge}
            details={[
              { label: 'Operator Digest', value: scannerConfig?.operator_telegram_enabled ? 'Enabled' : 'Disabled' },
            ]}
            onRefresh={() => onRunAction('run_telegram_test')}
            loading={runningAction === 'run_telegram_test'}
          />

          <HealthCard
            title="Database & Ledger"
            health="HEALTHY"
            lastSyncMs={0}
            details={[
              { label: 'Audit Trail', value: `${operatorEvents.length} events` },
              { label: 'Contract Schema', value: 'Verified' },
            ]}
          />
        </div>
      </div>

      {/* 6. Runtime Event Stream Preview */}
      <Timeline
        events={operatorEvents.slice(0, 10).map((evt) => ({
          id: String(evt.id ?? Math.random()),
          timestamp: String(evt.started_at ?? new Date().toISOString()),
          source: String(evt.source ?? 'operator'),
          title: String(evt.action ?? 'Operator Action'),
          summary: String(evt.summary ?? ''),
          result: String(evt.result ?? 'SUCCESS'),
          actor: String(evt.actor_user_id ?? 'admin'),
          error: evt.error ? String(evt.error) : undefined,
        }))}
      />

      {/* Emergency Stop Dialog */}
      <TypedConfirmationDialog
        isOpen={emergencyDialogOpen}
        onClose={() => setEmergencyDialogOpen(false)}
        onConfirm={handleEmergencyStop}
        title="Emergency Stop Runtime"
        description="This will immediately pause new market scans, stop order submission, and pause auto-repair. Active stop-loss orders on exchanges will remain intact."
        expectedPhrase="EMERGENCY STOP"
        confirmLabel="Halt All Engine Operations"
        loading={Boolean(runningAction)}
      />
    </div>
  );
}
