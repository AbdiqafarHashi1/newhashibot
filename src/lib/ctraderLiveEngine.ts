import { supabase } from './supabase';

export interface LiveCTraderAccountState {
  id: string;
  userId?: string;
  broker: string;
  server: string;
  accountNumberMasked: string;
  accountNumberFull?: string;
  nickname: string;
  currency: string;
  leverage: number;
  accountType: 'prop' | 'personal' | 'demo';
  executionMode: 'prop_challenge' | 'personal' | 'demo';
  executionEnabled: boolean;
  connectionStatus: 'connected' | 'pending' | 'degraded' | 'disconnected';
  providerHealth: 'healthy' | 'degraded' | 'unhealthy';
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  floatingPnl: number;
  initialBalance: number;
  todayStartingBalance: number;
  todayRealizedPnl: number;
  peakEquity: number;
  openPositions: LiveCTraderPosition[];
  lastSyncAt: string;
  bridgeId: string;
  openApiAppClientId?: string;
  // Specific Prop firm settings
  propFirmName?: string;
  maxDailyLossPct?: number;
  maxTotalLossPct?: number;
  profitTargetPct?: number;
  minTradingDays?: number;
  newsTradingAllowed?: boolean;
  weekendHoldingAllowed?: boolean;
  consecutiveLossesToday?: number;
  isDailyDrawdownLocked?: boolean;
  targetAchievedLocked?: boolean;
  daysTradedCount?: number;
  calibratedRiskPct?: number;
}

export interface LiveCTraderPosition {
  id: string;
  positionId: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number; // in lots
  openPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  tp2?: number;
  unrealizedPnl: number;
  swap: number;
  commission: number;
  openedAt: string;
  comment: string;
  magicNumber?: number;
  isBreakevenProtected?: boolean;
}

const STORAGE_KEY_CTRADER_ACCOUNTS = 'hashibot_live_ctrader_accounts_v1';

export function getConnectedCTraderAccounts(): LiveCTraderAccountState[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CTRADER_ACCOUNTS);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to load local cTrader accounts:', err);
  }

  // Default initial cTrader account for Customer #2
  const seededAccounts: LiveCTraderAccountState[] = [
    {
      id: 'ctrader-acc-cust-02',
      userId: 'usr-customer-02',
      broker: 'Pepperstone cTrader',
      server: 'cTrader-Live-01',
      accountNumberMasked: 'CT-9104',
      accountNumberFull: '3829104',
      nickname: 'Customer #2 (Pepperstone cTrader $50,000)',
      currency: 'USD',
      leverage: 100,
      accountType: 'personal',
      executionMode: 'personal',
      executionEnabled: true,
      connectionStatus: 'connected',
      providerHealth: 'healthy',
      balance: 50840.50,
      equity: 51212.50,
      margin: 860.00,
      freeMargin: 50352.50,
      floatingPnl: 372.00,
      initialBalance: 50000.00,
      todayStartingBalance: 50840.50,
      todayRealizedPnl: 280.00,
      peakEquity: 51212.50,
      lastSyncAt: new Date().toISOString(),
      bridgeId: 'bridge-ctrader-desktop-8089',
      openApiAppClientId: 'hashibot-ctrader-openapi-client',
      calibratedRiskPct: 0.5,
      openPositions: [
        {
          id: 'pos-ct-01',
          positionId: 9812401,
          symbol: 'EURUSD',
          side: 'BUY',
          volume: 0.50,
          openPrice: 1.08450,
          currentPrice: 1.08580,
          stopLoss: 1.08250,
          takeProfit: 1.08950,
          tp2: 1.09200,
          unrealizedPnl: 65.00,
          swap: 0,
          commission: -1.75,
          openedAt: new Date(Date.now() - 3600000).toISOString(),
          comment: 'HashiBot cTrader London Breakout',
          magicNumber: 7771,
          isBreakevenProtected: true,
        },
        {
          id: 'pos-ct-02',
          positionId: 9812408,
          symbol: 'XAUUSD',
          side: 'BUY',
          volume: 0.20,
          openPrice: 2854.20,
          currentPrice: 2869.55,
          stopLoss: 2845.00,
          takeProfit: 2885.00,
          unrealizedPnl: 307.00,
          swap: 0,
          commission: -1.40,
          openedAt: new Date(Date.now() - 7200000).toISOString(),
          comment: 'HashiBot cTrader Gold Breakout',
          magicNumber: 7772,
          isBreakevenProtected: true,
        },
      ],
    },
  ];

  saveConnectedCTraderAccounts(seededAccounts);
  return seededAccounts;
}

export function saveConnectedCTraderAccounts(accounts: LiveCTraderAccountState[]) {
  try {
    localStorage.setItem(STORAGE_KEY_CTRADER_ACCOUNTS, JSON.stringify(accounts));
  } catch (err) {
    console.warn('Failed to save live cTrader accounts:', err);
  }
}

