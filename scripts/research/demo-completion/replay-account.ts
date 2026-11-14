import {readFileSync,writeFileSync,readdirSync} from 'node:fs';import {createHash} from 'node:crypto';
import {HistoricalAccountLedger} from '../../../supabase/functions/_shared/historical-account-ledger.ts';
import {historicalAccountScenario} from '../../../supabase/functions/_shared/historical-account-scenario.ts';
import {historicalAccountMetrics} from '../../../supabase/functions/_shared/historical-account-metrics.ts';
import {researchAccountId} from '../account-resume.ts';
const [input,folder,output]=process.argv.slice(2);if(!input||!folder||!output)throw Error('SCANNER_REPORT_DATA_OUTPUT_REQUIRED');
const raw=readFileSync(input),source=JSON.parse(raw.toString());if(source.status!=='COMPLETED')throw Error('COMPLETE_SCANNER_REQUIRED');
const start=Date.parse(source.funnel.period.start),end=Date.parse(source.funnel.period.end),bars=new Map<number,any[]>();
for(const m of source.manifests){const bytes=readFileSync(`${folder}/${m.symbol}-5m-${m.month}.json`);if(createHash('sha256').update(bytes).digest('hex')!==m.rowsSha256)throw Error('NATIVE_DATA_HASH_MISMATCH');for(const b of JSON.parse(bytes.toString())){const at=Date.parse(b.open_time);bars.set(at,[...(bars.get(at)??[]),b]);}}
const specs=source.executionAssumptions,signals=new Map<number,any[]>();for(const s of source.signalSnapshots){if(s.setup.status!=='ACTIVE'||s.at<Date.parse(s.setup.fillAt))throw Error('SCANNER_ENTRY_EVENT_INVALID');signals.set(s.at,[...(signals.get(s.at)??[]),s.setup]);}
const capital=25000,riskPct=.4,id=researchAccountId('MT5_PERSONAL',capital,riskPct),ledger=new HistoricalAccountLedger({purpose:'HISTORICAL_RESEARCH',initialCapital:capital,timezone:'UTC',dailyLossPct:5,overallLossPct:12,drawdown:'STATIC',dailyBasis:'DAY_START_BALANCE',stopOutMarginRatio:50},specs),template=historicalAccountScenario({purpose:'HISTORICAL_RESEARCH',provider:'MT5_PERSONAL',capital,riskPct,accountId:id});
for(let at=start;at<end;at+=60000){const closed=bars.get(at-300000)??[],opening=bars.get(at)??[],quotes=opening.map(b=>({symbol:b.symbol,at,bid:b.open,ask:b.ask_open,conversion:1}));
 if(closed.length)ledger.observeClosedBars(closed,at,Object.fromEntries(closed.map(b=>[b.symbol,1])));if(quotes.length)ledger.observeQuotes(quotes,at);
 if(at%86400000===79200000)ledger.financing(at,`broker-carry-reserve:${at}`,Object.fromEntries(ledger.openPositionSnapshot().map(p=>[p.symbol,.00015*p.side])));
 for(const s of signals.get(at)??[]){const q=quotes.find(q=>q.symbol===s.symbol);if(q)ledger.enter(s,q,template(s,q,specs.find((x:any)=>x.symbol===s.symbol)));}
}
const state=ledger.snapshot(),digest=createHash('sha256');const paths=[...readdirSync('supabase/functions/_shared',{recursive:true}).filter(p=>String(p).endsWith('.ts')).map(p=>'supabase/functions/_shared/'+p),'scripts/research/demo-completion/replay-account.ts','scripts/research/account-resume.ts'].sort();for(const p of paths){digest.update(p);digest.update(readFileSync(p));}
source.scannerEngineSourceSha256=source.engineSourceSha256;source.engineSourceSha256=digest.digest('hex');source.accountReplay={schema:'complete-recorded-scanner-account/v1',scannerReportSha256:createHash('sha256').update(raw).digest('hex'),initialCapital:capital,accountId:id,continuous:true,monthlyReset:false,reason:'Rebuild the complete recorded scanner stream after correcting a CLI fractional-risk checkpoint identity defect. No candidates or entry timestamps changed.'};
source.accounts=[{provider:'MT5_PERSONAL',capital,riskPct,metrics:historicalAccountMetrics(state,capital,start,end),trades:state.trades,decisions:state.decisions,equityPath:state.equityPath}];writeFileSync(output,JSON.stringify(source,null,2)+'\n');console.log(JSON.stringify(source.accounts[0].metrics));
