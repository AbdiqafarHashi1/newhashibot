import type { ExchangeOrder, ExchangePosition, ExchangeProvider, ProviderResult } from './exchangeProvider.js';
import type { TradeTruthRecord } from '../runtime/tradeTruth/types.js';

export type ExecutionPolicyMode = 'personal' | 'demo' | 'prop_challenge';
export interface ExecutionPolicy {
  mode: ExecutionPolicyMode;
  riskPerTradePct: number;
  dailyLossPct: number;
  weeklyLossPct: number;
  maxExposurePct: number;
  maxOpenPositions: number;
  breakEvenAtR: number;
  trailingStartsAtR: number;
  trailingDistanceR: number;
  partialCloseAtR: number;
  partialClosePct: number;
  staleAfterMs: number;
  maxRecoveryAttempts: number;
}

export const DEFAULT_EXECUTION_POLICIES: Readonly<Record<ExecutionPolicyMode, ExecutionPolicy>> = Object.freeze({
  personal: { mode:'personal', riskPerTradePct:1, dailyLossPct:5, weeklyLossPct:10, maxExposurePct:10, maxOpenPositions:5, breakEvenAtR:1, trailingStartsAtR:1.5, trailingDistanceR:.5, partialCloseAtR:1, partialClosePct:50, staleAfterMs:90_000, maxRecoveryAttempts:5 },
  demo: { mode:'demo', riskPerTradePct:2, dailyLossPct:10, weeklyLossPct:20, maxExposurePct:25, maxOpenPositions:10, breakEvenAtR:1, trailingStartsAtR:1.5, trailingDistanceR:.5, partialCloseAtR:1, partialClosePct:50, staleAfterMs:120_000, maxRecoveryAttempts:5 },
  prop_challenge: { mode:'prop_challenge', riskPerTradePct:.5, dailyLossPct:4, weeklyLossPct:8, maxExposurePct:5, maxOpenPositions:3, breakEvenAtR:.75, trailingStartsAtR:1.25, trailingDistanceR:.4, partialCloseAtR:1, partialClosePct:50, staleAfterMs:60_000, maxRecoveryAttempts:3 },
});

export type TradeManagementEvent = 'trade_opened'|'trade_protected'|'break_even'|'trailing_stop'|'partial_close'|'tp1'|'tp2'|'trade_closed'|'recovery_action'|'execution_error'|'synchronization_failure';
export interface ManagedTrade extends TradeTruthRecord { metadata?: Record<string, unknown>; }
export interface TradeManagerStore {
  listActive(providerId: string, accountId: string): Promise<ManagedTrade[]>;
  save(trade: ManagedTrade, event: TradeManagementEvent, idempotencyKey: string): Promise<void>;
}
export interface LifecycleReporter { publish(event: TradeManagementEvent, trade: ManagedTrade, details?: Record<string, unknown>): Promise<void>; }
export interface AccountRiskState { equity:number; dailyPnl:number; weeklyPnl:number; exposure:number; openPositions:number; }

export function validateExecutionPolicy(policy: ExecutionPolicy, state: AccountRiskState): string[] {
  const reasons:string[]=[];
  if (state.equity <= 0) reasons.push('invalid_equity');
  if (state.dailyPnl <= -(state.equity * policy.dailyLossPct / 100)) reasons.push('daily_loss_lock');
  if (state.weeklyPnl <= -(state.equity * policy.weeklyLossPct / 100)) reasons.push('weekly_loss_lock');
  if (state.exposure > state.equity * policy.maxExposurePct / 100) reasons.push('exposure_limit');
  if (state.openPositions >= policy.maxOpenPositions) reasons.push('max_positions');
  return reasons;
}

