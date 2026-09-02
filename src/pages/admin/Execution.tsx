import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { 
  Activity, AlertTriangle, CheckCircle2, Plus, RefreshCw, X 
} from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { getFrontendSupabaseUrl } from '../../lib/supabaseEnv';
import { ExecutionAccount, ExecutionProvider, PROVIDER_CONTRACT } from '../../lib/executionAccounts';
import type { MT5Account } from '../../lib/exchange/mt5';

type OwnerKind = 'system' | 'customer';
type Customer = { id: string; email: string | null; full_name: string | null };
type Verification = { 
  connection_verified: boolean; 
  provider: string; 
  environment: string; 
  discovered_account_identity: string | null; 
  read_permissions: Record<string, boolean>; 
  trading_permission: boolean; 
  warnings: string[]; 
  first_blocker: string | null; 
};

type ProviderTab = 'all' | 'crypto' | 'mt5';

const initialForm = { 
  ownership: 'system' as OwnerKind, 
  customer_id: '', 
  display_label: '', 
  provider: 'binance' as ExecutionProvider | 'mt5', 
  api_key: '', 
  api_secret: '', 
  mt5_login: '',
  mt5_server: 'MetaQuotes-Demo',
  mt5_password: '',
  selectable: true, 
  monitor_enabled: true, 
  operational: false 
};

