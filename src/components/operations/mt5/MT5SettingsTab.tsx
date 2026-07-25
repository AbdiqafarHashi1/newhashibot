import { 
  Sliders, Shield, Clock, Info
} from 'lucide-react';

export function MT5SettingsTab() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-zinc-900/80 p-4 border border-zinc-800 rounded-xl">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Sliders size={16} className="text-blue-400" />
            MT5 Bridge Operational Settings & Runtime Parameters
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Read-only specification of active polling timers, retry configurations, and lease policies
          </p>
        </div>
        <span className="text-xs bg-blue-500/10 border border-blue-500/20 text-blue-400 px-3 py-1 rounded-full font-bold uppercase tracking-wider">
          Active Production Spec
        </span>
      </div>

      {/* Parameters Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Timing Parameters */}
        <div className="p-5 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2 border-b border-zinc-800 pb-3">
            <Clock size={14} className="text-purple-400" />
            Daemon Polling & Synchronization Timers
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <div>
                <span className="font-semibold text-white block">Command Polling Interval</span>
                <span className="text-[11px] text-zinc-500">Frequency at which python daemon polls cloud queue</span>
              </div>
              <span className="font-mono font-bold text-purple-400 text-sm">1.0s</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <div>
                <span className="font-semibold text-white block">Heartbeat Interval</span>
                <span className="text-[11px] text-zinc-500">Heartbeat ping frequency to signal bridge liveness</span>
              </div>
              <span className="font-mono font-bold text-purple-400 text-sm">10.0s</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <div>
                <span className="font-semibold text-white block">State Sync Interval</span>
                <span className="text-[11px] text-zinc-500">Account equity, margin, and open positions snapshot cycle</span>
              </div>
              <span className="font-mono font-bold text-purple-400 text-sm">5.0s</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <div>
                <span className="font-semibold text-white block">Symbol Spec Sync Interval</span>
                <span className="text-[11px] text-zinc-500">Broker symbol digits, points, and fill policies sync cycle</span>
              </div>
              <span className="font-mono font-bold text-purple-400 text-sm">300.0s</span>
            </div>
          </div>
        </div>

        {/* Resilience & Lease Parameters */}
        <div className="p-5 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2 border-b border-zinc-800 pb-3">
            <Shield size={14} className="text-emerald-400" />
            Resilience, Atomic Leases & Safety Rules
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <div>
                <span className="font-semibold text-white block">Command Lease Timeout</span>
                <span className="text-[11px] text-zinc-500">Atomic lease expiration for unacknowledged commands</span>
              </div>
              <span className="font-mono font-bold text-emerald-400 text-sm">120s (2m)</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <div>
                <span className="font-semibold text-white block">Max Command Retries</span>
                <span className="text-[11px] text-zinc-500">Maximum execution attempts before terminal failure</span>
              </div>
              <span className="font-mono font-bold text-emerald-400 text-sm">3 Attempts</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <div>
                <span className="font-semibold text-white block">Bridge Protocol Specification</span>
                <span className="text-[11px] text-zinc-500">Contract schema version for cloud-daemon bridge</span>
              </div>
              <span className="font-mono font-bold text-emerald-400 text-sm">v1.0.0-phase8c</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <div>
                <span className="font-semibold text-white block">Operating Mode</span>
                <span className="text-[11px] text-zinc-500">Current Phase 8D operational stage</span>
              </div>
              <span className="font-mono font-bold text-cyan-400 text-sm">Pre-Certification</span>
            </div>
          </div>
        </div>
      </div>

      {/* Informational Guidance Note */}
      <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-2 text-xs text-zinc-400">
        <div className="flex items-center gap-2 font-bold text-white">
          <Info size={16} className="text-blue-400" />
          Operating Contract Integrity Rules
        </div>
        <p>
          The MT5 Agent configuration is hardcoded in <code className="text-zinc-200 font-mono">/mt5-agent/config.py</code> and enforced by the Supabase Edge Function <code className="text-zinc-200 font-mono">mt5-bridge</code>. Any parameter change during deployment automatically propagates on the next daemon heartbeat.
        </p>
      </div>
    </div>
  );
}
