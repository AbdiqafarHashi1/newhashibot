import type { ArbitrationCandidate } from "./arbitrator.ts";
import type { StrategyCandle } from "./professional-strategies.ts";

export interface ReplayFillAssumptions {
  entryTiming: "NEXT_OPEN";
  feeBps: number; spreadBps: number; slippageBps: number; fundingBps: number;
  partialExitPct: number;
  moveStopToBreakevenAfterTp1: boolean;
  trailingStopR: number | null;
  sameCandlePolicy: "STOP_FIRST" | "AMBIGUOUS";
  maxBarsInTrade?: number;
  closeAtHorizon?: boolean;
  tp1StopPolicy?: "NEXT_BAR" | "CONSERVATIVE_SAME_BAR";
}
export interface ReplayCashFlowEvent { time: string; candidateId: string; kind: "COST"|"TP1"|"EXIT"; sequence: number; realizedR: number; }
export interface ReplayOutcome {
  candidateId:string; strategyId:string; symbol:string; timeframe:string;
  status:"TARGET"|"STOP"|"OPEN"|"AMBIGUOUS"|"EXCLUDED"|"TIMEOUT";
  entryTime:string; exitTime:string|null; entryPrice:number; exitPrice:number|null;
  grossR:number|null; netR:number|null; costR:number; partialExit:boolean; conservative:boolean;
  exclusionReason?:string; cashFlowEvents:ReplayCashFlowEvent[];
}
export const DEFAULT_REPLAY_ASSUMPTIONS:ReplayFillAssumptions={entryTiming:"NEXT_OPEN",feeBps:0,spreadBps:0,slippageBps:0,fundingBps:0,partialExitPct:.5,moveStopToBreakevenAfterTp1:true,trailingStopR:null,sameCandlePolicy:"STOP_FIRST"};

export function validateReplayAssumptions(a: ReplayFillAssumptions) {
  if(a.tp1StopPolicy!==undefined&&!["NEXT_BAR","CONSERVATIVE_SAME_BAR"].includes(a.tp1StopPolicy))throw new Error("INVALID_TP1_STOP_POLICY");
  if (a.entryTiming !== "NEXT_OPEN" || !["STOP_FIRST","AMBIGUOUS"].includes(a.sameCandlePolicy)) throw new Error("UNSUPPORTED_REPLAY_POLICY");
  if (![a.feeBps,a.spreadBps,a.slippageBps,a.fundingBps].every(x=>Number.isFinite(x)&&x>=0)) throw new Error("INVALID_REPLAY_COSTS");
  if (!Number.isFinite(a.partialExitPct)||a.partialExitPct<0||a.partialExitPct>1) throw new Error("INVALID_PARTIAL_EXIT_PERCENTAGE");
  if (a.trailingStopR!==null&&(!Number.isFinite(a.trailingStopR)||a.trailingStopR<0)) throw new Error("INVALID_TRAILING_STOP");
  if (a.maxBarsInTrade!==undefined&&(!Number.isInteger(a.maxBarsInTrade)||a.maxBarsInTrade<1)) throw new Error("INVALID_MAX_BARS_IN_TRADE");
}

