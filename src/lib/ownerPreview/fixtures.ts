export type PreviewRow = Record<string, any>; // Existing UI projections have heterogeneous shapes.
const now = new Date().toISOString();
export const previewCustomers = [
  { id: 'preview-customer-amina', full_name: 'Amina — demonstration customer', email: 'amina@example.invalid', created_at: now, role: 'user' as const },
  { id: 'preview-customer-yusuf', full_name: 'Yusuf — demonstration customer', email: 'yusuf@example.invalid', created_at: now, role: 'user' as const },
];
const account = (id: string, customer: number, provider: string, mode: string, state: string, risk: number): PreviewRow => ({
  id, account_id: id, enabled: false, customer_id: previewCustomers[customer].id, user_id: previewCustomers[customer].id,
  provider, provider_name: provider, environment: provider === 'BINANCE' ? 'testnet' : 'demo', account_mode: mode,
  display_label: `${previewCustomers[customer].full_name.split(' ')[0]} ${provider} ${mode} — simulated`,
  nickname: `${provider} ${mode} demo`, broker: 'Demonstration broker', server: 'SIMULATED',
  account_number_masked: 'DEMO-••••', currency: 'USD', leverage: 100, account_type: mode === 'PROP' ? 'prop' : 'demo',
  execution_mode: mode === 'PROP' ? 'prop_firm_guardian' : 'personal', execution_enabled: false,
  connection_status: state === 'healthy' ? 'connected' : 'disconnected', provider_health: state,
  phase_h_readiness: state === 'healthy' ? 'READY' : 'BLOCKED', phase_h_readiness_reasons: state === 'healthy' ? [] : [`SIMULATED_${state.toUpperCase()}`],
  phase_h_certification_status: 'SIMULATED_NOT_CERTIFIED', policy_profile_id: `preview-brain-${id}`, policy_version: 'demo-v1',
  runtime_control: 'STOP_NEW_ENTRIES', last_error: state === 'incident' ? 'Demonstration protection incident' : null,
  last_synchronized_at: now, last_heartbeat_at: now, last_sync_at: now, bridge_id: `preview-bridge-${id}`,
  balance: customer ? 25000 : 100000, equity: customer ? 24750 : 100200, risk_percent: risk, status: state, created_at: now,
  evidence_kind: 'SIMULATED_DEMONSTRATION',
});
export const previewAccounts = [
  account('preview-amina-mt5-personal', 0, 'MT5', 'PERSONAL', 'healthy', .3),
  account('preview-amina-binance', 0, 'BINANCE', 'PERSONAL', 'uncertain', .2),
  account('preview-yusuf-mt5-prop', 1, 'MT5', 'PROP', 'incident', .1),
  account('preview-yusuf-bybit', 1, 'BYBIT', 'PERSONAL', 'blocked', .15),
  account('preview-yusuf-mt5-pending', 1, 'MT5', 'PERSONAL', 'pending', .1),
];
export function createPreviewTables(): Record<string, PreviewRow[]> {
  const tables: Record<string, PreviewRow[]> = {};
  const put = (names: string[], rows: PreviewRow[]) => names.forEach(name => { tables[name] = structuredClone(rows); });
  put(['profiles'], previewCustomers);
  put(['execution_accounts_safe', 'execution_accounts', 'connected_execution_accounts'], previewAccounts);
  put(['mt5_accounts', 'mt5_accounts_safe'], previewAccounts.filter(a => a.provider === 'MT5'));
  put(['packages'], [
    { id: 'preview-signals', name: 'Signal-only — demonstration', slug: 'vip-signals', price: 20, monthly_price: 20, price_usd: 20, sort_order: 1, is_active: true, features: ['Simulated signal subscription'] },
    { id: 'preview-execution', name: 'Execution — demonstration', slug: 'personal-auto', price: 100, monthly_price: 100, price_usd: 100, sort_order: 2, is_active: true, features: ['Simulated demo-account subscription'] },
  ]);
  put(['customer_subscriptions'], previewCustomers.map((c, i) => ({ id: `preview-sub-${i}`, user_id: c.id, customer_id: c.id, customer_name: c.full_name, full_name: c.full_name, email: c.email, package_id: i ? 'preview-execution' : 'preview-signals', package_name: i ? 'Execution demonstration' : 'Signal-only demonstration', payment_status: i ? 'pending' : 'paid', access_status: i ? 'inactive' : 'active', telegram_status: i ? 'not_invited' : 'joined', subscription_status: 'active', start_date: now, end_date: '2099-01-01', expires_at: '2099-01-01', created_at: now, updated_at: now, packages: tables.packages[i], evidence_kind: 'SIMULATED_DEMONSTRATION' })));
  put(['customer_bot_setups'], previewAccounts.map(a => ({ ...a, id: `preview-setup-${a.id}`, execution_account_id: a.id, selected_provider: a.provider.toLowerCase(), execution_provider: a.provider.toLowerCase(), account_mode: a.account_mode.toLowerCase(), risk_per_trade: a.risk_percent, risk_per_trade_percent: a.risk_percent, strategy_names: ['trend-pullback'], selected_strategies: ['trend-pullback'], enabled_strategies: ['trend-pullback'], preferred_symbols: ['BTCUSDT','EURUSD'], bot_type: a.provider === 'MT5' ? 'forex_mt5_personal' : 'crypto_personal', capital_mode: a.account_mode.toLowerCase(), account_size: a.balance, platform: a.provider.toLowerCase(), setup_status: 'configured', bot_status: 'paused', is_enabled: false, updated_at: now })));
  put(['account_brain_assignments'], previewAccounts.map(a => ({ id: a.policy_profile_id, customer_id: a.customer_id, execution_account_id: a.id, brain_family: a.account_mode === 'PROP' ? 'PROP_CONSERVATIVE_DEMO' : 'PERSONAL_BALANCED_DEMO', policy_version: 'demo-v1', risk_percent: a.risk_percent, strategies: ['trend-pullback'], superseded_at: null })));
  put(['prop_account_configs'], [{ id: 'preview-prop-profile', customer_id: previewCustomers[1].id, execution_account_id: previewAccounts[2].id, profile_id: 'SIMULATED_PROP', profile_version: 'demo-v1', account_size: 25000, currency: 'USD', current_state:'SIMULATED', payout_state:'SIMULATED', configuration: { id:'preview-prop-profile',label:'Demonstration Prop campaign',profileId:'FTMO_TWO_STEP',profileVersion:'demo-v1',accountSize:25000,currency:'USD',mode:'HISTORICAL_PROP_SIMULATION',provider:'HISTORICAL',realPropActivationConfirmed:false,monthlyIncomeObjectivePct:2,softProfitGuardPct:1.7,noNewEntriesPct:2,internalDailyLossLockPct:2,retainedBufferPct:.5,control:'STOP_NEW_ENTRIES' } }]);
  put(['scanner_config'], [{ id: 1, active_timeframes: ['15m','1h'], demo_mode_enabled: true, min_signal_grade: 'A', prevent_duplicate_symbol_signals: true, crypto_scan_interval_minutes: 5, forex_scan_interval_minutes: 5, is_enabled: false, schedule_enabled: false, scan_interval_minutes: 5, signal_enable_crypto: true, signal_enable_forex: true, scan_crypto_enabled: true, scan_forex_enabled: true, auto_send_telegram: false, allow_demo_telegram_sending: false, min_auto_send_grade: 'A', heartbeat_updated_at: now, updated_at: now }]);
  put(['execution_settings'], [{ id: 1, execution_enabled: false, kill_switch: true, allow_live_trading: false, updated_at: now }]);
  put(['strategy_configs'], ['compression-breakout','trend-pullback','london-breakout'].map((strategy_name, i) => ({ id: `preview-strategy-${i}`, strategy_name, allowed_symbols: ['BTCUSDT','EURUSD'], allowed_timeframes: ['15m','1h'], params: {}, min_rr: 2, signal_style: 'DEMONSTRATION', risk_mode: 'DEMO', enabled: true, is_enabled: true, market_type: i === 2 ? 'forex' : 'crypto', timeframe: '15m', min_score: 70, min_confidence: .75, parameters: {}, config: {}, updated_at: now })));
  put(['signals'], [{ id: 'preview-signal-btc', symbol: 'BTCUSDT', direction: 'BUY', side: 'BUY', market_type: 'crypto', entry_price: 60000, sl: 59500, tp1: 60500, tp2: 61000, tp3: 61500, status: 'active', data_source: 'SIMULATED DEMONSTRATION', strategy_name: 'trend-pullback', timeframe: '15m', grade: 'A', confidence: .82, created_at: now, expires_at: '2099-01-01' }]);
  put(['provider_status'], previewAccounts.map(a => ({ provider: a.provider.toLowerCase(), status: a.status, latency_ms: 42, last_checked_at: now, updated_at: now })));
  put(['execution_provider_controls'], previewAccounts.map(a => ({ provider: a.provider.toLowerCase(), environment: a.environment, execution_account_id: a.id, customer_id: a.customer_id, entry_enabled: false, protection_enabled: true, updated_at: now })));
  put(['trade_management_truth', 'active_positions'], previewAccounts.slice(0,4).map(a => ({ id: `preview-position-${a.id}`, customer_id: a.customer_id, user_id: a.user_id, execution_account_id: a.id, provider: a.provider.toLowerCase(), environment: a.environment, symbol: a.provider === 'MT5' ? 'EURUSD' : 'BTCUSDT', side: 'long', status: 'open', qty: .01, entry_price: 100, mark_price: 101, unrealized_pnl: 10, sl_present: a.status !== 'incident', tp1_present: true, tp2_present: true, protection_status: a.status === 'incident' ? 'missing_sl' : 'protected', profit_lock_status: 'inactive', monitor_status: 'simulated', recovery_status: a.status === 'incident' ? 'pending' : 'none', latest_error: a.last_error, latest_sync_at: now, evidence_kind: 'SIMULATED_DEMONSTRATION' })));
  put(['operator_runtime_events', 'audit_logs'], [{ id: 'preview-incident', customer_id: previewCustomers[1].id, execution_account_id: previewAccounts[2].id, event_type: 'PROTECTION_INCIDENT', action: 'DEMONSTRATION', result: 'FAILED', severity: 'CRITICAL', subsystem: 'PROTECTION', provider: 'mt5', message: 'Simulated missing stop-loss incident; no real position', result_summary: 'Demonstration recovery pending', created_at: now }]);
  put(['execution_readiness_projections'], previewAccounts.map(a => ({ id: `preview-ready-${a.id}`, execution_account_id: a.id, customer_id: a.customer_id, state: a.phase_h_readiness, reasons: a.phase_h_readiness_reasons, required_action: 'Inspect simulated evidence', calculated_at: now })));
  put(['commerce_subscriptions'], previewCustomers.map((c,i) => ({ id: `preview-commerce-${i}`, customer_id: c.id, user_id: c.id, product_code: i ? 'EXECUTION' : 'SIGNALS', provider: 'DEMONSTRATION', status: i ? 'pending' : 'active', current_period_end: '2099-01-01', grace_end: null, currency: 'USD', amount_minor: i ? 10000 : 2000, entitlement_state: i ? 'pending' : 'active', cancel_at_period_end: false })));
  put(['telegram_fulfillment_requests', 'telegram_deliveries', 'telegram_links'], previewCustomers.map((c,i) => ({ id: `preview-membership-${i}`, customer_id: c.id, user_id: c.id, entitlement_id: `preview-sub-${i}`, delivery_type: 'initial_signal', message_type: 'initial_signal', action: 'DEMONSTRATION', status: i ? 'failed' : 'sent', membership_status: i ? 'pending' : 'joined', telegram_username: i ? 'demo_yusuf' : 'demo_amina', destination_channel: 'Simulated VIP audience', safe_error: i ? 'Demonstration membership pending' : null, created_at: now })));
  put(['mt5_scanner_feeds'], [{ id: 'preview-owner-feed', history_account_id: previewAccounts[0].id, feed_identity: 'DEMONSTRATION OWNER FEED', status: 'HEALTHY', enabled: true, bridge_id: 'preview-bridge', last_heartbeat_at: now, validation_evidence: { simulated: true } }]);
  put(['customer_onboarding_sessions'], previewCustomers.map(c => ({ id: `preview-onboarding-${c.id}`, customer_id: c.id, stage: 0 })));
  // Explicit zero-row demonstrations: no fabricated backend evidence for these ledgers.
  for (const name of ['access_requests','user_access','strategy_candidates','mode_configs','paper_execution_intents','signal_updates','telegram_router_audit','intelligence_events','intelligence_feed_results','intelligence_feed_health','intelligence_event_health','telegram_delivery_health','execution_monitor_heartbeats','execution_monitor_schedules','execution_orders','execution_event_logs','execution_policies','execution_provider_global_controls','provider_execution_performance','provider_parity_audit','provider_symbol_cache','risk_profiles','runtime_proof_view','scheduler_truth_view','cron_jobs_view','problem_symbol_quarantine','provider_100_trade_readiness_view','commerce_provider_events','backtest_runs','certified_execution_account_policies','certified_runtime_artifacts','bybit_prop_accounts','prop_daily_sessions','prop_audit_events','prop_simulation_runs','phase_n_commands_safe','phase_h_entitlements','provider_connections_safe','risk_acknowledgements','founding_slot_reservations','assisted_setup_requests','additional_account_requests','campaign_attributions','phase_h_audit_events','customer_onboarding_provisioning']) tables[name] ??= [];
  put(['scanner_runs'], [{ id: 'preview-scan', run_type: 'manual', status: 'success', started_at: now, finished_at: now, symbols_scanned: 3, signals_created: 1, telegram_sent_count: 0, telegram_failed_count: 0, error_message: null, evidence_kind: 'SIMULATED_DEMONSTRATION' }]);
  put(['signal_analytics_view'], [{ ...tables.signals[0], signal_id: tables.signals[0].id, current_status:'closed',outcome_category:'WIN',r_result:1.2,close_price:60600,closed_at:now,duration_minutes:60 }]);
  put(['active_trade_management_truth'], tables.trade_management_truth);
  put(['symbols'], ['BTCUSDT','EURUSD','ETHUSDT'].map((symbol,i)=>({id:`preview-symbol-${i}`,symbol,market_type:i===1?'forex':'crypto',enabled:true,is_active:true})));
  put(['candles'], []);
  return tables;
}
