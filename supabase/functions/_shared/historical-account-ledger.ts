import {evaluateAccountSignal,type AccountEvaluationInput,type AccountDecisionRecord} from './account-policy-authority.ts';
import type {AccountExecutionContext,OpenPositionSummary} from './account-execution-brain/types.ts';
import type {ConditionalSetup} from './conditional-signal-service.ts';
import type {StrategyCandle} from './professional-strategies.ts';
import {watchWidth} from './conditional-contract.ts';
const adverseTick=(price:number,tick:number,buy:boolean)=>(buy?Math.ceil(price/tick-1e-8):Math.floor(price/tick+1e-8))*tick;
export interface HistoricalExecutionSpec {
 symbol:string;contractSize:number;quantityStep:number;minimumQuantity:number;minimumNotional:number;tickSize:number;leverage:number;
 feeBpsPerSide:number;spreadBps:number;slippageBps:number;minimumStopDistance:number;allowShort:boolean;
 provenance:{kind:'HISTORICAL_VENUE_SPEC'|'DOCUMENTED_ASSUMPTION';source:string;limitations:string[]};
}
export interface HistoricalQuote {symbol:string;at:number;bid:number;ask:number;conversion:number;}
export interface LedgerPosition {id:string;signalId:string;strategy:string;symbol:string;side:1|-1;quantity:number;originalQuantity:number;entry:number;stop:number;tp1:number;tp2:number;partialFraction:number;breakEven:boolean;partialDone:boolean;openedAt:number;expiresAt:number;lastBar:number;mark:number;conversion:number;entryRisk:number;realizedGross:number;costs:number;funding:number;}
export interface HistoricalTrade {id:string;signalId:string;strategy:string;symbol:string;side:1|-1;openedAt:number;closedAt:number;entry:number;exit:number;quantity:number;gross:number;costs:number;funding:number;net:number;netR:number;reason:string;}
export interface LedgerSnapshot {schema:'historical-account-ledger/v1';balance:number;equity:number;peakEquity:number;maximumDrawdown:number;day:string;dayStart:number;dayPeak:number;dailyLocked:boolean;failed:boolean;through:number|null;priceUnavailable?:boolean;lastObservation?:number;lastBatchContent?:string;positions:LedgerPosition[];trades:HistoricalTrade[];seenSignals:string[];decisions:{signalId:string;at:number;decision:string;reasons:string[];quantity:number}[];equityPath:{at:number;balance:number;equity:number;kind:string;dailyLocked:boolean;failed:boolean}[];charged:string[];}
export interface HistoricalAccountPolicy {purpose:'HISTORICAL_RESEARCH';initialCapital:number;timezone:string;dailyLossPct:number;overallLossPct:number;drawdown:'STATIC'|'TRAILING';dailyBasis:'DAY_START_BALANCE'|'INITIAL_BALANCE';stopOutMarginRatio:number;}
/** Event-driven account bookkeeping. The real account Brain remains the risk/quantity authority.
 * External effects are absent. OHLC adverse extrema use a conservative simultaneous-loss bound,
 * explicitly distinct from observed tick equity. Historical signal reference fills are never reused as broker fills. */