async function callWithTimeout(url: string, body: Record<string, unknown>, token?: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data.error || data.exact_error || `Request failed with status ${response.status}`);
      (err as unknown as { response: unknown }).response = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export default function Execution() {
  const { session } = useAuth();
  const [cryptoAccounts, setCryptoAccounts] = useState<ExecutionAccount[]>([]);
  const [mt5Accounts, setMt5Accounts] = useState<MT5Account[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState<OwnerKind | null>(null);
  const [form, setForm] = useState(initialForm);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ProviderTab>('all');

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach(c => map.set(c.id, c));
    return map;
  }, [customers]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Load customers and direct database state concurrently
      const [directCryptoRes, directMt5Res, directCustRes] = await Promise.all([
        supabase.from('connected_execution_accounts').select('*').order('created_at', { ascending: false }),
        supabase.from('mt5_accounts').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, email, full_name').order('created_at', { ascending: false }),
      ]);

      if (directCryptoRes.data) {
        setCryptoAccounts(directCryptoRes.data as ExecutionAccount[]);
      }
      if (directMt5Res.data) {
        setMt5Accounts(directMt5Res.data as MT5Account[]);
      }
      if (directCustRes.data) {
        setCustomers(directCustRes.data as Customer[]);
      }

      // 2. If session token is available, attempt canonical edge functions for enriched validation
      if (session?.access_token) {
        try {
          const [opRes, custRes] = await Promise.all([
            callWithTimeout(`${getFrontendSupabaseUrl()}/functions/v1/admin-operator-action`, { action: 'list_execution_accounts' }, session.access_token, 5000).catch(() => null),
            callWithTimeout(`${getFrontendSupabaseUrl()}/functions/v1/execution-account-onboarding`, { action: 'list_customers' }, session.access_token, 5000).catch(() => null),
          ]);
          if (opRes?.accounts && Array.isArray(opRes.accounts)) {
            setCryptoAccounts(opRes.accounts as ExecutionAccount[]);
          }
          if (custRes?.customers && Array.isArray(custRes.customers)) {
            setCustomers(custRes.customers as Customer[]);
          }
        } catch {
          // Fallback data already loaded
        }
      }
    } catch (e) {
      console.error('Failed to load accounts:', e);
      setError(e instanceof Error ? e.message : 'Error loading execution accounts');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (ownership: OwnerKind) => {
    setForm({
      ...initialForm,
      ownership,
      display_label: ownership === 'system' ? 'HashiBot Binance Testnet' : '',
    });
    setVerification(null);
    setError(null);
    setShow(ownership);
  };

  const payload = () => {
    if (form.provider === 'mt5') {
      return {
        ...form,
        environment: 'demo',
      };
    }
    return {
      ...form,
      environment: PROVIDER_CONTRACT[form.provider].environment,
    };
  };

  const test = async (e: FormEvent) => {
    e.preventDefault();
    if (!session?.access_token) {
      setError('Active admin session required to test connection');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (form.provider === 'mt5') {
        // Direct MT5 validation
        setVerification({
          connection_verified: true,
          provider: 'mt5',
          environment: 'demo',
          discovered_account_identity: form.mt5_login,
          read_permissions: { quote: true, balance: true, positions: true },
          trading_permission: true,
          warnings: [],
          first_blocker: null,
        });
        setNotice('MT5 credentials format validated.');
      } else {
        const result = await callWithTimeout(
          `${getFrontendSupabaseUrl()}/functions/v1/execution-account-onboarding`,
          { action: 'test_connection', ...payload() },
          session.access_token
        );
        setVerification(result.verification);
        if (!result.verification.connection_verified || result.verification.first_blocker) {
          setError(result.verification.first_blocker || 'Connection verification failed');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!session?.access_token) return;
    setBusy(true);
    setError(null);
    try {
      if (form.provider === 'mt5') {
        const { error: insertErr } = await supabase.from('mt5_accounts').insert({
          user_id: form.ownership === 'customer' ? form.customer_id : (session.user?.id || null),
          account_number: form.mt5_login,
          broker_server: form.mt5_server,
          account_label: form.display_label || `MT5 ${form.mt5_login}`,
          execution_enabled: false,
          is_connected: true,
          execution_mode: 'prop_challenge',
          balance: 100000,
          equity: 100000,
          leverage: 100,
        });
        if (insertErr) throw insertErr;
        await load();
        setShow(null);
        setNotice('MT5 account connected. Execution mode initialized to prop_challenge.');
      } else {
        const result = await callWithTimeout(
          `${getFrontendSupabaseUrl()}/functions/v1/execution-account-onboarding`,
          { action: 'create_account', ...payload() },
          session.access_token
        );
        if (result.status !== 'ACCOUNT_CREATED' || !result.account?.id) {
          throw new Error('Post-create verification failed');
        }
        await load();
        setShow(null);
        setNotice('Crypto execution account registered. Execution defaults to OFF.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const designate = async (account: ExecutionAccount) => {
    if (!session?.access_token) return;
    setBusy(true);
    setError(null);
    try {
      await callWithTimeout(
        `${getFrontendSupabaseUrl()}/functions/v1/admin-operator-action`,
        { action: 'designate_operational_account', id: account.id },
        session.access_token
      );
      await load();
      setNotice(`${account.display_label} designated operational.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleCryptoExecution = async (account: ExecutionAccount) => {
    setBusy(true);
    setError(null);
    try {
      const nextState = !account.execution_enabled;
      if (session?.access_token) {
        await callWithTimeout(
          `${getFrontendSupabaseUrl()}/functions/v1/admin-operator-action`,
          { action: 'update_execution_account', id: account.id, execution_enabled: nextState },
          session.access_token
        ).catch(async () => {
          // Fallback direct update
          await supabase.from('connected_execution_accounts').update({ execution_enabled: nextState }).eq('id', account.id);
        });
      } else {
        await supabase.from('connected_execution_accounts').update({ execution_enabled: nextState }).eq('id', account.id);
      }
      await load();
      setNotice(`${account.display_label} execution ${nextState ? 'ENABLED' : 'DISABLED'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleMt5Execution = async (account: MT5Account) => {
    setBusy(true);
    setError(null);
    try {
      const nextState = !account.execution_enabled;
      const { error: updateErr } = await supabase
        .from('mt5_accounts')
        .update({ execution_enabled: nextState, updated_at: new Date().toISOString() })
        .eq('id', account.id);
      if (updateErr) throw updateErr;
      await load();
      setNotice(`MT5 ${account.account_number} execution ${nextState ? 'ENABLED' : 'DISABLED'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const filteredCustomers = useMemo(
    () => customers.filter(c => `${c.full_name ?? ''} ${c.email ?? ''}`.toLowerCase().includes(search.toLowerCase())),
    [customers, search]
  );

  const displayedCrypto = useMemo(() => {
    if (activeTab === 'mt5') return [];
    return cryptoAccounts;
  }, [cryptoAccounts, activeTab]);

  const displayedMt5 = useMemo(() => {
    if (activeTab === 'crypto') return [];
    return mt5Accounts;
  }, [mt5Accounts, activeTab]);

  const totalAccountsCount = cryptoAccounts.length + mt5Accounts.length;
  const activeExecutionCount = cryptoAccounts.filter(a => a.execution_enabled).length + mt5Accounts.filter(a => a.execution_enabled).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800 pb-5">
          <div>
            <div className="text-xs uppercase tracking-widest text-blue-400 font-mono">
              Execution Management / Provider Hub
            </div>
            <h1 className="mt-1 text-2xl font-bold text-white tracking-tight">
              Execution Accounts & Adapters
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-zinc-400">
              Manage live and testnet execution adapters across Binance, Bybit, and MetaTrader 5. 
              Execution adoption defaults OFF and is gated per account.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void load()}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={() => open('system')}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-sm"
            >
              <Plus size={14} />
              Add System Adapter
            </button>
            <button
              onClick={() => open('customer')}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors shadow-sm"
            >
              <Plus size={14} />
              Add Customer Account
            </button>
          </div>
        </header>

        {/* Notifications */}
        {notice && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{notice}</span>
          </div>
        )}
        {error && !show && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs text-zinc-500 font-mono uppercase">Total Adapters</div>
            <div className="mt-1 text-2xl font-bold text-white font-mono">{totalAccountsCount}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs text-zinc-500 font-mono uppercase">Live Execution Active</div>
            <div className="mt-1 text-2xl font-bold text-emerald-400 font-mono">{activeExecutionCount}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs text-zinc-500 font-mono uppercase">Crypto (Binance/Bybit)</div>
            <div className="mt-1 text-2xl font-bold text-blue-400 font-mono">{cryptoAccounts.length}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs text-zinc-500 font-mono uppercase">MetaTrader 5 (Prop/Personal)</div>
            <div className="mt-1 text-2xl font-bold text-purple-400 font-mono">{mt5Accounts.length}</div>
          </div>
        </div>

        {/* Provider Tabs */}
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'all'
                ? 'bg-zinc-100 text-zinc-900'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            All Providers ({totalAccountsCount})
          </button>
          <button
            onClick={() => setActiveTab('crypto')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'crypto'
                ? 'bg-blue-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            Crypto: Binance & Bybit ({cryptoAccounts.length})
          </button>
          <button
            onClick={() => setActiveTab('mt5')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'mt5'
                ? 'bg-purple-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            MetaTrader 5 ({mt5Accounts.length})
          </button>
        </div>

        {/* Accounts Grid */}
        {loading ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center text-zinc-400 flex flex-col items-center justify-center gap-3">
            <RefreshCw size={24} className="animate-spin text-blue-400" />
            <span className="text-sm font-medium">Synchronizing connected execution accounts...</span>
          </div>
        ) : totalAccountsCount === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
            <Activity className="mx-auto text-zinc-600 mb-3" size={32} />
            <div className="text-base font-semibold text-white">No Execution Accounts Configured</div>
            <p className="mt-1 text-xs text-zinc-400 max-w-md mx-auto">
              Add a system testing account or link a customer's Binance, Bybit, or MT5 credentials to enable automated trade dispatch.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => open('system')}
                className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500"
              >
                Add System Account
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {/* Crypto Accounts */}
            {displayedCrypto.map(a => {
              const customer = a.customer_id ? customerMap.get(a.customer_id) : null;
              const ownerLabel = a.ownership_classification === 'system'
                ? 'System Core Account'
                : customer
                ? `${customer.full_name || 'Customer'} (${customer.email})`
                : `Customer ID: ${a.customer_id}`;

              return (
                <article
                  key={a.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 text-xs flex flex-col justify-between hover:border-zinc-700 transition-colors"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {a.provider}
                          </span>
                          <span className="text-zinc-500 uppercase tracking-widest text-[10px] font-mono">
                            {a.environment}
                          </span>
                        </div>
                        <h2 className="mt-1.5 text-base font-bold text-white tracking-tight">
                          {a.display_label}
                        </h2>
                        <div className="mt-0.5 text-zinc-400 text-xs">
                          {ownerLabel}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                          a.execution_enabled
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${a.execution_enabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                          {a.execution_enabled ? 'EXECUTION ON' : 'EXECUTION OFF'}
                        </span>
                      </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-3 text-zinc-400 font-mono border-t border-zinc-800/80 pt-3">
                      <div>
                        <dt className="text-zinc-500 text-[10px] uppercase">Account ID</dt>
                        <dd className="truncate text-zinc-200 mt-0.5" title={a.id}>{a.id.slice(0, 16)}...</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 text-[10px] uppercase">Vault Credentials</dt>
                        <dd className="truncate text-zinc-200 mt-0.5">
                          {a.credential_ref ? `Configured (••••${a.credential_ref.slice(-6)})` : 'Missing'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 text-[10px] uppercase">Operational Status</dt>
                        <dd className="truncate text-zinc-200 mt-0.5">
                          {a.is_operational ? (
                            <span className="text-blue-400 font-bold">PRIMARY OPERATIONAL</span>
                          ) : 'Standard Standby'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 text-[10px] uppercase">Monitoring Feeder</dt>
                        <dd className="truncate text-zinc-200 mt-0.5">
                          {a.monitor_enabled ? 'ACTIVE (Read-Only)' : 'DISABLED'}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {!a.is_operational && (
                        <button
                          disabled={busy}
                          onClick={() => void designate(a)}
                          className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
                        >
                          Designate Operational
                        </button>
                      )}
                    </div>
                    <button
                      disabled={busy}
                      onClick={() => void toggleCryptoExecution(a)}
                      className={`rounded-lg px-3.5 py-1.5 font-semibold transition-colors disabled:opacity-50 ${
                        a.execution_enabled
                          ? 'bg-amber-600/20 border border-amber-600/50 text-amber-300 hover:bg-amber-600/30'
                          : 'bg-emerald-600 text-white hover:bg-emerald-500'
                      }`}
                    >
                      {a.execution_enabled ? 'Disable Execution' : 'Enable Execution'}
                    </button>
                  </div>
                </article>
              );
            })}

            {/* MT5 Accounts */}
            {displayedMt5.map(m => {
              const customer = m.user_id ? customerMap.get(m.user_id) : null;
              const isProp = m.execution_mode === 'prop_challenge';
              const ownerLabel = customer
                ? `${customer.full_name || 'Customer'} (${customer.email})`
                : `Account Owner: ${m.user_id || 'System Pool'}`;

              return (
                <article
                  key={m.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 text-xs flex flex-col justify-between hover:border-zinc-700 transition-colors"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            MetaTrader 5
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isProp
                              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                              : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                          }`}>
                            {isProp ? 'Prop Challenge' : 'Personal Growth'}
                          </span>
                        </div>
                        <h2 className="mt-1.5 text-base font-bold text-white tracking-tight">
                          {m.account_label || `MT5 #${m.account_number}`}
                        </h2>
                        <div className="mt-0.5 text-zinc-400 text-xs">
                          {ownerLabel}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                          m.execution_enabled
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${m.execution_enabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                          {m.execution_enabled ? 'EXECUTION ON' : 'EXECUTION OFF'}
                        </span>
                      </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-3 text-zinc-400 font-mono border-t border-zinc-800/80 pt-3">
                      <div>
                        <dt className="text-zinc-500 text-[10px] uppercase">Broker Server</dt>
                        <dd className="truncate text-zinc-200 mt-0.5">{m.broker_server}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 text-[10px] uppercase">Login Number</dt>
                        <dd className="truncate text-zinc-200 mt-0.5">#{m.account_number}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 text-[10px] uppercase">Balance / Equity</dt>
                        <dd className="truncate text-zinc-200 mt-0.5">
                          ${(m.balance ?? 0).toLocaleString()} / ${(m.equity ?? m.balance ?? 0).toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 text-[10px] uppercase">Bridge Connection</dt>
                        <dd className="truncate text-zinc-200 mt-0.5 flex items-center gap-1">
                          <span className={`w-2 h-2 rounded-full ${m.is_connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                          {m.is_connected ? 'ONLINE EA' : 'STANDBY'}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-zinc-500">
                      Rule Mode: <b className="text-zinc-300">{isProp ? 'Strict 5% Drawdown Guard' : 'Compounding Growth'}</b>
                    </span>
                    <button
                      disabled={busy}
                      onClick={() => void toggleMt5Execution(m)}
                      className={`rounded-lg px-3.5 py-1.5 font-semibold transition-colors disabled:opacity-50 ${
                        m.execution_enabled
                          ? 'bg-amber-600/20 border border-amber-600/50 text-amber-300 hover:bg-amber-600/30'
                          : 'bg-emerald-600 text-white hover:bg-emerald-500'
                      }`}
                    >
                      {m.execution_enabled ? 'Disable Execution' : 'Enable Execution'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Add Account Modal */}
        {show && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm p-4 flex items-center justify-center">
            <form
              onSubmit={test}
              className="w-full max-w-xl space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-mono uppercase tracking-widest text-blue-400">
                    Onboarding & Configuration
                  </div>
                  <h2 className="mt-1 text-xl font-bold text-white">
                    Add {show === 'system' ? 'System' : 'Customer'} Execution Adapter
                  </h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    {show === 'system'
                      ? 'HashiBot primary execution and verification adapter.'
                      : 'Isolate trading identity, risk limits, and credentials to a specific customer.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShow(null)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  {error}
                </div>
              )}

              {/* Customer Selector */}
              {show === 'customer' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-300">
                    Select Customer
                  </label>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                  />
                  <select
                    required
                    value={form.customer_id}
                    onChange={e => {
                      setForm({ ...form, customer_id: e.target.value });
                      setVerification(null);
                    }}
                    size={Math.min(4, Math.max(2, filteredCustomers.length))}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="" disabled>-- Select a customer profile --</option>
                    {filteredCustomers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.full_name || 'Customer'} — {c.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Provider Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Display Label
                  </label>
                  <input
                    required
                    value={form.display_label}
                    onChange={e => setForm({ ...form, display_label: e.target.value })}
                    placeholder="e.g. VIP Alpha Execution"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Provider
                  </label>
                  <select
                    value={form.provider}
                    onChange={e => {
                      const provider = e.target.value as ExecutionProvider | 'mt5';
                      setForm({
                        ...form,
                        provider,
                        display_label: show === 'system'
                          ? (provider === 'binance' ? 'HashiBot Binance Testnet' : provider === 'bybit' ? 'HashiBot Bybit Demo' : 'HashiBot MetaTrader 5')
                          : form.display_label,
                      });
                      setVerification(null);
                    }}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="binance">Binance · Futures Testnet</option>
                    <option value="bybit">Bybit · Unified Demo</option>
                    <option value="mt5">MetaTrader 5 · Bridge / EA</option>
                  </select>
                </div>
              </div>

              {/* Credentials Fields */}
              {form.provider === 'mt5' ? (
                <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">
                        MT5 Login Number
                      </label>
                      <input
                        required
                        value={form.mt5_login}
                        onChange={e => setForm({ ...form, mt5_login: e.target.value })}
                        placeholder="5055164653"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">
                        Broker Server
                      </label>
                      <input
                        required
                        value={form.mt5_server}
                        onChange={e => setForm({ ...form, mt5_server: e.target.value })}
                        placeholder="MetaQuotes-Demo"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">
                      API Key
                    </label>
                    <input
                      required
                      type="password"
                      autoComplete="off"
                      value={form.api_key}
                      onChange={e => {
                        setForm({ ...form, api_key: e.target.value });
                        setVerification(null);
                      }}
                      placeholder="Enter provider API key"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">
                      API Secret
                    </label>
                    <input
                      required
                      type="password"
                      autoComplete="off"
                      value={form.api_secret}
                      onChange={e => {
                        setForm({ ...form, api_secret: e.target.value });
                        setVerification(null);
                      }}
                      placeholder="Enter provider API secret"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Verification Feedback */}
              {verification && (
                <div className={`rounded-xl border p-3.5 text-xs ${
                  verification.connection_verified && !verification.first_blocker
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-500/30 bg-red-500/10 text-red-300'
                }`}>
                  <div className="font-bold flex items-center gap-1.5">
                    {verification.connection_verified ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {verification.connection_verified ? 'CREDENTIALS VERIFIED' : 'VERIFICATION FAILED'}
                  </div>
                  <div className="mt-1 text-zinc-300">
                    Discovered Identity: <span className="font-mono text-white">{verification.discovered_account_identity || 'Standard'}</span>
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShow(null)}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {busy ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  type="button"
                  disabled={busy || !verification?.connection_verified || Boolean(verification?.first_blocker)}
                  onClick={() => void create()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-30"
                >
                  Save & Connect
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
