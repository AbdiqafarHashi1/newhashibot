import { useEffect, useState } from 'react';
import {
  Activity,
  Layers,
  Radio,
  Cpu,
  Target,
  Shield,
  CreditCard,
  ShieldCheck,
  Zap,
  Send,
  Newspaper,
  ClipboardList,
  CheckCircle,
  AlertTriangle,
  Users,
  RefreshCw,
} from 'lucide-react';
import { AdminLayout } from '../../../components/layout/AdminLayout';
import { useAuth } from '../../../contexts/AuthContext';
import { useAdminLiveState } from '../../../hooks/useAdminLiveState';
import { callEdgeFunction } from '../../../lib/edgeFunctionStatus';
import { ActionResult, OperatorActionResult } from '../../../components/admin/ActionResult';
import { loadOperatorTruth as fetchOperatorTruth, RuntimeRow } from '../../../lib/operatorTruth';

// Import design system tabs
import { ControlCenterTab } from './tabs/ControlCenterTab';
import { OperatingModesTab } from './tabs/OperatingModesTab';
import { ScannerOverviewTab } from './tabs/ScannerOverviewTab';
import { StrategyOverviewTab } from './tabs/StrategyOverviewTab';
import { ArbitratorTab } from './tabs/ArbitratorTab';
import { RiskCapitalTab } from './tabs/RiskCapitalTab';
import { ExecutionOverviewTab } from './tabs/ExecutionOverviewTab';
import { PositionsProtectionTab } from './tabs/PositionsProtectionTab';
import { ProviderHealthTab } from './tabs/ProviderHealthTab';
import { TelegramOverviewTab } from './tabs/TelegramOverviewTab';
import { IntelligenceTab } from './tabs/IntelligenceTab';
import { AuditOverviewTab } from './tabs/AuditOverviewTab';
import { RuntimeProofTab } from './tabs/RuntimeProofTab';
import { IncidentsTab } from './tabs/IncidentsTab';
import { CustomersTab } from './tabs/CustomersTab';

export type Section =
  | 'dashboard'
  | 'modes'
  | 'scanner'
  | 'strategies'
  | 'arbitrator'
  | 'risk'
  | 'executions'
  | 'trade-manager'
  | 'providers'
  | 'telegram'
  | 'intelligence'
  | 'audit'
  | 'runtime-proof'
  | 'incidents'
  | 'customers';

const navItems: Array<{ id: Section; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { id: 'dashboard', label: 'Command Center', icon: Activity },
  { id: 'modes', label: 'Operating Modes', icon: Layers },
  { id: 'scanner', label: 'Scanner Engine', icon: Radio },
  { id: 'strategies', label: 'Strategy Matrix', icon: Cpu },
  { id: 'arbitrator', label: 'Arbitrator Engine', icon: Target },
  { id: 'risk', label: 'Risk & Capital', icon: Shield },
  { id: 'executions', label: 'Execution Orders', icon: CreditCard },
  { id: 'trade-manager', label: 'Positions & Protection', icon: ShieldCheck },
  { id: 'providers', label: 'Provider Health', icon: Zap },
  { id: 'telegram', label: 'Telegram Gateway', icon: Send },
  { id: 'intelligence', label: 'News Brain', icon: Newspaper },
  { id: 'audit', label: 'Operator Audit', icon: ClipboardList },
  { id: 'runtime-proof', label: 'Runtime Proofs', icon: CheckCircle },
  { id: 'incidents', label: 'Incidents & Alarms', icon: AlertTriangle },
  { id: 'customers', label: 'Customers', icon: Users },
];

