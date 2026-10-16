import { useState, useEffect } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import {
  AdminFeederTelemetry,
  CustomerBridgeTelemetry,
  fetchAdminFeederTelemetry,
  getDefaultCustomerBridge,
  saveAdminFeederTelemetry,
  generateVisualBridgeStandaloneScript,
  saveCustomerBridgeTelemetry,
  BridgePlatformType,
  AccountCategory
} from '../../lib/visualBridgeEngine';
import { getAllFleetCustomerAccounts } from '../../lib/customerAccountManager';
import { fetchLiveMarketQuotes } from '../../lib/realMarketPrices';
import {
  Radio, Users, Server, Play,
  CheckCircle2, Activity, Search,
  DollarSign, Globe, Copy, Check,
  Lock, Settings, ShieldCheck, Shield,
  Cpu, Layers
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';

export function AdminVisualBridgeManagement() {
  const [feeder, setFeeder] = useState<AdminFeederTelemetry | null>(null);
  const [bridges, setBridges] = useState<CustomerBridgeTelemetry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedBridge, setSelectedBridge] = useState<CustomerBridgeTelemetry | null>(null);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editForm, setEditForm] = useState<{
    executionMode: 'prop_firm_guardian' | 'account_growth_accelerator';
    accountType: AccountCategory;
    platformType: BridgePlatformType;
    initialDeposit: number;
    riskPercentPerTrade: number;
    maxConcurrentTrades: number;
    dailyDrawdownLimitPercent: number;
    maxLeverageLimit: number;
    autoTradingEnabled: boolean;
    assignedTier: string;
    notes: string;
    growthAggressionTier: 'balanced_growth' | 'high_velocity' | 'hyper_drive';
    dynamicCompoundingEnabled: boolean;
    tpPyramidingEnabled: boolean;
    trailingStopTriggerR: number;
  }>({
    executionMode: 'prop_firm_guardian',
    accountType: '50k_prop',
    platformType: 'mt5_forex',
    initialDeposit: 50000,
    riskPercentPerTrade: 0.5,
    maxConcurrentTrades: 2,
    dailyDrawdownLimitPercent: 4.5,
    maxLeverageLimit: 100,
    autoTradingEnabled: true,
    assignedTier: '$50k Institutional Prop Tier',
    notes: '',
    growthAggressionTier: 'high_velocity',
    dynamicCompoundingEnabled: true,
    tpPyramidingEnabled: true,
    trailingStopTriggerR: 1.5
  });
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [copiedFeederScript, setCopiedFeederScript] = useState(false);

  // Initialize live customer bridges fleet with unified customer account store & real-time polling
  useEffect(() => {
    const fetchData = async () => {
      const feederData = await fetchAdminFeederTelemetry();
      setFeeder(feederData);

      const unifiedFleet = await getAllFleetCustomerAccounts();
      const mappedFleet: CustomerBridgeTelemetry[] = unifiedFleet.map(u => {
        if (u.telemetry) {
          return u.telemetry;
        }
        const isProp = u.executionMode === 'prop_firm_guardian';
        const base = getDefaultCustomerBridge(
          u.userId,
          u.userEmail,
          u.accountSize,
          u.platform,
          u.accountCategory,
          u.executionMode
        );
        return {
          ...base,
          bridgeId: u.id.startsWith('acc-') ? `BRG-${u.platform.toUpperCase()}-${u.accountNumber}` : u.id,
          accountNumber: u.accountNumber,
          accountName: u.assignedTier,
          brokerServer: u.brokerOrExchange,
          balance: u.balance,
          equity: u.equity,
          currentProfit: u.floatingPnl,
          targetProgressPercent: isProp ? Math.max(0, Math.min(100, ((u.equity - u.accountSize) / (u.accountSize * 0.08)) * 100)) : 45,
          dailyDrawdownPercent: u.dailyDrawdownPercent,
          dailyDrawdownLimitPercent: u.dailyDrawdownLimitPercent,
          riskPercentPerTrade: u.riskPercentPerTrade,
          maxConcurrentTrades: u.maxConcurrentTrades,
          maxLeverageLimit: u.maxLeverage,
          latencyMs: u.latencyMs,
          connectionState: u.connectionState,
          autoTradingEnabled: u.autoTradingEnabled,
          activePositions: [],
          adminManagedConfig: {
            assignedTier: u.assignedTier,
            lockedByAdmin: true,
            lastUpdatedBy: 'Admin Risk Console',
            lastUpdatedAt: new Date().toISOString(),
            notes: u.isRealUserAccount ? 'Active Live Customer Master Account' : 'Institutional Prop Fleet'
          }
        };
      });

      setBridges(mappedFleet);
      setSelectedBridge(prev => {
        if (!prev && mappedFleet.length > 0) return mappedFleet[0];
        if (prev) {
          const fresh = mappedFleet.find(b => b.bridgeId === prev.bridgeId || b.accountNumber === prev.accountNumber);
          if (fresh) return fresh;
        }
        return mappedFleet[0] || null;
      });
    };

    fetchData();
    const interval = setInterval(fetchData, 1800);
    return () => clearInterval(interval);
  }, []);

  const handleAdminClosePosition = (ticket: number) => {
    if (!selectedBridge) return;
    const remaining = (selectedBridge.activePositions || []).filter(p => p.ticket !== ticket);
    const pos = (selectedBridge.activePositions || []).find(p => p.ticket === ticket);
    const posProfit = pos ? pos.profit : 0;
    const newBal = selectedBridge.balance + posProfit;
    const newFloating = remaining.reduce((acc, p) => acc + p.profit, 0);

    const updated: CustomerBridgeTelemetry = {
      ...selectedBridge,
      balance: newBal,
      equity: newBal + newFloating,
      currentProfit: newFloating,
      activePositions: remaining,
      detectionLogs: [
        `[${new Date().toLocaleTimeString()}] Admin closed position #${ticket} (${pos?.symbol || 'Trade'} @ $${posProfit.toFixed(2)}).`,
        ...selectedBridge.detectionLogs
      ]
    };

    saveCustomerBridgeTelemetry(updated);
    setSelectedBridge(updated);
    setBridges(prev => prev.map(b => b.bridgeId === updated.bridgeId ? updated : b));
    setActionSuccess(`Admin closed position #${ticket}! Added $${posProfit.toFixed(2)} to customer balance.`);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const handleAdminInjectTrade = async () => {
    if (!selectedBridge) return;
    const quotes = await fetchLiveMarketQuotes();
    const isCrypto = selectedBridge.platformType && selectedBridge.platformType !== 'mt5_forex';
    const chosenSymbol = isCrypto ? 'BTCUSD' : 'XAUUSD';
    const quote = quotes[chosenSymbol] || (chosenSymbol === 'XAUUSD' ? { bid: 2884.50, ask: 2884.75 } : { bid: 88450.00, ask: 88455.00 });
    
    const openPrice = quote.ask;
    const isGold = chosenSymbol === 'XAUUSD';
    const newTicket = Date.now();
    
    const newPos = {
      ticket: newTicket,
      symbol: chosenSymbol,
      type: 'BUY' as const,
      volume: isGold ? 0.50 : 0.05,
      openPrice,
      currentPrice: openPrice,
      sl: openPrice - (isGold ? 15.0 : 500.0),
      tp: openPrice + (isGold ? 35.0 : 1200.0),
      profit: 0.00,
      pips: 0.0,
      openTime: new Date().toISOString(),
      comment: 'Admin Live Order Dispatch'
    };

    const updatedPositions = [newPos, ...(selectedBridge.activePositions || [])];
    const totalFloating = updatedPositions.reduce((acc, p) => acc + p.profit, 0);

    const updated: CustomerBridgeTelemetry = {
      ...selectedBridge,
      equity: selectedBridge.balance + totalFloating,
      currentProfit: totalFloating,
      activePositions: updatedPositions,
      detectionLogs: [
        `[${new Date().toLocaleTimeString()}] Admin dispatched live order: BUY ${newPos.volume} ${chosenSymbol} @ ${openPrice} (#${newTicket})`,
        ...selectedBridge.detectionLogs
      ]
    };

    saveCustomerBridgeTelemetry(updated);
    setSelectedBridge(updated);
    setBridges(prev => prev.map(b => b.bridgeId === updated.bridgeId ? updated : b));
    setActionSuccess(`Dispatched order #${newTicket} (${chosenSymbol} BUY ${newPos.volume} lots @ $${openPrice}) to account #${selectedBridge.accountNumber}!`);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const handleAdminPanicCloseAll = () => {
    if (!selectedBridge) return;
    if (window.confirm(`⚠️ Are you sure you want to close ALL positions on ${selectedBridge.userName}'s account #${selectedBridge.accountNumber}?`)) {
      const closedProfit = (selectedBridge.activePositions || []).reduce((acc, p) => acc + p.profit, 0);
      const newBal = selectedBridge.balance + closedProfit;
      const updated: CustomerBridgeTelemetry = {
        ...selectedBridge,
        balance: newBal,
        equity: newBal,
        currentProfit: 0,
        activePositions: [],
        detectionLogs: [
          `[${new Date().toLocaleTimeString()}] 🚨 Admin triggered Emergency Close All. Realized PnL: $${closedProfit.toFixed(2)}.`,
          ...selectedBridge.detectionLogs
        ]
      };
      saveCustomerBridgeTelemetry(updated);
      setSelectedBridge(updated);
      setBridges(prev => prev.map(b => b.bridgeId === updated.bridgeId ? updated : b));
      setActionSuccess(`All positions closed on account #${selectedBridge.accountNumber}! Locked PnL: $${closedProfit.toFixed(2)}.`);
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };

  const handleOpenEditConfig = (bridge: CustomerBridgeTelemetry) => {
    setSelectedBridge(bridge);
    const isGrowth = bridge.executionMode === 'account_growth_accelerator';
    setEditForm({
      executionMode: bridge.executionMode || 'prop_firm_guardian',
      accountType: bridge.accountType,
      platformType: bridge.platformType || 'mt5_forex',
      initialDeposit: bridge.initialDeposit,
      riskPercentPerTrade: bridge.riskPercentPerTrade,
      maxConcurrentTrades: bridge.maxConcurrentTrades || (isGrowth ? 3 : 2),
      dailyDrawdownLimitPercent: bridge.dailyDrawdownLimitPercent,
      maxLeverageLimit: bridge.maxLeverageLimit || (bridge.platformType?.includes('mt5') ? 100 : isGrowth ? 20 : 10),
      autoTradingEnabled: bridge.autoTradingEnabled,
      assignedTier: bridge.adminManagedConfig?.assignedTier || (isGrowth ? `$${(bridge.initialDeposit / 1000).toFixed(0)}k Growth Accelerator` : `$${(bridge.initialDeposit / 1000).toFixed(0)}k Institutional Prop Tier`),
      notes: bridge.adminManagedConfig?.notes || '',
      growthAggressionTier: bridge.growthConfig?.growthAggressionTier || 'high_velocity',
      dynamicCompoundingEnabled: bridge.growthConfig?.dynamicCompoundingEnabled ?? true,
      tpPyramidingEnabled: bridge.growthConfig?.tpPyramidingEnabled ?? true,
      trailingStopTriggerR: bridge.growthConfig?.trailingStopTriggerR || 1.5
    });
    setIsEditingConfig(true);
  };

  const handleSaveAdminConfig = () => {
    if (!selectedBridge) return;

    const isCrypto = editForm.platformType !== 'mt5_forex';
    const isGrowth = editForm.executionMode === 'account_growth_accelerator';

    const updatedBridge: CustomerBridgeTelemetry = {
      ...selectedBridge,
      executionMode: editForm.executionMode,
      platformType: editForm.platformType,
      accountType: editForm.accountType,
      initialDeposit: editForm.initialDeposit,
      currency: isCrypto ? 'USDT' : 'USD',
      riskPercentPerTrade: editForm.riskPercentPerTrade,
      maxConcurrentTrades: editForm.maxConcurrentTrades,
      dailyDrawdownLimitPercent: editForm.dailyDrawdownLimitPercent,
      maxLeverageLimit: editForm.maxLeverageLimit,
      autoTradingEnabled: editForm.autoTradingEnabled,
      profitTarget: editForm.initialDeposit * (isGrowth ? 0.50 : isCrypto ? 0.10 : 0.08),
      growthConfig: isGrowth ? {
        growthAggressionTier: editForm.growthAggressionTier,
        dynamicCompoundingEnabled: editForm.dynamicCompoundingEnabled,
        tpPyramidingEnabled: editForm.tpPyramidingEnabled,
        maxOpenRiskPercent: editForm.riskPercentPerTrade * editForm.maxConcurrentTrades,
        riskPercentPerTrade: editForm.riskPercentPerTrade,
        trailingStopTriggerR: editForm.trailingStopTriggerR,
        maxConcurrentTrades: editForm.maxConcurrentTrades,
        maxLeverageCap: editForm.maxLeverageLimit,
        dailySoftStopPercent: editForm.dailyDrawdownLimitPercent,
        compoundProfitReinvestPct: 100
      } : undefined,
      adminManagedConfig: {
        assignedTier: editForm.assignedTier,
        lockedByAdmin: true,
        lastUpdatedBy: 'Admin (Master Risk Officer)',
        lastUpdatedAt: new Date().toISOString(),
        notes: editForm.notes
      }
    };

    // Update fleet and selected
    const updatedFleet = bridges.map(b => b.bridgeId === selectedBridge.bridgeId ? updatedBridge : b);
    setBridges(updatedFleet);
    setSelectedBridge(updatedBridge);
    saveCustomerBridgeTelemetry(updatedBridge);
    setIsEditingConfig(false);

    setActionSuccess(`Successfully assigned ${isGrowth ? 'Account Growth Accelerator' : 'Prop Guardian'} profile to ${selectedBridge.userName} (${selectedBridge.bridgeId})! Client portal updated & locked.`);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const handleToggleFeederStatus = () => {
    if (!feeder) return;
    const nextStatus = feeder.status === 'STREAMING' ? 'IDLE' : 'STREAMING';
    const updated: AdminFeederTelemetry = {
      ...feeder,
      status: nextStatus,
      lastTickAt: new Date().toISOString()
    };
    setFeeder(updated);
    saveAdminFeederTelemetry(updated);
    setActionSuccess(`Admin Market Feeder is now ${nextStatus}.`);
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const handleCopyScript = () => {
    const script = generateVisualBridgeStandaloneScript();
    navigator.clipboard.writeText(script);
    setCopiedFeederScript(true);
    setTimeout(() => setCopiedFeederScript(false), 3000);
  };

  const filteredBridges = bridges.filter(b => {
    const matchesSearch = b.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.accountNumber.includes(searchQuery) ||
      b.bridgeId.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;
    if (filterType === 'growth') return b.executionMode === 'account_growth_accelerator';
    if (filterType === 'forex_growth') return b.executionMode === 'account_growth_accelerator' && (!b.platformType || b.platformType === 'mt5_forex');
    if (filterType === 'crypto_growth') return b.executionMode === 'account_growth_accelerator' && (b.platformType && b.platformType !== 'mt5_forex');
    if (filterType === 'prop') return b.executionMode === 'prop_firm_guardian' || b.accountType.includes('prop');
    if (filterType === 'crypto') return b.platformType && b.platformType !== 'mt5_forex';
    if (filterType === 'forex') return !b.platformType || b.platformType === 'mt5_forex';
    return true;
  });

  const totalGrowthAccounts = bridges.filter(b => b.executionMode === 'account_growth_accelerator').length;
  const totalPropAccounts = bridges.filter(b => b.executionMode !== 'account_growth_accelerator' && b.accountType.includes('prop')).length;
  const totalCryptoAccounts = bridges.filter(b => b.platformType && b.platformType !== 'mt5_forex').length;
  const totalForexGrowthAccounts = bridges.filter(b => b.executionMode === 'account_growth_accelerator' && (!b.platformType || b.platformType === 'mt5_forex')).length;
  const activeConnectedCount = bridges.filter(b => b.connectionState === 'connected').length;
  const avgLatency = Math.round(bridges.reduce((acc, b) => acc + b.latencyMs, 0) / (bridges.length || 1));
  const totalFleetEquity = bridges.reduce((acc, b) => acc + b.equity, 0);

  return (
    <AdminLayout>
      <div className="space-y-6 pb-12">
        {/* Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
                Institutional Bridge Fleet &amp; Multi-Asset Admin
                <Badge variant="green" className="text-xs">
                  Master Admin Control
                </Badge>
              </h1>
              <p className="text-sm text-zinc-400">
                Master Governance: Full customisation for Forex (MT5) and Crypto Props (Bybit, Binance, OKX, Bitget). Customers are locked in Read-Only mode.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleFeederStatus}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 border shadow-lg ${
                feeder?.status === 'STREAMING'
                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}
            >
              {feeder?.status === 'STREAMING' ? (
                <>
                  <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                  Scanner Feeder: STREAMING
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Scanner Feeder
                </>
              )}
            </button>
          </div>
        </div>

        {/* Action Success Toast */}
        {actionSuccess && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-sm flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Top Fleet KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Customer Bridges Fleet</span>
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {activeConnectedCount} / {bridges.length} Online
            </div>
            <div className="mt-2 text-xs text-zinc-400">
              {totalPropAccounts} Prop Evaluations • {totalGrowthAccounts} Growth Accel • {totalCryptoAccounts} Crypto Futures
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Fleet Total Managed Capital</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400 tracking-tight">
              ${totalFleetEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="mt-2 text-xs text-zinc-400">
              Under autonomous HashiBot execution
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Execution Fleet Latency</span>
              <Activity className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-cyan-300 tracking-tight">
              {avgLatency} ms
            </div>
            <div className="mt-2 text-xs text-zinc-400">
              Sub-10ms direct API &amp; MT5 pipe routing
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Admin Master Governance</span>
              <ShieldCheck className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-amber-300 tracking-tight flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-400" />
              100% Client Lock
            </div>
            <div className="mt-2 text-xs text-zinc-400 truncate">
              Admin-Only Risk &amp; Tier Override
            </div>
          </div>
        </div>

        {/* SECTION 1: CENTRAL ADMIN MT5 MARKET DATA FEEDER */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Central Admin MT5 &amp; Crypto Data Feeder</h2>
                <p className="text-xs text-zinc-400">
                  Feeds real-time Gold (XAUUSD), Major Forex &amp; Crypto Perpetual ticks directly into the HashiBot Cloud Scanner.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyScript}
                className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 border border-zinc-700"
              >
                {copiedFeederScript ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copiedFeederScript ? 'Copied Feeder Script!' : 'Copy Feeder Script'}
              </button>
            </div>
          </div>

          {/* Streaming Symbols Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {feeder?.activeSymbols.map((item) => (
              <div key={item.symbol} className="p-3 bg-black/40 border border-zinc-800/80 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">{item.symbol}</span>
                  <span className="text-[10px] text-emerald-400 font-mono">{item.spreadPips}p</span>
                </div>
                <div className="text-sm font-mono text-cyan-300 font-semibold">
                  {item.bid.toFixed(item.symbol.includes('JPY') ? 3 : item.symbol === 'XAUUSD' || item.symbol.includes('BTC') || item.symbol === 'US30' || item.symbol === 'NAS100' ? 2 : 5)}
                </div>
                <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {item.lastUpdate}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 2: CUSTOMER BRIDGES FLEET TABLE & INSPECTOR */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bridges List */}
          <div className="lg:col-span-2 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-400" />
                Customer Account Fleet ({filteredBridges.length})
              </h3>

              <div className="flex items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search account / email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-3 py-1.5 bg-black/50 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 w-44"
                  />
                </div>

                {/* Filter */}
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="bg-black/50 border border-zinc-800 rounded-xl text-xs text-zinc-300 px-3 py-1.5 focus:outline-none"
                >
                  <option value="all">All Modes &amp; Accounts ({bridges.length})</option>
                  <option value="growth">⚡ All Growth Mode Accounts ({totalGrowthAccounts})</option>
                  <option value="forex_growth">📈 Forex &amp; Metals Growth ({totalForexGrowthAccounts})</option>
                  <option value="crypto_growth">🚀 Crypto Futures Growth ({totalGrowthAccounts - totalForexGrowthAccounts})</option>
                  <option value="prop">🛡️ Prop Firm Guardian Accounts ({totalPropAccounts})</option>
                  <option value="forex">Forex &amp; Metals MT5 Fleet ({bridges.filter(b => !b.platformType || b.platformType === 'mt5_forex').length})</option>
                  <option value="crypto">Crypto Futures Fleet ({totalCryptoAccounts})</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                    <th className="pb-3 px-3">Customer / Platform</th>
                    <th className="pb-3 px-3">Profile Mode / Tier</th>
                    <th className="pb-3 px-3">Balance / Equity</th>
                    <th className="pb-3 px-3">Profit / Target</th>
                    <th className="pb-3 px-3">Daily DD</th>
                    <th className="pb-3 px-3">Risk Lock</th>
                    <th className="pb-3 px-3">Admin Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredBridges.map((b) => {
                    const isSelected = selectedBridge?.bridgeId === b.bridgeId;
                    const isCrypto = b.platformType && b.platformType !== 'mt5_forex';
                    const isGrowth = b.executionMode === 'account_growth_accelerator';
                    return (
                      <tr
                        key={b.bridgeId}
                        onClick={() => setSelectedBridge(b)}
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-cyan-500/10' : 'hover:bg-zinc-800/30'
                        }`}
                      >
                        <td className="py-3 px-3">
                          <div className="font-semibold text-white flex items-center gap-1.5">
                            {b.userName}
                            {isCrypto ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {b.platformType?.replace('_futures', '').toUpperCase()}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                MT5
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-500 font-mono">#{b.accountNumber} ({b.bridgeId})</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-col gap-1">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 w-fit ${
                              isGrowth
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25'
                            }`}>
                              {isGrowth ? '⚡ GROWTH ACCEL' : '🛡️ PROP GUARDIAN'}
                            </span>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              ${(b.initialDeposit / 1000).toFixed(0)}k {b.accountType.replace('crypto_', '').replace('_prop', ' Prop').replace('_growth_personal', ' Personal').toUpperCase()}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-mono text-zinc-200">${b.equity.toLocaleString()} {b.currency}</div>
                          <div className="text-[10px] text-zinc-500">Bal: ${b.balance.toLocaleString()}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className={`font-bold font-mono ${b.currentProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {b.currentProfit >= 0 ? '+' : ''}${b.currentProfit.toFixed(2)}
                          </div>
                          {b.profitTarget > 0 && (
                            <div className="text-[10px] text-zinc-400">{b.targetProgressPercent.toFixed(1)}% of Target</div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`font-mono text-xs font-semibold ${
                            b.dailyDrawdownPercent < 3.0 ? 'text-zinc-300' : 'text-amber-400'
                          }`}>
                            {b.dailyDrawdownPercent.toFixed(2)}%
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1 font-mono text-xs text-cyan-300">
                            <Lock className="w-3 h-3 text-amber-400" />
                            {b.riskPercentPerTrade}%
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditConfig(b);
                            }}
                            className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-cyan-500 hover:text-black text-zinc-300 transition text-[11px] font-bold flex items-center gap-1"
                          >
                            <Settings className="w-3 h-3" /> Edit Config
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected Customer Bridge Detailed Inspector */}
          {selectedBridge && (
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Account Inspector</div>
                  <h4 className="text-base font-bold text-white flex items-center gap-1.5">
                    {selectedBridge.userName}
                    <span className="text-xs font-normal text-zinc-400">({selectedBridge.userEmail})</span>
                  </h4>
                  <div className="text-xs text-zinc-400 font-mono">#{selectedBridge.accountNumber} @ {selectedBridge.brokerServer}</div>
                </div>
                <Badge variant="green" className="text-xs">
                  Connected
                </Badge>
              </div>

              {/* Admin Lock Banner */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs space-y-1">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> Customer Controls are Locked (Read-Only)
                </div>
                <p className="text-zinc-300 text-[11px]">
                  The customer sees this config in their portal but cannot modify risk, lot limits, or daily drawdown settings. Only you as Admin can customize these rules.
                </p>
              </div>

              {/* Inspector KPI Rows */}
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between p-2.5 bg-black/40 rounded-xl border border-zinc-800">
                  <span className="text-zinc-400">Platform &amp; Type:</span>
                  <span className="font-semibold text-white uppercase">{selectedBridge.platformType || 'MT5 FOREX'}</span>
                </div>
                <div className="flex justify-between p-2.5 bg-black/40 rounded-xl border border-zinc-800">
                  <span className="text-zinc-400">Assigned Tier:</span>
                  <span className="font-bold text-cyan-300">{selectedBridge.adminManagedConfig?.assignedTier || `$${(selectedBridge.initialDeposit / 1000).toFixed(0)}k Tier`}</span>
                </div>
                <div className="flex justify-between p-2.5 bg-black/40 rounded-xl border border-zinc-800">
                  <span className="text-zinc-400">Balance / Equity:</span>
                  <span className="font-mono font-bold text-white">
                    ${selectedBridge.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} / <span className="text-cyan-300">${selectedBridge.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </span>
                </div>
                <div className="flex justify-between p-2.5 bg-black/40 rounded-xl border border-zinc-800">
                  <span className="text-zinc-400">Risk Per Trade:</span>
                  <span className="font-mono font-bold text-emerald-400">{selectedBridge.riskPercentPerTrade}% (${(selectedBridge.initialDeposit * (selectedBridge.riskPercentPerTrade / 100)).toFixed(0)})</span>
                </div>
                <div className="flex justify-between p-2.5 bg-black/40 rounded-xl border border-zinc-800">
                  <span className="text-zinc-400">Max Concurrent Trades:</span>
                  <span className="font-mono text-white">{selectedBridge.maxConcurrentTrades || 2} Trades Max</span>
                </div>
                <div className="flex justify-between p-2.5 bg-black/40 rounded-xl border border-zinc-800">
                  <span className="text-zinc-400">Daily Hard Lock:</span>
                  <span className="font-mono text-amber-400">{selectedBridge.dailyDrawdownLimitPercent}% (${(selectedBridge.initialDeposit * (selectedBridge.dailyDrawdownLimitPercent / 100)).toFixed(0)})</span>
                </div>
                <div className="flex justify-between p-2.5 bg-black/40 rounded-xl border border-zinc-800">
                  <span className="text-zinc-400">Auto-Trading Status:</span>
                  <span className={`font-bold ${selectedBridge.autoTradingEnabled ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {selectedBridge.autoTradingEnabled ? 'ACTIVE & EXECUTING' : 'PAUSED'}
                  </span>
                </div>
              </div>

              {/* Live Open Positions Fleet Inspector */}
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    Live Open Positions ({selectedBridge.activePositions?.length || 0})
                  </div>
                  <button
                    onClick={handleAdminInjectTrade}
                    className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold rounded-lg transition"
                  >
                    + Inject Live Trade
                  </button>
                </div>

                {!selectedBridge.activePositions || selectedBridge.activePositions.length === 0 ? (
                  <div className="p-3 bg-black/40 rounded-xl border border-zinc-800 text-[11px] text-zinc-500 text-center">
                    No active positions currently open on account #{selectedBridge.accountNumber}.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {selectedBridge.activePositions.map((pos) => (
                      <div
                        key={pos.ticket}
                        className="p-2.5 bg-black/50 border border-zinc-800 rounded-xl flex items-center justify-between text-xs font-mono"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white font-sans">{pos.symbol}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              pos.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                            }`}>
                              {pos.type} {pos.volume.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-zinc-500">#{pos.ticket}</span>
                          </div>
                          <div className="text-[11px] text-zinc-400 mt-0.5">
                            Open: {pos.openPrice} → Now: <span className="text-cyan-300 font-bold">{pos.currentPrice}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-xs ${pos.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {pos.profit >= 0 ? '+' : ''}${pos.profit.toFixed(2)}
                          </span>
                          <button
                            onClick={() => handleAdminClosePosition(pos.ticket)}
                            className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-[10px] font-sans font-bold"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Host & Detection Info */}
              <div className="space-y-1 text-[11px] text-zinc-400 bg-black/50 p-3 rounded-xl border border-zinc-800/80 font-mono">
                <div>Daemon: {selectedBridge.osInfo}</div>
                <div>Latency: {selectedBridge.latencyMs}ms</div>
                {selectedBridge.apiKeyMasked && <div>API Key: {selectedBridge.apiKeyMasked}</div>}
              </div>

              {/* Primary Admin Edit & Action Triggers */}
              <div className="pt-2 border-t border-zinc-800 flex flex-col gap-2">
                <button
                  onClick={() => handleOpenEditConfig(selectedBridge)}
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-500/20"
                >
                  <Settings className="w-4 h-4 text-black" /> Customize Customer Rules &amp; Prop Tier
                </button>
                <button
                  onClick={handleAdminPanicCloseAll}
                  className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5 text-rose-400" /> Admin Emergency Close All Positions
                </button>
              </div>
            </div>
          )}
        </div>

        {/* MODAL: ADMIN MASTER CONFIGURATION & RULE OVERRIDE */}
        {isEditingConfig && selectedBridge && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Admin Master Rule &amp; Tier Customizer</h3>
                    <p className="text-xs text-zinc-400">
                      Configure custom execution, prop parameters, and risk limits for <strong className="text-white">{selectedBridge.userName}</strong>.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditingConfig(false)}
                  className="text-zinc-400 hover:text-white text-xs font-semibold px-2.5 py-1 bg-zinc-800 rounded-lg"
                >
                  ✕ Close
                </button>
              </div>

              <div className="space-y-4 text-xs">
                {/* 🌟 PROFILE MODE SWITCH: PROP FIRM GUARDIAN vs ACCOUNT GROWTH ACCELERATOR */}
                <div className="p-3.5 bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-purple-950/30 border border-cyan-500/30 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-cyan-400" />
                      Execution Profile Mode:
                    </label>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">
                      {editForm.executionMode === 'account_growth_accelerator' ? '⚡ High-Yield Growth Engine' : '🛡️ Strict Evaluation Protection'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditForm({
                        ...editForm,
                        executionMode: 'prop_firm_guardian',
                        riskPercentPerTrade: 0.5,
                        maxConcurrentTrades: 2,
                        dailyDrawdownLimitPercent: 4.5,
                        maxLeverageLimit: editForm.platformType === 'mt5_forex' ? 100 : 10,
                        assignedTier: `$${(editForm.initialDeposit / 1000).toFixed(0)}k Institutional Prop Evaluation`,
                        accountType: editForm.platformType !== 'mt5_forex' ? 'crypto_50k_prop' : '50k_prop'
                      })}
                      className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 ${
                        editForm.executionMode === 'prop_firm_guardian'
                          ? 'bg-cyan-500/15 border-cyan-500 text-white shadow-md'
                          : 'bg-black/40 border-zinc-800 text-zinc-400 hover:bg-zinc-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-cyan-300">🛡️ Prop Firm Guardian</span>
                        {editForm.executionMode === 'prop_firm_guardian' && <Check className="w-4 h-4 text-cyan-400" />}
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Strict 0.5% risk cap, 4.5% hard lockout circuit breaker, max 2 concurrent trades. Designed for passing &amp; funding challenges.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditForm({
                        ...editForm,
                        executionMode: 'account_growth_accelerator',
                        riskPercentPerTrade: 1.5,
                        maxConcurrentTrades: 3,
                        dailyDrawdownLimitPercent: 9.0,
                        maxLeverageLimit: editForm.platformType === 'mt5_forex' ? 100 : 15,
                        assignedTier: `$${(editForm.initialDeposit / 1000).toFixed(0)}k ${editForm.platformType === 'mt5_forex' ? 'Forex & Gold' : 'Crypto'} Growth Accelerator (1.5% Compound)`,
                        accountType: editForm.platformType === 'mt5_forex' ? 'forex_growth_personal' : 'crypto_growth_personal'
                      })}
                      className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 ${
                        editForm.executionMode === 'account_growth_accelerator'
                          ? 'bg-purple-500/20 border-purple-500 text-white shadow-md'
                          : 'bg-black/40 border-zinc-800 text-zinc-400 hover:bg-zinc-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-purple-300">⚡ Account Growth Accelerator</span>
                        {editForm.executionMode === 'account_growth_accelerator' && <Check className="w-4 h-4 text-purple-400" />}
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Aggressive compounding for personal accounts (Forex MT5, Gold / Metals, Crypto Futures). Allows 1.0%–2.0% risk, dynamic equity scaling, and multi-TP pyramiding.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Platform & Broker Engine */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-zinc-300 font-semibold flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-cyan-400" /> Platform / Broker Route:
                    </label>
                    <select
                      value={editForm.platformType}
                      onChange={(e) => {
                        const plat = e.target.value as BridgePlatformType;
                        const isMT5 = plat === 'mt5_forex';
                        setEditForm({
                          ...editForm,
                          platformType: plat,
                          maxLeverageLimit: isMT5 ? 100 : 15,
                          accountType: editForm.executionMode === 'account_growth_accelerator'
                            ? (isMT5 ? 'forex_growth_personal' : 'crypto_growth_personal')
                            : (isMT5 ? '50k_prop' : 'crypto_50k_prop')
                        });
                      }}
                      className="w-full bg-black/60 border border-zinc-700 rounded-xl p-2.5 text-zinc-200 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="mt5_forex">MetaTrader 5 (Forex, Gold XAUUSD &amp; Metals / ECN)</option>
                      <option value="bybit_futures">Bybit USDT Perpetual (Crypto Futures / API)</option>
                      <option value="binance_futures">Binance USD-M Futures (Crypto Futures / API)</option>
                      <option value="okx_futures">OKX Unified SWAP (Crypto Futures / API)</option>
                      <option value="bitget_futures">Bitget Futures (Crypto Futures / API)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-zinc-300 font-semibold flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-amber-400" /> Account Category / Challenge:
                    </label>
                    <select
                      value={editForm.accountType}
                      onChange={(e) => setEditForm({ ...editForm, accountType: e.target.value as AccountCategory })}
                      className="w-full bg-black/60 border border-zinc-700 rounded-xl p-2.5 text-zinc-200 focus:outline-none focus:border-cyan-500"
                    >
                      <optgroup label="⚡ Account Growth Accelerator (Forex, Metals &amp; Crypto)">
                        <option value="forex_growth_personal">📈 Personal Forex Growth Accelerator (MT5)</option>
                        <option value="gold_growth_personal">🥇 Personal Gold / Metals Growth (XAUUSD Compounding)</option>
                        <option value="forex_growth_aggressive">🔥 Aggressive Forex &amp; Gold Compound (Hyper-Drive)</option>
                        <option value="crypto_growth_personal">🚀 Personal Crypto Futures (Growth Accelerator)</option>
                        <option value="crypto_growth_aggressive">🔥 Aggressive Crypto Compound (Hyper-Drive)</option>
                      </optgroup>
                      <optgroup label="🛡️ Institutional Forex Prop Firm Evaluations">
                        <option value="10k_prop">$10,000 Forex Prop Challenge</option>
                        <option value="25k_prop">$25,000 Forex Prop Challenge</option>
                        <option value="50k_prop">$50,000 Forex Prop Challenge</option>
                        <option value="100k_prop">$100,000 Forex Prop Challenge</option>
                        <option value="200k_prop">$200,000 Forex Prop Challenge</option>
                      </optgroup>
                      <optgroup label="🛡️ Institutional Crypto Prop Firm Evaluations">
                        <option value="crypto_10k_prop">$10,000 Crypto Prop (Bybit/Binance)</option>
                        <option value="crypto_25k_prop">$25,000 Crypto Prop (Bybit/Binance)</option>
                        <option value="crypto_50k_prop">$50,000 Crypto Prop (Bybit/Binance)</option>
                        <option value="crypto_100k_prop">$100,000 Crypto Prop (Bybit/Binance)</option>
                      </optgroup>
                      <optgroup label="Custom Live Accounts">
                        <option value="personal_mt5">Standard Personal Forex MT5 Live</option>
                        <option value="personal_crypto_api">Standard Personal Crypto API Live</option>
                        <option value="custom_prop">Custom Institutional Account</option>
                      </optgroup>
                    </select>
                  </div>
                </div>

                {/* Growth Accelerator Specific Rule Matrix */}
                {editForm.executionMode === 'account_growth_accelerator' && (
                  <div className="p-3.5 bg-purple-950/20 border border-purple-500/30 rounded-xl space-y-3">
                    <div className="font-bold text-purple-300 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        ⚡ {editForm.platformType === 'mt5_forex' ? 'Forex & Metals Growth Engine' : 'Crypto Futures Growth Engine'}:
                      </span>
                      <span className="text-[10px] text-zinc-400">Institutional Compounding Matrix</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-zinc-300 font-medium">Aggression Tier:</label>
                        <select
                          value={editForm.growthAggressionTier}
                          onChange={(e) => {
                            const tier = e.target.value as 'balanced_growth' | 'high_velocity' | 'hyper_drive';
                            setEditForm({
                              ...editForm,
                              growthAggressionTier: tier,
                              riskPercentPerTrade: tier === 'hyper_drive' ? 2.0 : tier === 'high_velocity' ? 1.5 : 1.0,
                              maxConcurrentTrades: tier === 'hyper_drive' ? 4 : 3,
                              maxLeverageLimit: editForm.platformType === 'mt5_forex' ? 100 : (tier === 'hyper_drive' ? 20 : tier === 'high_velocity' ? 15 : 10),
                              dailyDrawdownLimitPercent: tier === 'hyper_drive' ? 12.0 : tier === 'high_velocity' ? 9.0 : 6.5
                            });
                          }}
                          className="w-full bg-black/60 border border-zinc-700 rounded-lg p-2 text-zinc-200"
                        >
                          <option value="balanced_growth">Balanced Growth (1.0% Risk / High RR)</option>
                          <option value="high_velocity">High Velocity (1.5% Risk / Compound)</option>
                          <option value="hyper_drive">Hyper-Drive (2.0% Risk / Max Pyramiding)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-zinc-300 font-medium">Dynamic Lot Compounding:</label>
                        <select
                          value={editForm.dynamicCompoundingEnabled ? 'yes' : 'no'}
                          onChange={(e) => setEditForm({ ...editForm, dynamicCompoundingEnabled: e.target.value === 'yes' })}
                          className="w-full bg-black/60 border border-zinc-700 rounded-lg p-2 text-zinc-200"
                        >
                          <option value="yes">Enabled (Auto-Scale Lots on Live Equity)</option>
                          <option value="no">Disabled (Static Deposit)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-zinc-300 font-medium">Breakout &amp; Runner Pyramiding:</label>
                        <select
                          value={editForm.tpPyramidingEnabled ? 'yes' : 'no'}
                          onChange={(e) => setEditForm({ ...editForm, tpPyramidingEnabled: e.target.value === 'yes' })}
                          className="w-full bg-black/60 border border-zinc-700 rounded-lg p-2 text-zinc-200"
                        >
                          <option value="yes">Enabled (Stack on Grade A+ Gold/FX/Crypto)</option>
                          <option value="no">Disabled (Single Entry Only)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Capital & Risk Parameters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-zinc-300 font-semibold">Account Capital ($):</label>
                    <input
                      type="number"
                      value={editForm.initialDeposit}
                      onChange={(e) => setEditForm({ ...editForm, initialDeposit: Number(e.target.value) })}
                      className="w-full bg-black/60 border border-zinc-700 rounded-xl p-2.5 text-zinc-200 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-zinc-300 font-semibold">Risk Per Trade (%):</label>
                    <input
                      type="number"
                      step="0.05"
                      value={editForm.riskPercentPerTrade}
                      onChange={(e) => setEditForm({ ...editForm, riskPercentPerTrade: Number(e.target.value) })}
                      className="w-full bg-black/60 border border-zinc-700 rounded-xl p-2.5 text-zinc-200 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-zinc-300 font-semibold">Daily Limit / Soft Stop (%):</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editForm.dailyDrawdownLimitPercent}
                      onChange={(e) => setEditForm({ ...editForm, dailyDrawdownLimitPercent: Number(e.target.value) })}
                      className="w-full bg-black/60 border border-zinc-700 rounded-xl p-2.5 text-zinc-200 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                </div>

                {/* Concurrency & Leverage Caps */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-zinc-300 font-semibold">Max Concurrent Trades:</label>
                    <select
                      value={editForm.maxConcurrentTrades}
                      onChange={(e) => setEditForm({ ...editForm, maxConcurrentTrades: Number(e.target.value) })}
                      className="w-full bg-black/60 border border-zinc-700 rounded-xl p-2.5 text-zinc-200 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="1">1 Trade Max (Ultra-Conservative)</option>
                      <option value="2">2 Trades Max (Standard Prop Firm)</option>
                      <option value="3">3 Trades Max (Growth Recommended)</option>
                      <option value="4">4 Trades Max (Aggressive Growth)</option>
                      <option value="5">5 Trades Max (Max Expansion)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-zinc-300 font-semibold">
                      {editForm.platformType === 'mt5_forex' ? 'Broker Leverage (Forex & Metals):' : 'Max Cross Leverage Cap (Crypto):'}
                    </label>
                    <select
                      value={editForm.maxLeverageLimit}
                      onChange={(e) => setEditForm({ ...editForm, maxLeverageLimit: Number(e.target.value) })}
                      className="w-full bg-black/60 border border-zinc-700 rounded-xl p-2.5 text-zinc-200 focus:outline-none focus:border-cyan-500"
                    >
                      {editForm.platformType === 'mt5_forex' ? (
                        <>
                          <option value="50">1:50 (50x Regulated Standard)</option>
                          <option value="100">1:100 (100x Standard Prop &amp; Live)</option>
                          <option value="200">1:200 (200x High-Velocity Growth)</option>
                          <option value="500">1:500 (500x Max ECN Raw)</option>
                        </>
                      ) : (
                        <>
                          <option value="5">5x Cross Leverage (Conservative)</option>
                          <option value="10">10x Leverage (Prop Firm Cap)</option>
                          <option value="15">15x Leverage (Growth Sweet Spot)</option>
                          <option value="20">20x Leverage (Hyper-Drive Max Cap)</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                {/* Assigned Tier Title & Internal Admin Notes */}
                <div className="space-y-1.5">
                  <label className="text-zinc-300 font-semibold">Custom Tier Label (Visible to Customer):</label>
                  <input
                    type="text"
                    value={editForm.assignedTier}
                    onChange={(e) => setEditForm({ ...editForm, assignedTier: e.target.value })}
                    placeholder="e.g. $50k FTMO Stellar Tier (0.5% Lock)"
                    className="w-full bg-black/60 border border-zinc-700 rounded-xl p-2.5 text-zinc-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-zinc-300 font-semibold">Admin Internal Notes:</label>
                  <textarea
                    rows={2}
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="e.g. Customer purchased Phase 1 evaluation. Risk locked to 0.5% per trade with 4.5% daily drawdown breaker."
                    className="w-full bg-black/60 border border-zinc-700 rounded-xl p-2.5 text-zinc-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  onClick={() => setIsEditingConfig(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAdminConfig}
                  className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-500/20"
                >
                  <Lock className="w-3.5 h-3.5" /> Save &amp; Lock Client Configuration
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

