import { useEffect, useState } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { supabase } from '../../lib/supabase';
import { Symbol } from '../../lib/types';
import { Badge } from '../../components/ui/Badge';

export default function Watchlist() {
  const [symbols, setSymbols] = useState<Symbol[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('symbols').select('*').eq('is_active', true).order('market_type').order('symbol')
      .then(({ data }) => { setSymbols(data ?? []); setLoading(false); });
  }, []);

  const crypto = symbols.filter(s => s.market_type === 'crypto');
  const forex = symbols.filter(s => s.market_type === 'forex');

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Watchlist</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{symbols.length} active markets being scanned</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {[{ label: 'Crypto', list: crypto }, { label: 'Forex / CFD', list: forex }].map(({ label, list }) => (
            <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold">{label}</span>
                <Badge variant="gray">{list.length} pairs</Badge>
              </div>
              <div className="divide-y divide-zinc-800">
                {list.map(sym => (
                  <div key={sym.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="font-mono text-sm font-semibold">{sym.symbol}</div>
                      <div className="text-xs text-zinc-500">{sym.display_name}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-600 capitalize">{sym.provider}</span>
                      <Badge variant={sym.is_active ? 'green' : 'gray'}>
                        {sym.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