export function* evaluateReplayOutcomeSteps(candidate:ArbitrationCandidate,candles:readonly StrategyCandle[],after:string,a:ReplayFillAssumptions):Generator<void,ReplayOutcome|null> {
  validateReplayAssumptions(a);
  const path=candles.filter(c=>Date.parse(c.open_time)>=Date.parse(after)); if(!path.length)return null;
  const entryCandle=path[0], entry=entryCandle.open, sign=candidate.side==="buy"?1:-1;
  const excluded=(reason:string):ReplayOutcome=>({candidateId:candidate.id,strategyId:candidate.strategyId,symbol:candidate.symbol,timeframe:candidate.timeframe,status:"EXCLUDED",entryTime:entryCandle.open_time,exitTime:null,entryPrice:entry,exitPrice:null,grossR:null,netR:null,costR:0,partialExit:false,conservative:true,exclusionReason:reason,cashFlowEvents:[]});
  if (!Number.isFinite(entry)||!Number.isFinite(candidate.stop)||!candidate.targets.length||candidate.targets.some(x=>!Number.isFinite(x))) return excluded("INVALID_ENTRY_GEOMETRY");
  const stopDistance=(entry-candidate.stop)*sign;
  if (stopDistance<=0) return excluded((candidate.stop-entry)*sign>=0?"ENTRY_GAP_BEYOND_STOP":"INVALID_ENTRY_GEOMETRY");
  const targetDistances=candidate.targets.map(x=>(x-entry)*sign);
  if(targetDistances.some(x=>x<=0)||targetDistances.some((x,i)=>i>0&&x<targetDistances[i-1])) return excluded("ENTRY_GAP_BEYOND_TARGET_OR_INVALID_GEOMETRY");
  const risk=stopDistance, tp1=candidate.targets[0], tp2=candidate.targets.at(-1)!;
  const costR=entry*(a.feeBps+a.spreadBps+a.slippageBps+a.fundingBps)/10_000/risk;
  let stop=candidate.stop, tp1Hit=false, gross=0, seq=0;
  const events:ReplayCashFlowEvent[]=[{time:entryCandle.open_time,candidateId:candidate.id,kind:"COST",sequence:seq++,realizedR:-costR}];
  const realized=(price:number,qty:number)=>(price-entry)*sign/risk*qty;
  const row=(status:ReplayOutcome["status"],exitTime:string|null,exitPrice:number|null,ambiguous=false):ReplayOutcome=>({candidateId:candidate.id,strategyId:candidate.strategyId,symbol:candidate.symbol,timeframe:candidate.timeframe,status,entryTime:entryCandle.open_time,exitTime,entryPrice:entry,exitPrice,grossR:status==="OPEN"||ambiguous?null:gross,netR:status==="OPEN"||ambiguous?null:gross-costR,costR,partialExit:tp1Hit,conservative:ambiguous||status==="STOP",cashFlowEvents:events});
  const limited=path.slice(0,a.maxBarsInTrade??path.length);
  for(const candle of limited){
    yield;
    const hitStop=sign===1?candle.low<=stop:candle.high>=stop;
    const hitTp1=!tp1Hit&&(sign===1?candle.high>=tp1:candle.low<=tp1);
    const hitTp2=sign===1?candle.high>=tp2:candle.low<=tp2;
    if(hitStop&&(hitTp1||hitTp2)){
      if(a.sameCandlePolicy==="AMBIGUOUS") return row("AMBIGUOUS",candle.open_time,null,true);
      const fill=sign===1?Math.min(stop,candle.open):Math.max(stop,candle.open);const amount=realized(fill,tp1Hit?1-a.partialExitPct:1); gross+=amount; events.push({time:candle.open_time,candidateId:candidate.id,kind:"EXIT",sequence:seq++,realizedR:amount}); return row("STOP",candle.open_time,fill);
    }
    if(hitStop){const fill=sign===1?Math.min(stop,candle.open):Math.max(stop,candle.open);const amount=realized(fill,tp1Hit?1-a.partialExitPct:1);gross+=amount;events.push({time:candle.open_time,candidateId:candidate.id,kind:"EXIT",sequence:seq++,realizedR:amount});return row("STOP",candle.open_time,fill);}
    if(hitTp1){tp1Hit=true;const amount=realized(tp1,a.partialExitPct);gross+=amount;events.push({time:candle.open_time,candidateId:candidate.id,kind:"TP1",sequence:seq++,realizedR:amount});if(a.moveStopToBreakevenAfterTp1)stop=entry;if(a.trailingStopR!==null)stop=sign===1?Math.max(stop,entry+risk*a.trailingStopR):Math.min(stop,entry-risk*a.trailingStopR);}
    if(hitTp1&&a.tp1StopPolicy==="CONSERVATIVE_SAME_BAR"&&(a.moveStopToBreakevenAfterTp1||a.trailingStopR!==null)&&(sign===1?candle.low<=stop:candle.high>=stop)){
      if(a.sameCandlePolicy==="AMBIGUOUS")return row("AMBIGUOUS",candle.open_time,null,true);
      const amount=realized(stop,1-a.partialExitPct);gross+=amount;events.push({time:candle.open_time,candidateId:candidate.id,kind:"EXIT",sequence:seq++,realizedR:amount});return row("STOP",candle.open_time,stop);
    }
    if(hitTp2){const amount=realized(tp2,tp1Hit?1-a.partialExitPct:1);gross+=amount;events.push({time:candle.open_time,candidateId:candidate.id,kind:"EXIT",sequence:seq++,realizedR:amount});return row("TARGET",candle.open_time,tp2);}
  }
  if(a.closeAtHorizon&&limited.length){const last=limited.at(-1)!,amount=realized(last.close,tp1Hit?1-a.partialExitPct:1);gross+=amount;events.push({time:last.open_time,candidateId:candidate.id,kind:"EXIT",sequence:seq++,realizedR:amount});return row("TIMEOUT",last.open_time,last.close);}
  return row("OPEN",null,null);
}

export function summarizeReplayOutcomes(rows:readonly ReplayOutcome[]){
  const resolved=rows.filter(r=>r.netR!==null),returns=resolved.map(r=>r.netR!),wins=returns.filter(x=>x>0),losses=returns.filter(x=>x<0),grossProfit=wins.reduce((a,b)=>a+b,0),grossLoss=Math.abs(losses.reduce((a,b)=>a+b,0));
  const events=rows.flatMap(r=>r.cashFlowEvents).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)||a.candidateId.localeCompare(b.candidateId)||a.sequence-b.sequence);
  let equity=0,peak=0,drawdown=0;const realizedEquityCurve=events.map(e=>{equity+=e.realizedR;peak=Math.max(peak,equity);drawdown=Math.max(drawdown,peak-equity);return{...e,equityR:equity}});
  return{analysisMode:"INDEPENDENT_SIGNAL_OUTCOMES" as const,overlapPolicy:"NOT_PORTFOLIO_NETTED" as const,tradeCount:rows.length,resolvedCount:resolved.length,openCount:rows.filter(r=>r.status==="OPEN").length,ambiguousCount:rows.filter(r=>r.status==="AMBIGUOUS").length,excludedCount:rows.filter(r=>r.status==="EXCLUDED").length,expectancyR:returns.length?returns.reduce((a,b)=>a+b,0)/returns.length:null,profitFactor:grossLoss?grossProfit/grossLoss:null,profitFactorUndefinedReason:grossLoss?null:grossProfit>0?"NO_LOSING_TRADES":"NO_RESOLVED_PROFIT",realizedMaxDrawdownR:events.length?drawdown:null,realizedEquityCurve};
}

export function evaluateReplayOutcome(...input:Parameters<typeof evaluateReplayOutcomeSteps>){const steps=evaluateReplayOutcomeSteps(...input);let step=steps.next();while(step.done===false)step=steps.next();return step.value;}
