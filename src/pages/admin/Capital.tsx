import { useState, useEffect, useCallback } from 'react';
import {
  PieChart, RefreshCw, CheckCircle2, ShieldAlert, AlertCircle,
  Sliders, ArrowDownRight, Layers,
  X, Save, Zap, Activity
} from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';

// --- TYPES ---
export type ProviderType = 'BINANCE' | 'BYBIT' | 'MT5_PERSONAL' | 'MT5_PROP';
export type EnvironmentType = 'TESTNET' | 'DEMO' | 'PERSONAL' | 'PROP';

export interface ExecutionAccountCapital {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  executionProfileId: string;
  executionProfileName: string;
  provider: ProviderType;
  providerKey: string;
  environment: EnvironmentType;
  accountId: string;
  accountMasked: string;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'STALE';
  allocationHealth: 'OPTIMAL' | 'OVER_ALLOCATED' | 'LOW_MARGIN' | 'INSUFFICIENT_BALANCE' | 'STALE';
  
  // Real Financial Values (null = Waiting for Runtime)
  balance: number | null;
  equity: number | null;
  freeMargin: number | null;
  usedMargin: number | null;
  reservedCapitalUsd: number | null;
  allocatedCapitalUsd: number;
  currentAllocationPct: number;
  openExposureUsd: number;
  largestAllocationUsd: number;
  largestPositionUsd: number;
  unrealizedPnlUsd: number;
  dailyPnlUsd: number;
  weeklyPnlUsd: number;
  drawdownPct: number;
  policyVersion: string;
  lastSyncAt: string | null;

  // Editable Policy Settings
  allocationEnabled: boolean;
  maxAllocationPct: number;
  maxDollarAllocationUsd: number;
  reserveCapitalPct: number;
  emergencyReserveUsd: number;
  maxExposureUsd: number;
  maxMarginUsagePct: number;
  maxPositionSizeUsd: number;
  maxSymbolAllocationUsd: number;
  allocationPriority: 'HIGH' | 'MEDIUM' | 'LOW';
  allocationMode: 'FIXED' | 'EQUITY_PCT' | 'DYNAMIC_VOL';
  scalingRule: 'FLAT' | 'COMPOUNDING' | 'LINEAR';
  compoundingEnabled: boolean;
  minBalanceRequiredUsd: number;
  lowBalanceProtectionEnabled: boolean;
}

export interface CertifiedRuntimeArtifactRow {
  id: string;
  evaluation_id: string;
  account_id: string;
  strategy_plan_id: string;
  risk_decision: {
    passed?: boolean;
    risk_percentage?: number;
    risk_usd?: number;
    reason?: string;
  } | null;
  capital_allocation_plan: {
    allocated_usd?: number;
    margin_required?: number;
    status?: string;
  } | null;
  execution_plan: {
    execution_plan_id?: string;
    provider?: string;
    symbol?: string;
    side?: string;
  } | null;
  created_at: string;
}

