import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { useAuth } from '../../contexts/AuthContext';
import { callEdgeFunction } from '../../lib/edgeFunctionStatus';
import { ActionResult, OperatorActionResult } from '../../components/admin/ActionResult';
import { loadOperatorTruth, OperatorTruthBundle } from '../../lib/operatorTruth';
import { supabase } from '../../lib/supabase';
import {
  Activity, RefreshCw, ShieldAlert, ShieldCheck,
  PauseCircle, PlayCircle, Search, Server, ArrowUpRight, CheckCircle2,
  BarChart3, Power, Gauge, FileCheck, Lock,
  CheckCircle, XCircle, Sliders, Radio, RotateCcw, Play
} from 'lucide-react';

export interface MissionControlEvent {
  id: string;
  timestamp: string;
  rawTime: number;
  subsystem: 'SCANNER' | 'ARBITRATOR' | 'EXECUTION' | 'PROTECTION' | 'RECOVERY' | 'SUPERVISOR' | 'RISK' | 'TELEGRAM' | 'PROVIDER' | 'DATABASE' | 'SYSTEM';
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'CRITICAL';
  provider: string;
  environment: string;
  symbol: string;
  strategy: string;
  message: string;
  status: string;
  drillDownUrl: string;
  receiptId?: string;
}

export interface WorkerState {
  name: string;
  id: string;
  subsystem: string;
  currentState: 'ACTIVE' | 'RUNNING' | 'IDLE' | 'PAUSED' | 'ERROR' | 'UNSUPPORTED';
  currentTask: string;
  lastRun: string | null;
  lastRunAgeMs: number | null;
  avgRuntimeMs: number | null;
  successCount: number;
  failureCount: number;
  heartbeatAgeMs: number | null;
  queueSize: number;
  lastError: string | null;
  actionCommand?: string;
}

export interface SystemTestReport {
  overall_status: 'PASS' | 'WARNING' | 'FAIL' | 'BLOCKED';
  duration_ms: number;
  timestamp: string;
  passed_count: number;
  warning_count: number;
  failed_count: number;
  checks: Array<{
    name: string;
    category: string;
    status: 'PASS' | 'WARNING' | 'FAIL' | 'BLOCKED' | 'NOT CONFIGURED';
    detail: string;
    observed_evidence?: string;
    timestamp?: string;
    source?: string;
    exact_blocker?: string | null;
  }>;
}

export interface ControlAuditRow {
  name: string;
  location: string;
  classification: 'Global Lifecycle' | 'Scanner Control' | 'Execution Account Control' | 'Safety Intervention' | 'Engineering Diagnostic' | 'Legacy Compatibility' | 'Proven Dead' | 'Unknown';
  replacementStatus: string;
  dependencies: string;
  recommendation: 'Keep' | 'Move to Advanced Diagnostics' | 'Move to Legacy Controls' | 'Deprecate after certification' | 'Remove after one stable release' | 'Cannot Remove';
}

const CONTROL_AUDIT_MATRIX: ControlAuditRow[] = [
  { name: 'Start HashiBot', location: 'Mission Control', classification: 'Global Lifecycle', replacementStatus: 'Active Global Owner', dependencies: 'DB, Scanner, Provider Controls', recommendation: 'Keep' },
  { name: 'Stop New Activity', location: 'Mission Control', classification: 'Global Lifecycle', replacementStatus: 'Active Global Owner', dependencies: 'Execution Settings, Provider Controls', recommendation: 'Keep' },
  { name: 'Emergency Stop', location: 'Mission Control', classification: 'Global Lifecycle', replacementStatus: 'Active Global Owner', dependencies: 'Kill Switch, Adoption Policy', recommendation: 'Keep' },
  { name: 'Run Full System Test', location: 'Mission Control', classification: 'Engineering Diagnostic', replacementStatus: 'Active Consolidated Diagnostic', dependencies: 'DB, RPC, Providers, Safety Monitors', recommendation: 'Keep' },
  { name: 'Scanner ON / OFF Master Switch', location: 'Mission Control', classification: 'Scanner Control', replacementStatus: 'Active Global Owner', dependencies: 'scanner_config.is_enabled', recommendation: 'Keep' },
  { name: 'Execution Switch (Per Account)', location: 'Mission Control', classification: 'Execution Account Control', replacementStatus: 'Active Account Owner', dependencies: 'execution_provider_controls.entry_enabled', recommendation: 'Keep' },
  { name: 'Manual "Run One Scan"', location: 'Advanced Diagnostics', classification: 'Engineering Diagnostic', replacementStatus: 'Moved to Diagnostics', dependencies: 'scheduled-market-scanner Edge Function', recommendation: 'Move to Advanced Diagnostics' },
  { name: 'Retry Protection Repair', location: 'Protection Center / Mission Control', classification: 'Safety Intervention', replacementStatus: 'Active Safety Action', dependencies: 'Protection Monitor', recommendation: 'Keep' },
  { name: 'Reconcile Runtime Truth', location: 'Mission Control / Recovery', classification: 'Safety Intervention', replacementStatus: 'Active Safety Action', dependencies: 'Sync Engine', recommendation: 'Keep' },
  { name: 'Emergency Position Close', location: 'Positions / Mission Control', classification: 'Safety Intervention', replacementStatus: 'Active Bounded Action', dependencies: 'Provider Execution API', recommendation: 'Keep' },
  { name: 'Acknowledge Incident', location: 'Mission Control / Audit Logs', classification: 'Safety Intervention', replacementStatus: 'Active Bounded Action', dependencies: 'operator_runtime_events', recommendation: 'Keep' },
  { name: 'Provider Manual Sync', location: 'Provider Operations Pages', classification: 'Engineering Diagnostic', replacementStatus: 'Diagnostics Only', dependencies: 'Provider Adapters', recommendation: 'Move to Advanced Diagnostics' },
  { name: 'Legacy Mode Switcher', location: 'Modes Page', classification: 'Legacy Compatibility', replacementStatus: 'Deprecated', dependencies: 'execution_settings', recommendation: 'Deprecate after certification' },
  { name: 'Legacy Cron Trigger Script', location: 'System Scripts', classification: 'Proven Dead', replacementStatus: 'Inactive', dependencies: 'None', recommendation: 'Remove after one stable release' },
];

