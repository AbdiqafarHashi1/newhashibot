import { isOwnerPreview } from '../../lib/ownerPreview/state';
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
    if ((!isOwnerPreview() && !session?.access_token) || runningAction === action) return;

    const highRisk = ['emergency_stop_runtime', 'start_hashibot', 'resume_bot', 'run_recovery_now'].includes(action);
    if (!isOwnerPreview() && highRisk && !window.confirm(`Confirm the critical operator action: '${action.toUpperCase()}'. This creates one immutable operator audit record.`)) return;

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
      let token = session?.access_token ?? null;
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
                  ACCOUNT LIFECYCLE CONTROLS
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
                <span className="text-[10px] text-zinc-500 font-mono">{isOwnerPreview() ? "Illustrative fixture projections • no verified runtime truth" : "Zero Decorative Widgets • 100% Verified Truth"}</span>
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
                      {!mt5PersonalControl ? 'NOT CONFIGURED' : mt5Pe…9142 tokens truncated…      )}
            {liveData.unrealized_pnl != null && (
              <span>Unrealized: <span className={`font-medium ${liveData.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{usd(liveData.unrealized_pnl)}</span></span>
            )}
            {liveData.last_sync && (
              <span className="hidden sm:inline">Synced: <span className="text-zinc-400">{new Date(liveData.last_sync).toLocaleTimeString()}</span></span>
            )}
          </div>
        )}
      </div>

      {trades.length === 0 ? (
        <div className="px-4 py-6 text-center text-zinc-600 text-xs">No open Bybit positions right now.</div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-zinc-800/60">
            {trades.map(t => {
              const pnl = t.latest_unrealized_pnl ?? 0;
              const isLong = t.direction === 'long';
              return (
                <div key={t.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isLong
                        ? <TrendingUp size={12} className="text-emerald-400" />
                        : <TrendingDown size={12} className="text-red-400" />}
                      <span className="text-sm font-bold text-zinc-100">{t.symbol}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${isLong ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {t.direction}
                      </span>
                    </div>
                    <span className={`text-sm font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{usd(pnl)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-xs">
                    <div><span className="text-zinc-600">Entry</span><br /><span className="text-zinc-300">{t.entry_price?.toFixed(2) ?? '—'}</span></div>
                    <div><span className="text-zinc-600">Mark</span><br /><span className="text-zinc-300">{(t.latest_mark_price ?? t.current_price)?.toFixed(2) ?? '—'}</span></div>
                    <div><span className="text-zinc-600">SL</span><br /><span className="text-red-400">{t.stop_loss?.toFixed(2) ?? '—'}</span></div>
                    <div><span className="text-zinc-600">TP1</span><br /><span className="text-emerald-400">{t.tp1?.toFixed(2) ?? '—'}</span></div>
                    <div><span className="text-zinc-600">Qty</span><br /><span className="text-zinc-300">{t.quantity ?? '—'}</span></div>
                    <div><span className="text-zinc-600">Age</span><br /><span className="text-zinc-400 flex items-center gap-1"><Clock size={9} />{tradeAge(t.opened_at)}</span></div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className={`px-1.5 py-0.5 rounded border ${
                      t.protection_status === 'protected' || t.protection_status === 'protected_native' || t.protection_status === 'protected_managed'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                    }`}>
                      {t.protection_status ?? 'unprotected'}
                    </span>
                    <span className="text-zinc-600">{t.status}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                  <th className="px-4 py-2 font-medium">Symbol</th>
                  <th className="px-2 py-2 font-medium">Dir</th>
                  <th className="px-2 py-2 font-medium">Entry</th>
                  <th className="px-2 py-2 font-medium">Mark</th>
                  <th className="px-2 py-2 font-medium">SL</th>
                  <th className="px-2 py-2 font-medium">TP1</th>
                  <th className="px-2 py-2 font-medium">Qty</th>
                  <th className="px-2 py-2 font-medium">Unrealized</th>
                  <th className="px-2 py-2 font-medium">Protection</th>
                  <th className="px-2 py-2 font-medium">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {trades.map(t => {
                  const pnl = t.latest_unrealized_pnl ?? 0;
                  const isLong = t.direction === 'long';
                  const isProtected = ['protected', 'protected_native', 'protected_managed'].includes(t.protection_status ?? '');
                  return (
                    <tr key={t.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-2.5 font-bold text-zinc-100">{t.symbol}</td>
                      <td className="px-2 py-2.5">
                        <span className={`flex items-center gap-1 font-bold ${isLong ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isLong ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {t.direction?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-zinc-300">{t.entry_price?.toFixed(2) ?? '—'}</td>
                      <td className="px-2 py-2.5 text-zinc-300">{(t.latest_mark_price ?? t.current_price)?.toFixed(2) ?? '—'}</td>
                      <td className="px-2 py-2.5 text-red-400">{t.stop_loss?.toFixed(2) ?? '—'}</td>
                      <td className="px-2 py-2.5 text-emerald-400">{t.tp1?.toFixed(2) ?? '—'}</td>
                      <td className="px-2 py-2.5 text-zinc-400">{t.quantity ?? '—'}</td>
                      <td className={`px-2 py-2.5 font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{usd(pnl)}</td>
                      <td className="px-2 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isProtected
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                        }`}>
                          {isProtected ? 'protected' : (t.protection_status ?? 'unprotected')}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-zinc-500 flex items-center gap-1">
                        <Clock size={9} /> {tradeAge(t.opened_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {trades.length > 0 && (
            <div className="px-4 py-2.5 border-t border-zinc-800 flex items-center justify-between">
              <span className="text-xs text-zinc-600">{trades.length} position{trades.length !== 1 ? 's' : ''} open</span>
              <span className={`text-xs font-bold ${totalUnrealized >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                Total unrealized: {usd(totalUnrealized)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Prop Account types ────────────────────────────────────────
interface PropAccount {
  id: string;
  label: string;
  firm_name: string;
  account_type: 'challenge' | 'funded' | 'evaluation';
  status: 'active' | 'passed' | 'failed' | 'paused' | 'pending';
  account_size_usd: number;
  current_balance_usd: number | null;
  peak_balance_usd: number | null;
  starting_balance_usd: number | null;
  unrealized_pnl_usd: number;
  profit_target_pct: number;
  max_daily_loss_pct: number;
  max_total_drawdown_pct: number;
  trailing_drawdown_pct: number | null;
  max_open_positions: number;
  max_leverage: number;
  governor_state: 'normal' | 'defensive' | 'paused' | 'locked';
  prop_readiness_score: number;
  prop_readiness_tier: 'green' | 'yellow' | 'red';
  trading_days_completed: number;
  min_trading_days: number;
  notes: string | null;
  created_at: string;
  challenge_passed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  is_archived: boolean;
  news_trading_allowed: boolean;
  weekend_holding_allowed: boolean;
}

interface DailySession {
  id: string;
  account_id: string;
  session_date: string;
  opening_balance_usd: number;
  daily_loss_limit_usd: number;
  realized_pnl_usd: number;
  unrealized_pnl_usd: number;
  total_pnl_usd: number;
  trades_taken: number;
  trades_won: number;
  trades_lost: number;
  win_rate: number;
  daily_limit_breached: boolean;
  session_locked: boolean;
}

// ── Helper utils ──────────────────────────────────────────────
function pct(value: number | null | undefined, fallback = '—'): string {
  if (value == null) return fallback;
  return `${(value * 100).toFixed(1)}%`;
}

function usd(value: number | null | undefined, fallback = '—'): string {
  if (value == null) return fallback;
  const sign = value >= 0 ? '' : '-';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tierColor(tier: 'green' | 'yellow' | 'red' | string): string {
  if (tier === 'green') return 'text-emerald-400';
  if (tier === 'yellow') return 'text-yellow-400';
  return 'text-red-400';
}

function tierBg(tier: 'green' | 'yellow' | 'red' | string): string {
  if (tier === 'green') return 'border-emerald-500/30 bg-emerald-500/10';
  if (tier === 'yellow') return 'border-yellow-500/30 bg-yellow-500/10';
  return 'border-red-500/30 bg-red-500/10';
}

function statusBadge(status: string): string {
  if (status === 'active') return 'border-blue-500/30 bg-blue-500/10 text-blue-300';
  if (status === 'passed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-300';
  if (status === 'paused') return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300';
  return 'border-zinc-700 bg-zinc-900 text-zinc-400';
}

function govColor(state: string): string {
  if (state === 'normal') return 'text-emerald-400';
  if (state === 'defensive') return 'text-yellow-400';
  return 'text-red-400';
}

// ── Sub-components ────────────────────────────────────────────
function StatChip({ label, value, tone = 'zinc' }: { label: string; value: string | number; tone?: 'zinc' | 'green' | 'red' | 'yellow' | 'blue' }) {
  const colors = {
    zinc: 'border-zinc-800 bg-zinc-900/60 text-zinc-100',
    green: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
    red: 'border-red-500/20 bg-red-500/10 text-red-200',
    yellow: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-200',
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-200',
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[tone]}`}>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
      <div className="text-base font-bold leading-tight">{value}</div>
    </div>
  );
}

function DrawdownBar({ usedPct, label, color }: { usedPct: number; label: string; color: string }) {
  const clamped = Math.min(100, Math.max(0, usedPct * 100));
  const barColor = clamped >= 90 ? 'bg-red-500' : clamped >= 70 ? 'bg-yellow-500' : 'bg-emerald-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className={color}>{clamped.toFixed(1)}% used</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

function ReadinessGauge({ score, tier }: { score: number; tier: 'green' | 'yellow' | 'red' }) {
  const color = tier === 'green' ? '#10b981' : tier === 'yellow' ? '#f59e0b' : '#ef4444';
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="#27272a" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x="48" y="48" textAnchor="middle" dominantBaseline="central" fill={color} fontSize="18" fontWeight="bold">{score}</text>
      </svg>
      <span className={`text-xs font-bold uppercase tracking-wider ${tierColor(tier)}`}>{tier.toUpperCase()}</span>
    </div>
  );
}

// ── Account Form (create / edit) ──────────────────────────────
const DEFAULT_FORM: Partial<PropAccount> = {
  label: '',
  firm_name: 'bybit_prop',
  account_type: 'challenge',
  status: 'active',
  account_size_usd: 10000,
  profit_target_pct: 0.1,
  max_daily_loss_pct: 0.05,
  max_total_drawdown_pct: 0.10,
  trailing_drawdown_pct: null,
  max_open_positions: 5,
  max_leverage: 10,
  news_trading_allowed: true,
  weekend_holding_allowed: true,
  governor_state: 'normal',
  notes: '',
};

function AccountForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: Partial<PropAccount>;
  onSave: (data: Partial<PropAccount>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Partial<PropAccount>>({ ...DEFAULT_FORM, ...initial });
  const set = (k: keyof PropAccount, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Account Label *</label>
          <input className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={form.label ?? ''} onChange={e => set('label', e.target.value)} placeholder="e.g. FTMO $10K Challenge" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Firm</label>
          <select className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={form.firm_name ?? 'bybit_prop'} onChange={e => set('firm_name', e.target.value)}>
            <option value="crypto_fund_trader">Crypto Fund Trader (CFT)</option>
            <option value="hyrotrader">HyroTrader (Crypto Prop)</option>
            <option value="bybit_prop">Bybit Prop</option>
            <option value="ftmo">FTMO</option>
            <option value="fundednext">FundedNext</option>
            <option value="the5ers">The5ers</option>
            <option value="myfundedfx">MyFundedFX</option>
            <option value="topstep">TopStep</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Account Type</label>
          <select className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={form.account_type ?? 'challenge'} onChange={e => set('account_type', e.target.value as PropAccount['account_type'])}>
            <option value="challenge">Challenge</option>
            <option value="evaluation">Evaluation</option>
            <option value="funded">Funded</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Account Size (USD)</label>
          <input type="number" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={form.account_size_usd ?? 10000} onChange={e => set('account_size_usd', Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Profit Target %</label>
          <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={(form.profit_target_pct ?? 0.1) * 100} onChange={e => set('profit_target_pct', Number(e.target.value) / 100)} placeholder="10" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Max Daily Loss %</label>
          <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={(form.max_daily_loss_pct ?? 0.05) * 100} onChange={e => set('max_daily_loss_pct', Number(e.target.value) / 100)} placeholder="5" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Max Total Drawdown %</label>
          <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={(form.max_total_drawdown_pct ?? 0.1) * 100} onChange={e => set('max_total_drawdown_pct', Number(e.target.value) / 100)} placeholder="10" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Trailing DD % (blank = fixed)</label>
          <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={form.trailing_drawdown_pct != null ? form.trailing_drawdown_pct * 100 : ''}
            onChange={e => set('trailing_drawdown_pct', e.target.value === '' ? null : Number(e.target.value) / 100)}
            placeholder="Leave blank for fixed DD" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Max Open Positions</label>
          <input type="number" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={form.max_open_positions ?? 5} onChange={e => set('max_open_positions', Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Max Leverage</label>
          <input type="number" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={form.max_leverage ?? 10} onChange={e => set('max_leverage', Number(e.target.value))} />
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 rounded accent-blue-500"
            checked={form.news_trading_allowed ?? true} onChange={e => set('news_trading_allowed', e.target.checked)} />
          News trading allowed
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 rounded accent-blue-500"
            checked={form.weekend_holding_allowed ?? true} onChange={e => set('weekend_holding_allowed', e.target.checked)} />
          Weekend holding allowed
        </label>
      </div>
      <div>
        <label className="text-xs text-zinc-500 block mb-1">Notes</label>
        <textarea rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 resize-none"
          value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} placeholder="Optional notes..." />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
          Cancel
        </button>
        <button onClick={() => onSave(form)} disabled={saving || !form.label?.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors">
          {saving ? 'Saving...' : 'Save Account'}
        </button>
      </div>
    </div>
  );
}

// ── Account Card ──────────────────────────────────────────────
function AccountCard({
  account,
  session,
  expanded,
  onToggle,
  onEdit,
  onGovernorChange,
}: {
  account: PropAccount;
  session: DailySession | null;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onGovernorChange: (id: string, state: PropAccount['governor_state']) => void;
}) {
  const balance = account.current_balance_usd ?? account.account_size_usd;
  const peak = account.peak_balance_usd ?? balance;
  const starting = account.starting_balance_usd ?? account.account_size_usd;
  const equity = balance + (account.unrealized_pnl_usd ?? 0);

  const totalDdPct = (peak - equity) / account.account_size_usd;
  const ddUsedRatio = totalDdPct / account.max_total_drawdown_pct;

  const gained = (balance - starting) / account.account_size_usd;
  const targetProgress = gained / account.profit_target_pct;

  const dailyLossLimit = (session?.opening_balance_usd ?? balance) * account.max_daily_loss_pct;
  const dailyLossUsed = session ? -(session.realized_pnl_usd) : 0;
  const dailyLossRatio = dailyLossLimit > 0 ? dailyLossUsed / dailyLossLimit : 0;

  const score = account.prop_readiness_score ?? 100;
  const tier = account.prop_readiness_tier ?? 'green';

  return (
    <div className={`rounded-2xl border bg-zinc-900/70 shadow-lg shadow-black/10 overflow-hidden ${tierBg(tier)}`}>
      {/* Header */}
      <button onClick={onToggle} className="w-full text-left p-4 flex items-start gap-3 hover:bg-white/5 transition-colors">
        <div className="shrink-0 mt-0.5">
          <ReadinessGauge score={score} tier={tier} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-zinc-100 truncate">{account.label}</h3>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusBadge(account.status)}`}>
              {account.status}
            </span>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-zinc-700 bg-zinc-800 text-zinc-400`}>
              {account.account_type}
            </span>
          </div>
          <div className="text-xs text-zinc-500 mb-2">{account.firm_name} · {usd(account.account_size_usd)} account</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <div className="text-[10px] text-zinc-600">Balance</div>
              <div className="text-sm font-semibold text-zinc-200">{usd(balance)}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600">P&L Progress</div>
              <div className={`text-sm font-semibold ${gained >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {pct(gained)} {targetProgress >= 1 ? '✓' : `/ ${pct(account.profit_target_pct)} target`}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600">Total DD</div>
              <div className={`text-sm font-semibold ${ddUsedRatio >= 0.8 ? 'text-red-400' : ddUsedRatio >= 0.5 ? 'text-yellow-400' : 'text-zinc-300'}`}>
                {pct(totalDdPct)} / {pct(account.max_total_drawdown_pct)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600">Governor</div>
              <div className={`text-sm font-semibold capitalize ${govColor(account.governor_state)}`}>
                {account.governor_state}
              </div>
            </div>
          </div>
        </div>
        <div className="shrink-0 text-zinc-600">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-zinc-800/60 pt-4 space-y-4">
          {/* Drawdown bars */}
          <div className="space-y-2">
            <DrawdownBar usedPct={ddUsedRatio} label="Total drawdown" color={ddUsedRatio >= 0.8 ? 'text-red-400' : 'text-zinc-400'} />
            <DrawdownBar usedPct={dailyLossRatio} label={`Daily loss (limit: ${usd(dailyLossLimit)})`} color={dailyLossRatio >= 0.8 ? 'text-red-400' : 'text-zinc-400'} />
            <DrawdownBar usedPct={Math.max(0, targetProgress)} label={`Challenge progress (target: ${pct(account.profit_target_pct)})`} color="text-emerald-400" />
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatChip label="Unrealized PnL" value={usd(account.unrealized_pnl_usd)}
              tone={account.unrealized_pnl_usd > 0 ? 'green' : account.unrealized_pnl_usd < 0 ? 'red' : 'zinc'} />
            <StatChip label="Today Realized" value={usd(session?.realized_pnl_usd ?? null)}
              tone={(session?.realized_pnl_usd ?? 0) >= 0 ? 'green' : 'red'} />
            <StatChip label="Today Trades" value={session?.trades_taken ?? '—'} />
            <StatChip label="Today Win Rate" value={session ? pct(session.win_rate) : '—'}
              tone={(session?.win_rate ?? 0) >= 0.6 ? 'green' : (session?.win_rate ?? 0) >= 0.4 ? 'yellow' : 'red'} />
          </div>

          {/* Rules */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-zinc-600 mb-0.5">Max positions</div>
              <div className="text-zinc-200 font-medium">{account.max_open_positions}</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-zinc-600 mb-0.5">Max leverage</div>
              <div className="text-zinc-200 font-medium">{account.max_leverage}x</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-zinc-600 mb-0.5">Trailing DD</div>
              <div className="text-zinc-200 font-medium">
                {account.trailing_drawdown_pct != null ? pct(account.trailing_drawdown_pct) : 'Fixed'}
              </div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-zinc-600 mb-0.5">Trading days</div>
              <div className="text-zinc-200 font-medium">{account.trading_days_completed} / {account.min_trading_days} min</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-zinc-600 mb-0.5">News trading</div>
              <div className={account.news_trading_allowed ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                {account.news_trading_allowed ? 'Allowed' : 'Blocked'}
              </div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-zinc-600 mb-0.5">Weekend hold</div>
              <div className={account.weekend_holding_allowed ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                {account.weekend_holding_allowed ? 'Allowed' : 'Blocked'}
              </div>
            </div>
          </div>

          {/* Governor controls */}
          <div>
            <div className="text-xs text-zinc-500 mb-2">Governor state</div>
            <div className="flex flex-wrap gap-2">
              {(['normal', 'defensive', 'paused', 'locked'] as const).map(state => (
                <button key={state}
                  onClick={() => onGovernorChange(account.id, state)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
                    account.governor_state === state
                      ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700'
                  }`}>
                  {state === 'normal' && <PlayCircle size={10} className="inline mr-1" />}
                  {state === 'defensive' && <Shield size={10} className="inline mr-1" />}
                  {state === 'paused' && <PauseCircle size={10} className="inline mr-1" />}
                  {state === 'locked' && <Lock size={10} className="inline mr-1" />}
                  {state}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors border border-zinc-700">
              <Edit3 size={11} /> Edit Rules
            </button>
          </div>

          {account.failure_reason && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-300">
              <XCircle size={11} className="inline mr-1" />
              Failure reason: {account.failure_reason}
            </div>
          )}
          {account.notes && (
            <div className="bg-zinc-800/40 rounded-lg px-3 py-2 text-xs text-zinc-500 italic">
              <Info size={11} className="inline mr-1" />{account.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function PropTradingPanel() {
  const [accounts, setAccounts] = useState<PropAccount[]>([]);
  const [sessions, setSessions] = useState<Record<string, DailySession>>({});
  const [bybitTrades, setBybitTrades] = useState<BybitTrade[]>([]);
  const [bybitLive, setBybitLive] = useState<BybitLiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PropAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Parallel: prop accounts + live bybit trades + execution settings
    const [accountsRes, tradesRes, settingsRes] = await Promise.all([
      supabase
        .from('bybit_prop_accounts')
        .select('*')
        .eq('is_archived', showArchived ? undefined! : false)
        .order('created_at', { ascending: false }),
      supabase
        .from('execution_orders')
        .select('id,symbol,direction,status,entry_price,current_price,latest_mark_price,stop_loss,tp1,tp2,quantity,leverage,latest_unrealized_pnl,protection_status,opened_at,created_at')
        .in('status', ACTIVE_STATUSES)
        .or('provider.eq.bybit,execution_provider.eq.bybit'),
      supabase
        .from('execution_settings')
        .select('bybit_latest_monitor_result,bybit_latest_successful_sync_at')
        .limit(1)
        .maybeSingle(),
    ]);

    if (accountsRes.error) { setError(accountsRes.error.message); setLoading(false); return; }
    setAccounts((accountsRes.data ?? []) as PropAccount[]);
    setBybitTrades((tradesRes.data ?? []) as BybitTrade[]);

    // Extract live balance data from bybit monitor result
    const monRes = settingsRes.data?.bybit_latest_monitor_result as Record<string, unknown> | null;
    if (monRes) {
      setBybitLive({
        wallet_balance: (monRes.wallet_balance as number) ?? null,
        equity: (monRes.equity as number) ?? null,
        unrealized_pnl: (monRes.unrealized_pnl as number) ?? null,
        available_balance: (monRes.available_balance as number) ?? null,
        bybit_positions_count: (monRes.bybit_positions_count as number) ?? null,
        bybit_open_orders_count: (monRes.bybit_open_orders_count as number) ?? null,
        last_sync: settingsRes.data?.bybit_latest_successful_sync_at ?? null,
      });
    }

    // Fetch today's sessions for prop accounts
    const ids = (accountsRes.data ?? []).map((a: PropAccount) => a.id);
    if (ids.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: sess } = await supabase
        .from('prop_daily_sessions')
        .select('*')
        .in('account_id', ids)
        .eq('session_date', today);
      const sessionMap: Record<string, DailySession> = {};
      (sess ?? []).forEach((s: DailySession) => { sessionMap[s.account_id] = s; });
      setSessions(sessionMap);
    }

    setLoading(false);
  }, [showArchived]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const activeAccounts = accounts.filter(a => !a.is_archived || showArchived);
  const liveUnrealized = bybitLive?.unrealized_pnl ?? bybitTrades.reduce((s, t) => s + (t.latest_unrealized_pnl ?? 0), 0);
  const totalBalance = bybitLive?.wallet_balance ?? activeAccounts.reduce((s, a) => s + (a.current_balance_usd ?? a.account_size_usd), 0);
  const greenCount = activeAccounts.filter(a => a.prop_readiness_tier === 'green').length;
  const redCount = activeAccounts.filter(a => a.prop_readiness_tier === 'red').length;

  async function handleSave(form: Partial<PropAccount>) {
    setSaving(true);
    setFormError(null);
    const payload = {
      label: form.label?.trim(),
      firm_name: form.firm_name,
      account_type: form.account_type,
      status: form.status ?? 'active',
      account_size_usd: form.account_size_usd,
      profit_target_pct: form.profit_target_pct,
      max_daily_loss_pct: form.max_daily_loss_pct,
      max_total_drawdown_pct: form.max_total_drawdown_pct,
      trailing_drawdown_pct: form.trailing_drawdown_pct,
      max_open_positions: form.max_open_positions,
      max_leverage: form.max_leverage,
      news_trading_allowed: form.news_trading_allowed,
      weekend_holding_allowed: form.weekend_holding_allowed,
      notes: form.notes || null,
      governor_state: form.governor_state ?? 'normal',
      starting_balance_usd: editingAccount ? undefined : form.account_size_usd,
      current_balance_usd: editingAccount ? undefined : form.account_size_usd,
      peak_balance_usd: editingAccount ? undefined : form.account_size_usd,
    };

    let err: { message: string } | null = null;
    if (editingAccount) {
      const res = await supabase.from('bybit_prop_accounts').update(payload).eq('id', editingAccount.id);
      err = res.error;
    } else {
      const res = await supabase.from('bybit_prop_accounts').insert(payload);
      err = res.error;
    }

    if (err) { setFormError(err.message); setSaving(false); return; }
    setShowForm(false);
    setEditingAccount(null);
    await fetchAll();
    setSaving(false);
  }

  async function handleGovernorChange(id: string, state: PropAccount['governor_state']) {
    await supabase.from('bybit_prop_accounts').update({ governor_state: state }).eq('id', id);
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, governor_state: state } : a));
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <><p className="mb-4 rounded border border-amber-700 p-3 text-sm text-amber-200">Historical Prop research only. Customer Prop execution currently supports MT5 demo accounts through account certification; research rows do not enable Bybit Prop execution.</p><ProfessionalPropWorkspace /></>
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              <Target size={20} className="text-blue-400" />
              Prop Trading Framework
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">Bybit prop accounts · challenge pass · capital preservation</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowArchived(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${showArchived ? 'bg-zinc-700 border-zinc-600 text-zinc-200' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-200'}`}>
              {showArchived ? 'Hide archived' : 'Show archived'}
            </button>
            <button onClick={fetchAll} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50">
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button onClick={() => { setEditingAccount(null); setShowForm(true); setFormError(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors">
              <Plus size={11} /> Add Account
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatChip label="Open Positions" value={bybitTrades.length} tone={bybitTrades.length > 0 ? 'blue' : 'zinc'} />
          <StatChip label="Live Balance" value={usd(totalBalance)} tone="blue" />
          <StatChip label="Unrealized PnL" value={usd(liveUnrealized)}
            tone={liveUnrealized > 0 ? 'green' : liveUnrealized < 0 ? 'red' : 'zinc'} />
          <StatChip label="Prop Accounts" value={`${activeAccounts.length} · ${greenCount}G ${redCount}R`}
            tone={redCount > 0 ? 'red' : 'green'} />
        </div>

        {/* Live Bybit positions — always shown */}
        <LiveBybitTrades trades={bybitTrades} liveData={bybitLive} />

        {/* Form */}
        {showForm && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl">
            <h2 className="text-sm font-bold text-zinc-100 mb-4 flex items-center gap-2">
              <Edit3 size={14} className="text-blue-400" />
              {editingAccount ? `Edit: ${editingAccount.label}` : 'New Prop Account'}
            </h2>
            {formError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-xs px-3 py-2 rounded-lg mb-4">{formError}</div>
            )}
            <AccountForm
              initial={editingAccount ?? {}}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingAccount(null); }}
              saving={saving}
            />
          </div>
        )}

        {/* Errors */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {/* Accounts list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeAccounts.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Target size={32} className="text-zinc-700 mx-auto" />
            <p className="text-zinc-500 text-sm">No prop accounts yet.</p>
            <p className="text-zinc-600 text-xs">Add your first Bybit prop account to get started.</p>
            <button onClick={() => { setEditingAccount(null); setShowForm(true); }}
              className="mt-2 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Plus size={14} /> Add Account
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {activeAccounts.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                session={sessions[account.id] ?? null}
                expanded={expandedId === account.id}
                onToggle={() => setExpandedId(v => v === account.id ? null : account.id)}
                onEdit={() => { setEditingAccount(account); setShowForm(true); setFormError(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                onGovernorChange={handleGovernorChange}
              />
            ))}
          </div>
        )}

        {/* Info panel */}
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4 space-y-2">
          <h3 className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
            <Zap size={11} className="text-blue-400" /> Strategy & Signal Competition
          </h3>
          <div className="text-xs text-zinc-600 space-y-1.5">
            <p>Signals are ranked by the Arbitrator (<code className="text-zinc-400">calculateOpportunityRankScore</code>) — only the highest-scoring A1/A2 signals are approved for prop accounts.</p>
            <p>When a symbol is already in a strong trend and the score is A-tier, <strong className="text-zinc-400">Scalp 1% mode</strong> is recommended: TP1 = 1%, SL = 0.5% (2:1 R/R). This maximises win-rate for funded account longevity.</p>
            <p>Governor switches to <strong className="text-zinc-400">Defensive</strong> automatically when drawdown exceeds 50% of max, or daily loss exceeds 60% of limit. All trades switch to scalp mode.</p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
