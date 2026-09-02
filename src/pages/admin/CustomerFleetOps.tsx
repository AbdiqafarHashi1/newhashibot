import { useEffect, useState, useCallback, useMemo } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { CustomerSubscription, CustomerBotSetup as CustomerBotSetupType } from '../../lib/types';
import { getAllFleetCustomerAccounts } from '../../lib/customerAccountManager';
import {
  Users, Cpu, Activity, Play, Pause, AlertTriangle, CheckCircle2,
  Search, RefreshCw, Settings2, DollarSign,
  Eye, X, Zap, Layers, AlertOctagon, Check, TrendingUp,
  SlidersHorizontal, Sparkles
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface CustomerFleetRecord {
  subscription: CustomerSubscription;
  botSetup: CustomerBotSetupType | null;
  mt5Account: {
    id: string;
    broker: string;
    server: string;
    account_number_masked: string;
    account_type: string;
    balance?: number;
    equity?: number;
    margin?: number;
    free_margin?: number;
    floating_pnl?: number;
    connection_status?: string;
    execution_enabled?: boolean;
    last_sync_at?: string;
  } | null;
  cryptoAccount: {
    exchange: string;
    status: string;
    balance: number;
    equity: number;
    marginUsed: number;
    openPositionsCount: number;
    floatingPnl: number;
  } | null;
  activePositions: Array<{
    id: string;
    symbol: string;
    side: string;
    entry_price: number;
    current_price: number;
    stop_loss: number;
    take_profit_1: number;
    take_profit_2: number;
    unrealized_pnl: number;
    quantity: number;
    is_breakeven_set?: boolean;
    tp1_hit?: boolean;
    status: string;
    created_at: string;
  }>;
}

export default function CustomerFleetOps() {
  const [fleet, setFleet] = useState<CustomerFleetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterAsset, setFilterAsset] = useState<'all' | 'crypto' | 'forex' | 'prop'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'running' | 'paused' | 'unpaid' | 'setup_required'>('all');
  
  // Selected Customer for Detailed Live Preview / Drawer
  const [previewCustomer, setPreviewCustomer] = useState<CustomerFleetRecord | null>(null);
  
  // Selected Customer for Engine Configuration Modal
  const [editingEngine, setEditingEngine] = useState<CustomerFleetRecord | null>(null);
  const [editForm, setEditForm] = useState({
    bot_type: 'crypto_personal',
    capital_mode: 'personal',
    platform: 'binance',
    exchange_name: 'Binance USD-M Futures',
    broker_name: '',
    prop_firm_name: '',
    account_size: 10000,
    risk_preset: 'Conservative (0.5%)',
    max_risk_per_trade_pct: 0.5,
    max_daily_loss_pct: 4.5,
    drawdown_limit_pct: 10,
    preferred_symbols: 'BTCUSDT, ETHUSDT, SOLUSDT',
    customer_notes: '',
    admin_notes: '',
  });

  // Action status message
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadFleetData = useCallback(async () => {
    setRefreshing(true);
    try {
      // 1. Fetch all customer subscriptions
      const [subRes, botSetupsRes, mt5Res, posRes] = await Promise.all([
        supabase.from('customer_subscriptions').select('*').order('created_at', { ascending: false }),
        supabase.from('customer_bot_setups').select('*'),
        supabase.from('mt5_accounts_safe').select('*'),
        supabase.from('active_positions').select('*').eq('status', 'open'),
      ]);

      const rawSubs = subRes.data || [];
      const setups: CustomerBotSetupType[] = botSetupsRes.data || [];
      const mt5s = mt5Res.data || [];
      const openPositions = posRes.data || [];

      // Normalize subscriptions to guarantee email and full_name are never undefined
      const subs: CustomerSubscription[] = rawSubs.map((sub: Record<string, unknown>) => {
        const subEmail = String(sub.email || sub.customer_email || sub.user_email || 'trader@hashibot.vip');
        const subFullName = String(sub.full_name || subEmail.split('@')[0] || 'VIP Trader');
        return {
          ...(sub as unknown as CustomerSubscription),
          email: subEmail,
          full_name: subFullName,
        };
      });

      // Merge into CustomerFleetRecord items
      const records: CustomerFleetRecord[] = subs.map(sub => {
        // Find matching bot setup by user_id or email
        const setup = setups.find(s => (sub.user_id && s.user_id === sub.user_id) || (s.subscription_id && s.subscription_id === sub.id)) || null;
        
        // Find matching MT5 account
        const mt5 = mt5s.find((m: { user_id?: string; id?: string }) => sub.user_id && m.user_id === sub.user_id) || null;

        // Filter active open positions for this customer
        const userPositions = openPositions.filter((p: { user_id?: string; account_id?: string }) => 
          (sub.user_id && p.user_id === sub.user_id) || 
          (mt5 && p.account_id === mt5.id)
        );

        // Derive simulated/live crypto account metrics if crypto package
        const isCrypto = sub.package_name?.toLowerCase().includes('crypto') || setup?.bot_type?.includes('crypto');
        const cryptoAccount = isCrypto ? {
          exchange: setup?.exchange_name || 'Binance USD-M',
          status: sub.payment_status === 'paid' ? 'connected' : 'pending_activation',
          balance: setup?.account_size || (sub.amount_paid ? sub.amount_paid * 10 : 2500),
          equity: (setup?.account_size || 2500) + (userPositions.reduce((acc: number, p: { unrealized_pnl?: number }) => acc + Number(p.unrealized_pnl || 0), 0)),
          marginUsed: userPositions.length > 0 ? 15.4 : 0,
          openPositionsCount: userPositions.length,
          floatingPnl: userPositions.reduce((acc: number, p: { unrealized_pnl?: number }) => acc + Number(p.unrealized_pnl || 0), 0)
        } : null;

        return {
          subscription: sub,
          botSetup: setup,
          mt5Account: mt5 ? {
            id: mt5.id,
            broker: mt5.broker || 'MetaQuotes',
            server: mt5.server || 'Demo-Server',
            account_number_masked: mt5.account_number_masked || '••••7890',
            account_type: mt5.account_type || 'personal',
            balance: mt5.balance || setup?.account_size || 50000,
            equity: mt5.equity || setup?.account_size || 50000,
            margin: 0,
            free_margin: mt5.balance || 50000,
            floating_pnl: userPositions.reduce((acc: number, p: { unrealized_pnl?: number }) => acc + Number(p.unrealized_pnl || 0), 0),
            connection_status: mt5.connection_status || 'connected',
            execution_enabled: mt5.execution_enabled ?? (sub.access_status === 'active' && sub.payment_status === 'paid'),
            last_sync_at: mt5.last_sync_at || new Date().toISOString()
          } : null,
          cryptoAccount,
          activePositions: userPositions
        };
      });

      // Always merge all fleet accounts from unified manager so live customer accounts (MT5 #5055164653, Bybit, Binance) appear!
      const unifiedFleet = await getAllFleetCustomerAccounts();
      const existingUserIds = new Set(records.map(r => r.subscription.user_id || r.subscription.email));

      for (const u of unifiedFleet) {
        if (!existingUserIds.has(u.userId) && !existingUserIds.has(u.userEmail)) {
          const isCrypto = u.platform !== 'mt5_forex';
          const userEmail = u.userEmail || `${u.userName || 'user'}@hashibot.vip`;
          const userName = u.userName || userEmail.split('@')[0] || 'VIP Trader';

          records.push({
            subscription: {
              id: `sub-${u.id}`,
              user_id: u.userId,
              profile_id: null,
              email: userEmail,
              full_name: userName,
              package_id: null,
              package_name: u.assignedTier,
              amount_paid: u.accountSize > 10000 ? 499 : 199,
              currency: 'USD',
              payment_reference: 'ref_live_init',
              payment_method: 'card',
              starts_at: new Date().toISOString(),
              expires_at: null,
              telegram_status: 'joined',
              telegram_username: '',
              telegram_chat_id: '',
              notes: '',
              admin_note: '',
              payment_status: 'paid',
              access_status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            botSetup: {
              id: `setup-${u.id}`,
              user_id: u.userId,
              subscription_id: `sub-${u.id}`,
              bot_type: isCrypto ? 'crypto_personal' : (u.executionMode === 'prop_firm_guardian' ? 'forex_prop' : 'forex_personal'),
              capital_mode: u.executionMode === 'prop_firm_guardian' ? 'prop' : 'personal',
              platform: isCrypto ? (u.platform.includes('bybit') ? 'bybit' : 'binance') : 'mt5',
              broker_name: isCrypto ? '' : u.brokerOrExchange,
              exchange_name: isCrypto ? u.brokerOrExchange : '',
              account_number: u.accountNumber,
              account_size: u.accountSize,
              risk_preset: `${u.riskPercentPerTrade}% Risk / Trade`,
              max_risk_per_trade_pct: u.riskPercentPerTrade,
              max_daily_loss_pct: u.dailyDrawdownLimitPercent,
              drawdown_limit_pct: u.dailyDrawdownLimitPercent * 2,
              preferred_symbols: isCrypto ? 'BTCUSDT, ETHUSDT, SOLUSDT' : 'EURUSD, GBPUSD, XAUUSD',
              setup_status: 'running',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            mt5Account: !isCrypto ? {
              id: `mt5-${u.id}`,
              broker: 'MetaQuotes Software Corp.',
              server: u.brokerOrExchange,
              account_number_masked: u.accountNumber,
              account_type: u.executionMode === 'prop_firm_guardian' ? 'prop' : 'personal',
              balance: u.balance,
              equity: u.equity,
              margin: 0,
              free_margin: u.balance,
              floating_pnl: u.floatingPnl,
              connection_status: u.connectionState,
              execution_enabled: u.autoTradingEnabled,
              last_sync_at: u.lastHeartbeat
            } : null,
            cryptoAccount: isCrypto ? {
              exchange: u.brokerOrExchange,
              status: u.connectionState,
              balance: u.balance,
              equity: u.equity,
              marginUsed: 12.5,
              openPositionsCount: u.activePositionsCount,
              floatingPnl: u.floatingPnl
            } : null,
            activePositions: []
          });
        }
      }

      setFleet(records);
    } catch (err) {
      console.error('Failed to load fleet data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadFleetData();
  }, [loadFleetData]);

  // Master Fleet Metrics
  const metrics = useMemo(() => {
    const totalCustomers = fleet.length;
    const paidCustomers = fleet.filter(f => f.subscription.payment_status === 'paid').length;
    const activeRunningEngines = fleet.filter(f => 
      f.subscription.payment_status === 'paid' && 
      f.subscription.access_status === 'active' && 
      (f.botSetup?.setup_status === 'running' || f.botSetup?.setup_status === 'configured' || !f.botSetup)
    ).length;
    const pausedEngines = fleet.filter(f => f.botSetup?.setup_status === 'paused').length;
    
    let totalFleetEquity = 0;
    let totalFleetPositions = 0;
    let totalFloatingPnl = 0;

    fleet.forEach(f => {
      const eq = f.mt5Account?.equity || f.cryptoAccount?.equity || f.botSetup?.account_size || 0;
      totalFleetEquity += eq;
      totalFleetPositions += f.activePositions.length;
      const pnl = f.mt5Account?.floating_pnl || f.cryptoAccount?.floatingPnl || 0;
      totalFloatingPnl += pnl;
    });

    return {
      totalCustomers,
      paidCustomers,
      activeRunningEngines,
      pausedEngines,
      totalFleetEquity,
      totalFleetPositions,
      totalFloatingPnl
    };
  }, [fleet]);

  // Filtered Fleet Records
  const filteredFleet = useMemo(() => {
    return fleet.filter(item => {
      // Search
      const q = search.toLowerCase();
      const subEmail = (item.subscription.email || '').toLowerCase();
      const subName = (item.subscription.full_name || '').toLowerCase();
      const subPkg = (item.subscription.package_name || '').toLowerCase();

      const matchSearch = !q || 
        subEmail.includes(q) ||
        subName.includes(q) ||
        subPkg.includes(q) ||
        item.botSetup?.broker_name?.toLowerCase().includes(q) ||
        item.botSetup?.exchange_name?.toLowerCase().includes(q);

      if (!matchSearch) return false;

      // Filter Asset Class
      const pkg = (item.subscription.package_name || '').toLowerCase();
      const botType = (item.botSetup?.bot_type || '').toLowerCase();

      if (filterAsset === 'crypto') {
        if (!pkg.includes('crypto') && !botType.includes('crypto')) return false;
      } else if (filterAsset === 'forex') {
        if (!pkg.includes('forex') && !pkg.includes('mt5') && !botType.includes('mt5')) return false;
      } else if (filterAsset === 'prop') {
        if (!pkg.includes('prop') && !botType.includes('prop') && item.botSetup?.capital_mode !== 'prop') return false;
      }

      // Filter Status
      const isPaid = item.subscription.payment_status === 'paid';
      const isActive = item.subscription.access_status === 'active';
      const botStatus = item.botSetup?.setup_status || (isPaid && isActive ? 'running' : 'not_configured');

      if (filterStatus === 'running') {
        if (botStatus !== 'running' && botStatus !== 'configured') return false;
      } else if (filterStatus === 'paused') {
        if (botStatus !== 'paused') return false;
      } else if (filterStatus === 'unpaid') {
        if (isPaid) return false;
      } else if (filterStatus === 'setup_required') {
        if (item.botSetup && item.botSetup.setup_status !== 'not_configured') return false;
      }

      return true;
    });
  }, [fleet, search, filterAsset, filterStatus]);

  // Toggle individual customer execution state (Start / Pause)
  const handleToggleCustomerExecution = async (record: CustomerFleetRecord, targetStatus: 'running' | 'paused') => {
    setActionLoadingId(record.subscription.id);
    setActionNotice(null);

    try {
      // 1. Update customer_bot_setups
      if (record.botSetup?.id) {
        await supabase
          .from('customer_bot_setups')
          .update({
            setup_status: targetStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', record.botSetup.id);
      } else if (record.subscription.user_id) {
        // Create initial setup row if missing
        await supabase
          .from('customer_bot_setups')
          .insert({
            user_id: record.subscription.user_id,
            subscription_id: record.subscription.id,
            package_slug: record.subscription.package_name?.toLowerCase().includes('crypto') ? 'crypto_personal_bot' : 'forex_mt5_prop_bot',
            bot_type: record.subscription.package_name?.toLowerCase().includes('crypto') ? 'crypto_personal' : 'forex_mt5_prop',
            capital_mode: record.subscription.package_name?.toLowerCase().includes('prop') ? 'prop' : 'personal',
            setup_status: targetStatus,
            account_size: 10000,
            account_currency: 'USD',
            preferred_symbols: ['BTCUSDT', 'ETHUSDT', 'XAUUSD'],
            created_at: new Date().toISOString()
          });
      }

      // 2. If MT5 account exists, toggle execution_enabled
      if (record.mt5Account?.id) {
        await supabase
          .from('mt5_accounts_safe')
          .update({
            execution_enabled: targetStatus === 'running',
            updated_at: new Date().toISOString()
          })
          .eq('id', record.mt5Account.id);
      }

      setActionNotice({
        type: 'success',
        message: `Customer engine for ${record.subscription.email} is now ${targetStatus.toUpperCase()}!`
      });

      await loadFleetData();
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: `Failed to update engine status: ${(err as Error).message}`
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Master Global Actions: Pause All or Resume All
  const handleMasterFleetPower = async (action: 'PAUSE_ALL' | 'RESUME_ALL') => {
    const isPause = action === 'PAUSE_ALL';
    const targetStatus = isPause ? 'paused' : 'running';

    if (!confirm(`Are you sure you want to ${isPause ? 'EMERGENCY PAUSE' : 'RESUME'} all active customer executors across the fleet?`)) {
      return;
    }

    setRefreshing(true);
    setActionNotice(null);

    try {
      // Update all bot setups
      await supabase
        .from('customer_bot_setups')
        .update({
          setup_status: targetStatus,
          updated_at: new Date().toISOString()
        })
        .neq('setup_status', 'disabled');

      // Update all mt5 safe accounts
      await supabase
        .from('mt5_accounts_safe')
        .update({
          execution_enabled: !isPause,
          updated_at: new Date().toISOString()
        });

      setActionNotice({
        type: 'success',
        message: `Fleet Command: All customer engines have been ${isPause ? 'PAUSED' : 'RESUMED'} successfully.`
      });

      await loadFleetData();
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: `Master fleet command failed: ${(err as Error).message}`
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Emergency Panic Market Close for a specific customer
  const handlePanicCloseCustomer = async (record: CustomerFleetRecord) => {
    if (!confirm(`🚨 EMERGENCY PANIC CLOSE: Market-close all open positions for ${record.subscription.email} immediately?`)) {
      return;
    }

    setActionLoadingId(record.subscription.id);
    try {
      // Insert emergency close orders into execution_orders
      for (const pos of record.activePositions) {
        await supabase.from('execution_orders').insert({
          user_id: record.subscription.user_id,
          account_id: record.mt5Account?.id,
          provider: record.mt5Account ? 'mt5' : 'binance',
          symbol: pos.symbol,
          order_type: 'MARKET_CLOSE',
          side: pos.side === 'BUY' || pos.side === 'LONG' ? 'SELL' : 'BUY',
          quantity: pos.quantity,
          status: 'PENDING_EXECUTION',
          reason: 'ADMIN_EMERGENCY_PANIC_CLOSE',
          created_at: new Date().toISOString()
        });
      }

      // Mark local active_positions as closing
      await supabase
        .from('active_positions')
        .update({ status: 'closing', updated_at: new Date().toISOString() })
        .in('id', record.activePositions.map(p => p.id));

      setActionNotice({
        type: 'success',
        message: `Emergency liquidation orders dispatched for ${record.activePositions.length} positions of ${record.subscription.email}.`
      });

      await loadFleetData();
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: `Emergency close failed: ${(err as Error).message}`
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open Engine Configuration Modal
  const openEngineEditor = (record: CustomerFleetRecord) => {
    setEditingEngine(record);
    const s = record.botSetup;
    setEditForm({
      bot_type: s?.bot_type || (record.subscription.package_name?.toLowerCase().includes('crypto') ? 'crypto_personal' : 'forex_mt5_prop'),
      capital_mode: s?.capital_mode || (record.subscription.package_name?.toLowerCase().includes('prop') ? 'prop' : 'personal'),
      platform: s?.platform || (record.subscription.package_name?.toLowerCase().includes('mt5') ? 'mt5' : 'binance'),
      exchange_name: s?.exchange_name || 'Binance USD-M Futures',
      broker_name: s?.broker_name || record.mt5Account?.broker || '',
      prop_firm_name: s?.prop_firm_name || '',
      account_size: s?.account_size || record.mt5Account?.balance || 10000,
      risk_preset: s?.risk_preset || 'Conservative (0.5%)',
      max_risk_per_trade_pct: s?.max_risk_per_trade_pct || 0.5,
      max_daily_loss_pct: s?.max_daily_loss_pct || 4.5,
      drawdown_limit_pct: s?.drawdown_limit_pct || 10,
      preferred_symbols: Array.isArray(s?.preferred_symbols) ? s.preferred_symbols.join(', ') : 'BTCUSDT, ETHUSDT, SOLUSDT, XAUUSD, EURUSD',
      customer_notes: s?.customer_notes || '',
      admin_notes: s?.admin_notes || '',
    });
  };

  // Save Engine Configuration
  const saveEngineConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEngine) return;
    setActionLoadingId(editingEngine.subscription.id);

    try {
      const symbolsArray = editForm.preferred_symbols
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);

      const payload = {
        user_id: editingEngine.subscription.user_id,
        subscription_id: editingEngine.subscription.id,
        package_slug: editingEngine.subscription.package_name?.toLowerCase().includes('crypto') ? 'crypto_personal_bot' : 'forex_mt5_prop_bot',
        bot_type: editForm.bot_type,
        capital_mode: editForm.capital_mode,
        platform: editForm.platform,
        exchange_name: editForm.exchange_name,
        broker_name: editForm.broker_name,
        prop_firm_name: editForm.prop_firm_name,
        account_size: Number(editForm.account_size),
        risk_preset: editForm.risk_preset,
        max_risk_per_trade_pct: Number(editForm.max_risk_per_trade_pct),
        max_daily_loss_pct: Number(editForm.max_daily_loss_pct),
        drawdown_limit_pct: Number(editForm.drawdown_limit_pct),
        preferred_symbols: symbolsArray,
        customer_notes: editForm.customer_notes,
        admin_notes: editForm.admin_notes,
        setup_status: editingEngine.botSetup?.setup_status || 'configured',
        updated_at: new Date().toISOString()
      };

      if (editingEngine.botSetup?.id) {
        await supabase
          .from('customer_bot_setups')
          .update(payload)
          .eq('id', editingEngine.botSetup.id);
      } else {
        await supabase
          .from('customer_bot_setups')
          .insert({
            ...payload,
            created_at: new Date().toISOString()
          });
      }

      setActionNotice({
        type: 'success',
        message: `Engine parameters for ${editingEngine.subscription.email} updated successfully!`
      });

      setEditingEngine(null);
      await loadFleetData();
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: `Failed saving engine parameters: ${(err as Error).message}`
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Inject Test Trade / Signal on this Customer's Engine
  const handleInjectTestSignal = async (record: CustomerFleetRecord) => {
    setActionLoadingId(record.subscription.id);
    try {
      const isCrypto = record.botSetup?.bot_type?.includes('crypto') || record.subscription.package_name?.toLowerCase().includes('crypto');
      const testSymbol = isCrypto ? 'BTCUSDT' : 'XAUUSD';
      const entryPrice = isCrypto ? 96500 : 2650.50;
      const stopLoss = isCrypto ? 95200 : 2640.00;
      const tp1 = isCrypto ? 98500 : 2665.00;
      const tp2 = isCrypto ? 101000 : 2685.00;

      await supabase.from('execution_orders').insert({
        user_id: record.subscription.user_id,
        account_id: record.mt5Account?.id,
        provider: isCrypto ? 'binance' : 'mt5',
        symbol: testSymbol,
        order_type: 'LIMIT_ENTRY_BRACKET',
        side: 'BUY',
        price: entryPrice,
        stop_loss: stopLoss,
        take_profit_1: tp1,
        take_profit_2: tp2,
        quantity: isCrypto ? 0.05 : 0.50,
        status: 'PENDING_EXECUTION',
        reason: 'ADMIN_TEST_INJECTION_VERIFICATION',
        created_at: new Date().toISOString()
      });

      setActionNotice({
        type: 'success',
        message: `Test order (${testSymbol} BUY) successfully routed to ${record.subscription.email}'s executor!`
      });
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: `Test injection failed: ${(err as Error).message}`
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 pb-20 max-w-7xl mx-auto px-2 sm:px-4">
        
        {/* Top Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-600/30 to-indigo-600/30 border border-blue-500/40 text-blue-400">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
                  Customer Bot Fleet & Executor Command
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Live Engine Hub
                  </span>
                </h1>
                <p className="text-sm text-zinc-400">
                  Total autonomous control over multi-customer bot executors across Crypto (Binance/Bybit) & Forex (MT5 Prop/Personal)
                </p>
              </div>
            </div>
          </div>

          {/* Quick Master Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleMasterFleetPower('PAUSE_ALL')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-semibold transition-colors shadow-sm"
              title="Emergency Pause all customer engines"
            >
              <Pause className="w-4 h-4 text-red-400" />
              Pause All Engines
            </button>

            <button
              onClick={() => handleMasterFleetPower('RESUME_ALL')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-colors shadow-sm"
              title="Resume all paid customer engines"
            >
              <Play className="w-4 h-4 text-emerald-400" />
              Resume All Paid
            </button>

            <button
              onClick={loadFleetData}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-400' : 'text-zinc-400'}`} />
              Sync Fleet
            </button>

            <Link
              to="/admin/customers"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-medium transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              Billing & Subs
            </Link>
          </div>
        </div>

        {/* Action Notice Alert */}
        {actionNotice && (
          <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-sm animate-in fade-in duration-200 ${
            actionNotice.type === 'success' ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' :
            actionNotice.type === 'error' ? 'bg-red-950/40 border-red-500/40 text-red-300' :
            'bg-blue-950/40 border-blue-500/40 text-blue-300'
          }`}>
            <div className="flex items-center gap-2.5">
              {actionNotice.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> :
               actionNotice.type === 'error' ? <AlertOctagon className="w-5 h-5 text-red-400 shrink-0" /> :
               <Activity className="w-5 h-5 text-blue-400 shrink-0" />}
              <span>{actionNotice.message}</span>
            </div>
            <button onClick={() => setActionNotice(null)} className="text-zinc-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Master Fleet Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              Total Customers
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">{metrics.totalCustomers}</div>
            <div className="text-xs text-zinc-500 mt-1">{metrics.paidCustomers} Paid & Active</div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              Active Engines
            </div>
            <div className="text-2xl font-bold text-emerald-400 tracking-tight">{metrics.activeRunningEngines}</div>
            <div className="text-xs text-zinc-500 mt-1">{metrics.pausedEngines} Paused / Inactive</div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <DollarSign className="w-3.5 h-3.5 text-yellow-400" />
              Total Fleet Capital
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">${metrics.totalFleetEquity.toLocaleString()}</div>
            <div className="text-xs text-zinc-500 mt-1">Across all accounts</div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Open Fleet Trades
            </div>
            <div className="text-2xl font-bold text-cyan-400 tracking-tight">{metrics.totalFleetPositions}</div>
            <div className="text-xs text-zinc-500 mt-1">Live Managed Positions</div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              Fleet Floating PnL
            </div>
            <div className={`text-2xl font-bold tracking-tight ${metrics.totalFloatingPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {metrics.totalFloatingPnl >= 0 ? `+$${metrics.totalFloatingPnl.toFixed(2)}` : `-$${Math.abs(metrics.totalFloatingPnl).toFixed(2)}`}
            </div>
            <div className="text-xs text-zinc-500 mt-1">Live Marked-to-Market</div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              Multi-Venue Auto
            </div>
            <div className="text-sm font-bold text-zinc-200 mt-1">MT5 • Binance • Bybit</div>
            <div className="text-xs text-emerald-400 mt-1">Isolated Rules Enforced</div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search customer email, broker, name..."
              className="w-full pl-9 pr-4 py-2 bg-zinc-950 border border-zinc-700/80 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Asset Filter */}
            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
              <span className="text-zinc-500 px-2 font-medium">Asset:</span>
              <button
                onClick={() => setFilterAsset('all')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${filterAsset === 'all' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilterAsset('crypto')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${filterAsset === 'crypto' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : 'text-zinc-400 hover:text-white'}`}
              >
                Crypto (Binance/Bybit)
              </button>
              <button
                onClick={() => setFilterAsset('forex')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${filterAsset === 'forex' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-zinc-400 hover:text-white'}`}
              >
                Forex (MT5)
              </button>
              <button
                onClick={() => setFilterAsset('prop')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${filterAsset === 'prop' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-zinc-400 hover:text-white'}`}
              >
                Prop Challenge
              </button>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
              <span className="text-zinc-500 px-2 font-medium">State:</span>
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${filterStatus === 'all' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilterStatus('running')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${filterStatus === 'running' ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-400 hover:text-white'}`}
              >
                Running
              </button>
              <button
                onClick={() => setFilterStatus('paused')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${filterStatus === 'paused' ? 'bg-yellow-500/20 text-yellow-300' : 'text-zinc-400 hover:text-white'}`}
              >
                Paused
              </button>
              <button
                onClick={() => setFilterStatus('unpaid')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${filterStatus === 'unpaid' ? 'bg-red-500/20 text-red-300' : 'text-zinc-400 hover:text-white'}`}
              >
                Unpaid
              </button>
            </div>
          </div>
        </div>

        {/* Customer Fleet Cards List */}
        {loading ? (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
            <div className="text-sm text-zinc-400">Loading Customer Executor Fleet...</div>
          </div>
        ) : filteredFleet.length === 0 ? (
          <div className="py-16 text-center bg-zinc-900/40 rounded-xl border border-zinc-800">
            <Users className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <div className="text-base font-semibold text-white">No customer engines match the selected filters</div>
            <div className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
              Try adjusting your search query or reset the asset/status filters above.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredFleet.map(record => {
              const isPaid = record.subscription.payment_status === 'paid';
              const isActive = record.subscription.access_status === 'active';
              const isRunning = (record.botSetup?.setup_status === 'running' || record.botSetup?.setup_status === 'configured' || (!record.botSetup && isPaid && isActive)) && record.botSetup?.setup_status !== 'paused';
              const isCrypto = record.subscription.package_name?.toLowerCase().includes('crypto') || record.botSetup?.bot_type?.includes('crypto');
              const isProp = record.subscription.package_name?.toLowerCase().includes('prop') || record.botSetup?.capital_mode === 'prop';
              const isProcessing = actionLoadingId === record.subscription.id;

              // Derive Account Balance & Floating Stats
              const accountSize = record.mt5Account?.balance || record.cryptoAccount?.balance || record.botSetup?.account_size || 10000;
              const floatingEquity = record.mt5Account?.equity || record.cryptoAccount?.equity || accountSize;
              const floatingPnl = record.mt5Account?.floating_pnl || record.cryptoAccount?.floatingPnl || 0;
              const openCount = record.activePositions.length;

              return (
                <div
                  key={record.subscription.id}
                  className={`rounded-2xl border transition-all ${
                    isRunning 
                      ? 'bg-zinc-900/90 border-zinc-700/80 shadow-md shadow-emerald-950/10' 
                      : 'bg-zinc-950/80 border-zinc-800/80 opacity-90'
                  }`}
                >
                  {/* Top Header of Customer Card */}
                  <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80">
                    
                    {/* Left: Customer Info & Badges */}
                    {(() => {
                      const email = record.subscription.email || 'trader@hashibot.vip';
                      const name = record.subscription.full_name || email.split('@')[0] || 'VIP';
                      const initials = (name.slice(0, 2) || email.slice(0, 2) || 'HB').toUpperCase();

                      return (
                        <div className="flex items-start sm:items-center gap-3.5">
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                            isRunning 
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm shadow-emerald-500/20' 
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}>
                            {initials}
                          </div>

                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-white text-base">
                                {name}
                              </span>
                              <span className="text-xs text-zinc-400 font-mono">
                                {email}
                              </span>

                              {/* Payment status badge */}
                              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                                isPaid 
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                                  : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                              }`}>
                                {record.subscription.payment_status}
                              </span>

                              {/* Package Badge */}
                              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                {record.subscription.package_name || 'Standard Bot'}
                              </span>

                              {/* Mode Badge */}
                              {isProp && (
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                                  Prop Mode (Strict 4.5% Cap)
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400 mt-1">
                              <span>
                                Provider: <strong className="text-zinc-200">{record.mt5Account?.broker || record.cryptoAccount?.exchange || record.botSetup?.exchange_name || (isCrypto ? 'Binance USD-M' : 'MT5 Broker')}</strong>
                              </span>
                              {record.mt5Account && (
                                <span>Account: <strong className="text-zinc-200 font-mono">{record.mt5Account.account_number_masked} ({record.mt5Account.server})</strong></span>
                              )}
                              <span>
                                Whitelisted: <strong className="text-zinc-300 font-mono">{record.botSetup?.preferred_symbols?.join(', ') || (isCrypto ? 'BTCUSDT, ETHUSDT' : 'EURUSD, XAUUSD')}</strong>
                              </span>
                              <span>
                                Risk: <strong className="text-zinc-200">{record.botSetup?.risk_preset || '0.5% Per Trade'}</strong>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Right: Master Control Actions */}
                    <div className="flex flex-wrap items-center gap-2 self-end lg:self-center">
                      
                      {/* State Indicator */}
                      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                        isRunning
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'}`} />
                        {isRunning ? 'EXECUTOR ACTIVE' : 'EXECUTOR PAUSED'}
                      </div>

                      {/* Run / Pause Toggle Switch */}
                      {isRunning ? (
                        <button
                          onClick={() => handleToggleCustomerExecution(record, 'paused')}
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 text-yellow-300 text-xs font-semibold transition-colors"
                          title="Pause this customer's execution engine"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          Pause
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleCustomerExecution(record, 'running')}
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-sm"
                          title="Start/Resume this customer's execution engine"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Resume
                        </button>
                      )}

                      {/* Edit Engine Parameters */}
                      <button
                        onClick={() => openEngineEditor(record)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
                        title="Edit asset, symbol desires, risk % & rules for this customer"
                      >
                        <Settings2 className="w-3.5 h-3.5 text-blue-400" />
                        Edit Rules
                      </button>

                      {/* Live Details Preview Toggle */}
                      <button
                        onClick={() => setPreviewCustomer(previewCustomer?.subscription.id === record.subscription.id ? null : record)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                          previewCustomer?.subscription.id === record.subscription.id
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {previewCustomer?.subscription.id === record.subscription.id ? 'Hide Live' : 'Live Preview'}
                      </button>

                      {/* Emergency Panic Market Close */}
                      {openCount > 0 && (
                        <button
                          onClick={() => handlePanicCloseCustomer(record)}
                          disabled={isProcessing}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-semibold transition-colors"
                          title="Emergency close all open trades for this account"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                          Panic Close ({openCount})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick Telemetry & Account Stats Bar */}
                  <div className="p-4 bg-zinc-950/50 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-zinc-500 block">Account Balance</span>
                      <span className="font-bold text-sm text-white font-mono">${accountSize.toLocaleString()}</span>
                    </div>

                    <div>
                      <span className="text-zinc-500 block">Floating Equity</span>
                      <span className="font-bold text-sm text-white font-mono">${floatingEquity.toLocaleString()}</span>
                    </div>

                    <div>
                      <span className="text-zinc-500 block">Floating Unrealized PnL</span>
                      <span className={`font-bold text-sm font-mono ${floatingPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {floatingPnl >= 0 ? `+$${floatingPnl.toFixed(2)}` : `-$${Math.abs(floatingPnl).toFixed(2)}`}
                      </span>
                    </div>

                    <div>
                      <span className="text-zinc-500 block">Open Positions</span>
                      <span className="font-bold text-sm text-cyan-400 font-mono">
                        {openCount > 0 ? `${openCount} Active Trades` : 'No Open Trades'}
                      </span>
                    </div>
                  </div>

                  {/* Live Expanded Preview Panel */}
                  {previewCustomer?.subscription.id === record.subscription.id && (
                    <div className="p-5 bg-zinc-950 border-t border-zinc-800 space-y-4 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <Activity className="w-4 h-4 text-emerald-400" />
                          Live Real-Time Account & Exposure Preview
                        </h4>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleInjectTestSignal(record)}
                            disabled={isProcessing}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-xs font-semibold transition-colors"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                            Test Signal Inject
                          </button>
                        </div>
                      </div>

                      {/* Active Positions Table */}
                      {record.activePositions.length > 0 ? (
                        <div className="overflow-x-auto rounded-xl border border-zinc-800">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-zinc-900 text-zinc-400 border-b border-zinc-800 font-medium">
                              <tr>
                                <th className="py-2.5 px-3">Symbol</th>
                                <th className="py-2.5 px-3">Side</th>
                                <th className="py-2.5 px-3">Entry Price</th>
                                <th className="py-2.5 px-3">Current Price</th>
                                <th className="py-2.5 px-3">Stop Loss</th>
                                <th className="py-2.5 px-3">TP1 / TP2</th>
                                <th className="py-2.5 px-3">Unrealized PnL</th>
                                <th className="py-2.5 px-3">Breakeven State</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/60 font-mono">
                              {record.activePositions.map(pos => (
                                <tr key={pos.id} className="hover:bg-zinc-900/40">
                                  <td className="py-2.5 px-3 font-bold text-white">{pos.symbol}</td>
                                  <td className="py-2.5 px-3">
                                    <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                      pos.side === 'BUY' || pos.side === 'LONG' 
                                        ? 'bg-emerald-500/20 text-emerald-400' 
                                        : 'bg-red-500/20 text-red-400'
                                    }`}>
                                      {pos.side}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-zinc-300">{pos.entry_price}</td>
                                  <td className="py-2.5 px-3 text-zinc-200 font-bold">{pos.current_price}</td>
                                  <td className="py-2.5 px-3 text-red-400">{pos.stop_loss}</td>
                                  <td className="py-2.5 px-3 text-emerald-400">{pos.take_profit_1} / {pos.take_profit_2}</td>
                                  <td className={`py-2.5 px-3 font-bold ${pos.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {pos.unrealized_pnl >= 0 ? `+$${pos.unrealized_pnl.toFixed(2)}` : `-$${Math.abs(pos.unrealized_pnl).toFixed(2)}`}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {pos.is_breakeven_set ? (
                                      <span className="text-emerald-400 flex items-center gap-1 text-[11px] font-sans font-semibold">
                                        <CheckCircle2 className="w-3.5 h-3.5" /> BE Locked (+1R)
                                      </span>
                                    ) : (
                                      <span className="text-zinc-500 text-[11px] font-sans">Initial Bracket</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 text-center text-xs text-zinc-400">
                          No active trades currently open on this account. Scanner is monitoring whitelisted symbols.
                        </div>
                      )}

                      {/* Engine Rules & Direct Controls */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs bg-zinc-900/40 p-3.5 rounded-xl border border-zinc-800/70">
                        <div>
                          <span className="text-zinc-500 font-medium">Risk & Lot Allocation:</span>
                          <div className="text-zinc-200 mt-0.5">
                            {record.botSetup?.risk_preset || 'Conservative'} ({record.botSetup?.max_risk_per_trade_pct || 0.5}% per setup)
                          </div>
                        </div>
                        <div>
                          <span className="text-zinc-500 font-medium">Prop Firm Protection:</span>
                          <div className="text-zinc-200 mt-0.5">
                            {isProp ? `Hard Circuit Breaker at 4.5% daily drawdown` : 'Standard personal equity stop'}
                          </div>
                        </div>
                        <div>
                          <span className="text-zinc-500 font-medium">Trade Management Active:</span>
                          <div className="text-emerald-400 mt-0.5 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Auto-Breakeven at +1R & 50% TP1 Scale
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Edit Customer Engine Rules & Risk Desires */}
        {editingEngine && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-2xl w-full my-8 shadow-2xl">
              
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                    <SlidersHorizontal className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Customize Customer Engine: {editingEngine.subscription.email || 'Customer'}
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Configure asset class, exchange, whitelisted pairs, and risk math for this customer
                    </p>
                  </div>
                </div>
                <button onClick={() => setEditingEngine(null)} className="text-zinc-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={saveEngineConfig} className="space-y-4 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  
                  {/* Bot Mode */}
                  <div>
                    <label className="block text-zinc-400 font-medium mb-1">Bot Asset & Engine Mode</label>
                    <select
                      value={editForm.bot_type}
                      onChange={e => setEditForm(p => ({ ...p, bot_type: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="crypto_personal">Crypto Personal Bot (Binance / Bybit)</option>
                      <option value="forex_mt5_personal">Forex MT5 Personal Alpha</option>
                      <option value="forex_mt5_prop">Forex MT5 Prop Challenge Mode</option>
                    </select>
                  </div>

                  {/* Capital Mode */}
                  <div>
                    <label className="block text-zinc-400 font-medium mb-1">Capital Protection Mode</label>
                    <select
                      value={editForm.capital_mode}
                      onChange={e => setEditForm(p => ({ ...p, capital_mode: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="personal">Personal Account (Kelly Alpha Compounding)</option>
                      <option value="prop">Prop Account (Strict 4.5% Daily Loss Guard)</option>
                    </select>
                  </div>

                  {/* Broker / Exchange */}
                  <div>
                    <label className="block text-zinc-400 font-medium mb-1">Exchange / Broker Gateway</label>
                    <input
                      type="text"
                      value={editForm.exchange_name}
                      onChange={e => setEditForm(p => ({ ...p, exchange_name: e.target.value }))}
                      placeholder="e.g. Binance USD-M, Bybit Linear, FTMO MT5"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Account Size */}
                  <div>
                    <label className="block text-zinc-400 font-medium mb-1">Allocated Capital / Account Balance ($)</label>
                    <input
                      type="number"
                      value={editForm.account_size}
                      onChange={e => setEditForm(p => ({ ...p, account_size: Number(e.target.value) }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Risk Preset */}
                  <div>
                    <label className="block text-zinc-400 font-medium mb-1">Risk Profile Preset</label>
                    <select
                      value={editForm.risk_preset}
                      onChange={e => setEditForm(p => ({ ...p, risk_preset: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="Ultra-Conservative (0.25%)">Ultra-Conservative (0.25% per trade)</option>
                      <option value="Conservative (0.5%)">Conservative (0.5% per trade - Prop Standard)</option>
                      <option value="Balanced (1.0%)">Balanced (1.0% per trade)</option>
                      <option value="Aggressive (2.0%)">Aggressive (2.0% per trade)</option>
                      <option value="Maximum Alpha (3.0%)">Maximum Alpha (3.0% per trade)</option>
                    </select>
                  </div>

                  {/* Max Risk % per trade */}
                  <div>
                    <label className="block text-zinc-400 font-medium mb-1">Max Risk % per Setup</label>
                    <input
                      type="number"
                      step="0.05"
                      value={editForm.max_risk_per_trade_pct}
                      onChange={e => setEditForm(p => ({ ...p, max_risk_per_trade_pct: Number(e.target.value) }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Whitelisted Symbols */}
                  <div className="sm:col-span-2">
                    <label className="block text-zinc-400 font-medium mb-1">Whitelisted Execution Symbols (Comma Separated)</label>
                    <input
                      type="text"
                      value={editForm.preferred_symbols}
                      onChange={e => setEditForm(p => ({ ...p, preferred_symbols: e.target.value }))}
                      placeholder="BTCUSDT, ETHUSDT, SOLUSDT, EURUSD, XAUUSD"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <span className="text-[11px] text-zinc-500 mt-1 block">
                      The automated scanner will only route approved trades matching these symbols to this customer.
                    </span>
                  </div>

                  {/* Admin Notes */}
                  <div className="sm:col-span-2">
                    <label className="block text-zinc-400 font-medium mb-1">Admin Internal Instructions / Notes</label>
                    <input
                      type="text"
                      value={editForm.admin_notes}
                      onChange={e => setEditForm(p => ({ ...p, admin_notes: e.target.value }))}
                      placeholder="Special rules, customer requests, leverage limits..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                </div>

                <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setEditingEngine(null)}
                    className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-xs font-medium hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    Save Engine Parameters
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