export interface ReconciliationIssue { type:'missing_position'|'duplicate_position'|'quantity_mismatch'|'missing_sl'|'missing_tp'|'orphan_position'|'stale_sync'; tradeId?:string; positionId?:string; symbol:string; }
const norm=(v:unknown)=>String(v??'').toUpperCase();
function protective(order:ExchangeOrder, position:ExchangePosition, kind:'sl'|'tp') {
  if (norm(order.symbol)!==norm(position.symbol) || order.reduceOnly!==true) return false;
  const tag=norm(`${order.type} ${order.metadata?.orderType} ${order.metadata?.target}`);
  return kind==='sl' ? /STOP|SL/.test(tag)&&!/TAKE/.test(tag) : /TAKE|TP|PROFIT/.test(tag);
}
export function reconcileTrades(trades:readonly ManagedTrade[], positions:readonly ExchangePosition[], orders:readonly ExchangeOrder[], nowMs=Date.now(), staleAfterMs=90_000):ReconciliationIssue[]{
  const issues:ReconciliationIssue[]=[];
  const claimed=new Set<string>();
  for(const trade of trades){
    const matches=positions.filter(p=> trade.provider_position_id ? p.providerPositionId===trade.provider_position_id : norm(p.symbol)===norm(trade.symbol)&&norm(p.side)===norm(trade.position_side));
    matches.forEach(p=>p.providerPositionId&&claimed.add(p.providerPositionId));
    if(!matches.length) issues.push({type:'missing_position',tradeId:trade.trade_id,symbol:trade.symbol});
    if(matches.length>1) issues.push({type:'duplicate_position',tradeId:trade.trade_id,symbol:trade.symbol});
    const position=matches[0];
    if(position&&trade.quantity_remaining!=null&&Math.abs(Math.abs(position.quantity)-trade.quantity_remaining)>1e-8) issues.push({type:'quantity_mismatch',tradeId:trade.trade_id,symbol:trade.symbol,positionId:position.providerPositionId});
    if(position&&!orders.some(o=>protective(o,position,'sl'))) issues.push({type:'missing_sl',tradeId:trade.trade_id,symbol:trade.symbol,positionId:position.providerPositionId});
    if(position&&!orders.some(o=>protective(o,position,'tp'))) issues.push({type:'missing_tp',tradeId:trade.trade_id,symbol:trade.symbol,positionId:position.providerPositionId});
    if(!trade.latest_sync_at||nowMs-Date.parse(trade.latest_sync_at)>staleAfterMs) issues.push({type:'stale_sync',tradeId:trade.trade_id,symbol:trade.symbol});
  }
  for(const p of positions) if(!p.providerPositionId||!claimed.has(p.providerPositionId)) issues.push({type:'orphan_position',positionId:p.providerPositionId,symbol:p.symbol});
  return issues;
}

function rMultiple(trade:ManagedTrade, mark:number){ const entry=Number(trade.entry_price_filled??trade.entry_price_intended);const stop=Number(trade.sl_price_intended);const risk=Math.abs(entry-stop);if(!risk)return 0;return trade.position_side==='long'?(mark-entry)/risk:(entry-mark)/risk; }
function replacementStop(trade:ManagedTrade, mark:number, distanceR:number){const entry=Number(trade.entry_price_filled??trade.entry_price_intended);const risk=Math.abs(entry-Number(trade.sl_price_intended));return trade.position_side==='long'?mark-risk*distanceR:mark+risk*distanceR;}

