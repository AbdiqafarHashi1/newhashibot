export type Brand<T, B extends string> = T & { readonly __brand: B };
export type ISODateTime = string;
export type Market = 'crypto' | 'forex';
export type Direction = 'long' | 'short';
export type Timeframe = '1m'|'3m'|'5m'|'15m'|'30m'|'1h'|'4h'|'1d';
export type AdapterType = 'binance'|'bybit'|'mt5'|'mock';
export type SignalId = Brand<string,'SignalId'>; export type CommandId = Brand<string,'CommandId'>; export type TradeId = Brand<string,'TradeId'>;
export interface RiskMetadata { maxRiskPct: number; rewardRiskRatio?: number; notes?: readonly string[] }
export interface InvalidationRule { ruleId: string; description: string; expiresSignal: boolean }
export type SignalLifecycleState = 'Created'|'Candidate'|'Approved'|'Dispatched'|'Executed'|'Closed'|'Cancelled'|'Expired'|'Rejected';
export interface Signal { readonly signalId: SignalId; readonly market: Market; readonly symbol: string; readonly timeframe: Timeframe; readonly direction: Direction; readonly strategyId: string; readonly strategyVersion: string; readonly entry: number; readonly stopLoss: number; readonly takeProfits: readonly number[]; readonly riskMetadata: RiskMetadata; readonly confidence: number; readonly score: number; readonly expectedDuration: string; readonly createdAt: ISODateTime; readonly expiresAt: ISODateTime; readonly lifecycleState: SignalLifecycleState; readonly immutableVersion: number; readonly reasons: readonly string[]; readonly invalidationRules: readonly InvalidationRule[] }
// Approved Signal price/risk/strategy fields are immutable; create a new immutableVersion instead of mutating.
export interface Candle { market: Market; symbol: string; timeframe: Timeframe; openTime: ISODateTime; closeTime: ISODateTime; open: number; high: number; low: number; close: number; volume: number; source: string; isClosed: boolean }
export interface EMA { period:number; value:number } export interface SMA { period:number; value:number } export interface RSI { period:number; value:number } export interface ATR { period:number; value:number } export interface ADX { period:number; value:number } export interface VWAP { value:number } export interface Supertrend { value:number; direction: Direction } export interface MACD { macd:number; signal:number; histogram:number } export interface BollingerBands { period:number; upper:number; middle:number; lower:number } export interface DonchianChannels { period:number; upper:number; lower:number; middle:number } export interface Stochastic { k:number; d:number } export interface SessionLevels { session:string; high:number; low:number; open:number } export interface MarketStructure { trend:'up'|'down'|'sideways'; swingHighs:number[]; swingLows:number[] }
export interface IndicatorSnapshot { ema?:EMA[]; sma?:SMA[]; rsi?:RSI; atr?:ATR; adx?:ADX; vwap?:VWAP; supertrend?:Supertrend; macd?:MACD; bollingerBands?:BollingerBands; donchianChannels?:DonchianChannels; stochastic?:Stochastic; sessionLevels?:SessionLevels[]; marketStructure?:MarketStructure }
export interface CustomerProfile { customerId:string; status:'pending'|'approved'|'suspended'; package:'signal_only'|'execution'; subscriptionPlanId:string }
export interface SubscriptionPlan { planId:string; name:string; package:'signal_only'|'execution'; features:string[] }
export interface ApprovalRequest { requestId:string; customerId:string; requestedPackage:'signal_only'|'execution'; createdAt:ISODateTime }
export interface CustomerAccount { accountId:string; customerId:string; adapterType:AdapterType; isEnabled:boolean }
export interface ExecutorProfile { executorId:string; customerId:string; accountId:string; adapterType:AdapterType; state:string }
export interface RiskProfile { riskProfileId:string; customerId:string; maxRiskPct:number; maxDailyLossPct:number; maxOpenTrades:number }
export interface StrategyPreset { presetId:string; strategyId:string; parameters:Record<string, unknown>; package:'signal_only'|'execution' }
export interface AdminAction { actionId:string; adminId:string; action:string; targetId:string; occurredAt:ISODateTime }
export interface AuditEvent { auditId:string; actorId:string; action:string; entity:string; entityId:string; occurredAt:ISODateTime; metadata:Record<string, unknown> }
export type TelegramChannelType='FreeCommunity'|'VipSignals'|'VipExecution'|'Announcements'|'AdminAlerts'|'ErrorAlerts'|'MarketingAffiliate';
export interface TelegramTemplate { templateId:string; channelType:TelegramChannelType; body:string }
export interface TelegramDelivery { deliveryId:string; channelType:TelegramChannelType; templateId:string; status:'queued'|'succeeded'|'failed'; payload:Record<string, unknown> }
export interface TelegramRoutingPolicy { policyId:string; channelType:TelegramChannelType; package?:'signal_only'|'execution' }
export interface TelegramLifecycleEventMapping { eventType:string; channelType:TelegramChannelType; templateId:string }
export * from './trade-management.js';
