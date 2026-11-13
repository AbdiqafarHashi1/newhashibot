import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {HistoricalAccountLedger} from '../../../supabase/functions/_shared/historical-account-ledger.ts';
import {historicalAccountScenario} from '../../../supabase/functions/_shared/historical-account-scenario.ts';
import {historicalAccountMetrics} from '../../../supabase/functions/_shared/historical-account-metrics.ts';
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)]})),raw=readFileSync(args.input),bytes=args.input.endsWith('.gz')?gunzipSync(raw):raw,source=JSON.parse(bytes.toString());
if(source.status!=='COMPLETED'||source.venue!=='BROKER_BID_ASK'||source.accounts.length!==1)throw Error('ONE_COMPLETE_NATIVE_BROKER_SCENARIO_REQUIRED');
const folder=args.data??'.tmp/launch-research/exness-data',start=Date.parse(source.funnel.period.start),end=Date.parse(source.funnel.period.end),all=new Map<string,Map<number,any>>();
for(const manifest of source.manifests){
 const path=`${folder}/${manifest.symbol}-5m-${manifest.month}.json`,payload=readFileSync(path);if(createHash('sha256').update(payload).digest('hex')!==manifest.rowsSha256)throw Error('NATIVE_INPUT_HASH_MISMATCH');
 const rows=all.get(manifest.symbol)??new Map();for(const b of JSON.parse(payload.toString()))rows.set(Date.parse(b.open_time),b);all.set(manifest.symbol,rows);
}
const entries=new Map<number,any[]>();for(const s of source.signalSnapshots){const group=entries.get(s.at)??[];group.push(s.setup);entries.set(s.at,group);}
const scenarios=(args.balances??'500,1000,10000').split(',').flatMap(c=>(args.risks??'.5,1').split(',').map(r=>{
 const capital=Number(c),riskPct=Number(r),id=`capital:${capital}:${riskPct}`,ledger=new HistoricalAccountLedger({purpose:'HISTORICAL_RESEARCH',initialCapital:capital,timezone:'UTC',dailyLossPct:5,overallLossPct:12,drawdown:'STATIC',dailyBasis:'DAY_START_BALANCE',stopOutMarginRatio:50},source.executionAssumptions),template=historicalAccountScenario({purpose:'HISTORICAL_RESEARCH',provider:'MT5_PERSONAL',capital,riskPct,accountId:id});return {capital,riskPct,ledger,template};
}));
for(let at=start;at<end;at+=300000){
 const closed=[...all.values()].map(r=>r.get(at-300000)).filter(Boolean),opening=[...all.values()].map(r=>r.get(at)).filter(Boolean),conversion=(b:any,p:number)=>['USDJPY','USDCAD'].includes(b.symbol)?1/p:1,quotes=opening.map(b=>({symbol:b.symbol,at,bid:b.open,ask:b.ask_open,conversion:conversion(b,b.open)}));
 for(const s of scenarios){
  if(closed.length)s.ledger.observeClosedBars(closed,at,Object.fromEntries(closed.map(b=>[b.symbol,conversion(b,b.close)])));if(quotes.length)s.ledger.observeQuotes(quotes,at);
  if(at%86400000===79200000)s.ledger.financing(at,`broker-carry-reserve:${at}`,Object.fromEntries(s.ledger.openPositionSnapshot().map(p=>[p.symbol,.0001*p.side])));
  for(const setup of entries.get(at)??[]){const q=quotes.find(q=>q.symbol===setup.symbol);if(q)s.ledger.enter(setup,q,s.template(setup,q,source.executionAssumptions.find((p:any)=>p.symbol===setup.symbol)));}
 }
}
const results=scenarios.map(s=>({capital:s.capital,riskPct:s.riskPct,metrics:historicalAccountMetrics(s.ledger.snapshot(),s.capital,start,end)})),baseline=source.accounts[0],repeated=results.find(s=>s.capital===baseline.capital&&s.riskPct===baseline.riskPct);
if(!repeated||Math.abs(repeated.metrics.netReturnPct-baseline.metrics.netReturnPct)>1e-8||repeated.metrics.closedTrades!==baseline.metrics.closedTrades)throw Error('BASELINE_ACCOUNT_REPRODUCTION_FAILED');
const report={schema:'capital-scenario-replay/v1',sourceReportSha256:createHash('sha256').update(bytes).digest('hex'),period:source.funnel.period,strategy:source.experiment.strategyScope,baselineReproduced:true,scenarios:results,limitations:['Frozen canonical signal stream; customer capital/risk resimulation, not a new strategy search','Observed reference quotes, scenario commission/slippage/carry/contracts','No actual provider placement or fill proof; minimum lots and account rules can block entries']};mkdirSync(args.out.slice(0,args.out.lastIndexOf('/')),{recursive:true});writeFileSync(args.out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(results.map(s=>({capital:s.capital,risk:s.riskPct,return:s.metrics.netReturnPct,entries:s.metrics.authorizedEntries,blocked:s.metrics.rejectedAttempts}))));