export class ProfessionalTradeManager {
  constructor(private provider:ExchangeProvider,private accountId:string,private store:TradeManagerStore,private reporter:LifecycleReporter,private policy:ExecutionPolicy,private now=()=>Date.now()){}
  private async record(trade:ManagedTrade,event:TradeManagementEvent,details:Record<string,unknown>={}){const key=`${trade.trade_id}:${event}:${trade.version}`;await this.store.save(trade,event,key);await this.reporter.publish(event,trade,details);}
  async cycle():Promise<{managed:number;issues:ReconciliationIssue[];actions:number;errors:string[]}>{
    const trades=await this.store.listActive(this.provider.metadata.id,this.accountId);
    let positions:ExchangePosition[],orders:ExchangeOrder[];
    try{[positions,orders]=await Promise.all([this.provider.fetchOpenPositions(),this.provider.fetchOpenOrders()]);}catch(error){for(const t of trades)await this.reporter.publish('synchronization_failure',t,{error:String(error)});return{managed:trades.length,issues:[],actions:0,errors:[String(error)]};}
    const issues=reconcileTrades(trades,positions,orders,this.now(),this.policy.staleAfterMs);let actions=0;const errors:string[]=[];
    for(const trade of trades){const position=positions.find(p=>p.providerPositionId===trade.provider_position_id)||positions.find(p=>norm(p.symbol)===norm(trade.symbol));if(!position)continue;
      const related=issues.filter(i=>i.tradeId===trade.trade_id);
      for(const issue of related.filter(i=>i.type==='missing_sl'||i.type==='missing_tp')){const req={symbol:trade.symbol,side:trade.position_side,quantity:Math.abs(position.quantity),entryPrice:Number(trade.entry_price_filled??trade.entry_price_intended),stopLoss:Number(trade.sl_price_intended),tp1:Number(trade.tp1_price_intended),tp2:Number(trade.tp2_price_intended),metadata:{tradeId:trade.trade_id,accountId:this.accountId,idempotencyKey:`${trade.trade_id}:repair:${issue.type}`}};const result=issue.type==='missing_sl'?await this.provider.placeStopLoss(req):await this.provider.placeTakeProfit(req,'tp1');if(result.ok){actions++;await this.record(trade,'recovery_action',{issue:issue.type});}else errors.push(result.error??issue.type);}
      const mark=Number(position.markPrice);const r=rMultiple(trade,mark);const meta=trade.metadata??{};
      if(r>=this.policy.partialCloseAtR&&!meta.partial_close_done){const quantity=Math.abs(position.quantity)*this.policy.partialClosePct/100;const result=await this.provider.closePosition({symbol:trade.symbol,providerPositionId:position.providerPositionId,quantity,reason:'policy_partial_close',metadata:{idempotencyKey:`${trade.trade_id}:partial_close`}});if(result.ok){actions++;trade.metadata={...meta,partial_close_done:true};await this.record(trade,'partial_close',{quantity,r});}else errors.push(result.error??'partial_close_failed');}
      if(r>=this.policy.trailingStartsAtR){const stop=replacementStop(trade,mark,this.policy.trailingDistanceR);const previous=Number(meta.trailing_stop??trade.sl_price_intended);const improves=trade.position_side==='long'?stop>previous:stop<previous;if(improves){const result=await this.provider.replaceSL({symbol:trade.symbol,side:trade.position_side,quantity:Math.abs(position.quantity),stopLoss:stop,reason:'trailing',metadata:{idempotencyKey:`${trade.trade_id}:trail:${stop}`}});if(result.ok){actions++;trade.metadata={...trade.metadata,trailing_stop:stop};await this.record(trade,'trailing_stop',{stop,r});}else errors.push(result.error??'trailing_failed');}}
      else if(r>=this.policy.breakEvenAtR&&!meta.break_even_done){const entry=Number(trade.entry_price_filled??trade.entry_price_intended);const result=await this.provider.replaceSL({symbol:trade.symbol,side:trade.position_side,quantity:Math.abs(position.quantity),stopLoss:entry,reason:'breakeven',metadata:{idempotencyKey:`${trade.trade_id}:break_even`}});if(result.ok){actions++;trade.metadata={...trade.metadata,break_even_done:true};await this.record(trade,'break_even',{stop:entry,r});}else errors.push(result.error??'break_even_failed');}
    }
    return{managed:trades.length,issues,actions,errors};
  }
}

export async function retryWithPolicy<T extends ProviderResult>(operation:()=>Promise<T>,maxAttempts:number,baseDelayMs=250,sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))):Promise<T>{let last:T|undefined;for(let attempt=1;attempt<=maxAttempts;attempt++){last=await operation();if(last.ok)return last;if(!/timeout|network|disconnect|stale|queue|rate/i.test(last.error??''))return last;if(attempt<maxAttempts)await sleep(baseDelayMs*2**(attempt-1));}return last!;}
