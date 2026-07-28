import { useState, useEffect, useCallback } from 'react';
import { 
  RefreshCw, CheckCircle2, Play, Square, Plus, AlertTriangle, Inbox, Key, X
} from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { 
  listMT5Accounts, connectMT5Account, setMT5Execution, testMT5Connection 
} from '../../lib/mt5Accounts';
import type { MT5Account } from '../../lib/exchange/mt5';

export default function PropProvider() {
  const [accounts, setAccounts] = useState<MT5Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  // Add Account Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [formBroker, setFormBroker] = useState('MetaQuotes Software');
  const [formServer, setFormServer] = useState('MetaQuotes-Demo');
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formNickname, setFormNickname] = useState('');
  const [formAccountType, setFormAccountType] = useState<'personal' | 'prop' | 'demo'>('demo');
  const [formError, setFormError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await listMT5Accounts();
      setAccounts(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to query MT5 accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAccounts();
    const interval = setInterval(() => void fetchAccounts(), 20000);
    return () => clearInterval(interval);
  }, [fetchAccounts]);

  const toggleExecutor = async (accountId: string, currentEnabled: boolean) => {
    setActionPending(true);
    setActionNotice(`Updating execution status for MT5 account ${accountId}...`);
    try {
      await setMT5Execution(accountId, !currentEnabled);
      setActionNotice(`MT5 execution mode updated.`);
      await fetchAccounts();
    } catch (err) {
      setActionNotice(`Failed to update MT5 execution: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionPending(false);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  const syncAccount = async (accountId: string) => {
    setActionPending(true);
    setActionNotice(`Testing connection and syncing MT5 account ${accountId}...`);
    try {
      await testMT5Connection(accountId);
      setActionNotice(`MT5 connection test and sync complete.`);
      await fetchAccounts();
    } catch (err) {
      setActionNotice(`MT5 sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionPending(false);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formAccountNumber || !formPassword || !formNickname) {
      setFormError('Account number, password, and nickname are required.');
      return;
    }

    setActionPending(true);
    try {
      await connectMT5Account({
        broker: formBroker,
        server: formServer,
        accountNumber: formAccountNumber,
        password: formPassword,
        nickname: formNickname,
        currency: 'USD',
        leverage: 100,
        accountType: formAccountType,
        executionMode: formAccountType === 'prop' ? 'prop_challenge' : formAccountType === 'demo' ? 'demo' : 'personal',
        ownerKind: 'system',
        credentialCapability: 'investor',
        operational: false,
        monitorEnabled: true
      });

      setShowAddModal(false);
      setFormPassword('');
      setFormAccountNumber('');
      setNotice('MT5 Account successfully onboarded.');
      await fetchAccounts();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to onboard MT5 account');
    } finally {
      setActionPending(false);
      setTimeout(() => setNotice(null), 5000);
    }
  };

  const filteredAccounts = accounts.filter(a => filterType === 'all' || a.accountType.toLowerCase() === filterType.toLowerCase());

  return (
    <AdminLayout>
      <div className="space-y-6 font-mono">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-blue-400">
              <span>HashiBot Operations</span>
              <span>/</span>
              <span>MT5 & Prop Provider Management</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
              MetaTrader 5 & Prop Firm Workspace
            </h1>
            <p className="text-sm text-zinc-400 font-sans mt-1">
              Unified control for MT5 Demo, Personal Live, and Prop Firm EA terminal bridges queried from <code className="text-zinc-300 font-mono">mt5_accounts_safe</code>.
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition"
          >
            <Plus size={16} />
            Add MT5 Account
          </button>
        </div>

        {notice && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-950/40 p-3 text-xs text-blue-300 flex items-center gap-2 font-sans">
            <CheckCircle2 size={16} />
            <span>{notice}</span>
          </div>
        )}

        {fetchError && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300 flex items-center gap-2 font-sans">
            <AlertTriangle size={16} />
            <span>{fetchError}</span>
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-xs">
          <span className="text-zinc-400">Account Scope:</span>
          {(['all', 'demo', 'personal', 'prop'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-lg font-medium uppercase transition ${
                filterType === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Account Cards */}
        {loading && accounts.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center text-xs text-zinc-400 font-sans">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-400" />
            <span>Loading registered MT5 & Prop accounts...</span>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-8 text-center font-sans space-y-2">
            <Inbox size={32} className="mx-auto text-zinc-600" />
            <div className="text-sm font-semibold text-zinc-300">NO_DATA / UNCONFIGURED</div>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              No MT5 or Prop Firm accounts are currently registered in <code className="text-zinc-400 font-mono">mt5_accounts_safe</code>.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAccounts.map(acc => {
              const isConn = acc.connectionStatus === 'connected';
              const isExec = acc.executionEnabled;
              const lastSyncStr = acc.lastSyncAt ? `${Math.round((Date.now() - new Date(acc.lastSyncAt).getTime()) / 1000)}s ago` : 'Never';

              return (
                <div key={acc.id} className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-5 space-y-4">
                  <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
                    <div>
                      <span className="text-[10px] text-blue-400 uppercase font-bold">
                        MT5 {acc.accountType} Bridge
                      </span>
                      <h3 className="text-base font-bold text-white mt-0.5">{acc.nickname || acc.broker}</h3>
                      <p className="text-xs text-zinc-400 font-sans">{acc.broker} • {acc.server}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                      isConn
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                      {acc.connectionStatus}
                    </span>
                  </div>

                  {/* Account Data */}
                  <div className="space-y-1.5 text-xs text-zinc-300">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Masked Account:</span>
                      <span className="text-white font-semibold">{acc.accountNumberMasked}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Currency / Leverage:</span>
                      <span className="text-zinc-300">{acc.currency} • {acc.leverage}x</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Execution Mode:</span>
                      <span className="text-blue-300 font-mono text-[11px]">{acc.executionMode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Execution Status:</span>
                      <span className={isExec ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                        {isExec ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Last Sync:</span>
                      <span className="text-zinc-400">{lastSyncStr}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-3 border-t border-zinc-800 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        disabled={actionPending}
                        onClick={() => toggleExecutor(acc.id, isExec)}
                        className={`py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition disabled:opacity-50 ${
                          isExec
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                        }`}
                      >
                        {isExec ? <Square size={12} /> : <Play size={12} />}
                        {isExec ? 'Stop Executor' : 'Start Executor'}
                      </button>

                      <button
                        disabled={actionPending}
                        onClick={() => syncAccount(acc.id)}
                        className="py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 text-xs font-semibold flex items-center justify-center gap-1 transition disabled:opacity-50"
                      >
                        <RefreshCw size={12} /> Sync / Test
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Account Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md w-full space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Key size={16} className="text-blue-400" />
                  Onboard MT5 / Prop Firm Account
                </div>
                <button onClick={() => setShowAddModal(false)} className="text-zinc-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              {formError && (
                <div className="bg-red-950/40 border border-red-500/30 p-2.5 rounded text-xs text-red-300">
                  {formError}
                </div>
              )}

              <form onSubmit={handleConnectSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-zinc-400 mb-1">Account Nickname</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. IC Markets Personal Live"
                    value={formNickname}
                    onChange={e => setFormNickname(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Account Type</label>
                  <select
                    value={formAccountType}
                    onChange={e => setFormAccountType(e.target.value as 'personal' | 'prop' | 'demo')}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white outline-none"
                  >
                    <option value="demo">Demo</option>
                    <option value="personal">Personal Live</option>
                    <option value="prop">Prop Firm</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Broker Name</label>
                  <input
                    type="text"
                    required
                    value={formBroker}
                    onChange={e => setFormBroker(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Server Name</label>
                  <input
                    type="text"
                    required
                    value={formServer}
                    onChange={e => setFormServer(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Account Number</label>
                  <input
                    type="text"
                    required
                    value={formAccountNumber}
                    onChange={e => setFormAccountNumber(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Investor / Master Password</label>
                  <input
                    type="password"
                    required
                    value={formPassword}
                    onChange={e => setFormPassword(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-zinc-500 block mt-1">Credentials are securely transmitted to backend edge function and never stored in cleartext.</span>
                </div>

                <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionPending}
                    className="px-4 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-500 disabled:opacity-50"
                  >
                    Connect MT5 Bridge
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
