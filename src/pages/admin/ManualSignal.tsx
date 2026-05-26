import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';

const SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','POLUSDT',
  'EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','NZDUSD','USDCAD','EURJPY','GBPJPY','XAUUSD'];
const MARKET_TYPES: Record<string, string> = {
  BTCUSDT:'crypto',ETHUSDT:'crypto',SOLUSDT:'crypto',BNBUSDT:'crypto',XRPUSDT:'crypto',
  ADAUSDT:'crypto',DOGEUSDT:'crypto',AVAXUSDT:'crypto',LINKUSDT:'crypto',POLUSDT:'crypto',
  EURUSD:'forex',GBPUSD:'forex',USDJPY:'forex',USDCHF:'forex',AUDUSD:'forex',
  NZDUSD:'forex',USDCAD:'forex',EURJPY:'forex',GBPJPY:'forex',XAUUSD:'forex',
};

export default function ManualSignal() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    symbol: 'BTCUSDT', timeframe: '1h', direction: 'buy', entry_low: '', entry_high: '',
    stop_loss: '', tp1: '', tp2: '', tp3: '', risk_reward: '', strategy_name: 'TrendContinuation',
    regime: 'trend_up', grade: 'A', confidence_score: '75', reason: '', invalidation: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(field: string, val: string) {
    setForm(f => ({ ...f, [field]: val }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await supabase.from('signals').insert({
      symbol: form.symbol,
      market_type: MARKET_TYPES[form.symbol] ?? 'forex',
      timeframe: form.timeframe,
      direction: form.direction,
      entry_type: 'zone',
      entry_low: parseFloat(form.entry_low),
      entry_high: parseFloat(form.entry_high),
      stop_loss: parseFloat(form.stop_loss),
      tp1: parseFloat(form.tp1),
      tp2: parseFloat(form.tp2),
      tp3: form.tp3 ? parseFloat(form.tp3) : null,
      risk_reward: parseFloat(form.risk_reward),
      strategy_name: form.strategy_name,
      regime: form.regime,
      grade: form.grade,
      confidence_score: parseInt(form.confidence_score),
      reason: form.reason,
      invalidation: form.invalidation,
      status: 'waiting',
      source: 'manual',
    });
    setLoading(false);
    if (err) setError(err.message);
    else nav('/admin/signals');
  }

  const field = (label: string, name: string, type = 'text', opts?: string[]) => (
    <div>
      <label className="block text-xs text-zinc-400 mb-1.5">{label}</label>
      {opts ? (
        <select value={(form as Record<string,string>)[name]} onChange={e => set(name, e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500">
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={(form as Record<string,string>)[name]} onChange={e => set(name, e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
      )}
    </div>
  );

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Create Manual Signal</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Manually create a signal outside the scanner</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-lg">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            {field('Symbol', 'symbol', 'text', SYMBOLS)}
            {field('Timeframe', 'timeframe', 'text', ['5m','15m','1h','4h'])}
            {field('Direction', 'direction', 'text', ['buy','sell'])}
            {field('Strategy', 'strategy_name', 'text', ['MicroScalper','CompressionBreakout','TrendContinuation','Manual'])}
            {field('Entry Low', 'entry_low', 'number')}
            {field('Entry High', 'entry_high', 'number')}
            {field('Stop Loss', 'stop_loss', 'number')}
            {field('TP1', 'tp1', 'number')}
            {field('TP2', 'tp2', 'number')}
            {field('TP3 (optional)', 'tp3', 'number')}
            {field('Risk/Reward', 'risk_reward', 'number')}
            {field('Confidence %', 'confidence_score', 'number')}
            {field('Grade', 'grade', 'text', ['A+','A','B'])}
            {field('Regime', 'regime', 'text', ['trend_up','trend_down','ranging','compression','expansion','high_volatility','low_volatility','unclear'])}
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Reason</label>
            <textarea value={form.reason} onChange={e => set('reason', e.target.value)} rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Invalidation</label>
            <textarea value={form.invalidation} onChange={e => set('invalidation', e.target.value)} rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button type="submit" disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
            {loading ? 'Creating...' : 'Create Signal'}
          </button>
          <button type="button" onClick={() => nav('/admin/signals')}
            className="border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-6 py-2.5 rounded-lg text-sm transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}