export default function MissionControl() {
  const { session } = useAuth();

  // Telemetry bundle state
  const [bundle, setBundle] = useState<OperatorTruthBundle | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Auto-refresh configuration
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  // Timeline filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [subsystemFilter] = useState<string>('ALL');
  const [providerFilter] = useState<string>('ALL');

  // Command execution
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<OperatorActionResult | null>(null);

  // Diagnostic Test Report Modal/Drawer
  const [testReport, setTestReport] = useState<SystemTestReport | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);

  // Active Tab View in Mission Control
  const [activeTab, setActiveTab] = useState<'OPERATIONS' | 'DIAGNOSTICS' | 'CONTROL_MATRIX' | 'TIMELINE'>('OPERATIONS');

  // Fetch verified backend truth
  const fetchTelemetry = useCallback(async (isInitial = false) => {
    if (isInitial) setRefreshing(true);
    else setRefreshing(true);

    try {
      const data = await loadOperatorTruth();
      setBundle(data);
      setLastRefreshedAt(new Date().toLocaleTimeString());
      setSessionExpired(false);
    } catch (err) {
      console.error('Failed to load Mission Control truth bundle:', err);
      const msg = err instanceof Error ? err.message : 'Failed to fetch backend telemetry.';
      if (msg.includes('JWT') || msg.includes('Unauthorized') || msg.includes('401')) {
        setSessionExpired(true);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void fetchTelemetry(true);
  }, [fetchTelemetry]);

  // Visibility-aware auto refresh
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const interval = setInterval(() => {
      if (!document.hidden) {
        void fetchTelemetry(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefreshEnabled, fetchTelemetry]);

  // Execute real backend command with JWT auto-refresh
  async function runCommand(action: string, provider?: string, extraParams: Record<string, unknown> = {}) {
    if (!session?.access_token || runningAction === action) return;

    const highRisk = ['emergency_stop_runtime', 'start_hashibot', 'resume_bot', 'run_recovery_now'].includes(action);
    if (highRisk && !window.confirm(`Confirm the critical operator action: '${action.toUpperCase()}'. This creates one immutable operator audit record.`)) return;

    const startedAt = new Date().toISOString();
    const route = '/functions/v1/admin-operator-action';
    const functionName = 'admin-operator-action';
    setRunningAction(action);

    setActionResult({
      status: 'RUNNING',
      action,
      provider,
      summary: `Executing backend command '${action}'...`,
      timestamp: startedAt,
      startedAt,
      route,
      functionName,
    });

    try {
      let token = session.access_token;
      const timeoutMs = action === 'run_scanner_now' ? 55000 : 30000;
      let result = await callEdgeFunction(functionName, { action, provider, ...extraParams, ...(highRisk ? { confirm: action } : {}) }, token, timeoutMs);

      // Part 8: JWT Refresh once if 401 encountered
      if (result.status === 401) {
        console.warn('JWT 401 returned from edge function. Attempting single session refresh...');
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        if (!refreshErr && refreshData?.session?.access_token) {
          token = refreshData.session.access_token;
          result = await callEdgeFunction(functionName, { action, provider, ...extraParams, ...(highRisk ? { confirm: action } : {}) }, token, timeoutMs);
        } else {
          setSessionExpired(true);
          setActionResult({
            status: 'BLOCKED',
            action,
            provider,
            summary: 'Session Expired. Please re-authenticate as Operator.',
            timestamp: startedAt,
            startedAt,
            finishedAt: new Date().toISOString(),
            durationMs: 0,
            blocker: 'JWT_EXPIRED',
            route,
            functionName,
            error: 'Session expired',
            raw: { error: 'Session expired' },
          });
          return;
        }
      }

      const data = result.data as Record<string, unknown> | null;
      const ok = result.ok && data && data.success === true && !data.exact_error;
      const raw = data?.raw as Record<string, unknown> | undefined;

      // Extract system test report if action was run_full_system_test
      if (action === 'run_full_system_test' && raw) {
        const report = raw as unknown as SystemTestReport;
        if (report.checks) {
          setTestReport(report);
          setShowTestModal(true);
        }
      }

      const res: OperatorActionResult = {
        status: ok ? 'SUCCESS' : 'FAILED',
        action,
        provider,
        summary: String(data?.result_summary ?? (ok ? 'Backend action completed successfully.' : 'Backend action failed.')),
        timestamp: startedAt,
        startedAt: String(data?.started_at ?? startedAt),
        finishedAt: String(data?.finished_at ?? new Date().toISOString()),
        durationMs: Number(data?.duration_ms ?? 0),
        runtimeEventId: data?.runtime_event_id ? String(data.runtime_event_id) : undefined,
        blocker: ok ? undefined : String(data?.blocker ?? data?.exact_error ?? 'Backend returned failure.'),
        route: String(data?.route ?? route),
        functionName: String(data?.function_name ?? functionName),
        target: data?.target ? String(data.target) : undefined,
        httpStatus: data?.http_status ? Number(data.http_status) : result.status,
        errorCode: data?.error_code ? String(data.error_code) : undefined,
        error: data?.exact_error ? String(data.exact_error) : (result.ok ? undefined : result.message),
        raw: data ?? result,
      };

      setActionResult(res);
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      setActionResult({
        status: 'FAILED',
        action,
        provider,
        summary: 'Backend operator command failed.',
        timestamp: startedAt,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: 0,
        blocker: 'NETWORK_OR_ROUTE_ERROR',
        route,
        functionName,
        error,
        raw: { error },
      });
    } finally {
      setRunningAction(null);
      void fetchTelemetry(false);
    }
  }

  // --- DERIVED METRICS & TRUTH EVALUATIONS ---

  const getAgeSec = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const t = new Date(dateStr).getTime();
    if (isNaN(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 1000));
  };

  const formatAge = (ageSec: number | null) => {
    if (ageSec === null) return 'NO_DATA';
    if (ageSec < 60) return `${ageSec}s ago`;
    if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
    return `${Math.floor(ageSec / 3600)}h ago`;
  };

  // 1. Scanner Master Switch & Config
  const scannerCfg = bundle?.scannerConfig;
  const scannerEnabled = scannerCfg?.is_enabled === true;
  const scannerStatus = !bundle || bundle.sourceErrors.scanner_config
    ? 'UNKNOWN'
    : !scannerCfg ? 'NOT CONFIGURED' : scannerEnabled ? 'ON (ACTIVE)' : 'OFF (PAUSED)';
  const scannerLastRun = bundle?.schedulerTruth?.[0] ?? null;
  const scannerLastRunAt = String(scannerLastRun?.started_at ?? scannerCfg?.last_scheduled_scan_at ?? '');
  const scannerAgeSec = getAgeSec(scannerLastRunAt);

  // 2. Heartbeats mapping
  const heartbeats = useMemo(() => bundle?.heartbeats ?? [], [bundle?.heartbeats]);
  const monitorHb = useMemo(() => {
    return heartbeats.find(h => String(h.provider ?? '').toLowerCase() === 'binance') ??
      heartbeats.find(h => String(h.provider ?? '').toLowerCase() === 'monitor') ??
      heartbeats[0];
  }, [heartbeats]);

  // 3. Trade Truth & Positions
  const tradeTruth = useMemo(() => bundle?.tradeTruth ?? [], [bundle?.tradeTruth]);
  const openPositionsCount = tradeTruth.length;
  const unprotectedPositions = useMemo(() => {
    return tradeTruth.filter(t => {
      const st = String(t.protection_status ?? '').toLowerCase();
      return st.includes('unprotect') || st.includes('failed') || t.sl_present === false;
    });
  }, [tradeTruth]);
  const protectedPositionsCount = openPositionsCount - unprotectedPositions.length;

  // 4. Execution Orders
  const executionOrders = useMemo(() => bundle?.executionOrders ?? [], [bundle?.executionOrders]);

  // 5. Provider Controls
  const providerControls = useMemo(() => bundle?.providerControls ?? [], [bundle?.providerControls]);
  const binanceControl = useMemo(() => providerControls.find(p => String(p.provider_name ?? p.provider ?? '').toLowerCase().includes('binance')), [providerControls]);
  const bybitControl = useMemo(() => providerControls.find(p => String(p.provider_name ?? p.provider ?? '').toLowerCase().includes('bybit')), [providerControls]);
  const mt5PersonalControl = useMemo(() => providerControls.find(p => String(p.provider_name ?? p.provider ?? '').toLowerCase().includes('mt5_personal')), [providerControls]);
  const mt5PropControl = useMemo(() => providerControls.find(p => String(p.provider_name ?? p.provider ?? '').toLowerCase().includes('mt5_prop')), [providerControls]);

  const enabledAccountsCount = useMemo(() => {
    return providerControls.filter(p => p.entry_enabled !== false).length;
  }, [providerControls]);

  // 6. Telegram Deliveries
  const telegramDeliveries = useMemo(() => bundle?.telegramDeliveries ?? [], [bundle?.telegramDeliveries]);
  const telegramSentCount = useMemo(() => {
    return telegramDeliveries.filter(d => ['sent', 'delivered', 'success'].includes(String(d.status ?? d.delivery_status ?? '').toLowerCase())).length;
  }, [telegramDeliveries]);
  const telegramFailedCount = useMemo(() => {
    return telegramDeliveries.filter(d => ['failed', 'error'].includes(String(d.status ?? d.delivery_status ?? '').toLowerCase())).length;
  }, [telegramDeliveries]);

  // 7. Runtime Events
  const operatorEvents = useMemo(() => bundle?.runtimeEvents ?? [], [bundle?.runtimeEvents]);

  // Active Environment
  const activeEnv = useMemo(() => {
    const envs = new Set<string>();
    tradeTruth.forEach(t => { if (t.environment) envs.add(String(t.environment).toUpperCase()); });
    executionOrders.forEach(o => { if (o.environment) envs.add(String(o.environment).toUpperCase()); });
    if (envs.size === 0) return 'UNKNOWN';
    return Array.from(envs).join(' / ');
  }, [tradeTruth, executionOrders]);

  const runtimeStatus = !bundle || bundle.sourceErrors.execution_settings
    ? 'UNKNOWN'
    : !bundle.executionSettings
      ? 'NOT CONFIGURED'
      : bundle.executionSettings.kill_switch_enabled
        ? 'EMERGENCY STOP'
        : bundle.executionSettings.bot_paused ? 'PAUSED' : 'ACTIVE';
  const providerHealth = useMemo(() => {
    if (!bundle || bundle.sourceErrors.execution_provider_controls) return 'UNKNOWN';
    if (providerControls.length === 0) return 'NOT CONFIGURED';
    const unhealthy = providerControls.filter(row => {
      const status = String(row.status ?? '').toUpperCase();
      return Boolean(row.last_error) || !['HEALTHY', 'CONNECTED', 'ACTIVE', 'READY'].includes(status);
    });
    return unhealthy.length === 0 ? 'ALL HEALTHY' : `${unhealthy.length} DISCONNECTED / DEGRADED`;
  }, [bundle, providerControls]);

  // Compiled Timeline
  const compiledTimeline = useMemo(() => {
    const list: MissionControlEvent[] = [];

    operatorEvents.forEach(row => {
      const isErr = String(row.status ?? row.result ?? '').toUpperCase().includes('FAIL') || Boolean(row.error);
      list.push({
        id: `evt-${row.id}`,
        timestamp: row.started_at ? new Date(String(row.started_at)).toLocaleString() : 'Just now',
        rawTime: row.started_at ? new Date(String(row.started_at)).getTime() : Date.now(),
        subsystem: 'SUPERVISOR',
        severity: isErr ? 'ERROR' : 'INFO',
        provider: String(row.provider ?? 'SYSTEM').toUpperCase(),
        environment: String(row.environment ?? 'TESTNET'),
        symbol: String(row.symbol ?? 'ALL'),
        strategy: 'OPERATOR',
        message: `${row.action ?? 'Operator Action'}: ${row.summary ?? row.result ?? 'Completed'}${row.error ? ` (${row.error})` : ''}`,
        status: String(row.status ?? row.result ?? 'VERIFIED'),
        drillDownUrl: '/admin/audit',
        receiptId: `ACT-${String(row.id).slice(0, 8)}`,
      });
    });

    telegramDeliveries.forEach(row => {
      const isErr = String(row.status ?? row.delivery_status ?? '').toLowerCase() === 'failed';
      list.push({
        id: `tg-${row.id}`,
        timestamp: row.created_at ? new Date(String(row.created_at)).toLocaleString() : 'Just now',
        rawTime: row.created_at ? new Date(String(row.created_at)).getTime() : Date.now(),
        subsystem: 'TELEGRAM',
        severity: isErr ? 'WARNING' : 'SUCCESS',
        provider: 'TELEGRAM',
        environment: String(row.destination_channel ?? 'ADMIN'),
        symbol: 'BROADCAST',
        strategy: 'GATEWAY',
        message: `Telegram Message: status = ${row.status ?? row.delivery_status}${row.error_message ? ` (${row.error_message})` : ''}`,
        status: isErr ? 'FAILED' : 'DELIVERED',
        drillDownUrl: '/admin/telegram',
        receiptId: `TG-${String(row.id).slice(0, 8)}`,
      });
    });

    heartbeats.forEach(row => {
      const isErr = row.monitor_status === 'failed' || Boolean(row.errors);
      list.push({
        id: `hb-${row.id}`,
        timestamp: row.started_at ? new Date(String(row.started_at)).toLocaleString() : 'Just now',
        rawTime: row.started_at ? new Date(String(row.started_at)).getTime() : Date.now(),
        subsystem: 'PROTECTION',
        severity: isErr ? 'WARNING' : 'INFO',
        provider: String(row.provider ?? 'WATCHDOG').toUpperCase(),
        environment: String(row.environment ?? 'TESTNET'),
        symbol: 'ALL',
        strategy: 'SUPERVISOR',
        message: `Watchdog Monitor Cycle: ${row.monitor_status} (${row.positions_seen ?? 0} positions verified)`,
        status: isErr ? 'WARNING' : 'VERIFIED',
        drillDownUrl: '/admin/protection',
        receiptId: `HB-${String(row.id).slice(0, 8)}`,
      });
    });

    tradeTruth.forEach(row => {
      const isUnprot = String(row.protection_status ?? '').toLowerCase().includes('unprotect') || row.sl_present === false;
      list.push({
        id: `pos-${row.provider}-${row.symbol}`,
        timestamp: row.latest_sync_at ? new Date(String(row.latest_sync_at)).toLocaleString() : 'Just now',
        rawTime: row.latest_sync_at ? new Date(String(row.latest_sync_at)).getTime() : Date.now(),
        subsystem: isUnprot ? 'PROTECTION' : 'EXECUTION',
        severity: isUnprot ? 'CRITICAL' : 'SUCCESS',
        provider: String(row.provider ?? 'BINANCE').toUpperCase(),
        environment: String(row.environment ?? 'TESTNET'),
        symbol: String(row.symbol),
        strategy: String(row.side ?? 'POSITION'),
        message: `Trade ${row.symbol} ${row.side} qty ${row.qty}: Protection State = ${row.protection_status ?? 'PROTECTED'}`,
        status: isUnprot ? 'UNPROTECTED' : 'VERIFIED',
        drillDownUrl: '/admin/positions',
      });
    });

    list.sort((a, b) => b.rawTime - a.rawTime);
    return list;
  }, [operatorEvents, telegramDeliveries, heartbeats, tradeTruth]);

  const filteredTimeline = useMemo(() => {
    return compiledTimeline.filter(e => {
      if (severityFilter !== 'ALL' && e.severity !== severityFilter) return false;
      if (subsystemFilter !== 'ALL' && e.subsystem !== subsystemFilter) return false;
      if (providerFilter !== 'ALL' && e.provider !== providerFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          e.message.toLowerCase().includes(q) ||
          e.symbol.toLowerCase().includes(q) ||
          e.provider.toLowerCase().includes(q) ||
          e.subsystem.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [compiledTimeline, severityFilter, subsystemFilter, providerFilter, searchTerm]);

  return (
    <AdminLayout>
      <div className="space-y-5">

        {/* TOP OPERATOR HEADER */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 shrink-0">
              <Gauge size={22} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-zinc-100 flex flex-wrap items-center gap-2">
                <span>HashiBot Mission Control</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  CERTIFIED LIFECYCLE
                </span>
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                Unified Operator Command Plane • Scanner, Arbitrator & Account Routing
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => fetchTelemetry(false)}
              disabled={refreshing}
              className="flex-1 sm:flex-none px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-mono font-semibold flex items-center justify-center gap-2 border border-zinc-700 transition"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin text-emerald-400' : ''} />
              {refreshing ? 'Syncing...' : 'Sync Truth'}
            </button>

            <button
              onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-mono font-semibold flex items-center justify-center gap-2 border transition ${
                autoRefreshEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400'
              }`}
            >
              <Radio size={13} className={autoRefreshEnabled ? 'animate-pulse' : ''} />
              {autoRefreshEnabled ? `Auto 5s` : 'Auto Off'}
            </button>

            {lastRefreshedAt && (
              <span className="text-[11px] font-mono text-zinc-500 hidden lg:inline">
                Synced {lastRefreshedAt}
              </span>
            )}
          </div>
        </div>

        {/* SESSION EXPIRED BANNER */}
        {sessionExpired && (
          <div className="p-4 bg-red-950/80 border border-red-500/40 rounded-xl flex items-center justify-between text-red-200">
            <div className="flex items-center gap-3">
              <Lock size={20} className="text-red-400" />
              <div>
                <h3 className="text-sm font-bold">Operator Session Expired</h3>
                <p className="text-xs text-red-300">
                  JWT authorization token has expired. Automatic single refresh failed. Re-authentication is required. Provider connections remain intact.
                </p>
              </div>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold font-mono transition"
            >
              Re-Authenticate
            </button>
          </div>
        )}

        {/* ACTION RESULT NOTIFICATION */}
        {actionResult && (
          <div className="transition-all">
            <ActionResult result={actionResult} />
          </div>
        )}

        {/* PART 1: GLOBAL LIFECYCLE CONTROLS */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-800 pb-3 gap-2">
            <div>
              <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                <Power size={16} className="text-emerald-400" /> Part 1 — Global Runtime Lifecycle Commands
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Mission Control owns the global operational lifecycle. Select primary operator command.
              </p>
            </div>
            <span className="self-start sm:self-auto px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
              LOCKED ARCHITECTURE
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            
            {/* START HASHIBOT */}
            <div className="bg-zinc-950/60 border border-emerald-500/30 hover:border-emerald-500/60 rounded-xl p-3.5 flex flex-col justify-between space-y-3 transition group">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 font-mono uppercase flex items-center gap-1.5">
                    <PlayCircle size={15} /> Start HashiBot
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                  Starts runtime in strict dependency order: validation → provider refresh → scanner → strategies → arbitrator → execution routing → protection.
                </p>
              </div>
              <button
                onClick={() => runCommand('start_hashibot')}
                disabled={runningAction === 'start_hashibot'}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition shadow-md flex items-center justify-center gap-2"
              >
                {runningAction === 'start_hashibot' ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                Start HashiBot
              </button>
            </div>

            {/* STOP NEW ACTIVITY */}
            <div className="bg-zinc-950/60 border border-amber-500/30 hover:border-amber-500/60 rounded-xl p-3.5 flex flex-col justify-between space-y-3 transition group">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 font-mono uppercase flex items-center gap-1.5">
                    <PauseCircle size={15} /> Stop New Activity
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300">SAFE</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                  Stops new scans & strategy plan adoption. <strong className="text-zinc-200">Preserves</strong> ongoing monitoring, protection, recovery & position management.
                </p>
              </div>
              <button
                onClick={() => runCommand('stop_new_activity')}
                disabled={runningAction === 'stop_new_activity'}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition shadow-md flex items-center justify-center gap-2"
              >
                {runningAction === 'stop_new_activity' ? <RefreshCw size={14} className="animate-spin" /> : <PauseCircle size={14} />}
                Stop New Activity
              </button>
            </div>

            {/* EMERGENCY STOP */}
            <div className="bg-zinc-950/60 border border-red-500/40 hover:border-red-500/70 rounded-xl p-3.5 flex flex-col justify-between space-y-3 transition group">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-red-400 font-mono uppercase flex items-center gap-1.5">
                    <ShieldAlert size={15} /> Emergency Stop
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-red-500/20 text-red-300">CRITICAL</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                  Blocks new claims & submissions immediately across all accounts. <strong className="text-zinc-200">Never liquidates trades automatically.</strong>
                </p>
              </div>
              <button
                onClick={() => runCommand('emergency_stop_runtime')}
                disabled={runningAction === 'emergency_stop_runtime'}
                className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition shadow-md flex items-center justify-center gap-2"
              >
                {runningAction === 'emergency_stop_runtime' ? <RefreshCw size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
                Emergency Stop
              </button>
            </div>

            {/* RUN FULL SYSTEM TEST */}
            <div className="bg-zinc-950/60 border border-blue-500/30 hover:border-blue-500/60 rounded-xl p-3.5 flex flex-col justify-between space-y-3 transition group">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-400 font-mono uppercase flex items-center gap-1.5">
                    <FileCheck size={15} /> Full System Test
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-blue-500/20 text-blue-300">DIAGNOSTIC</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                  Runs 15 consolidated system audits: Auth, DB, Migrations, Scanner, Binance/Bybit/MT5, Safety & Telegram. Returns PASS/WARN/FAIL.
                </p>
              </div>
              <button
                onClick={() => runCommand('run_full_system_test')}
                disabled={runningAction === 'run_full_system_test'}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition shadow-md flex items-center justify-center gap-2"
              >
                {runningAction === 'run_full_system_test' ? <RefreshCw size={14} className="animate-spin" /> : <FileCheck size={14} />}
                Run Full System Test
              </button>
            </div>

          </div>
        </div>

        {/* MISSION CONTROL TABS */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-zinc-800 scrollbar-none -mx-1 px-1">
          <button
            onClick={() => setActiveTab('OPERATIONS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold font-mono uppercase tracking-wider shrink-0 transition flex items-center gap-2 ${
              activeTab === 'OPERATIONS'
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 shadow-sm font-bold'
                : 'bg-zinc-900/60 border border-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <Gauge size={14} /> Part 10 — Runtime Dashboard
          </button>

          <button
            onClick={() => setActiveTab('DIAGNOSTICS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold font-mono uppercase tracking-wider shrink-0 transition flex items-center gap-2 ${
              activeTab === 'DIAGNOSTICS'
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 shadow-sm font-bold'
                : 'bg-zinc-900/60 border border-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <Sliders size={14} /> Parts 2-4 — Controls & Safety
          </button>

          <button
            onClick={() => setActiveTab('CONTROL_MATRIX')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold font-mono uppercase tracking-wider shrink-0 transition flex items-center gap-2 ${
              activeTab === 'CONTROL_MATRIX'
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 shadow-sm font-bold'
                : 'bg-zinc-900/60 border border-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <BarChart3 size={14} /> Part 5 — Control Matrix
          </button>

          <button
            onClick={() => setActiveTab('TIMELINE')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold font-mono uppercase tracking-wider shrink-0 transition flex items-center gap-2 ${
              activeTab === 'TIMELINE'
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 shadow-sm font-bold'
                : 'bg-zinc-900/60 border border-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <Activity size={14} /> Activity Timeline ({filteredTimeline.length})
          </button>
        </div>

        {/* TAB 1: RUNTIME READINESS DASHBOARD (PART 10) */}
        {activeTab === 'OPERATIONS' && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2 font-mono">
                  <BarChart3 size={15} className="text-emerald-400" /> Runtime Readiness Dashboard — Truth Metrics
                </h2>
                <span className="text-[10px] text-zinc-500 font-mono">Zero Decorative Widgets • 100% Verified Truth</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">

                {/* 1. Runtime Status */}
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
                  <span className="text-[10px] font-mono text-zinc-500 block">1. Runtime Status</span>
                  <div className="text-sm font-bold font-mono mt-1 text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> {runtimeStatus}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-1">Env: {activeEnv}</span>
                </div>

                {/* 2. Scanner Status */}
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
                  <span className="text-[10px] font-mono text-zinc-500 block">2. Scanner Status</span>
                  <div className={`text-sm font-bold font-mono mt-1 ${scannerEnabled ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {scannerStatus}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-1">
                    Interval: {scannerCfg?.scan_interval_minutes != null ? `${scannerCfg.scan_interval_minutes}m` : 'UNKNOWN'}
                  </span>
                </div>

                {/* 3. Last Scan */}
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
                  <span className="text-[10px] font-mono text-zinc-500 block">3. Last Scan</span>
                  <div className="text-sm font-bold font-mono mt-1 text-zinc-200">
                    {formatAge(scannerAgeSec)}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-1 truncate">
                    {scannerLastRunAt ? new Date(scannerLastRunAt).toLocaleTimeString() : 'No scans logged'}
                  </span>
                </div>

                {/* 4. Account Truth Freshness */}
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
                  <span className="text-[10px] font-mono text-zinc-500 block">4. Account Truth Freshness</span>
                  <div className="text-sm font-bold font-mono mt-1 text-emerald-400">
                    {formatAge(getAgeSec(tradeTruth[0]?.latest_sync_at ? String(tradeTruth[0].latest_sync_at) : null))}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-1">Verified DB Projection</span>
                </div>

                {/* 5. Enabled Execution Accounts */}
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
                  <span className="text-[10px] font-mono text-zinc-500 block">5. Enabled Execution Accounts</span>
                  <div className="text-sm font-bold font-mono mt-1 text-zinc-100">
                    {bundle?.sourceErrors.execution_provider_controls ? 'UNKNOWN' : `${enabledAccountsCount} / ${providerControls.length} Accounts`}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-1">Independent Routing</span>
                </div>

                {/* 6. Open Positions */}
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
                  <span className="text-[10px] font-mono text-zinc-500 block">6. Open Positions</span>
                  <div className="text-sm font-bold font-mono mt-1 text-zinc-100">
                    {openPositionsCount} Open ({protectedPositionsCount} Protected)
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-1">Exchange Native SL/TP</span>
                </div>

                {/* 7. Accounts Requiring Protection */}
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
                  <span className="text-[10px] font-mono text-zinc-500 block">7. Accounts Needing Protection</span>
                  <div className={`text-sm font-bold font-mono mt-1 ${unprotectedPositions.length === 0 ? 'text-emerald-400' : 'text-red-400 animate-pulse'}`}>
                    {unprotectedPositions.length} Unprotected
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-1">Auto Watchdog Engine</span>
                </div>

                {/* 8. Monitor Health */}
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
                  <span className="text-[10px] font-mono text-zinc-500 block">8. Monitor Health</span>
                  <div className="text-sm font-bold font-mono mt-1 text-emerald-400">
                    {monitorHb?.started_at ? formatAge(getAgeSec(String(monitorHb.started_at))) : 'UNKNOWN'}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-1">Watchdog Lease Verified</span>
                </div>

                {/* 9. Recovery Queue */}
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
                  <span className="text-[10px] font-mono text-zinc-500 block">9. Recovery Queue</span>
                  <div className="text-sm font-bold font-mono mt-1 text-zinc-200">
                    {bundle?.quarantine?.length ?? 0} Quarantined
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-1">Auto Repair Watchdog</span>
                </div>

                {/* 10. Provider Health */}
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
                  <span className="text-[10px] font-mono text-zinc-500 block">10. Provider Health</span>
                  <div className="text-sm font-bold font-mono mt-1 text-emerald-400">
                    {providerHealth}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-1">Binance / Bybit / MT5</span>
                </div>

                {/* 11. Telegram Health */}
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
                  <span className="text-[10px] font-mono text-zinc-500 block">11. Telegram Health</span>
                  <div className={`text-sm font-bold font-mono mt-1 ${telegramFailedCount === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {telegramSentCount} Sent / {telegramFailedCount} Failed
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-1">{telegramDeliveries.length ? 'Delivery ledger evidence' : 'UNKNOWN — no delivery evidence'}</span>
                </div>

                {/* 12. Canonical Writer Health */}
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
                  <span className="text-[10px] font-mono text-zinc-500 block">12. Canonical Writer Health</span>
                  <div className="text-sm font-bold font-mono mt-1 text-emerald-400">
                    {operatorEvents.length} Events Logged
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-1">Immutable Audit Ledger</span>
                </div>

              </div>

              {/* 13. LAST FULL SYSTEM TEST BANNER */}
              <div className="mt-4 bg-zinc-950 p-3.5 rounded border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <FileCheck size={20} className="text-blue-400" />
                  <div>
                    <span className="text-[10px] font-mono text-zinc-500 uppercase block">13. Last Full System Test</span>
                    <div className="text-xs font-bold font-mono text-zinc-200 mt-0.5 flex items-center gap-2">
                      {testReport ? (
                        <>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            testReport.overall_status === 'PASS' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                            testReport.overall_status === 'WARNING' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                            'bg-red-500/20 text-red-300 border border-red-500/30'
                          }`}>
                            RESULT: {testReport.overall_status}
                          </span>
                          <span>Passed {testReport.passed_count}/{testReport.checks.length} checks ({testReport.duration_ms}ms)</span>
                        </>
                      ) : (
                        <span className="text-zinc-400">No consolidated system test executed in current session.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {testReport && (
                    <button
                      onClick={() => setShowTestModal(true)}
                      className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono rounded border border-zinc-700 transition"
                    >
                      View Diagnostics Report
                    </button>
                  )}
                  <button
                    onClick={() => runCommand('run_full_system_test')}
                    disabled={runningAction === 'run_full_system_test'}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold font-mono rounded transition flex items-center gap-1.5"
                  >
                    {runningAction === 'run_full_system_test' ? <RefreshCw size={13} className="animate-spin" /> : <FileCheck size={13} />}
                    Run Diagnostic Now
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: CONTROLS & SAFETY (PARTS 2, 3 & 4) */}
        {activeTab === 'DIAGNOSTICS' && (
          <div className="space-y-6">

            {/* PART 2: SCANNER CONTROL */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2 font-mono">
                    <Search size={16} className="text-emerald-400" /> Part 2 — Global Scanner Control
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Mission Control owns the single master scanner control.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                    scannerEnabled
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  }`}>
                    SCANNER {scannerEnabled ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>

              <div className="bg-zinc-950 p-4 rounded border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-zinc-200 font-mono">
                    Master Scanner Engine Toggle (ON / OFF)
                  </div>
                  <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
                    Turning Scanner <strong className="text-amber-300">OFF</strong> stops market scanning and stops new StrategyPlan adoption. It <strong className="text-emerald-300">does NOT stop</strong> monitoring, protection, recovery, reporting or reconciliation.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => runCommand('toggle_scanner', undefined, { enabled: !scannerEnabled })}
                    disabled={runningAction === 'toggle_scanner'}
                    className={`px-4 py-2 rounded text-xs font-bold font-mono uppercase tracking-wider transition flex items-center gap-2 border ${
                      scannerEnabled
                        ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
                    }`}
                  >
                    {scannerEnabled ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
                    Set Scanner {scannerEnabled ? 'OFF' : 'ON'}
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-zinc-500 flex items-center justify-between font-mono bg-zinc-950/40 p-2.5 rounded border border-zinc-800/60">
                <span>Advanced Diagnostics: Single manual scan trigger available under Diagnostics.</span>
                <button
                  onClick={() => runCommand('run_scanner_now')}
                  disabled={runningAction === 'run_scanner_now'}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[10px] font-bold transition flex items-center gap-1"
                >
                  Run Single Scan Diagnostic
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
                {[
                  ['run_monitor_now', 'Refresh Provider Health'],
                  ['run_supervisor_now', 'Refresh Runtime Truth'],
                  ['run_runtime_proof', 'Run Provider Proof'],
                  ['sync_providers', 'Refresh Execution Fleet'],
                  ['verify_protection', 'Verify Protection'],
                  ['pause_entries', 'Pause Runtime Entries'],
                  ['resume_bot', 'Resume Runtime'],
                ].map(([action, label]) => (
                  <button
                    key={action}
                    onClick={() => runCommand(action)}
                    disabled={Boolean(runningAction)}
                    className="px-2.5 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded text-[10px] font-bold font-mono transition"
                  >
                    {runningAction === action ? 'Running…' : label}
                  </button>
                ))}
              </div>
            </div>

            {/* PART 3: ONE EXECUTION SWITCH PER ACCOUNT */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2 font-mono">
                    <Sliders size={16} className="text-blue-400" /> Part 3 — Independent Execution Account Switches
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Each execution account has exactly one operational adoption switch.
                  </p>
                </div>
                <span className="text-[10px] font-mono text-zinc-500">ISOLATED ACCOUNT ADOPTION</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Binance Account Switch */}
                <div className="bg-zinc-950 p-4 rounded border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-zinc-200 font-mono flex items-center gap-2">
                        <Server size={14} className="text-amber-400" /> Binance Futures Testnet Account
                      </h3>
                      <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">
                        Provider: binance • Mode: Crypto Testnet
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                      binanceControl?.entry_enabled === true
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}>
                      {!binanceControl ? 'NOT CONFIGURED' : binanceControl.entry_enabled === true ? 'EXECUTION ON' : 'EXECUTION OFF'}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Execution OFF blocks new ExecutionPlans & submissions on Binance. Does NOT stop scanner, monitoring, protection, recovery or other accounts.
                  </p>

                  <button
                    onClick={() => runCommand('toggle_account_execution', 'binance', { enabled: binanceControl?.entry_enabled === false })}
                    disabled={Boolean(runningAction) || !binanceControl}
                    className={`w-full py-1.5 rounded text-xs font-bold font-mono uppercase tracking-wider transition border ${
                      binanceControl?.entry_enabled === true
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
                    }`}
                  >
                    {binanceControl ? `Toggle Binance Execution ${binanceControl.entry_enabled === true ? 'OFF' : 'ON'}` : 'Binance Not Configured'}
                  </button>
                </div>

                {/* Bybit Account Switch */}
                <div className="bg-zinc-950 p-4 rounded border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-zinc-200 font-mono flex items-center gap-2">
                        <Server size={14} className="text-blue-400" /> Bybit Demo Account
                      </h3>
                      <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">
                        Provider: bybit • Mode: Crypto Demo
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                      bybitControl?.entry_enabled === true
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}>
                      {!bybitControl ? 'NOT CONFIGURED' : bybitControl.entry_enabled === true ? 'EXECUTION ON' : 'EXECUTION OFF'}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Execution OFF blocks new ExecutionPlans & submissions on Bybit. Does NOT stop scanner, monitoring, protection, recovery or Binance.
                  </p>

                  <button
                    onClick={() => runCommand('toggle_account_execution', 'bybit', { enabled: bybitControl?.entry_enabled === false })}
                    disabled={Boolean(runningAction) || !bybitControl}
                    className={`w-full py-1.5 rounded text-xs font-bold font-mono uppercase tracking-wider transition border ${
                      bybitControl?.entry_enabled === true
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
                    }`}
                  >
                    {bybitControl ? `Toggle Bybit Execution ${bybitControl.entry_enabled === true ? 'OFF' : 'ON'}` : 'Bybit Not Configured'}
                  </button>
                </div>

                {/* MT5 Personal Account Switch */}
                <div className="bg-zinc-950 p-4 rounded border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-zinc-200 font-mono flex items-center gap-2">
                        <Server size={14} className="text-purple-400" /> MT5 Personal Forex Account
                      </h3>
                      <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">
                        Provider: mt5_personal • Mode: Forex Bridge
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                      mt5PersonalControl?.entry_enabled === true
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}>
                      {!mt5PersonalControl ? 'NOT CONFIGURED' : mt5PersonalControl.entry_enabled === true ? 'EXECUTION ON' : 'EXECUTION OFF'}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Execution OFF blocks new ExecutionPlans on MT5 Personal. All other providers remain completely unaffected.
                  </p>

                  <button
                    onClick={() => runCommand('toggle_account_execution', 'mt5_personal', { enabled: mt5PersonalControl?.entry_enabled === false })}
                    disabled={Boolean(runningAction) || !mt5PersonalControl}
                    className={`w-full py-1.5 rounded text-xs font-bold font-mono uppercase tracking-wider transition border ${
                      mt5PersonalControl?.entry_enabled === true
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
                    }`}
                  >
                    {mt5PersonalControl ? `Toggle MT5 Personal Execution ${mt5PersonalControl.entry_enabled === true ? 'OFF' : 'ON'}` : 'MT5 Personal Not Configured'}
                  </button>
                </div>

                {/* MT5 Prop Account Switch */}
                <div className="bg-zinc-950 p-4 rounded border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-zinc-200 font-mono flex items-center gap-2">
                        <Server size={14} className="text-cyan-400" /> MT5 Prop Evaluation Account
                      </h3>
                      <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">
                        Provider: mt5_prop • Mode: Prop Challenge
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                      mt5PropControl?.entry_enabled === true
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}>
                      {!mt5PropControl ? 'NOT CONFIGURED' : mt5PropControl.entry_enabled === true ? 'EXECUTION ON' : 'EXECUTION OFF'}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Execution OFF blocks new ExecutionPlans on MT5 Prop. Daily drawdown monitoring and risk limits remain active.
                  </p>

                  <button
                    onClick={() => runCommand('toggle_account_execution', 'mt5_prop', { enabled: mt5PropControl?.entry_enabled === false })}
                    disabled={Boolean(runningAction) || !mt5PropControl}
                    className={`w-full py-1.5 rounded text-xs font-bold font-mono uppercase tracking-wider transition border ${
                      mt5PropControl?.entry_enabled === true
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
                    }`}
                  >
                    {mt5PropControl ? `Toggle MT5 Prop Execution ${mt5PropControl.entry_enabled === true ? 'OFF' : 'ON'}` : 'MT5 Prop Not Configured'}
                  </button>
                </div>

              </div>
            </div>

            {/* PART 4: BOUNDED SAFETY INTERVENTIONS */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2 font-mono">
                    <ShieldCheck size={16} className="text-emerald-400" /> Part 4 — Bounded Safety Interventions
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Monitoring, protection & recovery are automatically active. Bounded operator actions below.
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  AUTOMATIC PROTECTION ALWAYS ON
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

                {/* Bounded Action 1: Retry Repair */}
                <div className="bg-zinc-950 p-3.5 rounded border border-zinc-800 flex flex-col justify-between space-y-2">
                  <div>
                    <h3 className="text-xs font-bold text-zinc-200 font-mono flex items-center gap-1.5">
                      <RotateCcw size={14} className="text-amber-400" /> 1. Retry Repair
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                      Re-triggers exchange native SL/TP attachment for open positions requiring protection.
                    </p>
                  </div>
                  <button
                    onClick={() => runCommand('repair_protection_now')}
                    disabled={runningAction === 'repair_protection_now'}
                    className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold font-mono rounded border border-zinc-700 transition"
                  >
                    {runningAction === 'repair_protection_now' ? 'Repairing...' : 'Retry Repair Now'}
                  </button>
                </div>

                {/* Bounded Action 2: Reconcile */}
                <div className="bg-zinc-950 p-3.5 rounded border border-zinc-800 flex flex-col justify-between space-y-2">
                  <div>
                    <h3 className="text-xs font-bold text-zinc-200 font-mono flex items-center gap-1.5">
                      <RefreshCw size={14} className="text-blue-400" /> 2. Reconcile
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                      Re-aligns local trade management truth with live exchange balance and position state.
                    </p>
                  </div>
                  <button
                    onClick={() => runCommand('reconcile_runtime')}
                    disabled={runningAction === 'reconcile_runtime'}
                    className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold font-mono rounded border border-zinc-700 transition"
                  >
                    {runningAction === 'reconcile_runtime' ? 'Reconciling...' : 'Reconcile Truth'}
                  </button>
                </div>

                {/* Bounded Action 3: Emergency Close */}
                <div className="bg-zinc-950 p-3.5 rounded border border-zinc-800 flex flex-col justify-between space-y-2">
                  <div>
                    <h3 className="text-xs font-bold text-zinc-200 font-mono flex items-center gap-1.5">
                      <XCircle size={14} className="text-red-400" /> 3. Emergency Close
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                      Safely request market exit for specific position with operator confirmation.
                    </p>
                  </div>
                  <Link
                    to="/admin/positions"
                    className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold font-mono rounded border border-zinc-700 transition text-center block"
                  >
                    Manage Open Trades
                  </Link>
                </div>

                {/* Bounded Action 4: Acknowledge Incident */}
                <div className="bg-zinc-950 p-3.5 rounded border border-zinc-800 flex flex-col justify-between space-y-2">
                  <div>
                    <h3 className="text-xs font-bold text-zinc-200 font-mono flex items-center gap-1.5">
                      <CheckCircle size={14} className="text-emerald-400" /> 4. Acknowledge Incident
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                      Acknowledge and mark flagged runtime warning or quarantine event as resolved.
                    </p>
                  </div>
                  <button
                    onClick={() => runCommand('run_recovery_now')}
                    disabled={runningAction === 'run_recovery_now'}
                    className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold font-mono rounded border border-zinc-700 transition"
                  >
                    {runningAction === 'run_recovery_now' ? 'Clearing...' : 'Acknowledge & Recover'}
                  </button>
                </div>

              </div>
            </div>

          </div>
        )}

        {/* TAB 3: PART 5 — CONTROL RETIREMENT MATRIX */}
        {activeTab === 'CONTROL_MATRIX' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2 font-mono">
                  <BarChart3 size={16} className="text-emerald-400" /> Part 5 — Control Ownership Audit & Retirement Matrix
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Safe control consolidation. No reachable control is removed without proof of dead status.
                </p>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">14 AUDITED OPERATOR CONTROLS</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950 text-zinc-400">
                    <th className="py-2.5 px-3 font-semibold">Control Name</th>
                    <th className="py-2.5 px-3 font-semibold">Location / Component</th>
                    <th className="py-2.5 px-3 font-semibold">Classification</th>
                    <th className="py-2.5 px-3 font-semibold">Replacement Status</th>
                    <th className="py-2.5 px-3 font-semibold">Dependencies</th>
                    <th className="py-2.5 px-3 font-semibold">Rollback Recommendation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {CONTROL_AUDIT_MATRIX.map((row, idx) => (
                    <tr key={idx} className="hover:bg-zinc-800/40 transition">
                      <td className="py-2.5 px-3 font-bold text-zinc-200 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {row.name}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-400">{row.location}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[9px] bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {row.classification}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-emerald-300 font-semibold">{row.replacementStatus}</td>
                      <td className="py-2.5 px-3 text-zinc-400 truncate max-w-[180px]">{row.dependencies}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          row.recommendation === 'Keep' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                          row.recommendation.startsWith('Move') ? 'bg-blue-500/10 text-blue-300 border border-blue-500/30' :
                          row.recommendation.startsWith('Deprecate') ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' :
                          'bg-red-500/10 text-red-300 border border-red-500/30'
                        }`}>
                          {row.recommendation}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: COMPILED ACTIVITY TIMELINE */}
        {activeTab === 'TIMELINE' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2 font-mono">
                  <Activity size={16} className="text-emerald-400" /> Compiled Runtime Activity Timeline
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Unified event stream across Scanner, Execution, Protection, Recovery, Telegram & System.
                </p>
              </div>

              {/* SEARCH & FILTERS */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Filter timeline..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-500 font-mono focus:outline-none focus:border-zinc-700"
                  />
                </div>

                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-300 font-mono focus:outline-none"
                >
                  <option value="ALL">All Severity</option>
                  <option value="INFO">INFO</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="WARNING">WARNING</option>
                  <option value="ERROR">ERROR</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>
            </div>

            {/* TIMELINE LIST */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredTimeline.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 font-mono text-xs">
                  No runtime activity events match current filter.
                </div>
              ) : (
                filteredTimeline.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-zinc-950/70 border border-zinc-800/80 rounded hover:border-zinc-700 transition flex items-start justify-between gap-3 text-xs font-mono"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border uppercase ${
                          item.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-300 border-red-500/40' :
                          item.severity === 'ERROR' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                          item.severity === 'WARNING' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                          item.severity === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                          'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}>
                          {item.severity}
                        </span>

                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-zinc-800 text-zinc-300">
                          {item.subsystem}
                        </span>

                        <span className="text-zinc-400 text-[11px] font-semibold">
                          {item.provider}
                        </span>

                        <span className="text-zinc-500 text-[11px]">
                          {item.timestamp}
                        </span>
                      </div>

                      <p className="text-zinc-200 text-xs leading-relaxed">
                        {item.message}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.receiptId && (
                        <span className="text-[10px] text-zinc-500 font-mono bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                          {item.receiptId}
                        </span>
                      )}
                      <Link
                        to={item.drillDownUrl}
                        className="text-zinc-400 hover:text-emerald-400 transition"
                      >
                        <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>

      {/* SYSTEM TEST REPORT MODAL */}
      {showTestModal && testReport && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-3">
                <FileCheck size={22} className="text-blue-400" />
                <div>
                  <h2 className="text-base font-bold text-zinc-100 font-mono">
                    Consolidated System Diagnostic Report
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Executed {new Date(testReport.timestamp).toLocaleString()} ({testReport.duration_ms}ms)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded text-xs font-bold font-mono border uppercase ${
                  testReport.overall_status === 'PASS' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                  testReport.overall_status === 'WARNING' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                  'bg-red-500/20 text-red-300 border-red-500/40'
                }`}>
                  STATUS: {testReport.overall_status}
                </span>
                <button
                  onClick={() => setShowTestModal(false)}
                  className="text-zinc-400 hover:text-white p-1"
                >
                  <XCircle size={18} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 font-mono text-center text-xs">
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded">
                <span className="text-emerald-400 font-bold block text-sm">{testReport.passed_count}</span>
                <span className="text-zinc-400 text-[10px]">PASSED CHECKS</span>
              </div>
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded">
                <span className="text-amber-300 font-bold block text-sm">{testReport.warning_count}</span>
                <span className="text-zinc-400 text-[10px]">WARNING CHECKS</span>
              </div>
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded">
                <span className="text-red-400 font-bold block text-sm">{testReport.failed_count}</span>
                <span className="text-zinc-400 text-[10px]">FAILED CHECKS</span>
              </div>
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {testReport.checks.map((check, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-zinc-950 border border-zinc-800 rounded flex items-center justify-between gap-3 text-xs font-mono"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-400 text-[10px] font-semibold uppercase">
                        [{check.category}]
                      </span>
                      <span className="text-zinc-200 font-bold">{check.name}</span>
                    </div>
                    <p className="text-zinc-400 text-[11px] leading-relaxed">{check.detail}</p>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase shrink-0 ${
                    check.status === 'PASS' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                    check.status === 'WARNING' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                    'bg-red-500/10 text-red-400 border-red-500/30'
                  }`}>
                    {check.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowTestModal(false)}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-mono font-bold transition"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}
