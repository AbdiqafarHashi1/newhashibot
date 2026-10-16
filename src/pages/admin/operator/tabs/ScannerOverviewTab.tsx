import { useState } from 'react';
import { Radio, RefreshCw } from 'lucide-react';
import { DataTable, SearchInput, FilterBar } from '../../../../components/operations';
import { OperatorActionResult } from '../../../../components/admin/ActionResult';

type Row = Record<string, unknown>;

export function ScannerOverviewTab({
  candidates = [],
  rejectedSetups = [],
  onRunAction,
  runningAction,
}: {
  scannerConfig?: Row | null;
  candidates?: Row[];
  rejectedSetups?: Row[];
  onRunAction: (action: string) => Promise<OperatorActionResult | null>;
  runningAction: string | null;
}) {
  const [activeMarket, setActiveMarket] = useState<'all' | 'crypto' | 'forex'>('all');
  const [activeSubTab, setActiveSubTab] = useState<'candidates' | 'rejected'>('candidates');
  const [searchTerm, setSearchTerm] = useState('');

  const isScanning = runningAction === 'run_scanner_now';

  const filterByMarketAndSearch = (items: Row[]) => {
    return items.filter((item) => {
      const symbol = String(item.symbol ?? '').toUpperCase();
      const market = String(item.market_type ?? (symbol.includes('USD') && !symbol.includes('USDT') ? 'forex' : 'crypto')).toLowerCase();

      if (activeMarket !== 'all' && market !== activeMarket) return false;
      if (searchTerm && !symbol.includes(searchTerm.toUpperCase())) return false;
      return true;
    });
  };

  const filteredCandidates = filterByMarketAndSearch(candidates);
  const filteredRejected = filterByMarketAndSearch(rejectedSetups);

  const candidateColumns = [
    {
      header: 'Symbol',
      accessor: (r: Row) => <span className="font-bold text-zinc-100">{String(r.symbol ?? '—')}</span>,
    },
    {
      header: 'Market',
      accessor: (r: Row) => (
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
          {String(r.market_type ?? 'crypto')}
        </span>
      ),
    },
    {
      header: 'Strategy',
      accessor: (r: Row) => <span className="text-blue-400">{String(r.strategy_name ?? '—')}</span>,
    },
    {
      header: 'Direction',
      accessor: (r: Row) => {
        const dir = String(r.direction ?? '').toUpperCase();
        return (
          <span className={`font-bold ${dir === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
            {dir}
          </span>
        );
      },
    },
    {
      header: 'Grade / Score',
      accessor: (r: Row) => (
        <span className="font-mono text-zinc-200">
          Grade {String(r.signal_grade ?? 'A')} • Score {String(r.score ?? 85)}
        </span>
      ),
    },
    {
      header: 'Entry Range',
      accessor: (r: Row) => (
        <span className="text-zinc-400 font-mono">
          {String(r.entry_low ?? '')} - {String(r.entry_high ?? '')}
        </span>
      ),
    },
  ];

  const rejectedColumns = [
    {
      header: 'Symbol',
      accessor: (r: Row) => <span className="font-bold text-zinc-100">{String(r.symbol ?? '—')}</span>,
    },
    {
      header: 'Strategy',
      accessor: (r: Row) => <span className="text-zinc-400">{String(r.strategy_name ?? '—')}</span>,
    },
    {
      header: 'Rejection Reason',
      accessor: (r: Row) => (
        <span className="text-red-300 font-mono text-[11px] bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded">
          {String(r.rejection_reason ?? r.reason ?? 'Score below threshold')}
        </span>
      ),
    },
    {
      header: 'Timestamp',
      accessor: (r: Row) => (
        <span className="text-zinc-500 font-mono text-[10px]">
          {r.created_at ? new Date(String(r.created_at)).toLocaleString() : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Header & Scanner Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-900/80 p-5 rounded-2xl border border-zinc-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="text-blue-400 animate-pulse" size={20} />
            <h2 className="text-base font-bold text-zinc-100">Unified Scanner Engine</h2>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Single scanner process evaluating Binance Crypto and Twelve Data Forex market adapters sequentially.
          </p>
        </div>

        <button
          onClick={() => onRunAction('run_scanner_now')}
          disabled={isScanning}
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-blue-950/50 flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={15} className={isScanning ? 'animate-spin' : ''} />
          {isScanning ? 'Executing Scanner Pipeline...' : 'Run Market Scan Now'}
        </button>
      </div>

      {/* 2. Market Adapters & Sub-tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => setActiveMarket('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeMarket === 'all' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All Markets
          </button>
          <button
            onClick={() => setActiveMarket('crypto')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeMarket === 'crypto' ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Crypto Adapter
          </button>
          <button
            onClick={() => setActiveMarket('forex')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeMarket === 'forex' ? 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/30' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Forex Adapter
          </button>
        </div>

        <div className="flex items-center gap-2 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => setActiveSubTab('candidates')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'candidates' ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Qualified Candidates ({filteredCandidates.length})
          </button>
          <button
            onClick={() => setActiveSubTab('rejected')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'rejected' ? 'bg-red-600/30 text-red-300 border border-red-500/30' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Filter Rejections ({filteredRejected.length})
          </button>
        </div>
      </div>

      {/* 3. Filter Bar */}
      <FilterBar>
        <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Filter by symbol or strategy..." />
      </FilterBar>

      {/* 4. Data Ledger Table */}
      {activeSubTab === 'candidates' ? (
        <DataTable
          columns={candidateColumns}
          data={filteredCandidates}
          emptyMessage="No scanner candidates currently in buffer. Run a manual scan to evaluate market setups."
        />
      ) : (
        <DataTable
          columns={rejectedColumns}
          data={filteredRejected}
          emptyMessage="No setup rejections logged in the current scan window."
        />
      )}
    </div>
  );
}
