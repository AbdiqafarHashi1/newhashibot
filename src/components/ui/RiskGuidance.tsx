import { AlertTriangle } from 'lucide-react';
import { Signal } from '../../lib/types';

function label(value: string | null | undefined, fallback: string) {
  return (value || fallback)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function pct(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}%` : '—';
}

function leverageRange(signal: Signal) {
  const min = Number(signal.suggested_leverage_min);
  const max = Number(signal.suggested_leverage_max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return '—';
  return `${min.toFixed(0)}x–${max.toFixed(0)}x`;
}

export function RiskGuidanceCompact({ signal }: { signal: Signal }) {
  if (signal.recommended_risk_pct == null && signal.suggested_leverage_max == null) return null;
  return (
    <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs">
      <div className="flex items-center gap-1.5 text-blue-300 font-medium mb-2">
        <AlertTriangle size={12} /> Risk / Leverage Guidance Only
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div><span className="text-zinc-500">Risk</span><div className="text-zinc-200">{pct(signal.recommended_risk_pct)} acct</div></div>
        <div><span className="text-zinc-500">Leverage</span><div className="text-zinc-200">{leverageRange(signal)}</div></div>
        <div><span className="text-zinc-500">Mode</span><div className="text-zinc-200">{label(signal.capital_mode ?? signal.mode_slug, 'signal_mode')}</div></div>
        <div><span className="text-zinc-500">Profile</span><div className="text-zinc-200">{label(signal.risk_profile, 'balanced')}</div></div>
      </div>
      {signal.strategy_specific_warning && <div className="mt-2 text-zinc-400">{signal.strategy_specific_warning}</div>}
      <div className="mt-2 text-zinc-500">Guidance only / not financial advice.</div>
    </div>
  );
}

export function RiskGuidanceDetail({ signal, admin = false }: { signal: Signal; admin?: boolean }) {
  if (signal.recommended_risk_pct == null && signal.suggested_leverage_max == null) return null;
  return (
    <div className="bg-zinc-900 border border-blue-500/20 rounded-xl overflow-hidden">
      <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between gap-3">
        <div className="text-xs text-blue-300 uppercase tracking-wider">Risk / Leverage Guidance</div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Guidance only</div>
      </div>
      <div className="divide-y divide-zinc-800">
        {[
          { label: 'Capital Mode', value: label(signal.capital_mode ?? signal.mode_slug, 'signal_mode') },
          { label: 'Risk Profile', value: label(signal.risk_profile, 'balanced') },
          { label: 'Suggested Risk', value: `${pct(signal.recommended_risk_pct)} of account` },
          { label: 'Suggested Leverage', value: leverageRange(signal) },
          { label: 'Max Leverage Cap', value: signal.leverage_cap != null ? `${Number(signal.leverage_cap).toFixed(0)}x` : '—' },
          ...(admin ? [{ label: 'Risk Class', value: signal.strategy_risk_class || '—' }] : []),
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between px-5 py-3 gap-4">
            <div className="text-xs text-zinc-500 w-32 shrink-0">{row.label}</div>
            <div className="text-sm text-zinc-200 text-right">{row.value}</div>
          </div>
        ))}
      </div>
      {(signal.position_sizing_note || signal.strategy_specific_warning || signal.risk_warning) && (
        <div className="px-5 py-4 space-y-2 text-xs border-t border-zinc-800">
          {signal.position_sizing_note && <p className="text-zinc-400">{signal.position_sizing_note}</p>}
          {signal.strategy_specific_warning && <p className="text-yellow-300/90">{signal.strategy_specific_warning}</p>}
          <p className="text-zinc-500">{signal.risk_warning || 'Signal only. Manage risk. Not financial advice.'}</p>
        </div>
      )}
    </div>
  );
}