export class HistoricalAccountLedger {
 private state:LedgerSnapshot;
 private specs:Map<string,HistoricalExecutionSpec>;
 constructor(private policy:HistoricalAccountPolicy,specs:readonly HistoricalExecutionSpec[],resume?:LedgerSnapshot){
  if(policy.purpose!=='HISTORICAL_RESEARCH'||![policy.initialCapital,policy.dailyLossPct,policy.overallLossPct].every(x=>Number.isFinite(x)&&x>0))throw Error('HISTORICAL_ACCOUNT_POLICY_INVALID');
  new Intl.DateTimeFormat('en-CA',{timeZone:policy.timezone});
  this.specs=new Map(specs.map(s=>[s.symbol,s]));
  for(const s of specs)if(![s.contractSize,s.quantityStep,s.minimumQuantity,s.tickSize,s.leverage].every(x=>Number.isFinite(x)&&x>0)||![s.feeBpsPerSide,s.spreadBps,s.slippageBps,s.minimumNotional,s.minimumStopDistance].every(x=>Number.isFinite(x)&&x>=0)||!s.provenance.source)throw Error('HISTORICAL_EXECUTION_SPEC_INVALID');
  if(resume&&resume.schema!=='historical-account-ledger/v1')throw Error('HISTORICAL_LEDGER_VERSION_MISMATCH');
  this.state=resume?structuredClone(resume):{schema:'historical-account-ledger/v1',balance:policy.initialCapital,equity:policy.initialCapital,peakEquity:policy.initialCapital,maximumDrawdown:0,day:'',dayStart:policy.initialCapital,dayPeak:policy.initialCapital,dailyLocked:false,failed:false,through:null,positions:[],trades:[],seenSignals:[],decisions:[],equityPath:[],charged:[]};
 }
 snapshot(){return structuredClone(this.state);}
 private spec(symbol:string){const s=this.specs.get(symbol);if(!s)throw Error('HISTORICAL_CONTRACT_SPEC_MISSING:'+symbol);return s;}
 private advance(at:number){if(!Number.isFinite(at)||this.state.through!==null&&at<this.state.through)throw Error('HISTORICAL_ACCOUNT_CLOCK_REGRESSION');const day=new Intl.DateTimeFormat('en-CA',{timeZone:this.policy.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(at);if(day!==this.state.day){this.state.day=day;this.state.dayStart=this.state.balance;this.state.dayPeak=this.state.equity;this.state.dailyLocked=false;}this.state.through=at;}
 private record(at:number,kind:string){
  const s=this.state;s.equity=s.balance+s.positions.reduce((n,p)=>n+(p.mark-p.entry)*p.side*p.quantity*this.spec(p.symbol).contractSize*p.conversion,0);s.peakEquity=Math.max(s.peakEquity,s.equity);s.dayPeak=Math.max(s.dayPeak,s.equity);s.maximumDrawdown=Math.max(s.maximumDrawdown,(s.peakEquity-s.equity)/s.peakEquity*100);
  const dailyAllowance=(this.policy.dailyBasis==='INITIAL_BALANCE'?this.policy.initialCapital:s.dayStart)*this.policy.dailyLossPct/100;
  if(s.equity<=s.dayStart-dailyAllowance)s.dailyLocked=true;
  const floor=(this.policy.drawdown==='STATIC'?this.policy.initialCapital:s.peakEquity)-this.policy.initialCapital*this.policy.overallLossPct/100;
  if(s.equity<=floor||s.equity<=0)s.failed=true;
  const margin=s.positions.reduce((n,p)=>n+p.quantity*this.spec(p.symbol).contractSize*p.entry*p.conversion/this.spec(p.symbol).leverage,0);
  if(margin>0&&s.equity/margin*100<=this.policy.stopOutMarginRatio){s.failed=true;for(const p of [...s.positions])this.fill(p,p.quantity,p.mark,at,'CONSERVATIVE_MARGIN_STOP_OUT');s.equity=s.balance;}
  s.equityPath.push({at,balance:s.balance,equity:s.equity,kind,dailyLocked:s.dailyLocked,failed:s.failed});
 }
 context(template:AccountExecutionContext,at:number):AccountExecutionContext {
  const s=this.state,open:OpenPositionSummary[]=s.positions.map(p=>{const spec=this.spec(p.symbol),risk=Math.max(0,(p.mark-p.stop)*p.side)*p.quantity*spec.contractSize*p.conversion;return {ticket_or_id:p.id,symbol:p.symbol,side:p.side===1?'BUY':'SELL',quantity:p.quantity,entry_price:p.entry,current_price:p.mark,unrealized_pnl:(p.mark-p.entry)*p.side*p.quantity*spec.contractSize*p.conversion,stop_loss:p.stop,take_profit:p.tp2,open_risk_amount:risk,open_risk_pct:s.balance>0?risk/s.balance*100:100,notional_value:p.quantity*spec.contractSize*p.mark*p.conversion,opened_at:new Date(p.openedAt).toISOString()};});
  const used=s.positions.reduce((n,p)=>n+p.quantity*this.spec(p.symbol).contractSize*p.entry*p.conversion/this.spec(p.symbol).leverage,0),risk=open.reduce((n,p)=>n+p.open_risk_amount,0),daily=Math.max(0,s.dayStart-s.equity),total=Math.max(0,(this.policy.drawdown==='STATIC'?this.policy.initialCapital:s.peakEquity)-s.equity),stamp=new Date(at).toISOString();
  return {...template,balance:s.balance,equity:s.equity,free_margin:Math.max(0,s.equity-used),used_margin:used,open_positions:open,exposure:{total_notional_usd:open.reduce((n,p)=>n+p.notional_value,0),total_open_risk_usd:risk,total_open_risk_pct:s.balance>0?risk/s.balance*100:100,active_position_count:open.length,positions_by_symbol:Object.fromEntries(open.map(p=>[p.symbol,open.filter(x=>x.symbol===p.symbol).length]))},daily_drawdown:{...template.daily_drawdown,starting_balance:s.dayStart,peak_equity:s.dayPeak,current_drawdown_amount:daily,current_drawdown_pct:daily/s.dayStart*100,is_violated:s.dailyLocked},total_drawdown:{...template.total_drawdown,initial_balance:this.policy.initialCapital,high_water_mark:s.peakEquity,current_drawdown_amount:total,current_drawdown_pct:total/this.policy.initialCapital*100,is_violated:s.failed},session_state:{...template.session_state,current_time_utc:stamp},runtime_health:{...template.runtime_health,last_heartbeat_at:stamp},updated_at:stamp};
 }
 enter(setup:ConditionalSetup,quote:HistoricalQuote,input:AccountEvaluationInput):AccountDecisionRecord|null {
  this.advance(quote.at);const spec=this.spec(setup.symbol),s=this.state,id=setup.id;
  const reject=(reason:string)=>{s.decisions.push({signalId:id,at:quote.at,decision:'BLOCK',reasons:[reason],quantity:0});return null;};
  if(s.seenSignals.includes(id))return reject('EXECUTION_REPLAY_PREVENTED');
  if(setup.status!=='ACTIVE'||setup.entryDecision?.kind!=='IMMEDIATE_CONFIRMED'||!(setup.entryDecision.executionEligible||setup.entryDecision.authorizationScope==='RESEARCH'))return reject('CONFIRMED_RESEARCH_OR_QUALIFIED_SIGNAL_REQUIRED');
  if(!['DEMO','TESTNET'].includes(input.context.environment))return reject('HISTORICAL_LIVE_ENVIRONMENT_FORBIDDEN');
  if(quote.symbol!==setup.symbol||![quote.bid,quote.ask,quote.conversion].every(x=>Number.isFinite(x)&&x>0)||quote.ask<quote.bid)return reject('HISTORICAL_QUOTE_INVALID');
  if(quote.at>=Date.parse(setup.expiresAt)||quote.at<Date.parse(setup.fillAt??'' )||quote.at-Date.parse(setup.fillAt??'')>90000)return reject('CUSTOMER_ENTRY_EXPIRED');
  if(s.priceUnavailable)return reject('POSITION_MARKET_DATA_UNAVAILABLE');
  if(s.failed||s.dailyLocked)return reject(s.failed?'ACCOUNT_FAILED':'DAILY_EQUITY_LOCK');
  if(setup.side==='sell'&&!spec.allowShort)return reject('INSTRUMENT_SHORT_UNSUPPORTED');
  const side=setup.side==='buy'?1:-1,reference=side===1?quote.ask:quote.bid,price=adverseTick(reference*(1+side*spec.slippageBps/10000),spec.tickSize,side===1),distance=side*(price-setup.stop),initialDistance=Math.abs(setup.trigger-setup.stop);
  if(distance<spec.minimumStopDistance||distance<=0||side*(setup.tp1-price)<=0||side*(price-setup.trigger)>(setup.management?.maximumChaseR??.25)*initialDistance)return reject('BROKER_ENTRY_PRICE_INVALID');
  const stamp=new Date(quote.at).toISOString(),context=this.context({...input.context,provider_contract:input.context.provider_contract?.kind==='MT5'?{...input.context.provider_contract,quote_to_account_conversion:quote.conversion}:input.context.provider_contract},quote.at);
  const decision=evaluateAccountSignal({...input,signal:{...input.signal,signal_id:id,symbol:setup.symbol,strategy_id:setup.strategy,timeframe:setup.timeframe,direction:side===1?'BUY':'SELL',entry_price:price,stop_loss:setup.stop,tp1:setup.tp1,tp2:setup.tp2,created_at:setup.fillAt??stamp},context,evaluatedAt:stamp,duplicateSignalForAccount:false,activeSymbolConflict:s.positions.some(p=>p.symbol===setup.symbol)});
  const q=decision.executionIntent?.approvedQuantity??0;
  if(!['ALLOW','REDUCE'].includes(decision.decision)||q<=0){s.decisions.push({signalId:id,at:quote.at,decision:decision.decision,reasons:[...decision.reasonCodes],quantity:0});return decision;}
  if(q<spec.minimumQuantity||Math.abs(q/spec.quantityStep-Math.round(q/spec.quantityStep))>1e-6||q*price*spec.contractSize*quote.conversion<spec.minimumNotional)return reject('BROKER_QUANTITY_OR_NOTIONAL_INVALID');
  const fees=q*price*spec.contractSize*quote.conversion*spec.feeBpsPerSide/10000;
  if(q*price*spec.contractSize*quote.conversion/spec.leverage+fees>context.free_margin)return reject('BROKER_MARGIN_INSUFFICIENT');
  s.seenSignals.push(id);s.balance-=fees;s.positions.push({id:`simulated:${input.account.id}:${id}`,signalId:id,strategy:setup.strategy,symbol:setup.symbol,side,quantity:q,originalQuantity:q,entry:price,stop:setup.stop,tp1:setup.tp1,tp2:setup.tp2,partialFraction:setup.management?.partialFraction??.5,breakEven:setup.management?.breakEvenAfterTp1??false,partialDone:false,openedAt:quote.at,expiresAt:quote.at+setup.holdBars*watchWidth(setup.timeframe),lastBar:quote.at-1,mark:side===1?quote.bid:quote.ask,conversion:quote.conversion,entryRisk:distance*q*spec.contractSize*quote.conversion,realizedGross:0,costs:fees,funding:0});
  s.decisions.push({signalId:id,at:quote.at,decision:decision.decision,reasons:[...decision.reasonCodes],quantity:q});this.record(quote.at,'ENTRY');return decision;
 }
 private fill(p:LedgerPosition,quantity:number,reference:number,at:number,reason:string){
  const spec=this.spec(p.symbol),price=adverseTick(reference*(1-p.side*spec.slippageBps/10000),spec.tickSize,p.side!==1),gross=(price-p.entry)*p.side*quantity*spec.contractSize*p.conversion,fee=quantity*price*spec.contractSize*p.conversion*spec.feeBpsPerSide/10000;
  this.state.balance+=gross-fee;p.realizedGross+=gross;p.costs+=fee;p.quantity=Math.max(0,p.quantity-quantity);
  if(p.quantity<spec.minimumQuantity-1e-12){this.state.positions=this.state.positions.filter(x=>x.id!==p.id);const net=p.realizedGross-p.costs-p.funding;this.state.trades.push({id:p.id,signalId:p.signalId,strategy:p.strategy,symbol:p.symbol,side:p.side,openedAt:p.openedAt,closedAt:at,entry:p.entry,exit:price,quantity:p.originalQuantity,gross:p.realizedGross,costs:p.costs,funding:p.funding,net,netR:net/p.entryRisk,reason});}
 }
 observeClosedBars(bars:readonly StrategyCandle[],at:number,conversions:Readonly<Record<string,number>>={}){
  const content=JSON.stringify({bars,conversions});if(this.state.lastObservation===at){if(this.state.lastBatchContent!==content)throw Error('HISTORICAL_BAR_REPLAY_CONTENT_CONFLICT');return;}
  const markAt=at-1;this.advance(markAt);const usable=bars.filter(b=>Date.parse(b.open_time)+watchWidth(b.timeframe)<=at),bySymbol=new Map(usable.map(b=>[b.symbol,b]));
  for(const p of [...this.state.positions]){const b=bySymbol.get(p.symbol);if(!b||Date.parse(b.open_time)<=p.lastBar||Date.parse(b.open_time)<p.openedAt)continue;
   const spec=this.spec(p.symbol),spread=b.ask_open!==undefined?b.ask_open-b.open:b.open*spec.spreadBps/10000;p.conversion=conversions[p.symbol]??p.conversion;
   const open=p.side===1?b.open:b.ask_open??b.open+spread;
   if(p.side*(open-p.stop)<=0){this.fill(p,p.quantity,open,Date.parse(b.open_time),'GAP_THROUGH_STOP');continue;}
   p.mark=p.side===1?Math.max(b.low,p.stop*(1-spec.slippageBps/10000)):Math.min(b.ask_high??b.high+spread,p.stop*(1+spec.slippageBps/10000));
  }
  this.state.priceUnavailable=this.state.positions.some(p=>!bySymbol.has(p.symbol));
  this.record(markAt,'CONSERVATIVE_INTRABAR_EQUITY_BOUND');
  for(const p of [...this.state.positions]){const b=bySymbol.get(p.symbol);if(!b||Date.parse(b.open_time)<=p.lastBar||Date.parse(b.open_time)<p.openedAt)continue;
   const spec=this.spec(p.symbol),spread=b.close*spec.spreadBps/10000,low=p.side===1?b.low:b.ask_low??b.low+spread,high=p.side===1?b.high:b.ask_high??b.high+spread;
   p.lastBar=Date.parse(b.open_time);
   if(p.side===1?low<=p.stop:high>=p.stop){this.fill(p,p.quantity,p.stop,markAt,'STOP_FIRST');continue;}
   if(p.side===1?high>=p.tp2:low<=p.tp2){
    if(!p.partialDone&&p.partialFraction>0){const q=Math.floor(p.quantity*p.partialFraction/spec.quantityStep)*spec.quantityStep;if(q>=spec.minimumQuantity&&p.quantity-q>=spec.minimumQuantity)this.fill(p,q,p.tp1,markAt,'PARTIAL_TP1');}
    this.fill(p,p.quantity,p.tp2,markAt,'TARGET');continue;
   }
   if(!p.partialDone&&(p.side===1?high>=p.tp1:low<=p.tp1)){const q=Math.floor(p.quantity*p.partialFraction/spec.quantityStep)*spec.quantityStep;if(q>=spec.minimumQuantity&&p.quantity-q>=spec.minimumQuantity){this.fill(p,q,p.tp1,markAt,'PARTIAL_TP1');p.partialDone=true;if(p.breakEven){p.stop=p.entry;if(p.side===1?low<=p.stop:high>=p.stop){this.fill(p,p.quantity,p.stop,markAt,'SAME_BAR_BREAK_EVEN_CONSERVATIVE');continue;}}}}
   p.mark=p.side===1?b.close:b.ask_close??b.close+spread;
   if(at>=p.expiresAt)this.fill(p,p.quantity,p.mark,markAt,'TIME_EXIT');
  }
  this.record(markAt,'CLOSED_BAR_MARK');this.state.lastObservation=at;this.state.lastBatchContent=content;this.advance(at);
 }
 observeQuotes(quotes:readonly HistoricalQuote[],at:number){
  this.advance(at);const bySymbol=new Map(quotes.map(q=>[q.symbol,q]));
  for(const p of [...this.state.positions]){const q=bySymbol.get(p.symbol);if(!q)continue;if(q.at!==at||q.ask<q.bid||![q.ask,q.bid,q.conversion].every(x=>Number.isFinite(x)&&x>0))throw Error('HISTORICAL_QUOTE_INVALID');p.mark=p.side===1?q.bid:q.ask;p.conversion=q.conversion;if(p.side*(p.mark-p.stop)<=0)this.fill(p,p.quantity,p.mark,at,'OBSERVED_QUOTE_STOP');else if(at>=p.expiresAt)this.fill(p,p.quantity,p.mark,at,'TIME_EXIT');}
  this.state.priceUnavailable=this.state.positions.some(p=>!bySymbol.has(p.symbol));this.record(at,'OBSERVED_QUOTE_MARK');
 }
 financing(at:number,eventId:string,rates:Readonly<Record<string,number>>){this.advance(at);if(this.state.charged.includes(eventId))return;this.state.charged.push(eventId);for(const p of this.state.positions){const rate=rates[p.symbol];if(rate===undefined)continue;if(!Number.isFinite(rate))throw Error('HISTORICAL_FINANCING_RATE_INVALID');const cost=p.quantity*this.spec(p.symbol).contractSize*p.mark*p.conversion*rate*p.side;this.state.balance-=cost;p.funding+=cost;}this.record(at,'FUNDING_OR_SWAP');}
}