export default function OperatorPanel({ section: initialSection = 'dashboard' }: { section?: Section }) {
  const { session } = useAuth();
  const { refresh } = useAdminLiveState(session);
  const [activeTab, setActiveTab] = useState<Section>(initialSection);

  // Runtime telemetry state
  const [truthRows, setTruthRows] = useState<RuntimeRow[]>([]);
  const [heartbeats, setHeartbeats] = useState<RuntimeRow[]>([]);
  const [providerControls, setProviderControls] = useState<RuntimeRow[]>([]);
  const [scannerConfig, setScannerConfig] = useState<RuntimeRow | null>(null);
  const [signals, setSignals] = useState<RuntimeRow[]>([]);
  const [deliveries, setDeliveries] = useState<RuntimeRow[]>([]);
  const [operatorEvents, setOperatorEvents] = useState<RuntimeRow[]>([]);
  const [executionOrders, setExecutionOrders] = useState<RuntimeRow[]>([]);
  const [intelligenceEvents, setIntelligenceEvents] = useState<RuntimeRow[]>([]);
  const [runtimeProof, setRuntimeProof] = useState<RuntimeRow | null>(null);
  const [schedulerTruth, setSchedulerTruth] = useState<RuntimeRow[]>([]);
  const [quarantineRows, setQuarantineRows] = useState<RuntimeRow[]>([]);
  const [readinessRows, setReadinessRows] = useState<RuntimeRow[]>([]);
  const [customerSubscriptions, setCustomerSubscriptions] = useState<RuntimeRow[]>([]);

  // Action state
  const [actionResult, setActionResult] = useState<OperatorActionResult | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  async function loadOperatorTruth() {
    try {
      const bundle = await fetchOperatorTruth();
      setTruthRows(bundle.tradeTruth);
      setHeartbeats(bundle.heartbeats);
      setProviderControls(bundle.providerControls);
      setScannerConfig(bundle.scannerConfig);
      setSignals(bundle.signals);
      setDeliveries(bundle.telegramDeliveries);
      setOperatorEvents(bundle.runtimeEvents);
      setExecutionOrders(bundle.executionOrders);
      setIntelligenceEvents(bundle.intelligenceEvents);
      setRuntimeProof(bundle.runtimeProof);
      setSchedulerTruth(bundle.schedulerTruth);
      setQuarantineRows(bundle.quarantine);
      setReadinessRows(bundle.readiness);
      setCustomerSubscriptions(bundle.customerSubscriptions);
    } catch (err) {
      console.error('Failed loading operator truth bundle', err);
    }
  }

  useEffect(() => {
    void refresh();
    void loadOperatorTruth();
    const id = window.setInterval(() => {
      void refresh();
      void loadOperatorTruth();
    }, 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function runAction(action: string, provider?: string): Promise<OperatorActionResult | null> {
    if (!session?.access_token || runningAction === action) return null;
    const started = Date.now();
    const startedAt = new Date().toISOString();
    const route = '/functions/v1/admin-operator-action';
    const functionName = 'admin-operator-action';
    setRunningAction(action);

    const initialRes: OperatorActionResult = {
      status: 'RUNNING',
      action,
      provider,
      summary: 'Executing backend operator action...',
      timestamp: startedAt,
      startedAt,
      route,
      functionName,
    };
    setActionResult(initialRes);

    try {
      const timeout = action === 'run_scanner_now' ? 55000 : 30000;
      const result = await callEdgeFunction(functionName, { action, provider }, session.access_token, timeout);
      const data = result.data as Record<string, unknown> | null;
      const ok = result.ok && data && data.success === true && !data.exact_error;

      const res: OperatorActionResult = {
        status: ok ? 'SUCCESS' : 'FAILED',
        action,
        provider,
        summary: String(data?.result_summary ?? (ok ? 'Backend action completed.' : 'Backend action failed.')),
        timestamp: startedAt,
        startedAt: String(data?.started_at ?? startedAt),
        finishedAt: String(data?.finished_at ?? new Date().toISOString()),
        durationMs: Number(data?.duration_ms ?? Date.now() - started),
        runtimeEventId: data?.runtime_event_id ? String(data.runtime_event_id) : undefined,
        blocker: ok ? undefined : String(data?.blocker ?? data?.error_code ?? 'backend returned failure'),
        route: String(data?.route ?? route),
        functionName: String(data?.function_name ?? functionName),
        error: data?.exact_error ? String(data.exact_error) : (result.ok ? undefined : result.message),
        raw: data ?? result,
      };

      setActionResult(res);
      return res;
    } catch (e) {
      const error = e instanceof Error ? e.message : 'unknown error';
      const failRes: OperatorActionResult = {
        status: 'FAILED',
        action,
        provider,
        summary: 'Backend operator route failed.',
        timestamp: startedAt,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        blocker: 'ROUTE_OR_NETWORK_ERROR',
        route,
        functionName,
        error,
        raw: { expected_route: route, expected_function: functionName, error },
      };
      setActionResult(failRes);
      return failRes;
    } finally {
      setRunningAction(null);
      void refresh();
      void loadOperatorTruth();
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
        {/* Top Header & Horizontal Tab Navigation */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
            <div>
              <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                <Shield className="text-blue-400" size={24} /> HashiBot Operations Console
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Institutional control plane for live trading runtime, risk parameters, and exchange position management.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  void refresh();
                  void loadOperatorTruth();
                }}
                className="px-3.5 py-2 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-zinc-300 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw size={14} /> Refresh Telemetry
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-2 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/50'
                      : 'bg-zinc-900/60 text-zinc-400 border border-zinc-800/80 hover:bg-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <Icon size={14} className={isActive ? 'text-white' : 'text-zinc-500'} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Operator Action Result Banner */}
        {actionResult && <ActionResult result={actionResult} />}

        {/* Tab Content Renderer */}
        <div className="pt-2">
          {activeTab === 'dashboard' && (
            <ControlCenterTab
              scannerConfig={scannerConfig}
              heartbeats={heartbeats}
              providerControls={providerControls}
              operatorEvents={operatorEvents}
              executionOrders={executionOrders}
              signals={signals}
              tradeTruth={truthRows}
              onRunAction={runAction}
              runningAction={runningAction}
            />
          )}

          {activeTab === 'modes' && (
            <OperatingModesTab
              scannerConfig={scannerConfig}
              providerControls={providerControls}
              readinessRows={readinessRows}
              onRunAction={runAction}
              runningAction={runningAction}
            />
          )}

          {activeTab === 'scanner' && (
            <ScannerOverviewTab
              candidates={signals}
              rejectedSetups={[]}
              onRunAction={runAction}
              runningAction={runningAction}
            />
          )}

          {activeTab === 'strategies' && <StrategyOverviewTab />}

          {activeTab === 'arbitrator' && <ArbitratorTab signals={signals} />}

          {activeTab === 'risk' && <RiskCapitalTab quarantineRows={quarantineRows} tradeTruth={truthRows} />}

          {activeTab === 'executions' && (
            <ExecutionOverviewTab
              executionOrders={executionOrders}
              onRunAction={runAction}
              runningAction={runningAction}
            />
          )}

          {activeTab === 'trade-manager' && (
            <PositionsProtectionTab
              tradeTruth={truthRows}
              onRunAction={runAction}
              runningAction={runningAction}
            />
          )}

          {activeTab === 'providers' && (
            <ProviderHealthTab
              providerControls={providerControls}
              heartbeats={heartbeats}
              onRunAction={runAction}
              runningAction={runningAction}
            />
          )}

          {activeTab === 'telegram' && (
            <TelegramOverviewTab
              deliveries={deliveries}
              onRunAction={runAction}
              runningAction={runningAction}
            />
          )}

          {activeTab === 'intelligence' && (
            <IntelligenceTab
              intelligenceEvents={intelligenceEvents}
              onRunAction={runAction}
              runningAction={runningAction}
            />
          )}

          {activeTab === 'audit' && <AuditOverviewTab operatorEvents={operatorEvents} />}

          {activeTab === 'runtime-proof' && (
            <RuntimeProofTab
              runtimeProof={runtimeProof}
              schedulerTruth={schedulerTruth}
              onRunAction={runAction}
              runningAction={runningAction}
            />
          )}

          {activeTab === 'incidents' && (
            <IncidentsTab
              tradeTruth={truthRows}
              providerControls={providerControls}
              onRunAction={runAction}
            />
          )}

          {activeTab === 'customers' && <CustomersTab customers={customerSubscriptions} />}
        </div>
      </div>
    </AdminLayout>
  );
}
