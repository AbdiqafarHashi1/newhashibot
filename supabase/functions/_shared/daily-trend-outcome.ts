import {dailyCandidate} from './daily-trend-contract.ts';
import {admitDailyRows,dailySeries} from './daily-trend.ts';
import type {ArbitrationCandidate} from './arbitrator.ts';
import type {StrategyCandle} from './professional-strategies.ts';
import type {ReplayOutcome,ReplayCashFlowEvent} from './replay-outcomes.ts';
/** Whole admitted prefix is needed for original indicator seeds. Trail applies only NEXT candle. */
export function* dailyTrendOutcomeSteps(c:ArbitrationCandidate,rows:readonly StrategyCandle[],after:string,costBps=26,observationEnd?:string):Generator<void,ReplayOutcome|null>{
 if(!dailyCandidate(c)||!admitDailyRows(rows,c.symbol))throw Error('DAILY_EXIT_CONTRACT_INVALID');
 const at=Date.parse(after),first=rows.findIndex(r=>Date.parse(r.open_time)===at);if(first<0)return null;
 if(first<201)throw Error('DAILY_SEED_PREFIX_REQUIRED');
 const f=dailySeries(rows),entry=rows[first].open,risk=entry-c.stop,events:ReplayCashFlowEvent[]=[];
 const result=(status:ReplayOutcome['status'],exit:number|null,index:number|null,reason?:string):ReplayOutcome=>({candidateId:c.id,strategyId:c.strategyId,symbol:c.symbol,timeframe:c.timeframe,status,entryTime:rows[first].open_time,exitTime:index===null?null:rows[index].open_time,entryPrice:entry,exitPrice:exit,grossR:exit===null?null:(exit-entry)/risk,netR:exit===null?null:(exit-entry)/risk-entry*costBps/10000/risk,costR:risk>0?entry*costBps/10000/risk:0,partialExit:false,conservative:status==='STOP',exclusionReason:reason,cashFlowEvents:events});
 if(!(entry>c.stop&&c.stop>0))return {...result('EXCLUDED',null,null,'ENTRY_GAP_BEYOND_STOP'),costR:0};
 events.push({candidateId:c.id,time:rows[first].open_time,kind:'COST',sequence:0,realizedR:-entry*costBps/10000/risk});
 let stop=c.stop,exitNext=false;
 for(let i=first;i<rows.length;i++){
  yield;
  const row=rows[i];let fill:number|null=null,status:ReplayOutcome['status']='OPEN';
  if(exitNext){fill=row.open;status='REGIME_EXIT';}
  else if(observationEnd!==undefined&&Date.parse(row.open_time)+86400000>Date.parse(observationEnd))break;
  else if(row.low<=stop){fill=Math.min(stop,row.open);status='STOP';}
  if(fill!==null){events.push({candidateId:c.id,time:row.open_time,kind:'EXIT',sequence:1,realizedR:(fill-entry)/risk});return result(status,fill,i);}
  stop=Math.max(stop,row.close-3*f.atr[i]);exitNext=f.fast[i]<=f.slow[i]||row.close<f.regime[i];
 }
 return result('OPEN',null,null);
}
