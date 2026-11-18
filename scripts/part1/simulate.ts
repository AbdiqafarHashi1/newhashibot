import {readFileSync,writeFileSync} from 'node:fs';
import {houseMoneyRisk,type EquityMode} from '../../supabase/functions/_shared/house-money-risk.ts';
import {rotationEntry,weekendRotation} from '../../supabase/functions/_shared/conditional-market.ts';
import {portfolioRiskGate} from '../../supabase/functions/_shared/portfolio-exposure.ts';
import {COST_POSITIVE_CONFIG_IDS} from '../../supabase/functions/_shared/cost-positive-configs.ts';
const data=JSON.parse(readFileSync('.tmp/part1-ledgers.json','utf8')),DAY=86400000,ms=(v:any)=>typeof v==='number'?v:Date.parse(v);
const input=data.trades.map((t:any)=>({...t,entry:ms(t.entry),exit:ms(t.exit)})).filter((t:any)=>COST_POSITIVE_CONFIG_IDS.includes(t.strategy));
const windows=[...['2025-04-01','2025-06-01','2026-08-01','2026-10-01'].map(start=>({start,days:30})),...['2025-04-01','2025-06-01','2026-07-05','2026-09-01'].map(start=>({start,days:60}))];
const modes:EquityMode[]=['PERSONAL','PROP_CHALLENGE_PASS','PROP_FUNDED_INCOME'];
const results:any[]=[];
for(const window of windows)for(const mode of modes){
 const start=Date.parse(window.start+'T00:00:00Z'),end=start+window.days*DAY,initial=10000;
 let balance=initial,peak=initial,maxDD=0,month='',monthBase=initial,monthlyNet=0,day='',dailyBase=initial,losses=0,latched:string|null=null,phase:1|2=1,phaseBase=initial,phaseOneAt:number|null=null,passAt:number|null=null,rotationUnpriced=0,openAtEnd=0;
 const open=new Map<string,any>(),events:any[]=[],dailyCloses=new Map<number,number>();let entries=0;
 for(const t of input)if(t.entry>=start&&t.entry<end){events.push({at:t.entry,kind:1,t});events.push({at:t.exit,kind:0,t});}
 // Rotation boundaries are observable calendar events, never chosen using an outcome.
 for(let at=start;at<end;at+=3600000)if(weekendRotation(at)&&!weekendRotation(at-1))events.push({at,kind:2});
 events.sort((a,b)=>a.at-b.at||a.kind-b.kind||String(a.t?.id??'').localeCompare(String(b.t?.id??'')));
 for(const e of events){if(e.at>=end)break;const iso=new Date(e.at).toISOString(),m=iso.slice(0,7),d=iso.slice(0,10);
  if(m!==month){month=m;monthBase=balance;monthlyNet=0;if(latched==='FUNDED_MONTHLY_TARGET_LOCK')latched=null;}
  if(d!==day){day=d;dailyBase=balance;if(latched&&['DAILY_CIRCUIT_4_PERCENT','CHALLENGE_DAILY_HALT','FUNDED_DAILY_HALT'].includes(latched))latched=null;}
  if(e.kind===2){if(mode!=='PERSONAL')for(const t of open.values())if(!rotationEntry(t.symbol,e.at).allowed){rotationUnpriced++;t.unpriced=true;}continue;}
  const t=e.t,key=t.strategy+':'+t.id;
  if(e.kind===0){const held=open.get(key);if(!held)continue;if(held.unpriced){open.delete(key);continue;}
   const pnl=held.riskAmount*t.netR;balance+=pnl;monthlyNet+=pnl;losses=pnl<0?losses+1:pnl>0?0:losses;peak=Math.max(peak,balance);maxDD=Math.max(maxDD,(peak-balance)/peak*100);open.delete(key);
   dailyCloses.set(Math.floor((e.at-start)/DAY)+1,balance);
   if(mode==='PROP_CHALLENGE_PASS'&&passAt===null&&balance>=phaseBase*(phase===1?1.08:1.05)){
    if(phase===1){phaseOneAt=e.at;phase=2;phaseBase=balance;monthlyNet=0;monthBase=balance;latched=null;}
    else{passAt=e.at;latched='CHALLENGE_PHASE_TARGET_LOCK';}
   }
   continue;
  }
  const rotation=rotationEntry(t.symbol,e.at);if(!rotation.allowed)continue;
  const facts={customerId:'ledger',accountId:mode,observedAt:iso,monthlyPnlPct:monthlyNet/monthBase*100,dailyPnlPct:(balance-dailyBase)/dailyBase*100,peakDrawdownPct:(peak-balance)/peak*100,totalDrawdownPct:Math.max(0,(initial-balance)/initial*100),consecutiveLosses:losses,phase,latchedReason:latched};
  const decision=houseMoneyRisk(mode,facts,iso,t.timeframe==='1h'&&['crypto.complementary-ema-pullback','forex.complementary-ema-pullback','gold.native-momentum-60-24-2-5'].includes(t.strategy),rotation.riskMultiplier);
  if(decision.block_reason){latched=decision.block_reason;continue;}
  if([...open.values()].some(p=>p.symbol===t.symbol))continue;
  const gate=portfolioRiskGate({symbol:t.symbol,positions:[...open.values()].map(p=>({symbol:p.symbol,open_risk_pct:p.riskAmount/balance*100})),requestedRiskPct:decision.applied_risk_pct,portfolioLimitPct:mode==='PERSONAL'?6:2,correlatedLimitPct:mode==='PERSONAL'?3:1.5});
  if(!gate.allowed)continue;entries++;open.set(key,{...t,riskAmount:balance*decision.applied_risk_pct/100});
 }
 openAtEnd=open.size;
 const coverage=COST_POSITIVE_CONFIG_IDS.filter(id=>data.coverage.some((c:any)=>c.strategy===id&&ms(c.start)<=start&&ms(c.end)>=end));
 const balanceAt=(days:number)=>{let value=initial;for(const [d,b] of [...dailyCloses.entries()].sort((a,b)=>a[0]-b[0]))if(d<=days)value=b;return (value/initial-1)*100;};
 results.push({...window,mode,coverage:coverage.length,totalConfigs:16,entries,returnPct:(balance/initial-1)*100,realizedMaxDrawdownPct:maxDD,phaseOneDays:phaseOneAt===null?null:(phaseOneAt-start)/DAY,passDays:passAt===null?null:(passAt-start)/DAY,funded14:balanceAt(14),funded21:balanceAt(21),rotationUnpriced,openAtEnd,status:coverage.length<16?'PARTIAL_COVERAGE':rotationUnpriced||openAtEnd?'UNPRICED_EXPOSURE':'COMPLETE_LEDGER'});
}
const n=(v:number|null)=>v===null?'—':v.toFixed(2),rows=results.map(r=>`| ${r.start} / ${r.days}d | ${r.mode} | ${r.coverage}/16 | ${r.rotationUnpriced?'N/A':n(r.returnPct)} | ${r.rotationUnpriced?'N/A':n(r.realizedMaxDrawdownPct)} | ${r.rotationUnpriced?'N/A':n(r.phaseOneDays)+' / '+n(r.passDays)} | ${r.mode==='PROP_FUNDED_INCOME'&&!r.rotationUnpriced?n(r.funded14)+' / '+n(r.funded21):'—'} | ${r.rotationUnpriced} / ${r.openAtEnd} |`);
const report=`# Saved-ledger portfolio diagnostics\n\nNo candle data was downloaded. ${input.length} unique closed source trades across ${new Set(input.map((x:any)=>x.strategy)).size}/16 configurations; ${data.missingReports.length} canonical full reports are absent from the saved checkout. Each row shares one cash ledger, freezes risk at entry, excludes duplicate symbol exposure, applies USD buckets, calendar entry gates and the same House-Money function as execution. Costs/funding are already netted in source R and are scaled linearly.\n\n**These are partial-coverage diagnostics, not a verified all-16 portfolio or firm-passing probability.** DD is realized-close drawdown, a lower bound on intratrade equity drawdown. Open-at-end positions are unmarked. Restricted Prop exposure crossing Friday needs a recorded Friday exit fill; missing fills produce N/A rather than using the later exit. Phase days show +8% then a further +5% from the phase-change balance; no minimum-day/firm handoff assumptions are invented. Funded columns show 14/21-day realized returns only. Windows reuse source periods and must not be pooled as independent evidence.\n\n| Start / window | Tier | Coverage | Realized return % | Realized DD % | Days +8 / +5 complete | Funded 14 / 21d % | Unpriced Friday / end-open |\n|---|---|---:|---:|---:|---:|---:|---:|\n${rows.join('\n')}\n`;
writeFileSync('docs/research/part1-portfolio-scorecard.md',report);writeFileSync('docs/research/part1-portfolio-results.json',JSON.stringify({sources:data.sources,missingReports:data.missingReports,missingStrategies:data.missingStrategies,limitations:data.limitations,results},null,2)+'\n');console.log(report);
