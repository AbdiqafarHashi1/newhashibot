import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {aggregateHours} from './crypto-three-role-rules.ts';
import {EXTRA_ROLES,proposeExtra} from './crypto-extra-roles.ts';
import {arbitrateCanonical} from '../../supabase/functions/_shared/trading-domain/arbitrator.ts';
import {evaluateReplayOutcome,summarizeReplayOutcomes} from '../../supabase/functions/_shared/replay-outcomes.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
const [root,out]=process.argv.slice(2);if(!root||!out)throw Error('Usage: crypto-extra-role-study.ts <verified development dir> <report.json>');
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex'),protocol=JSON.parse(await readFile('scripts/research/crypto-extra-role-protocol.json','utf8'));
const data=new Map<string,{rows:StrategyCandle[];hours:StrategyCandle[]}>(),sources=[];
for(const symbol of ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT']){const names=(await readdir(root)).filter(f=>f.startsWith(symbol+'-15m-')&&f.endsWith('.json')&&!f.endsWith('.manifest.json')).sort();if(names.length!==18)throw Error('SOURCE_COUNT');const rows:StrategyCandle[]=[];
 for(const name of names){const raw=await readFile(`${root}/${name}`,'utf8'),m=JSON.parse(await readFile(`${root}/${name.replace('.json','.manifest.json')}`,'utf8'));if(sha(raw)!==m.datasetSha256||m.nativeFlow!==true||m.sourceUrl!==`https://data.binance.vision/data/futures/um/monthly/klines/${symbol}/15m/${name.replace('.json','.zip')}`)throw Error('SOURCE_IDENTITY');rows.push(...JSON.parse(raw));sources.push({name,...m});}
 if(rows.length!==52416||rows.some((v,i)=>v.symbol!==symbol||Date.parse(v.open_time)!==Date.parse(protocol.from)+i*900000))throw Error('COVERAGE');data.set(symbol,{rows,hours:aggregateHours(rows)});
}
const studies=[],btc=data.get('BTCUSDT')!.hours;
for(const [symbol,{rows,hours}] of data)for(const role of EXTRA_ROLES){const selections=[];let activeUntil=-Infinity;
 for(let i=743;i<hours.length;i++){const at=Date.parse(hours[i].open_time)+3600000;if(at<=activeUntil)continue;const proposal=proposeExtra(role,hours.slice(i-743,i+1),btc.slice(i-743,i+1));if(!proposal)continue;const c=proposal.candidate;
  const arbitration=arbitrateCanonical([{id:c.id,strategyId:c.strategyId,strategyVersion:c.strategyVersion,configurationVersion:protocol.schema,timestamp:new Date(at).toISOString(),symbol,primaryTimeframe:'1h',side:'BUY',entry:c.entry,stop:c.stop,targets:c.targets,score:c.score,evidence:{reasonCodes:[],indicators:{},observations:{research:true}}}],{minimumScore:0,blockedSymbols:[]});if(!arbitration.chosen)throw Error('CANONICAL_SELECTION_MISMATCH');
  const costs={feeBps:10,spreadBps:2,slippageBps:4,fundingBps:Math.ceil(proposal.horizon/32)*3},future=rows.slice((i+1)*4,(i+1)*4+proposal.horizon),assumptions={entryTiming:'NEXT_OPEN' as const,...costs,partialExitPct:0,moveStopToBreakevenAfterTp1:false,trailingStopR:null,sameCandlePolicy:'STOP_FIRST' as const,maxBarsInTrade:proposal.horizon,closeAtHorizon:true};
  const outcome=evaluateReplayOutcome(c,future,new Date(at).toISOString(),assumptions),stressOutcome=evaluateReplayOutcome(c,future,new Date(at).toISOString(),{...assumptions,...Object.fromEntries(Object.entries(costs).map(([k,v])=>[k,v*1.5]))});if(!outcome||!stressOutcome)continue;
  selections.push({candidate:c,decisionAt:new Date(at).toISOString(),outcome,stressOutcome,arbitration});if(outcome.status!=='EXCLUDED')activeUntil=outcome.exitTime?Date.parse(outcome.exitTime)+900000:Infinity;
 }
 const summary=summarizeReplayOutcomes(selections.map(t=>t.outcome));studies.push({symbol,mode:role,summary,stressSummary:summarizeReplayOutcomes(selections.map(t=>t.stressOutcome)),selections});console.log(JSON.stringify({symbol,role,n:summary.resolvedCount,pf:summary.profitFactor}));
}
const aggregate=EXTRA_ROLES.map(mode=>{const cases=studies.filter(s=>s.mode===mode&&(mode==='MAJOR_WEEKLY_MOMENTUM'?['BTCUSDT','ETHUSDT']:['BTCUSDT','ETHUSDT','SOLUSDT']).includes(s.symbol)),trades=cases.flatMap(s=>s.selections),summary=summarizeReplayOutcomes(trades.map(t=>t.outcome)),stress=summarizeReplayOutcomes(trades.map(t=>t.stressOutcome)),calendar=Object.fromEntries(['2025','2026'].map(y=>[y,summarizeReplayOutcomes(trades.filter(t=>t.decisionAt.startsWith(y)).map(t=>t.outcome))]));const failures=[];
 if(summary.resolvedCount<50)failures.push('INSUFFICIENT_SAMPLE');if((summary.profitFactor??0)<1.2)failures.push('NET_PF');if((summary.expectancyR??-Infinity)<.02)failures.push('NET_EXPECTANCY');if(cases.some(s=>(s.summary.expectancyR??-Infinity)<=0))failures.push('ASSET_CONSISTENCY');if(Object.values(calendar).some(s=>(s.expectancyR??-Infinity)<=0))failures.push('CALENDAR_CONSISTENCY');if((stress.expectancyR??-Infinity)<=0)failures.push('COST_STRESS');return {mode,summary,stress,calendar,failures,verdict:failures.length?'FAILED_DEVELOPMENT':'REQUIRES_NEW_VALIDATION'};
});
const files=['scripts/research/crypto-extra-role-protocol.json','scripts/research/crypto-extra-roles.ts','scripts/research/crypto-extra-role-study.ts','scripts/research/crypto-three-role-rules.ts','supabase/functions/_shared/replay-outcomes.ts','supabase/functions/_shared/trading-domain/arbitrator.ts'];await writeFile(out,JSON.stringify({protocol,sources,studies,aggregate,sourceHashes:Object.fromEntries(await Promise.all(files.map(async p=>[p,sha(await readFile(p))]))),publication:false,execution:false,promotion:false},null,2)+'\n');