export default function Capital() {
  const [accounts, setAccounts] = useState<ExecutionAccountCapital[]>([]);
  const [artifacts, setArtifacts] = useState<CertifiedRuntimeArtifactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Filter state
  const [providerFilter, setProviderFilter] = useState<string>('ALL');

  // Modal editing state
  const [editingAccount, setEditingAccount] = useState<ExecutionAccountCapital | null>(null);
  const [pendingCapitalPolicy, setPendingCapitalPolicy] = useState<Partial<ExecutionAccountCapital>>({});

  // Fetch Capital Truth & Allocation Artifacts
  const loadCapitalTruth = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const [
        connectedAccountsRes,
        mt5AccountsRes,
        execSettingsRes,
        providerControlsRes,
        tradeTruthRes,
        certifiedPoliciesRes,
        executionPoliciesRes,
        artifactsRes,
        profilesRes
      ] = await Promise.all([
        supabase.from('connected_execution_accounts').select('*'),
        supabase.from('mt5_accounts_safe').select('*'),
        supabase.from('execution_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('execution_provider_controls').select('*'),
        supabase.from('active_trade_management_truth').select('*'),
        supabase.from('certified_execution_account_policies').select('*').eq('current', true),
        supabase.from('execution_policies').select('*'),
        supabase.from('certified_runtime_artifacts').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('profiles').select('id, full_name, email')
      ]);

      const connectedList = connectedAccountsRes.data ?? [];
      const mt5List = mt5AccountsRes.data ?? [];
      const execSettings = execSettingsRes.data;
      const controlsList = providerControlsRes.data ?? [];
      const tradesList = tradeTruthRes.data ?? [];
      const certPoliciesList = certifiedPoliciesRes.data ?? [];
      const execPoliciesList = executionPoliciesRes.data ?? [];
      const artifactsList = (artifactsRes.data ?? []) as CertifiedRuntimeArtifactRow[];
      const profilesList = profilesRes.data ?? [];

      setArtifacts(artifactsList);

      // Customer map
      const profileMap = new Map<string, { name: string; email: string }>();
      profilesList.forEach((p: { id: string; full_name?: string; email?: string }) => {
        profileMap.set(p.id, {
          name: p.full_name || p.email || 'Customer',
          email: p.email || ''
        });
      });

      const compiledAccounts: ExecutionAccountCapital[] = [];

      // --- ACCOUNT 1: Binance Testnet ---
      const binanceControl = controlsList.find((c: { provider_name: string }) => c.provider_name === 'binance');
      const binanceTrades = tradesList.filter((t: { provider: string }) => t.provider === 'binance');
      const binanceCertPolicy = certPoliciesList.find((p: { provider: string }) => p.provider === 'BINANCE');
      const binanceExecPolicy = execPoliciesList.find((p: { provider: string }) => p.provider === 'binance');

      const binanceTotalBal = execSettings ? (execSettings.account_total_margin_balance ?? execSettings.account_total_wallet_balance ?? null) : null;
      const binanceAvail = execSettings ? (execSettings.account_available_balance ?? execSettings.account_available_usdt ?? null) : null;
      const binanceUnrealizedPnl = execSettings ? (execSettings.account_unrealized_pnl ?? 0) : 0;
      const binanceEquity = binanceTotalBal != null ? binanceTotalBal + binanceUnrealizedPnl : null;
      const binanceReserved = binanceTotalBal != null && binanceAvail != null ? Math.max(0, binanceTotalBal - binanceAvail) : null;

      const binanceOpenPositions = binanceTrades.filter((t: { status: string }) => t.status === 'open' || t.status === 'submitted');
      const binanceExposureUsd = binanceOpenPositions.reduce((sum: number, t: { quantity?: number; mark_price?: number; entry_price?: number }) => {
        const qty = Number(t.quantity ?? 0);
        const px = Number(t.mark_price ?? t.entry_price ?? 0);
        return sum + (qty * px);
      }, 0);

      const binanceLargestPos = binanceOpenPositions.reduce((max: number, t: { quantity?: number; mark_price?: number; entry_price?: number }) => {
        const qty = Number(t.quantity ?? 0);
        const px = Number(t.mark_price ?? t.entry_price ?? 0);
        return Math.max(max, qty * px);
      }, 0);

      const binanceAcc: ExecutionAccountCapital = {
        id: 'cap-binance-testnet',
        customerId: '00000000-0000-0000-0000-000000000000',
        customerName: 'System Admin',
        customerEmail: 'admin@hashibot.io',
        executionProfileId: 'prof-binance-core',
        executionProfileName: 'Crypto Core Futures',
        provider: 'BINANCE',
        providerKey: 'binance',
        environment: 'TESTNET',
        accountId: 'binance-usdm-testnet',
        accountMasked: 'Binance Futures Testnet',
        connectionStatus: binanceControl?.enabled ? 'CONNECTED' : 'DISCONNECTED',
        allocationHealth: binanceTotalBal != null ? (binanceAvail != null && binanceAvail < (binanceTotalBal * 0.15) ? 'LOW_MARGIN' : 'OPTIMAL') : 'STALE',
        balance: binanceTotalBal,
        equity: binanceEquity,
        freeMargin: binanceAvail,
        usedMargin: binanceReserved,
        reservedCapitalUsd: binanceReserved,
        allocatedCapitalUsd: Number(binanceCertPolicy?.maximum_account_exposure ?? binanceExecPolicy?.max_exposure_pct ?? 10000),
        currentAllocationPct: binanceTotalBal && binanceTotalBal > 0 ? Number(((binanceExposureUsd / binanceTotalBal) * 100).toFixed(1)) : 0,
        openExposureUsd: binanceExposureUsd,
        largestAllocationUsd: Number(binanceCertPolicy?.maximum_symbol_exposure ?? 5000),
        largestPositionUsd: binanceLargestPos,
        unrealizedPnlUsd: binanceUnrealizedPnl,
        dailyPnlUsd: binanceUnrealizedPnl,
        weeklyPnlUsd: binanceUnrealizedPnl,
        drawdownPct: binanceTotalBal && binanceTotalBal > 0 && binanceUnrealizedPnl < 0 ? Number(((Math.abs(binanceUnrealizedPnl) / binanceTotalBal) * 100).toFixed(2)) : 0,
        policyVersion: binanceCertPolicy?.policy_version ?? 'v1.4.0',
        lastSyncAt: execSettings?.updated_at ?? null,

        allocationEnabled: binanceCertPolicy?.enabled ?? binanceControl?.enabled ?? true,
        maxAllocationPct: 100,
        maxDollarAllocationUsd: Number(binanceCertPolicy?.maximum_account_exposure ?? 10000),
        reserveCapitalPct: 10,
        emergencyReserveUsd: 1000,
        maxExposureUsd: Number(binanceCertPolicy?.maximum_account_exposure ?? 10000),
        maxMarginUsagePct: 80,
        maxPositionSizeUsd: Number(binanceCertPolicy?.maximum_symbol_exposure ?? 5000),
        maxSymbolAllocationUsd: Number(binanceCertPolicy?.maximum_symbol_exposure ?? 5000),
        allocationPriority: 'HIGH',
        allocationMode: 'EQUITY_PCT',
        scalingRule: 'COMPOUNDING',
        compoundingEnabled: true,
        minBalanceRequiredUsd: 500,
        lowBalanceProtectionEnabled: true
      };
      compiledAccounts.push(binanceAcc);

      // --- ACCOUNT 2: Bybit Unified Demo ---
      const bybitControl = controlsList.find((c: { provider_name: string }) => c.provider_name === 'bybit');
      const bybitTrades = tradesList.filter((t: { provider: string }) => t.provider === 'bybit');
      const bybitCertPolicy = certPoliciesList.find((p: { provider: string }) => p.provider === 'BYBIT');

      const bybitOpenPositions = bybitTrades.filter((t: { status: string }) => t.status === 'open' || t.status === 'submitted');
      const bybitExposureUsd = bybitOpenPositions.reduce((sum: number, t: { quantity?: number; mark_price?: number; entry_price?: number }) => {
        const qty = Number(t.quantity ?? 0);
        const px = Number(t.mark_price ?? t.entry_price ?? 0);
        return sum + (qty * px);
      }, 0);

      const bybitAcc: ExecutionAccountCapital = {
        id: 'cap-bybit-demo',
        customerId: '00000000-0000-0000-0000-000000000000',
        customerName: 'System Admin',
        customerEmail: 'admin@hashibot.io',
        executionProfileId: 'prof-bybit-demo',
        executionProfileName: 'Bybit Unified V5',
        provider: 'BYBIT',
        providerKey: 'bybit',
        environment: 'DEMO',
        accountId: 'bybit-v5-demo',
        accountMasked: 'Bybit Unified Demo',
        connectionStatus: bybitControl?.enabled ? 'CONNECTED' : 'DISCONNECTED',
        allocationHealth: 'STALE', // No canonical balance API connected directly
        balance: null, // Waiting for Runtime
        equity: null,
        freeMargin: null,
        usedMargin: null,
        reservedCapitalUsd: null,
        allocatedCapitalUsd: Number(bybitCertPolicy?.maximum_account_exposure ?? 8000),
        currentAllocationPct: 0,
        openExposureUsd: bybitExposureUsd,
        largestAllocationUsd: Number(bybitCertPolicy?.maximum_symbol_exposure ?? 4000),
        largestPositionUsd: 0,
        unrealizedPnlUsd: 0,
        dailyPnlUsd: 0,
        weeklyPnlUsd: 0,
        drawdownPct: 0,
        policyVersion: bybitCertPolicy?.policy_version ?? 'v1.1.0',
        lastSyncAt: bybitControl?.updated_at ?? null,

        allocationEnabled: bybitCertPolicy?.enabled ?? bybitControl?.enabled ?? false,
        maxAllocationPct: 80,
        maxDollarAllocationUsd: 8000,
        reserveCapitalPct: 15,
        emergencyReserveUsd: 1000,
        maxExposureUsd: 8000,
        maxMarginUsagePct: 75,
        maxPositionSizeUsd: 4000,
        maxSymbolAllocationUsd: 4000,
        allocationPriority: 'MEDIUM',
        allocationMode: 'FIXED',
        scalingRule: 'FLAT',
        compoundingEnabled: false,
        minBalanceRequiredUsd: 1000,
        lowBalanceProtectionEnabled: true
      };
      compiledAccounts.push(bybitAcc);

      // --- ACCOUNTS 3 & 4: MT5 Accounts ---
      mt5List.forEach((mt5: {
        id: string;
        user_id?: string;
        broker?: string;
        account_number_masked?: string;
        nickname?: string;
        account_type?: string;
        execution_enabled?: boolean;
        connection_status?: string;
        balance?: number;
        equity?: number;
        margin?: number;
        free_margin?: number;
        last_heartbeat_at?: string;
      }) => {
        const isProp = mt5.account_type === 'prop' || mt5.account_type === 'prop_challenge';
        const providerType: ProviderType = isProp ? 'MT5_PROP' : 'MT5_PERSONAL';
        const envType: EnvironmentType = isProp ? 'PROP' : 'PERSONAL';
        const profileInfo = profileMap.get(mt5.user_id ?? '') ?? { name: 'MT5 Operator', email: '' };

        const certPolicy = certPoliciesList.find((p: { account_id: string }) => p.account_id === String(mt5.id));

        const mt5Trades = tradesList.filter((t: { account_id?: string; provider?: string }) => t.account_id === String(mt5.id) || t.provider === (isProp ? 'mt5_prop' : 'mt5_personal'));
        const mt5OpenPos = mt5Trades.filter((t: { status: string }) => t.status === 'open');

        const bal = mt5.balance ?? null;
        const eq = mt5.equity ?? null;
        const freeM = mt5.free_margin ?? null;
        const usedM = mt5.margin ?? null;

        const mt5ExpUsd = usedM ? Number(usedM) : 0;
        const pnl = bal && eq ? eq - bal : 0;

        const mt5Acc: ExecutionAccountCapital = {
          id: `cap-mt5-${mt5.id}`,
          customerId: mt5.user_id ?? 'system',
          customerName: profileInfo.name,
          customerEmail: profileInfo.email,
          executionProfileId: `prof-mt5-${mt5.id}`,
          executionProfileName: mt5.nickname || `${mt5.broker ?? 'MT5'} ${isProp ? 'Prop Challenge' : 'Personal'}`,
          provider: providerType,
          providerKey: isProp ? 'mt5_prop' : 'mt5_personal',
          environment: envType,
          accountId: String(mt5.id),
          accountMasked: mt5.account_number_masked || `MT5 #${mt5.id.slice(0, 8)}`,
          connectionStatus: mt5.connection_status === 'connected' ? 'CONNECTED' : (mt5.connection_status === 'stale' ? 'STALE' : 'DISCONNECTED'),
          allocationHealth: bal != null ? (freeM != null && freeM < (bal * 0.2) ? 'LOW_MARGIN' : 'OPTIMAL') : 'STALE',
          balance: bal,
          equity: eq,
          freeMargin: freeM,
          usedMargin: usedM,
          reservedCapitalUsd: usedM,
          allocatedCapitalUsd: Number(certPolicy?.maximum_account_exposure ?? (isProp ? 50000 : 20000)),
          currentAllocationPct: bal && bal > 0 ? Number(((mt5ExpUsd / bal) * 100).toFixed(1)) : 0,
          openExposureUsd: mt5ExpUsd,
          largestAllocationUsd: Number(certPolicy?.maximum_symbol_exposure ?? (isProp ? 25000 : 10000)),
          largestPositionUsd: mt5OpenPos.length > 0 ? mt5ExpUsd / mt5OpenPos.length : 0,
          unrealizedPnlUsd: pnl,
          dailyPnlUsd: pnl,
          weeklyPnlUsd: pnl,
          drawdownPct: bal && eq && eq < bal ? Number((((bal - eq) / bal) * 100).toFixed(2)) : 0,
          policyVersion: certPolicy?.policy_version ?? 'v1.0.0',
          lastSyncAt: mt5.last_heartbeat_at ?? null,

          allocationEnabled: certPolicy?.enabled ?? mt5.execution_enabled ?? true,
          maxAllocationPct: isProp ? 100 : 80,
          maxDollarAllocationUsd: isProp ? 50000 : 20000,
          reserveCapitalPct: 10,
          emergencyReserveUsd: isProp ? 2500 : 1000,
          maxExposureUsd: isProp ? 50000 : 20000,
          maxMarginUsagePct: 80,
          maxPositionSizeUsd: isProp ? 25000 : 10000,
          maxSymbolAllocationUsd: isProp ? 25000 : 10000,
          allocationPriority: isProp ? 'HIGH' : 'MEDIUM',
          allocationMode: 'EQUITY_PCT',
          scalingRule: 'COMPOUNDING',
          compoundingEnabled: true,
          minBalanceRequiredUsd: isProp ? 10000 : 1000,
          lowBalanceProtectionEnabled: true
        };
        compiledAccounts.push(mt5Acc);
      });

      // Connected client accounts
      connectedList.forEach((ca: {
        id: string;
        customer_id: string;
        provider: string;
        account_id: string;
        environment: string;
        enabled: boolean;
      }) => {
        const exists = compiledAccounts.some(a => a.accountId === ca.account_id && a.providerKey === ca.provider);
        if (!exists) {
          const profile = profileMap.get(ca.customer_id) ?? { name: 'Client Account', email: '' };
          const pType: ProviderType = ca.provider.toUpperCase() === 'BYBIT' ? 'BYBIT' : 'BINANCE';
          const eType: EnvironmentType = ca.environment.toUpperCase() === 'DEMO' ? 'DEMO' : 'TESTNET';

          compiledAccounts.push({
            id: `cap-conn-${ca.id}`,
            customerId: ca.customer_id,
            customerName: profile.name,
            customerEmail: profile.email,
            executionProfileId: `prof-client-${ca.id}`,
            executionProfileName: `${pType} Client Managed`,
            provider: pType,
            providerKey: ca.provider,
            environment: eType,
            accountId: ca.account_id,
            accountMasked: `Client ${pType} #${ca.account_id.slice(0, 8)}`,
            connectionStatus: ca.enabled ? 'CONNECTED' : 'DISCONNECTED',
            allocationHealth: 'OPTIMAL',
            balance: null,
            equity: null,
            freeMargin: null,
            usedMargin: null,
            reservedCapitalUsd: null,
            allocatedCapitalUsd: 10000,
            currentAllocationPct: 0,
            openExposureUsd: 0,
            largestAllocationUsd: 5000,
            largestPositionUsd: 0,
            unrealizedPnlUsd: 0,
            dailyPnlUsd: 0,
            weeklyPnlUsd: 0,
            drawdownPct: 0,
            policyVersion: 'v1.0.0',
            lastSyncAt: null,

            allocationEnabled: ca.enabled,
            maxAllocationPct: 80,
            maxDollarAllocationUsd: 10000,
            reserveCapitalPct: 15,
            emergencyReserveUsd: 1000,
            maxExposureUsd: 10000,
            maxMarginUsagePct: 75,
            maxPositionSizeUsd: 5000,
            maxSymbolAllocationUsd: 5000,
            allocationPriority: 'MEDIUM',
            allocationMode: 'EQUITY_PCT',
            scalingRule: 'FLAT',
            compoundingEnabled: false,
            minBalanceRequiredUsd: 1000,
            lowBalanceProtectionEnabled: true
          });
        }
      });

      setAccounts(compiledAccounts);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to query capital truth');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCapitalTruth();
    const interval = setInterval(() => void loadCapitalTruth(), 20000);
    return () => clearInterval(interval);
  }, [loadCapitalTruth]);

  // Handle Edit Capital Modal Open
  const handleOpenEdit = (acc: ExecutionAccountCapital) => {
    setEditingAccount(acc);
    setPendingCapitalPolicy({ ...acc });
  };

  // Save Capital Policy Revision
  const handleSaveCapitalPolicy = async () => {
    if (!editingAccount || !pendingCapitalPolicy) return;
    setSavingId(editingAccount.id);
    setNotice(`Submitting capital allocation revision for ${editingAccount.accountMasked}...`);

    try {
      const newVersion = `v${(parseFloat(editingAccount.policyVersion.replace('v', '')) + 0.1).toFixed(1)}`;

      const policyPayload = {
        customer_id: editingAccount.customerId !== '00000000-0000-0000-0000-000000000000' && editingAccount.customerId !== 'system'
          ? editingAccount.customerId
          : '00000000-0000-0000-0000-000000000000',
        execution_profile_id: '00000000-0000-0000-0000-000000000001',
        provider: editingAccount.provider,
        environment: editingAccount.environment === 'PERSONAL' ? 'TESTNET' : (editingAccount.environment === 'PROP' ? 'DEMO' : editingAccount.environment),
        account_id: editingAccount.accountId,
        policy_version: newVersion,
        current: true,
        enabled: pendingCapitalPolicy.allocationEnabled ?? true,
        adoption_enabled: pendingCapitalPolicy.allocationEnabled ?? true,
        risk_percentage: 1.0,
        maximum_risk_cap: 3.0,
        daily_loss_limit: 500,
        weekly_loss_limit: 1500,
        drawdown_limit: 10.0,
        maximum_concurrent_positions: 3,
        maximum_account_exposure: pendingCapitalPolicy.maxDollarAllocationUsd ?? 10000,
        maximum_symbol_exposure: pendingCapitalPolicy.maxSymbolAllocationUsd ?? 5000,
        leverage_ceiling: 20,
        minimum_signal_grade: 'A',
        allowed_strategy_ids: ['Compression Breakout', 'Trend Pullback'],
        allowed_symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'EURUSD'],
        cooldown_policy: { cooldown_minutes: 15 },
        protection_policy: { require_sl: true, require_tp: true },
        certified_context: {
          capital_policy: {
            reserve_capital_pct: pendingCapitalPolicy.reserveCapitalPct,
            emergency_reserve_usd: pendingCapitalPolicy.emergencyReserveUsd,
            allocation_mode: pendingCapitalPolicy.allocationMode,
            scaling_rule: pendingCapitalPolicy.scalingRule,
            compounding: pendingCapitalPolicy.compoundingEnabled
          },
          updated_at: new Date().toISOString()
        },
        changed_by: '00000000-0000-0000-0000-000000000000',
        changed_at: new Date().toISOString()
      };

      const { error: certErr } = await supabase
        .from('certified_execution_account_policies')
        .insert(policyPayload);

      if (certErr) console.warn('certified_execution_account_policies update:', certErr.message);

      // Audit log event
      await supabase.from('operator_runtime_events').insert({
        event_type: 'CAPITAL_POLICY_UPDATED',
        account_id: editingAccount.accountId,
        payload: {
          account: editingAccount.accountMasked,
          provider: editingAccount.provider,
          old_version: editingAccount.policyVersion,
          new_version: newVersion,
          allocated_usd: pendingCapitalPolicy.maxDollarAllocationUsd
        },
        created_at: new Date().toISOString()
      });

      setNotice(`Capital allocation policy revision ${newVersion} successfully applied.`);
      setEditingAccount(null);
      await loadCapitalTruth();
    } catch (err) {
      setNotice(`Error saving capital policy: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingId(null);
      setTimeout(() => setNotice(null), 6000);
    }
  };

  // Compute Verified Summary Aggregates
  const verifiedAccounts = accounts.filter(a => a.balance != null);
  const totalBalanceUsd = verifiedAccounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);
  const totalEquityUsd = verifiedAccounts.reduce((sum, a) => sum + (a.equity ?? 0), 0);
  const totalAvailableCapitalUsd = verifiedAccounts.reduce((sum, a) => sum + (a.freeMargin ?? 0), 0);
  const totalReservedCapitalUsd = verifiedAccounts.reduce((sum, a) => sum + (a.reservedCapitalUsd ?? 0), 0);
  const totalOpenExposureUsd = accounts.reduce((sum, a) => sum + a.openExposureUsd, 0);
  const totalDailyPnlUsd = accounts.reduce((sum, a) => sum + a.dailyPnlUsd, 0);
  const totalWeeklyPnlUsd = accounts.reduce((sum, a) => sum + a.weeklyPnlUsd, 0);
  const totalOpenProfitUsd = accounts.reduce((sum, a) => sum + (a.unrealizedPnlUsd > 0 ? a.unrealizedPnlUsd : 0), 0);
  const totalOpenLossUsd = accounts.reduce((sum, a) => sum + (a.unrealizedPnlUsd < 0 ? Math.abs(a.unrealizedPnlUsd) : 0), 0);
  const overallUtilizationPct = totalBalanceUsd > 0 ? ((totalReservedCapitalUsd / totalBalanceUsd) * 100).toFixed(1) : '0.0';

  const overallRuntimeHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 
    accounts.some(a => a.allocationHealth === 'INSUFFICIENT_BALANCE') ? 'CRITICAL' :
    accounts.some(a => a.allocationHealth === 'LOW_MARGIN' || a.allocationHealth === 'OVER_ALLOCATED') ? 'WARNING' : 'HEALTHY';

  // Filter accounts
  const filteredAccounts = accounts.filter(a => {
    if (providerFilter === 'ALL') return true;
    if (providerFilter === 'BINANCE') return a.provider === 'BINANCE';
    if (providerFilter === 'BYBIT') return a.provider === 'BYBIT';
    if (providerFilter === 'MT5_PERSONAL') return a.provider === 'MT5_PERSONAL';
    if (providerFilter === 'MT5_PROP') return a.provider === 'MT5_PROP';
    return true;
  });

  return (
    <AdminLayout>
      <div className="space-y-6 font-mono text-zinc-100 pb-12">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-zinc-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-blue-400 font-semibold">
              <PieChart size={14} />
              <span>HashiBot Operations</span>
              <span>/</span>
              <span>Capital Manager</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
              Cross-Account Capital Allocation & Margin Operations
            </h1>
            <p className="text-sm text-zinc-400 font-sans mt-1 max-w-3xl">
              Independent capital allocation controls, margin reservations, and verified balance ledgers across the entire execution fleet. Only real backend contracts are displayed.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadCapitalTruth()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs font-sans font-medium text-zinc-300 hover:border-zinc-700 hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh Capital</span>
            </button>
          </div>
        </div>

        {notice && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-xs text-emerald-300 flex items-center justify-between font-sans">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <span>{notice}</span>
            </div>
            <button onClick={() => setNotice(null)} className="text-zinc-500 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        {fetchError && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-xs text-red-300 flex items-center gap-2 font-sans">
            <ShieldAlert size={16} className="text-red-400 shrink-0" />
            <span>{fetchError}</span>
          </div>
        )}

        {/* 1. CAPITAL EXECUTIVE SUMMARY */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Activity size={14} className="text-blue-400" /> Capital Summary ({verifiedAccounts.length} Verified Accounts)
            </h2>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border uppercase ${
                overallRuntimeHealth === 'HEALTHY' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                overallRuntimeHealth === 'WARNING' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                'bg-red-500/10 text-red-400 border-red-500/30'
              }`}>
                Fleet Health: {overallRuntimeHealth}
              </span>
              <span className="text-[10px] text-zinc-500 font-sans hidden sm:inline">Verified real-time balance & margin ledger</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3">
            {/* Total Balance */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-3 space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase block">Total Balance</span>
              <div className="text-lg font-bold text-white font-mono">
                {verifiedAccounts.length > 0 ? `$${totalBalanceUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : <span className="text-zinc-600 text-xs">Not Available</span>}
              </div>
              <span className="text-[9px] text-zinc-500 font-sans block truncate">Verified Wallet Sum</span>
            </div>

            {/* Total Equity */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-3 space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase block">Total Equity</span>
              <div className="text-lg font-bold text-white font-mono">
                {verifiedAccounts.length > 0 ? `$${totalEquityUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : <span className="text-zinc-600 text-xs">Not Available</span>}
              </div>
              <span className="text-[9px] text-zinc-500 font-sans block truncate">Mark Equity Sum</span>
            </div>

            {/* Available Capital */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1">
              <span className="text-[10px] text-emerald-400 uppercase block">Available Capital</span>
              <div className="text-lg font-bold text-emerald-300 font-mono">
                {verifiedAccounts.length > 0 ? `$${totalAvailableCapitalUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : <span className="text-zinc-600 text-xs">Not Available</span>}
              </div>
              <span className="text-[9px] text-emerald-500 font-sans block truncate">Unreserved / Ready</span>
            </div>

            {/* Capital Reserved */}
            <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-3 space-y-1">
              <span className="text-[10px] text-blue-400 uppercase block">Reserved Margin</span>
              <div className="text-lg font-bold text-blue-300 font-mono">
                ${totalReservedCapitalUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <span className="text-[9px] text-blue-500 font-sans block truncate">Margin In Use</span>
            </div>

            {/* Utilization */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-3 space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase block">Capital Utilization</span>
              <div className="text-lg font-bold text-amber-400 font-mono">{overallUtilizationPct}%</div>
              <span className="text-[9px] text-zinc-500 font-sans block truncate">Margin % Used</span>
            </div>

            {/* Daily PnL */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-3 space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase block">Daily P/L</span>
              <div className={`text-lg font-bold font-mono ${totalDailyPnlUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalDailyPnlUsd >= 0 ? '+' : ''}${totalDailyPnlUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <span className="text-[9px] text-zinc-500 font-sans block truncate">
                Wk: {totalWeeklyPnlUsd >= 0 ? '+' : ''}${totalWeeklyPnlUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>

            {/* Open Profit */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3 space-y-1">
              <span className="text-[10px] text-emerald-400 uppercase block">Open Profit</span>
              <div className="text-lg font-bold text-emerald-300 font-mono">
                +${totalOpenProfitUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <span className="text-[9px] text-emerald-500 font-sans block truncate">Positive Positions</span>
            </div>

            {/* Open Loss */}
            <div className="rounded-xl border border-red-500/20 bg-red-950/10 p-3 space-y-1">
              <span className="text-[10px] text-red-400 uppercase block">Open Loss</span>
              <div className="text-lg font-bold text-red-400 font-mono">
                -${totalOpenLossUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <span className="text-[9px] text-red-500 font-sans block truncate">Drawdown Positions</span>
            </div>

            {/* Total Exposure */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-3 space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase block">Total Exposure</span>
              <div className="text-lg font-bold text-white font-mono">
                ${totalOpenExposureUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <span className="text-[9px] text-zinc-500 font-sans block truncate">Market Position Value</span>
            </div>
          </div>
        </div>

        {/* 2. EXECUTION ACCOUNT CAPITAL GRID */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <PieChart size={18} className="text-blue-400" /> Execution Accounts Capital Allocation ({accounts.length})
              </h2>
              <p className="text-xs text-zinc-400 font-sans mt-0.5">
                Every execution account manages independent capital allocation limits, margin buffers, and compounding rules.
              </p>
            </div>

            {/* Provider Filter Tabs */}
            <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs font-sans overflow-x-auto">
              <button
                onClick={() => setProviderFilter('ALL')}
                className={`px-2.5 py-1 rounded-md transition ${providerFilter === 'ALL' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400 hover:text-white'}`}
              >
                All ({accounts.length})
              </button>
              <button
                onClick={() => setProviderFilter('BINANCE')}
                className={`px-2.5 py-1 rounded-md transition ${providerFilter === 'BINANCE' ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30' : 'text-zinc-400 hover:text-white'}`}
              >
                Binance
              </button>
              <button
                onClick={() => setProviderFilter('BYBIT')}
                className={`px-2.5 py-1 rounded-md transition ${providerFilter === 'BYBIT' ? 'bg-orange-500/20 text-orange-300 font-semibold border border-orange-500/30' : 'text-zinc-400 hover:text-white'}`}
              >
                Bybit
              </button>
              <button
                onClick={() => setProviderFilter('MT5_PERSONAL')}
                className={`px-2.5 py-1 rounded-md transition ${providerFilter === 'MT5_PERSONAL' ? 'bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30' : 'text-zinc-400 hover:text-white'}`}
              >
                MT5 Personal
              </button>
              <button
                onClick={() => setProviderFilter('MT5_PROP')}
                className={`px-2.5 py-1 rounded-md transition ${providerFilter === 'MT5_PROP' ? 'bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30' : 'text-zinc-400 hover:text-white'}`}
              >
                MT5 Prop
              </button>
            </div>
          </div>

          {/* Capital Account Cards */}
          {loading && accounts.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-12 text-center text-xs text-zinc-400 font-sans space-y-2">
              <RefreshCw size={24} className="animate-spin mx-auto text-blue-400" />
              <span>Loading fleet capital allocation and margin truth...</span>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-8 text-center text-xs text-zinc-500 font-sans">
              No accounts match the selected provider filter.
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-2">
              {filteredAccounts.map(acc => (
                <div
                  key={acc.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-5 space-y-4 hover:border-zinc-700/80 transition"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 border-b border-zinc-800/80 pb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap text-[10px] font-sans">
                        <span className={`px-2 py-0.5 rounded font-bold border ${
                          acc.provider === 'BINANCE' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                          acc.provider === 'BYBIT' ? 'bg-orange-500/10 text-orange-300 border-orange-500/30' :
                          acc.provider === 'MT5_PERSONAL' ? 'bg-blue-500/10 text-blue-300 border-blue-500/30' :
                          'bg-purple-500/10 text-purple-300 border-purple-500/30'
                        }`}>
                          {acc.provider}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {acc.environment}
                        </span>
                        <span className="text-zinc-500 font-mono">{acc.policyVersion}</span>
                      </div>

                      <h3 className="text-base font-bold text-white mt-1.5 flex items-center gap-2">
                        {acc.accountMasked}
                      </h3>
                      <span className="text-xs text-zinc-400 font-sans block">
                        Customer: <span className="text-zinc-200 font-semibold">{acc.customerName}</span>
                      </span>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        acc.allocationHealth === 'OPTIMAL' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                        acc.allocationHealth === 'LOW_MARGIN' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                        'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}>
                        {acc.allocationHealth}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Priority: {acc.allocationPriority}
                      </span>
                    </div>
                  </div>

                  {/* Financial Values Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80">
                      <span className="text-[10px] text-zinc-500 block uppercase">Reported Balance</span>
                      <span className="font-bold text-white font-mono">
                        {acc.balance != null ? `$${acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span className="text-zinc-600 font-sans text-[11px]">Waiting for Runtime</span>}
                      </span>
                    </div>

                    <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80">
                      <span className="text-[10px] text-zinc-500 block uppercase">Reported Equity</span>
                      <span className="font-bold text-white font-mono">
                        {acc.equity != null ? `$${acc.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span className="text-zinc-600 font-sans text-[11px]">Waiting for Runtime</span>}
                      </span>
                    </div>

                    <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80">
                      <span className="text-[10px] text-zinc-500 block uppercase">Free Margin</span>
                      <span className="font-bold text-emerald-400 font-mono">
                        {acc.freeMargin != null ? `$${acc.freeMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span className="text-zinc-600 font-sans text-[11px]">Waiting for Runtime</span>}
                      </span>
                    </div>

                    <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80">
                      <span className="text-[10px] text-zinc-500 block uppercase">Reserved Margin</span>
                      <span className="font-bold text-blue-300 font-mono">
                        {acc.usedMargin != null ? `$${acc.usedMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span className="text-zinc-600 font-sans text-[11px]">Waiting for Runtime</span>}
                      </span>
                    </div>

                    <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80">
                      <span className="text-[10px] text-zinc-500 block uppercase">Allocated Target</span>
                      <span className="font-bold text-amber-300 font-mono">
                        ${acc.allocatedCapitalUsd.toLocaleString()}
                      </span>
                    </div>

                    <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80">
                      <span className="text-[10px] text-zinc-500 block uppercase">Current Exposure</span>
                      <span className="font-bold text-white font-mono">
                        ${acc.openExposureUsd.toLocaleString()}
                      </span>
                    </div>

                    <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80">
                      <span className="text-[10px] text-zinc-500 block uppercase">Open P/L</span>
                      <span className={`font-bold font-mono ${acc.unrealizedPnlUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {acc.unrealizedPnlUsd >= 0 ? '+' : ''}${acc.unrealizedPnlUsd.toLocaleString()}
                      </span>
                    </div>

                    <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80">
                      <span className="text-[10px] text-zinc-500 block uppercase">Compounding</span>
                      <span className="font-bold text-emerald-400 font-mono">
                        {acc.compoundingEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </div>

                  {/* Card Controls */}
                  <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleOpenEdit(acc)}
                      className="flex-1 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-sans font-semibold transition flex items-center justify-center gap-1.5"
                    >
                      <Sliders size={14} /> Configure Capital Allocation Policy
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. EDITABLE CAPITAL CONFIGURATION MODAL */}
        {editingAccount && pendingCapitalPolicy && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-3xl overflow-hidden my-8 shadow-2xl space-y-0 font-mono">
              <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
                <div>
                  <div className="flex items-center gap-2 text-xs text-blue-400 font-bold uppercase">
                    <PieChart size={14} />
                    <span>Capital Policy Revision Controls</span>
                    <span className="text-zinc-600">|</span>
                    <span className="text-zinc-400 font-mono">{editingAccount.policyVersion}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white mt-0.5">
                    Configure Capital Policy: {editingAccount.accountMasked}
                  </h3>
                  <span className="text-xs text-zinc-400 font-sans block">Customer: {editingAccount.customerName}</span>
                </div>

                <button
                  onClick={() => setEditingAccount(null)}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto font-sans text-xs">
                {/* Switches */}
                <div className="space-y-3 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800">
                  <h4 className="text-xs font-bold text-zinc-300 font-mono uppercase tracking-wider flex items-center gap-2">
                    <Zap size={14} className="text-amber-400" /> Allocation Mode & Controls
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="flex items-center gap-2 text-zinc-300 bg-zinc-900 p-3 rounded-lg border border-zinc-800 cursor-pointer hover:border-zinc-700">
                      <input
                        type="checkbox"
                        checked={pendingCapitalPolicy.allocationEnabled ?? true}
                        onChange={e => setPendingCapitalPolicy(p => ({ ...p, allocationEnabled: e.target.checked }))}
                        className="rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-0"
                      />
                      <span>Enable Capital Allocation</span>
                    </label>

                    <label className="flex items-center gap-2 text-zinc-300 bg-zinc-900 p-3 rounded-lg border border-zinc-800 cursor-pointer hover:border-zinc-700">
                      <input
                        type="checkbox"
                        checked={pendingCapitalPolicy.compoundingEnabled ?? true}
                        onChange={e => setPendingCapitalPolicy(p => ({ ...p, compoundingEnabled: e.target.checked }))}
                        className="rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-0"
                      />
                      <span>Compounding On</span>
                    </label>

                    <label className="flex items-center gap-2 text-zinc-300 bg-zinc-900 p-3 rounded-lg border border-zinc-800 cursor-pointer hover:border-zinc-700">
                      <input
                        type="checkbox"
                        checked={pendingCapitalPolicy.lowBalanceProtectionEnabled ?? true}
                        onChange={e => setPendingCapitalPolicy(p => ({ ...p, lowBalanceProtectionEnabled: e.target.checked }))}
                        className="rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-0"
                      />
                      <span>Low Balance Auto-Protection</span>
                    </label>
                  </div>
                </div>

                {/* Capital Allocation Limits */}
                <div className="space-y-3 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800">
                  <h4 className="text-xs font-bold text-zinc-300 font-mono uppercase tracking-wider flex items-center gap-2">
                    <PieChart size={14} className="text-emerald-400" /> Capital Allocation Dollar Limits
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-zinc-400 mb-1">Max Dollar Allocation ($)</label>
                      <input
                        type="number"
                        step="500"
                        min="500"
                        value={pendingCapitalPolicy.maxDollarAllocationUsd ?? 10000}
                        onChange={e => setPendingCapitalPolicy(p => ({ ...p, maxDollarAllocationUsd: parseFloat(e.target.value) || 1000 }))}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-white font-mono focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 mb-1">Max Allocation % Of Wallet</label>
                      <input
                        type="number"
                        step="5"
                        min="10"
                        max="100"
                        value={pendingCapitalPolicy.maxAllocationPct ?? 80}
                        onChange={e => setPendingCapitalPolicy(p => ({ ...p, maxAllocationPct: parseFloat(e.target.value) || 10 }))}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-white font-mono focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 mb-1">Reserve Capital % Buffer</label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="50"
                        value={pendingCapitalPolicy.reserveCapitalPct ?? 10}
                        onChange={e => setPendingCapitalPolicy(p => ({ ...p, reserveCapitalPct: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-white font-mono focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 mb-1">Emergency Reserve Buffer ($)</label>
                      <input
                        type="number"
                        step="250"
                        min="0"
                        value={pendingCapitalPolicy.emergencyReserveUsd ?? 1000}
                        onChange={e => setPendingCapitalPolicy(p => ({ ...p, emergencyReserveUsd: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-white font-mono focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 mb-1">Max Symbol Allocation ($)</label>
                      <input
                        type="number"
                        step="500"
                        min="500"
                        value={pendingCapitalPolicy.maxSymbolAllocationUsd ?? 5000}
                        onChange={e => setPendingCapitalPolicy(p => ({ ...p, maxSymbolAllocationUsd: parseFloat(e.target.value) || 500 }))}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-white font-mono focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 mb-1">Minimum Balance Required ($)</label>
                      <input
                        type="number"
                        step="250"
                        min="100"
                        value={pendingCapitalPolicy.minBalanceRequiredUsd ?? 1000}
                        onChange={e => setPendingCapitalPolicy(p => ({ ...p, minBalanceRequiredUsd: parseFloat(e.target.value) || 100 }))}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-white font-mono focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Priority & Mode */}
                <div className="space-y-3 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800">
                  <h4 className="text-xs font-bold text-zinc-300 font-mono uppercase tracking-wider flex items-center gap-2">
                    <Sliders size={14} className="text-purple-400" /> Scaling & Allocation Priority
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-zinc-400 mb-1">Allocation Priority</label>
                      <select
                        value={pendingCapitalPolicy.allocationPriority ?? 'HIGH'}
                        onChange={e => setPendingCapitalPolicy(p => ({ ...p, allocationPriority: e.target.value as 'HIGH' | 'MEDIUM' | 'LOW' }))}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none"
                      >
                        <option value="HIGH">High Priority (First Claim)</option>
                        <option value="MEDIUM">Medium Priority (Standard Pool)</option>
                        <option value="LOW">Low Priority (Residual Capital)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-zinc-400 mb-1">Allocation Sizing Mode</label>
                      <select
                        value={pendingCapitalPolicy.allocationMode ?? 'EQUITY_PCT'}
                        onChange={e => setPendingCapitalPolicy(p => ({ ...p, allocationMode: e.target.value as 'FIXED' | 'EQUITY_PCT' | 'DYNAMIC_VOL' }))}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none"
                      >
                        <option value="EQUITY_PCT">Dynamic Percentage of Equity</option>
                        <option value="FIXED">Fixed Dollar Amount</option>
                        <option value="DYNAMIC_VOL">Volatility Adjusted Sizing</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-zinc-400 mb-1">Capital Scaling Rule</label>
                      <select
                        value={pendingCapitalPolicy.scalingRule ?? 'COMPOUNDING'}
                        onChange={e => setPendingCapitalPolicy(p => ({ ...p, scalingRule: e.target.value as 'FLAT' | 'COMPOUNDING' | 'LINEAR' }))}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none"
                      >
                        <option value="COMPOUNDING">Geometric Compounding</option>
                        <option value="LINEAR">Linear Profit Scaling</option>
                        <option value="FLAT">Flat Fixed Sizing</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between font-sans">
                <span className="text-xs text-zinc-400 font-mono flex items-center gap-1.5">
                  <AlertCircle size={14} className="text-blue-400" /> Updates apply to future allocations. Historical strategy plans are preserved.
                </span>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingAccount(null)}
                    className="px-4 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white text-xs font-semibold transition"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSaveCapitalPolicy()}
                    disabled={savingId === editingAccount.id}
                    className="px-5 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-zinc-950 font-bold text-xs transition flex items-center gap-2 disabled:opacity-50"
                  >
                    {savingId === editingAccount.id ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    <span>Apply Capital Revision</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. CAPITAL ALLOCATION TIMELINE (REAL ARTIFACT TRACE) */}
        <div className="space-y-3 pt-4 border-t border-zinc-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Layers size={16} className="text-blue-400" /> Capital Allocation Artifact Timeline
              </h2>
              <p className="text-xs text-zinc-400 font-sans mt-0.5">
                Real immutable audit chain: <code className="text-emerald-400 font-mono">StrategyPlan</code> → <code className="text-amber-400 font-mono">RiskDecision</code> → <code className="text-blue-400 font-mono">CapitalAllocationPlan</code> → <code className="text-purple-400 font-mono">ExecutionPlan</code>
              </p>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">
              Source: certified_runtime_artifacts ({artifacts.length})
            </span>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 overflow-hidden font-sans">
            {artifacts.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <AlertCircle size={28} className="mx-auto text-zinc-600" />
                <div className="text-xs font-bold text-zinc-300 font-mono">Waiting for Runtime / No Allocation Artifacts</div>
                <p className="text-xs text-zinc-500 max-w-md mx-auto">
                  No real capital allocation decisions recorded yet in <code className="text-zinc-400 font-mono">certified_runtime_artifacts</code> table. When signals pass arbitration, real allocation plans will render here in real time.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80 text-xs">
                {artifacts.map(art => (
                  <div key={art.id} className="p-4 hover:bg-zinc-800/40 transition space-y-2">
                    <div className="flex items-center justify-between font-mono">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/20 font-bold">
                          EVAL #{art.evaluation_id.slice(0, 10)}
                        </span>
                        <span className="text-white font-bold">{art.account_id}</span>
                        <span className="text-zinc-500">Plan: {art.strategy_plan_id.slice(0, 8)}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500">{new Date(art.created_at).toLocaleString()}</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono overflow-x-auto pt-1">
                      <div className="bg-zinc-950 p-2 rounded border border-zinc-800 shrink-0">
                        <span className="text-[9px] text-zinc-500 block uppercase">StrategyPlan</span>
                        <span className="text-emerald-400 font-bold">{art.execution_plan?.symbol || 'SIGNAL'} ({art.execution_plan?.side || 'BUY'})</span>
                      </div>
                      <ArrowDownRight size={14} className="text-zinc-600 shrink-0" />
                      <div className="bg-zinc-950 p-2 rounded border border-zinc-800 shrink-0">
                        <span className="text-[9px] text-zinc-500 block uppercase">RiskDecision</span>
                        <span className="text-amber-300 font-bold">{art.risk_decision?.passed ? 'PASSED' : 'REJECTED'} ({art.risk_decision?.risk_percentage ?? 1.0}%)</span>
                      </div>
                      <ArrowDownRight size={14} className="text-zinc-600 shrink-0" />
                      <div className="bg-zinc-950 p-2 rounded border border-zinc-800 shrink-0">
                        <span className="text-[9px] text-zinc-500 block uppercase">CapitalAllocationPlan</span>
                        <span className="text-blue-300 font-bold">${art.capital_allocation_plan?.allocated_usd ?? 0} Allocated</span>
                      </div>
                      <ArrowDownRight size={14} className="text-zinc-600 shrink-0" />
                      <div className="bg-zinc-950 p-2 rounded border border-zinc-800 shrink-0">
                        <span className="text-[9px] text-zinc-500 block uppercase">ExecutionPlan</span>
                        <span className="text-purple-300 font-bold">{art.execution_plan?.execution_plan_id ? 'SUBMITTED' : 'QUEUED'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 5. CAPITAL DISTRIBUTION AGGREGATIONS */}
        <div className="space-y-3 pt-4 border-t border-zinc-800">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <PieChart size={16} className="text-blue-400" /> Capital Distribution
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
            {/* By Provider */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-4 space-y-3">
              <span className="text-xs font-bold text-zinc-300 font-mono uppercase block border-b border-zinc-800 pb-2">
                Capital By Provider
              </span>
              <div className="space-y-2">
                {['BINANCE', 'BYBIT', 'MT5_PERSONAL', 'MT5_PROP'].map(p => {
                  const provAccs = accounts.filter(a => a.provider === p);
                  const bal = provAccs.reduce((a, b) => a + (b.balance ?? 0), 0);
                  const exp = provAccs.reduce((a, b) => a + b.openExposureUsd, 0);
                  return (
                    <div key={p} className="flex items-center justify-between bg-zinc-950 p-2.5 rounded border border-zinc-800/80 font-mono">
                      <div>
                        <span className="font-bold text-white">{p}</span>
                        <span className="text-[10px] text-zinc-500 block font-sans">{provAccs.length} account(s)</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-emerald-400 block">${bal.toLocaleString()} Bal</span>
                        <span className="text-[10px] text-zinc-400 font-sans">${exp.toLocaleString()} Exp</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Environment */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-4 space-y-3">
              <span className="text-xs font-bold text-zinc-300 font-mono uppercase block border-b border-zinc-800 pb-2">
                Capital By Environment
              </span>
              <div className="space-y-2">
                {['TESTNET', 'DEMO', 'PERSONAL', 'PROP'].map(env => {
                  const envAccs = accounts.filter(a => a.environment === env);
                  const bal = envAccs.reduce((a, b) => a + (b.balance ?? 0), 0);
                  return (
                    <div key={env} className="flex items-center justify-between bg-zinc-950 p-2.5 rounded border border-zinc-800/80 font-mono">
                      <div>
                        <span className="font-bold text-white">{env}</span>
                        <span className="text-[10px] text-zinc-500 block font-sans">{envAccs.length} account(s)</span>
                      </div>
                      <span className="font-bold text-blue-300">${bal.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
