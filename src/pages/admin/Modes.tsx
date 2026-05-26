import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { ModeConfig, RiskProfile } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import { Radio, Cpu, Zap, AlertTriangle, Shield, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Save } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const MODE_META: Record<string, { icon: LucideIcon; color: string; borderColor: string; description: string }> = {
  signal_mode: {
    icon: Radio,
    color: 'text-blue-400',
    borderColor: 'border-blue-500/30',
    description: 'Publishes scanner-generated signals to Telegram subscribers. No execution — pure signal delivery.',
  },
  personal_mode: {
    icon: Cpu,
    color: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    description: 'Paper execution intent logging for personal MT5 accounts. Tracks what would be traded. No real orders.',
  },
  prop_mode: {
    icon: Zap,
    color: 'text-yellow-400',
    borderColor: 'border-yellow-500/30',
    description: 'Strict risk governance for prop firm challenge compliance. Conservative scoring thresholds, strict drawdown limits.',
  },
};

function RiskProfileEditor({ rp, onSave }: { rp: RiskProfile; onSave: (updated: RiskProfile) => void }) {
  const [form, setForm] = useState(rp);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  function field(key: keyof RiskProfile, label: string, suffix = '') {
    const value = form[key];
    if (typeof value !== 'number') return null;
    return (
      <div key={key} className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">{label}{suffix && <span className="text-zinc-600 ml-1">{suffix}</span>}</label>
        <input
          type="number"
          step="0.01"
          value={value}
          onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 w-full"
        />
      </div>
    );
  }

  async function save() {
    setSaving(true);
    setMsg('');
    const { error } = await supabase.from('risk_profiles').update({
      max_daily_loss_pct: form.max_daily_loss_pct,
      max_drawdown_pct: form.max_drawdown_pct,
      max_open_positions: form.max_open_positions,
      max_trades_per_day: form.max_trades_per_day,
      max_consecutive_losses: form.max_consecutive_losses,
      cooldown_minutes: form.cooldown_minutes,
      default_risk_pct: form.default_risk_pct,
      account_equity: form.account_equity,
    }).eq('id', rp.id);
    if (!error) {
      setMsg('Saved.');
      onSave(form);
    } else {
      setMsg(`Error: ${error.message}`);
    }
    setSaving(false);
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-4 mt-3">
      <div className="text-xs text-zinc-500 font-medium mb-3 uppercase tracking-wide">Risk Profile: {rp.name}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {field('max_daily_loss_pct', 'Max Daily Loss', '%')}
        {field('max_drawdown_pct', 'Max Drawdown', '%')}
        {field('max_open_positions', 'Max Open Positions')}
        {field('max_trades_per_day', 'Max Trades / Day')}
        {field('max_consecutive_losses', 'Max Consec. Losses')}
        {field('cooldown_minutes', 'Cooldown', 'min')}
        {field('default_risk_pct', 'Default Risk', '%')}
        {field('account_equity', 'Account Equity', 'USD')}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
          <Save size={12} />
          {saving ? 'Saving...' : 'Save Risk Profile'}
        </button>
        {msg && <span className={`text-xs ${msg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{msg}</span>}
      </div>
    </div>
  );
}

function ModeCard({ mode, riskProfile, onToggle, onSave }: {
  mode: ModeConfig;
  riskProfile: RiskProfile | null;
  onToggle: (id: string, enabled: boolean) => void;
  onSave: (updated: RiskProfile) => void;
}) {
  const meta = MODE_META[mode.slug];
  const Icon = meta.icon;
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    setToggling(true);
    await onToggle(mode.id, !mode.is_enabled);
    setToggling(false);
  }

  return (
    <div className={`bg-zinc-900 border rounded-xl overflow-hidden ${mode.is_enabled ? meta.borderColor : 'border-zinc-800'}`}>
      <div className="flex items-start gap-4 p-5">
        <div className={`w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0`}>
          <Icon size={18} className={meta.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{mode.display_name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
              mode.is_enabled
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                : 'text-zinc-500 bg-zinc-800 border-zinc-700'
            }`}>
              {mode.is_enabled ? 'Enabled' : 'Disabled'}
            </span>
            {mode.paper_execution_enabled && (
              <span className="text-xs px-2 py-0.5 rounded-full border text-cyan-400 bg-cyan-500/10 border-cyan-500/30">
                Paper Execution
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{meta.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
              mode.is_enabled
                ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
            }`}>
            {mode.is_enabled
              ? <><ToggleRight size={13} /> Disable</>
              : <><ToggleLeft size={13} /> Enable</>}
          </button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 border-t border-zinc-800 pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-zinc-800/60 rounded-lg px-3 py-2">
              <div className="text-xs text-zinc-500 mb-0.5">Min Score Override</div>
              <div className="text-sm font-medium">{mode.min_score_override ?? 'Default'}</div>
            </div>
            <div className="bg-zinc-800/60 rounded-lg px-3 py-2">
              <div className="text-xs text-zinc-500 mb-0.5">Min RR Override</div>
              <div className="text-sm font-medium">{mode.min_rr_override ?? 'Default'}</div>
            </div>
            <div className="bg-zinc-800/60 rounded-lg px-3 py-2">
              <div className="text-xs text-zinc-500 mb-0.5">Max Active Signals</div>
              <div className="text-sm font-medium">{mode.max_active_signals}</div>
            </div>
            <div className="bg-zinc-800/60 rounded-lg px-3 py-2">
              <div className="text-xs text-zinc-500 mb-0.5">Paper Execution</div>
              <div className={`text-sm font-medium ${mode.paper_execution_enabled ? 'text-cyan-400' : 'text-zinc-500'}`}>
                {mode.paper_execution_enabled ? 'On' : 'Off'}
              </div>
            </div>
          </div>

          {mode.allowed_timeframes && (
            <div className="mb-4">
              <div className="text-xs text-zinc-500 mb-1">Allowed Timeframes</div>
              <div className="flex flex-wrap gap-1">
                {mode.allowed_timeframes.map(tf => (
                  <span key={tf} className="text-xs bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded font-mono">{tf}</span>
                ))}
              </div>
            </div>
          )}

          {riskProfile && <RiskProfileEditor rp={riskProfile} onSave={onSave} />}
        </div>
      )}
    </div>
  );
}

export default function Modes() {
  const { session } = useAuth();
  const [modes, setModes] = useState<ModeConfig[]>([]);
  const [riskProfiles, setRiskProfiles] = useState<RiskProfile[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [modesRes, rpRes] = await Promise.all([
      supabase.from('mode_configs').select('*').order('slug'),
      supabase.from('risk_profiles').select('*').order('mode_slug'),
    ]);
    setModes(modesRes.data ?? []);
    setRiskProfiles(rpRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(id: string, enabled: boolean) {
    const { error } = await supabase.from('mode_configs').update({ is_enabled: enabled }).eq('id', id);
    if (!error) {
      setModes(ms => ms.map(m => m.id === id ? { ...m, is_enabled: enabled } : m));
      if (session) {
        await supabase.from('audit_logs').insert({
          actor_user_id: session.user.id,
          action: enabled ? 'mode_enabled' : 'mode_disabled',
          entity_type: 'mode_configs',
          entity_id: id,
          metadata: { enabled },
        });
      }
    }
  }

  function handleRpSave(updated: RiskProfile) {
    setRiskProfiles(rps => rps.map(rp => rp.id === updated.id ? updated : rp));
  }

  const enabledCount = modes.filter(m => m.is_enabled).length;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Mode Control</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Enable and configure product modes — Signal, Personal, and Prop</p>
      </div>

      <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-4 mb-6 flex gap-3">
        <Shield size={15} className="text-blue-400 mt-0.5 shrink-0" />
        <div className="text-xs text-zinc-400 leading-relaxed">
          <span className="text-blue-300 font-medium">No real trades are ever placed by this system.</span>{' '}
          Personal Mode and Prop Mode use paper execution intents — simulated records of what would be traded.
          The MT5 execution bridge is a future phase and is not connected. Enabling a mode only affects signal routing and paper intent logging.
        </div>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-xs">
          <span className="text-zinc-500">Active modes: </span>
          <span className="font-semibold text-zinc-200">{enabledCount} / {modes.length}</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-xs">
          <span className="text-zinc-500">Risk profiles: </span>
          <span className="font-semibold text-zinc-200">{riskProfiles.length}</span>
        </div>
      </div>

      <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl p-3 mb-5 flex gap-2">
        <AlertTriangle size={13} className="text-yellow-400 mt-0.5 shrink-0" />
        <p className="text-xs text-yellow-300/80">
          Personal Mode and Prop Mode require execution infrastructure (MT5 bridge) before they produce actionable output.
          Enabling them now will log paper intents, which is safe and useful for pre-launch testing.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {modes.map(mode => {
            const rp = riskProfiles.find(r => r.mode_slug === mode.slug) ?? null;
            return (
              <ModeCard
                key={mode.id}
                mode={mode}
                riskProfile={rp}
                onToggle={handleToggle}
                onSave={handleRpSave}
              />
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
