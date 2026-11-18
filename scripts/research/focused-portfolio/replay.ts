import {concurrentCryptoRiskMultiplier} from '../../../supabase/functions/_shared/personal-growth-policy.ts';
import {houseMoneyRisk,type EquityMode} from '../../../supabase/functions/_shared/house-money-risk.ts';
import {conditionalMarket,rotationEntry,weekendRotation} from '../../../supabase/functions/_shared/conditional-market.ts';
import {portfolioRiskGate} from '../../../supabase/functions/_shared/portfolio-exposure.ts';
export const ms=(v:any)=>typeof v==='number'?v:Date.parse(v);
export function covers(rows:any[],id:string,start:number,end:number){let through=start;for(const c of rows.filter(c=>c.strategy===id).sort((a,b)=>ms(a.start)-ms(b.start))){if(ms(c.end)<=through)continue;if(ms(c.start)>through)return false;through=Math.max(through,ms(c.end));if(through>=end)return true;}return false;}
export interface PersonalExperiment {riskPct:number;dailyHaltPct:number;peakHaltPct:number;portfolioLimitPct:number;correlatedLimitPct:number;allCryptoWeekends?:boolean;leverage?:number;marginBudgetPct?:number;dynamicHouseMoney?:boolean;concurrentCryptoGuard?:boolean;durableLocks?:boolean;}
/** Existing Part 1 policy replay, isolated for bounded research. Never writes live policy. */
export function replay(data:any,closes:any[],ids:string[],mode:EquityMode,window:{start:string;days:number},costDragR=0,dropBest=false,realized?:any[],experiment?:PersonalExperiment){
 if(experiment && mode!=='PERSONAL')throw new Error('Experimental risk is Personal-only');
 const blocked:Record<string,number>={};const reject=(reason:string)=>{blocked[reason]=(blocked[reason]??0)+1;};let maxMarginPct=0,guardedEntries=0;
 const DAY=86400000;
 let input=data.trades.filter((t:any)=>ids.includes(t.strategy)).map((t:any)=>({...t,entry:ms(t.entry),exit:ms(t.exit),netR:t.netR-costDragR}));
 if(dropBest){const admitted:any[]=[];replay(data,closes,ids,mode,window,costDragR,false,admitted,experiment);const best=admitted.filter(t=>t.pnl>0).sort((a,b)=>b.pnl-a.pnl||String(a.id).localeCompare(String(b.id)))[0];if(best)input=input.filter((t:any)=>t.strategy!==best.strategy||t.id!==best.id);}

 const fridayCloses=new Map(closes.map((c:any)=>[c.strategy+':'+c.id+':'+c.at,{...c,netR:c.netR-costDragR}]));
 const start=Date.parse(window.start+'T00:00:00Z'),end=start+window.days*DAY,initial=10000;
 let balance=initial,peak=initial,maxDD=0,month='',monthBase=initial,monthlyNet=0,day='',dailyBase=initial,losses=0,latched:string|null=null,phase:1|2=1,phaseBase=initial,phaseOneAt:number|null=null,passAt:number|null=null,rotationUnpriced=0,openAtEnd=0;
 const open=new Map<string,any>(),events:any[]=[],dailyCloses=new Map<number,number>();let entries=0;
 for(const t of input)if(t.entry>=start&&t.entry<end){events.push({at:t.entry,kind:1,t});events.push({at:t.exit,kind:0,t});}
 // Rotation boundaries are observable calendar events, never chosen using an outcome.
 for(let at=start;at<end;at+=3600000)if(weekendRotation(at)&&!weekendRotation(at-1))events.push({at,kind:2});
 const settle=(key:string,netR:number,at:number)=>{const held=open.get(key);if(!held)return;
   realized?.push({strategy:held.strategy,id:held.id,pnl:held.riskAmount*netR,netR,at});
   const pnl=held.riskAmount*netR;balance+=pnl;monthlyNet+=pnl;losses=pnl<0?losses+1:pnl>0?0:losses;peak=Math.max(peak,balance);maxDD=Math.max(maxDD,(peak-balance)/peak*100);open.delete(key);
   dailyCloses.set(Math.floor((at-start)/DAY)+1,balance);
   if(mode==='PROP_CHALLENGE_PASS'&&passAt===null&&balance>=phaseBase*(phase===1?1.08:1.05)){
    if(phase===1){phaseOneAt=at;phase=2;phaseBase=balance;monthlyNet=0;monthBase=balance;latched=null;}
    else{passAt=at;latched='CHALLENGE_PHASE_TARGET_LOCK';}
   }
 };
 events.sort((a,b)=>a.at-b.at||a.kind-b.kind||String(a.t?.id??'').localeCompare(String(b.t?.id??'')));
 for(const e of events){if(e.at>=end)break;const iso=new Date(e.at).toISOString(),m=iso.slice(0,7),d=iso.slice(0,10);
  if(m!==month){month=m;monthBase=balance;monthlyNet=0;if(latched==='FUNDED_MONTHLY_TARGET_LOCK')latched=null;}
  if(d!==day){day=d;dailyBase=balance;if(latched&&['DAILY_CIRCUIT_4_PERCENT','CHALLENGE_DAILY_HALT','FUNDED_DAILY_HALT','EXPERIMENT_DAILY_HALT'].includes(latched))latched=null;}
  if(e.kind===2){if(mode!=='PERSONAL')for(const [key,t] of [...open.entries()])if(conditionalMarket(t.symbol)==='forex'&&!rotationEntry(t.symbol,e.at).allowed){
   const close=fridayCloses.get(key+':'+e.at);
   if(close?.status==='PRICED')settle(key,close.netR,e.at);
   else if(!t.unpriced){rotationUnpriced++;t.unpriced=true;}
  }continue;}
  const t=e.t,key=t.strategy+':'+t.id;
  if(e.kind===0){const held=open.get(key);if(!held)continue;if(held.unpriced){open.delete(key);continue;}
   settle(key,t.netR,e.at);continue;
  }
  const rotation=rotationEntry(t.symbol,e.at);if(!rotation.allowed&&!(experiment?.allCryptoWeekends&&conditionalMarket(t.symbol)==='crypto')){reject('WEEKEND_ENTRY');continue;}
  const facts={customerId:'ledger',accountId:mode,observedAt:iso,monthlyPnlPct:monthlyNet/monthBase*100,dailyPnlPct:(balance-dailyBase)/dailyBase*100,peakDrawdownPct:(peak-balance)/peak*100,totalDrawdownPct:Math.max(0,(initial-balance)/initial*100),consecutiveLosses:losses,phase,latchedReason:latched};
  let decision=houseMoneyRisk(mode,facts,iso,t.timeframe==='1h'&&['crypto.complementary-ema-pullback','forex.complementary-ema-pullback','gold.native-momentum-60-24-2-5'].includes(t.strategy),rotation.riskMultiplier);
  if(experiment&&!experiment.dynamicHouseMoney){const dd=(peak-balance)/peak*100,daily=(balance-dailyBase)/dailyBase*100;const reason=experiment.durableLocks&&latched?.startsWith('EXPERIMENT_')?latched:balance<=0?'INSOLVENT':dd>=experiment.peakHaltPct?'EXPERIMENT_PEAK_HALT':daily<=-experiment.dailyHaltPct?'EXPERIMENT_DAILY_HALT':null;decision={equity_phase:'EXPERIMENT',base_risk_pct:experiment.riskPct,applied_risk_pct:experiment.riskPct*(weekendRotation(e.at)&&conditionalMarket(t.symbol)==='crypto'?.75:1),block_reason:reason} as any;}
  if(decision.block_reason){latched=decision.block_reason;reject(decision.block_reason);continue;}
  if([...open.values()].some(p=>p.symbol===t.symbol)){reject('SYMBOL_LOCK');continue;}
  const cryptoMultiplier=experiment?.concurrentCryptoGuard?concurrentCryptoRiskMultiplier(t.symbol,[...open.values()]):1;decision={...decision,applied_risk_pct:decision.applied_risk_pct*cryptoMultiplier};
  const gate=portfolioRiskGate({symbol:t.symbol,positions:[...open.values()].map(p=>({symbol:p.symbol,open_risk_pct:p.riskAmount/balance*100})),requestedRiskPct:decision.applied_risk_pct,portfolioLimitPct:experiment?.portfolioLimitPct??(mode==='PERSONAL'?6:2),correlatedLimitPct:experiment?.correlatedLimitPct??(mode==='PERSONAL'?3:1.5)});
  if(!gate.allowed){reject(gate.reasons.join('+'));continue;}
  const riskAmount=balance*decision.applied_risk_pct/100;let margin=0;
  if(experiment?.leverage){if(!Number.isFinite(t.notionalPerRisk)||t.notionalPerRisk<=0){reject('ENTRY_GEOMETRY_MISSING');continue;}margin=riskAmount*t.notionalPerRisk/experiment.leverage;const used=[...open.values()].reduce((sum,p)=>sum+(p.margin??0),0);if((used+margin)/balance*100>(experiment.marginBudgetPct??50)){reject('MARGIN_CAPACITY');continue;}maxMarginPct=Math.max(maxMarginPct,(used+margin)/balance*100);}
  entries++;if(cryptoMultiplier<1)guardedEntries++;open.set(key,{...t,riskAmount,margin});
 }
 openAtEnd=open.size;
 const coverage=ids.filter(id=>covers(data.coverage,id,start,end));
 const balanceAt=(days:number)=>{let value=initial;for(const [d,b] of [...dailyCloses.entries()].sort((a,b)=>a[0]-b[0]))if(d<=days)value=b;return (value/initial-1)*100;};
 return {...window,mode,blocked,maxMarginPct,guardedEntries,coverage:coverage.length,coverageStrategyIds:coverage,missingCoverageStrategyIds:ids.filter(id=>!coverage.includes(id)),totalConfigs:ids.length,entries,returnPct:(balance/initial-1)*100,realizedMaxDrawdownPct:maxDD,phaseOneDays:phaseOneAt===null?null:(phaseOneAt-start)/DAY,passDays:passAt===null?null:(passAt-start)/DAY,funded14:balanceAt(14),funded21:balanceAt(21),rotationUnpriced,openAtEnd,status:coverage.length<ids.length?'PARTIAL_COVERAGE':rotationUnpriced||openAtEnd?'UNPRICED_EXPOSURE':'COMPLETE_LEDGER'};
}
