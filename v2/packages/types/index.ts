export type Brand<T, B extends string> = T & { readonly __brand: B };
export type ISODateTime = string;
export type Market = 'crypto' | 'forex';
export type Direction = 'long' | 'short';
export type Timeframe = '1m'|'3m'|'5m'|'15m'|'30m'|'1h'|'2h'|'4h'|'6h'|'12h'|'1d'|'1w';
export type AdapterType = 'binance'|'bybit'|'mt5'|'mock';
export type SignalId = Brand<string,'SignalId'>; export type CommandId = Brand<string,'CommandId'>; export type TradeId = Brand<string,'TradeId'>;
export type MarketStatus = 'open'|'closed'|'halted'|'unknown'; export type FeedHealthStatus='healthy'|'degraded'|'stale'|'down';
export interface RiskMetadata { maxRiskPct: number; rewardRiskRatio?: number; notes?: readonly string[] }
export interface InvalidationRule { ruleId: string; description: string; expiresSignal: boolean }
export type SignalLifecycleState = 'Created'|'Candidate'|'Approved'|'Dispatched'|'Executed'|'Closed'|'Cancelled'|'Expired'|'Rejected';
export interface Signal { readonly signalId: SignalId; readonly market: Market; readonly symbol: string; readonly timeframe: Timeframe; readonly direction: Direction; readonly strategyId: string; readonly strategyVersion: string; readonly entry: number; readonly stopLoss: number; readonly takeProfits: readonly number[]; readonly riskMetadata: RiskMetadata; readonly confidence: number; readonly score: number; readonly expectedDuration: string; readonly createdAt: ISODateTime; readonly expiresAt: ISODateTime; readonly lifecycleState: SignalLifecycleState; readonly immutableVersion: number; readonly reasons: readonly string[]; readonly invalidationRules: readonly InvalidationRule[] }
export interface TickQuote { bid?:number; ask?:number; spread?:number }
export interface CandleSourceMetadata { provider:string; tickCount:number; firstTickAt?:ISODateTime; lastTickAt?:ISODateTime; generatedBy:'tick'|'gap'|'warmup'; quality:'complete'|'gap_fill'|'warmup' }
export type CandleLifecycleState = 'OPEN'|'UPDATING'|'FINALIZING'|'CLOSED'|'ARCHIVED';
export interface Candle { market: Market; symbol: string; timeframe: Timeframe; openTime: ISODateTime; closeTime: ISODateTime; open: number; high: number; low: number; close: number; volume: number; exchangeVolume?:number; tickVolume?:number; source: string; sourceMetadata?: CandleSourceMetadata; isClosed: boolean; lifecycleState?: CandleLifecycleState; provider?: string; sequence?: number }
export interface EMA { period:number; value:number|null; warmup:number } export interface SMA { period:number; value:number|null; warmup:number } export interface RSI { period:number; value:number|null; warmup:number } export interface ATR { period:number; value:number|null; warmup:number } export interface ADX { period:number; value:number|null; warmup:number; plusDI:number|null; minusDI:number|null } export interface VWAP { value:number|null; warmup:number } export interface Supertrend { period:number; multiplier:number; value:number|null; direction: Direction|'neutral'; warmup:number } export interface MACD { fast:number; slow:number; signalPeriod:number; macd:number|null; signal:number|null; histogram:number|null; warmup:number } export interface BollingerBands { period:number; stdDev:number; upper:number|null; middle:number|null; lower:number|null; warmup:number } export interface DonchianChannels { period:number; upper:number|null; lower:number|null; middle:number|null; warmup:number } export interface Stochastic { kPeriod:number; dPeriod:number; k:number|null; d:number|null; warmup:number }
export interface SessionFeatures { currentSession:'asian'|'london'|'new_york'|'overlap'|'off_hours'; asianRange?:{high:number;low:number}; londonStatus:'pre'|'open'|'closed'; newYorkStatus:'pre'|'open'|'closed'; sessionHigh:number|null; sessionLow:number|null; dailyHigh:number|null; dailyLow:number|null; weeklyHigh:number|null; weeklyLow:number|null }
export interface MarketStructure { trend:'up'|'down'|'sideways'; swingHighs:number[]; swingLows:number[]; rangeState:'ranging'|'expanding'|'none'; compressionState:'compressed'|'normal'; breakoutState:'up'|'down'|'none'; volatilityRegime:'low'|'normal'|'high' }
export interface IndicatorSnapshot { market:Market; symbol:string; timeframe:Timeframe; candleCloseTime:ISODateTime; computedAt:ISODateTime; missingData:boolean; warmupRemaining:number; ema:EMA[]; sma:SMA[]; rsi:RSI; atr:ATR; adx:ADX; vwap:VWAP; supertrend:Supertrend; macd:MACD; bollingerBands:BollingerBands; donchianChannels:DonchianChannels; stochastic:Stochastic; sessions:SessionFeatures; marketStructure:MarketStructure }
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
