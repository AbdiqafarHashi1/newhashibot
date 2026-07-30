import React, { useState } from 'react';
import { Lock, Globe, Layers } from 'lucide-react';
import {
  EnvironmentBadge,
  CertificationBadge,
  TypedConfirmationDialog,
  HealthBadge,
  Health,
} from '../../../../components/operations';
import { OperatorActionResult } from '../../../../components/admin/ActionResult';

type Row = Record<string, unknown>;

export function OperatingModesTab({
  scannerConfig,
  onRunAction,
  runningAction,
}: {
  scannerConfig: Row | null;
  providerControls?: Row[];
  readinessRows?: Row[];
  onRunAction: (action: string, provider?: string) => Promise<OperatorActionResult | null>;
  runningAction: string | null;
}) {
  const [unlockLiveDialogOpen, setUnlockLiveDialogOpen] = useState(false);
  const [selectedLiveProvider, setSelectedLiveProvider] = useState<string | null>(null);

  const scanCrypto = scannerConfig?.scan_crypto_enabled !== false;
  const scanForex = scannerConfig?.scan_forex_enabled !== false;

  const signalModes = [
    {
      name: 'Crypto Market Signals',
      type: 'Crypto',
      provider: 'Binance Candles Endpoint',
      symbols: 'BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT (+ top 50 perpetuals)',
      strategies: ['MicroScalper', 'QuickScalp', 'CompressionBreakout', 'SwingContinuation'],
      enabled: scanCrypto,
      configField: 'scan_crypto_enabled',
    },
    {
      name: 'Forex & Commodities Signals',
      type: 'Forex',
      provider: 'Twelve Data API Adapter',
      symbols: 'EURUSD, GBPUSD, USDJPY, AUDUSD, XAUUSD (Gold)',
      strategies: ['ForexMicroScalper', 'ForexSwingContinuation'],
      enabled: scanForex,
      configField: 'scan_forex_enabled',
    },
  ];

  const executionModes = [
    {
      name: 'Binance USD-M Testnet',
      provider: 'Binance',
      env: 'TESTNET',
      scope: 'Testnet Futures',
      maxPositions: 5,
      readiness: 'READY',
      certification: 'FULLY_CERTIFIED',
      credentials: 'VALIDATED',
      health: 'HEALTHY',
      isLive: false,
    },
    {
      name: 'Bybit Unified Testnet',
      provider: 'Bybit',
      env: 'TESTNET',
      scope: 'Testnet Futures / Prop',
      maxPositions: 5,
      readiness: 'READY',
      certification: 'FULLY_CERTIFIED',
      credentials: 'VALIDATED',
      health: 'HEALTHY',
      isLive: false,
    },
    {
      name: 'MT5 Terminal Bridge (Demo)',
      provider: 'MT5',
      env: 'DEMO',
      scope: 'Prop Firm / EA Demo',
      maxPositions: 3,
      readiness: 'READY',
      certification: 'STAGE_2_PASSED',
      credentials: 'CONNECTED',
      health: 'HEALTHY',
      isLive: false,
    },
    {
      name: 'Binance Production Live',
      provider: 'Binance',
      env: 'LIVE',
      scope: 'Live USD-M Futures',
      maxPositions: 3,
      readiness: 'LOCKED',
      certification: 'STAGE_1_PASSED',
      credentials: 'NOT_CONFIGURED',
      health: 'OFFLINE',
      isLive: true,
      lockReason: 'Live API keys missing in secrets vault & live certification incomplete.',
    },
    {
      name: 'Bybit Production Live',
      provider: 'Bybit',
      env: 'LIVE',
      scope: 'Live Perpetual Swaps',
      maxPositions: 3,
      readiness: 'LOCKED',
      certification: 'STAGE_1_PASSED',
      credentials: 'NOT_CONFIGURED',
      health: 'OFFLINE',
      isLive: true,
      lockReason: 'Live API keys missing in secrets vault & live certification incomplete.',
    },
    {
      name: 'MT5 Production Personal / Prop',
      provider: 'MT5',
      env: 'LIVE',
      scope: 'Live MetaTrader 5 Bridge',
      maxPositions: 2,
      readiness: 'LOCKED',
      certification: 'UNVERIFIED',
      credentials: 'NOT_CONFIGURED',
      health: 'OFFLINE',
      isLive: true,
      lockReason: 'MT5 Live terminal bridge requires standalone broker authentication credentials.',
    },
  ];

  const handleToggleSignalMode = async (field: string) => {
    const actionName = scannerConfig?.[field] ? `pause_${field.replace('_enabled', '')}` : `resume_${field.replace('_enabled', '')}`;
    await onRunAction(actionName);
  };

  return (
    <div className="space-y-6">
      {/* 1. Top Section Title */}
      <div>
        <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
          <Layers className="text-blue-400" size={18} /> Signal & Execution Operating Modes
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Configure active market scanners, routing environments, risk boundaries, and live trading safety locks.
        </p>
      </div>

      {/* 2. Signal Market Adapters Section */}
      <div className="space-y-3">
        <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400">1. Signal Market Adapters</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {signalModes.map((mode, i) => (
            <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Globe size={18} className="text-blue-400" />
                  <div>
                    <h4 className="font-bold text-sm text-zinc-100">{mode.name}</h4>
                    <span className="text-[11px] font-mono text-zinc-500">{mode.provider}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleSignalMode(mode.configField)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    mode.enabled
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}
                >
                  {mode.enabled ? 'ACTIVE' : 'PAUSED'}
                </button>
              </div>

              <div className="space-y-1.5 text-xs text-zinc-300 font-mono bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/60">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Universe:</span>
                  <span className="text-zinc-200">{mode.symbols}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Strategies:</span>
                  <span className="text-blue-300">{mode.strategies.join(', ')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Execution Routing Modes */}
      <div className="space-y-3">
        <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400">2. Execution Environments & Safety Locks</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {executionModes.map((mode, i) => (
            <div
              key={i}
              className={`rounded-2xl border p-5 space-y-4 shadow-lg flex flex-col justify-between ${
                mode.isLive
                  ? 'border-red-500/30 bg-zinc-900/90'
                  : 'border-zinc-800 bg-zinc-900/80'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h4 className="font-bold text-sm text-zinc-100 truncate">{mode.name}</h4>
                  <EnvironmentBadge env={mode.env} />
                </div>

                <div className="flex items-center justify-between text-xs mb-3">
                  <CertificationBadge level={mode.certification} />
                  <HealthBadge health={mode.health as Health} />
                </div>

                <div className="space-y-1.5 text-xs font-mono text-zinc-300 bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/60">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Scope:</span>
                    <span>{mode.scope}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Max Positions:</span>
                    <span>{mode.maxPositions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Credentials:</span>
                    <span className={mode.credentials === 'VALIDATED' ? 'text-emerald-400' : 'text-yellow-400'}>
                      {mode.credentials}
                    </span>
                  </div>
                </div>

                {mode.lockReason && (
                  <div className="mt-3 text-[11px] font-mono text-red-300 bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl flex items-start gap-1.5">
                    <Lock size={13} className="text-red-400 shrink-0 mt-0.5" />
                    <span>{mode.lockReason}</span>
                  </div>
                )}
              </div>

              {mode.isLive ? (
                <button
                  onClick={() => {
                    setSelectedLiveProvider(mode.name);
                    setUnlockLiveDialogOpen(true);
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  <Lock size={13} /> Unlock Live Execution
                </button>
              ) : (
                <button
                  onClick={() => onRunAction('refresh_exchange', mode.provider.toLowerCase())}
                  disabled={Boolean(runningAction)}
                  className="w-full py-2 px-3 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  Verify Provider Readiness
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Unlock Live Dialog */}
      <TypedConfirmationDialog
        isOpen={unlockLiveDialogOpen}
        onClose={() => setUnlockLiveDialogOpen(false)}
        onConfirm={() => {
          alert(`Live unlock requested for ${selectedLiveProvider}. Note: Live execution requires valid API secrets in production environment.`);
          setUnlockLiveDialogOpen(false);
        }}
        title={`Unlock ${selectedLiveProvider ?? 'Live Execution'}`}
        description="WARNING: Unlocking live execution will route real customer and proprietary trades directly to exchange order books with real capital. Ensure credentials, risk profiles, and protection parameters are certified."
        expectedPhrase="UNLOCK LIVE TRADING"
        confirmLabel="Authorize Live Unlock"
        loading={Boolean(runningAction)}
      />
    </div>
  );
}
