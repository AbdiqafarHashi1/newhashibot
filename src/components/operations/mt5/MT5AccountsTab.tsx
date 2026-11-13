import {useSearchParams} from 'react-router-dom';
import { useState, useEffect } from 'react';
import { 
  UserPlus, Shield, Lock, RefreshCw, Trash2, CheckCircle2, 
  Eye, EyeOff, AlertTriangle, PlayCircle
} from 'lucide-react';
import { listMT5Accounts, connectMT5Account, setMT5Execution, removeMT5Account, testMT5Connection, requestMT5OperationalAdoption } from '../../../lib/mt5Accounts';
import type { MT5Account, MT5ExecutionMode } from '../../../lib/exchange/mt5';

interface Props {
  onSelectAccountForRuntime?: (accountId: string) => void;
}

export function MT5AccountsTab({ onSelectAccountForRuntime }: Props) {
  const [params]=useSearchParams();const feedSetup=params.get('purpose')==='feed';
  const [accounts, setAccounts] = useState<MT5Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  // Form modal state
  const [showModal, setShowModal] = useState(feedSetup);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form fields
  const [nickname, setNickname] = useState(feedSetup?'HashiBot admin Forex and Gold feed':'');
  const [broker, setBroker] = useState('');
  const [server, setServer] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [password, setPassword] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [leverage, setLeverage] = useState('100');
  const [accountType, setAccountType] = useState<'personal' | 'prop' | 'demo'>(feedSetup?'demo':'personal');
  const [executionMode, setExecutionMode] = useState<MT5ExecutionMode>(feedSetup?'demo':'personal');
  const [ownerKind, setOwnerKind] = useState<'system' | 'customer'>(feedSetup?'system':'customer');
  const [credentialCapability, setCredentialCapability] = useState<'investor' | 'master'>('investor');

  const fetchAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listMT5Accounts();
      setAccounts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch MT5 accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await connectMT5Account({
        broker: broker.trim(),
        server: server.trim(),
        accountNumber: accountNumber.trim(),
        password,
        nickname: nickname.trim(),
        currency,
        leverage: Number(leverage),
        accountType,
        executionMode, ownerKind, credentialCapability, operational: false, monitorEnabled: true
      });
      setActionSuccess('MT5 Account saved successfully.');
      setShowModal(false);
      resetForm();
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect MT5 account');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setNickname('');
    setBroker('');
    setServer('');
    setAccountNumber('');
    setPassword('');
    setCurrency('USD');
    setLeverage('100');
    setAccountType('personal');
    setExecutionMode('personal');
    setOwnerKind('customer');
    setCredentialCapability('investor');
    setShowPassword(false);
  };

  const handleToggleExecution = async (account: MT5Account) => {
    try {
      await setMT5Execution(account.id, !account.executionEnabled);
      setActionSuccess(`Execution ${!account.executionEnabled ? 'enabled' : 'disabled'} for ${account.nickname}`);
      fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update execution setting');
    }
  };

  const handleDelete = async (accountId: string, nickname: string) => {
    if (!window.confirm(`Are you sure you want to remove account "${nickname}"?`)) return;
    try {
      await removeMT5Account(accountId);
      setActionSuccess(`Account "${nickname}" removed`);
      fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove MT5 account');
    }
  };
  const durableAction = async (key:string, run:()=>Promise<unknown>) => { setActiveAction(key); setError(null); setActionSuccess(null); try { const result=await run() as {httpStatus?:number;backendCode?:string|null;commandId?:string;commandStatus?:string;status?:string}; const status=result.commandStatus??result.status??'UNKNOWN'; setActionSuccess(result.commandId ? `HTTP ${result.httpStatus} · backend ${result.backendCode??'OK'} · command ${result.commandId} · status ${status}. Track lifecycle in Commands.` : `HTTP ${result.httpStatus} · backend ${result.backendCode??'OK'} · status ${status}`); } catch(err) { setError(err instanceof Error?err.message:'MT5 command failed'); } finally { setActiveAction(null); } };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/80 p-4 border border-zinc-800 rounded-xl">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Shield size={16} className="text-blue-400" />
            MT5 Accounts & Terminal Configuration
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage MT5 Personal, Prop, and Demo accounts connected to HashiBot Cloud. Passwords are securely stored.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAccounts}
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 px-3 py-2 rounded-lg transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="text-xs text-white bg-blue-600 hover:bg-blue-500 font-semibold flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-colors shadow-lg shadow-blue-600/20"
          >
            <UserPlus size={14} />
            Add MT5 Account
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300 flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Accounts List Table */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Registered Accounts ({accounts.length})
          </span>
          <span className="text-[11px] text-zinc-500">
            Source: <code className="text-zinc-400 font-mono">mt5_accounts_safe</code>
          </span>
        </div>

        {loading && accounts.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-blue-400" />
            Loading registered MT5 accounts...
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500">
            No MT5 accounts registered yet. Click <span className="text-blue-400 font-semibold">"Add MT5 Account"</span> to connect your first MetaTrader 5 terminal.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/60 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3 font-semibold">Nickname / Broker</th>
                  <th className="p-3 font-semibold">Login / Server</th>
                  <th className="p-3 font-semibold">Type</th>
                  <th className="p-3 font-semibold">Execution</th>
                  <th className="p-3 font-semibold">Bridge</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-white">{acc.nickname}</div>
                      <div className="text-[11px] text-zinc-500">{acc.broker}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-mono text-zinc-300">{acc.accountNumberMasked}</div>
                      <div className="text-[11px] text-zinc-500">{acc.server}</div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        acc.accountType === 'prop' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                        acc.accountType === 'personal' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}>
                        {acc.accountType}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => handleToggleExecution(acc)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors flex items-center gap-1.5 ${
                          acc.executionEnabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300'
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${acc.executionEnabled ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                        {acc.executionEnabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-zinc-400">
                      {acc.bridgeId || 'bridge-mt5-001'}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        acc.connectionStatus === 'connected' ? 'bg-emerald-500/10 text-emerald-400' :
                        acc.connectionStatus === 'degraded' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-zinc-800 text-zinc-400'
                      }`}>
                        {acc.connectionStatus}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="relative group">
                          <button
                            disabled={activeAction!==null}
                            onClick={()=>durableAction(`test:${acc.id}`,()=>testMT5Connection(acc.id))}
                            className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded text-[11px] font-medium flex items-center gap-1"
                          >
                            <PlayCircle size={12} />
                            {activeAction===`test:${acc.id}`?'Queuing…':'Sync / Test'}
                          </button>
                          <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block z-20 w-44 p-2 bg-zinc-900 border border-zinc-700 rounded text-[10px] text-zinc-300 shadow-xl">
                            Enqueues one durable read-only command; it does not launch Python.
                          </div>
                        </div>
                        <button disabled={activeAction!==null} onClick={()=>durableAction(`adopt:${acc.id}`,()=>requestMT5OperationalAdoption(acc.id))} className="px-2.5 py-1 bg-amber-600/10 border border-amber-500/20 text-amber-400 rounded text-[11px]">{activeAction===`adopt:${acc.id}`?'Requesting…':'Request adoption'}</button>

                        {/* View Runtime */}
                        <button
                          onClick={() => onSelectAccountForRuntime?.(acc.id)}
                          className="px-2.5 py-1 bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600/20 rounded text-[11px] font-medium transition-colors"
                        >
                          Runtime
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(acc.id, acc.nickname)}
                          className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
                          title="Delete account"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit MT5 Account Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield size={16} className="text-blue-400" />
                Configure MetaTrader 5 Account
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-zinc-500 hover:text-white text-lg font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Ownership</label>
                  <select value={ownerKind} onChange={(e) => setOwnerKind(e.target.value as 'system' | 'customer')} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white">
                    <option value="customer">Customer</option><option value="system">System</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Credential capability</label>
                  <select value={credentialCapability} onChange={(e) => setCredentialCapability(e.target.value as 'investor' | 'master')} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white">
                    <option value="investor">Investor — monitoring only</option><option value="master">Master — trading capable</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Account Nickname</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. FTMO Challenge 100k"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Account Type</label>
                  <select
                    value={accountType}
                    onChange={(e) => {
                      const type = e.target.value as 'personal' | 'prop' | 'demo';
                      setAccountType(type);
                      setExecutionMode(type === 'prop' ? 'prop_challenge' : type === 'demo' ? 'demo' : 'personal');
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="personal">Personal Live</option>
                    <option value="prop">Prop Firm Challenge</option>
                    <option value="demo">Demo Practice</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Broker Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MetaQuotes / IC Markets"
                    value={broker}
                    onChange={(e) => setBroker(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Server Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ICMarketsSC-Live01"
                    value={server}
                    onChange={(e) => setServer(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Account Login Number</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 50123984"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Trader Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Trader password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 pr-8 text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-[11px] text-zinc-400 flex items-center gap-2">
                <Lock size={14} className="text-emerald-400 shrink-0" />
                <span>
                  Passwords are encrypted server-side and never displayed once saved.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Currency</label>
                  <input
                    type="text"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Account Leverage (1:X)</label>
                  <input
                    type="number"
                    value={leverage}
                    onChange={(e) => setLeverage(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors shadow-lg shadow-blue-600/20 flex items-center gap-1.5"
                >
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : null}
                  {saving ? 'Saving...' : 'Save MT5 Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