export function addConnectedCTraderAccount(params: {
  broker: string;
  server: string;
  accountNumberFull: string;
  nickname: string;
  balance: number;
  leverage: number;
  accountType: 'prop' | 'personal' | 'demo';
  propFirmName?: string;
  maxDailyLossPct?: number;
  maxTotalLossPct?: number;
  profitTargetPct?: number;
  newsTradingAllowed?: boolean;
  weekendHoldingAllowed?: boolean;
  openApiClientId?: string;
}): LiveCTraderAccountState {
  const accounts = getConnectedCTraderAccounts();
  const masked = `CT-${params.accountNumberFull.slice(-4)}`;

  const newAccount: LiveCTraderAccountState = {
    id: `ctrader-acc-${Date.now()}`,
    broker: params.broker,
    server: params.server,
    accountNumberMasked: masked,
    accountNumberFull: params.accountNumberFull,
    nickname: params.nickname || `${params.broker} (${params.accountType === 'prop' ? 'Prop Challenge' : 'Customer Account'})`,
    currency: 'USD',
    leverage: params.leverage,
    accountType: params.accountType,
    executionMode: params.accountType === 'prop' ? 'prop_challenge' : 'personal',
    executionEnabled: true,
    connectionStatus: 'connected',
    providerHealth: 'healthy',
    balance: params.balance,
    equity: params.balance,
    margin: 0,
    freeMargin: params.balance,
    floatingPnl: 0,
    initialBalance: params.balance,
    todayStartingBalance: params.balance,
    todayRealizedPnl: 0,
    peakEquity: params.balance,
    openPositions: [],
    lastSyncAt: new Date().toISOString(),
    bridgeId: `bridge-ctrader-${params.accountNumberFull.slice(-4)}`,
    openApiAppClientId: params.openApiClientId || 'hashibot-ctrader-openapi-live',
    propFirmName: params.propFirmName,
    maxDailyLossPct: params.maxDailyLossPct ?? (params.accountType === 'prop' ? 5.0 : 8.0),
    maxTotalLossPct: params.maxTotalLossPct ?? (params.accountType === 'prop' ? 10.0 : 15.0),
    profitTargetPct: params.profitTargetPct ?? (params.accountType === 'prop' ? 10.0 : 25.0),
    minTradingDays: params.accountType === 'prop' ? 4 : 0,
    newsTradingAllowed: params.newsTradingAllowed ?? true,
    weekendHoldingAllowed: params.weekendHoldingAllowed ?? true,
    calibratedRiskPct: 0.5,
  };

  accounts.unshift(newAccount);
  saveConnectedCTraderAccounts(accounts);
  return newAccount;
}

export function executeLiveCTraderTrade(
  accountId: string,
  trade: {
    symbol: string;
    side: 'BUY' | 'SELL';
    volume: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    comment?: string;
  }
): { success: boolean; position?: LiveCTraderPosition; error?: string } {
  const accounts = getConnectedCTraderAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return { success: false, error: 'cTrader account not found' };

  if (account.isDailyDrawdownLocked) {
    return { success: false, error: 'TRADING BLOCKED: cTrader daily drawdown circuit breaker active.' };
  }

  const newPosition: LiveCTraderPosition = {
    id: `pos-ct-${Date.now()}`,
    positionId: Math.floor(Math.random() * 8999999) + 1000000,
    symbol: trade.symbol,
    side: trade.side,
    volume: trade.volume,
    openPrice: trade.entryPrice,
    currentPrice: trade.entryPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    unrealizedPnl: 0,
    swap: 0,
    commission: Number((-trade.volume * 3.5).toFixed(2)),
    openedAt: new Date().toISOString(),
    comment: trade.comment || 'HashiBot cTrader Quant Execution',
    magicNumber: 7779,
  };

  account.openPositions.push(newPosition);
  saveConnectedCTraderAccounts(accounts);
  return { success: true, position: newPosition };
}

export function closeLiveCTraderPosition(
  accountId: string,
  positionId: number
): { success: boolean; realizedPnl: number; error?: string } {
  const accounts = getConnectedCTraderAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return { success: false, realizedPnl: 0, error: 'cTrader account not found' };

  const idx = account.openPositions.findIndex((p) => p.positionId === positionId);
  if (idx < 0) return { success: false, realizedPnl: 0, error: 'Position not found' };

  const pos = account.openPositions[idx];
  const pnl = pos.unrealizedPnl;

  account.balance += pnl;
  account.equity = account.balance;
  account.todayRealizedPnl += pnl;
  account.openPositions.splice(idx, 1);

  saveConnectedCTraderAccounts(accounts);
  return { success: true, realizedPnl: pnl };
}
