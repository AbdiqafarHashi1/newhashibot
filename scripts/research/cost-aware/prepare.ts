import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { costAwareFeatures } from '../../../supabase/functions/_shared/cost-aware-opportunities.ts';
import { evaluateReplayOutcome } from '../../../supabase/functions/_shared/replay-outcomes.ts';
import type { ArbitrationCandidate } from '../../../supabase/functions/_shared/arbitrator.ts';
import type { StrategyCandle } from '../../../supabase/functions/_shared/professional-strategies.ts';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const [directory,output]=process.argv.slice(2);
if(!directory||!output)throw Error('Usage: prepare.ts <verified-native-development-directory> <training.json>');
const protocolRaw=await readFile('scripts/research/cost-aware/protocol.json','utf8'),p=JSON.parse(protocolRaw),files=await readdir(directory);
const samples:unknown[]=[],sources:unknown[]=[],exclusions:Record<string,number>={};
const start=Date.parse(p.developmentFrom),end=Date.parse(p.developmentToExclusive),costs=p.cryptoCostsBps,totalBps=costs.fees+costs.spread+costs.slippage+costs.fundingReserve;
for(const symbol of p.cryptoSymbols){
 const names=files.filter(f=>f.startsWith(symbol+'-15m-')&&f.endsWith('.json')&&!f.endsWith('.manifest.json')).sort();
 if(names.length!==18)throw Error('INCOMPLETE_NATIVE_DATASET:'+symbol);
 const rows:StrategyCandle[]=[];
 for(const name of names){const raw=await readFile(`${directory}/${name}`,'utf8'),meta=JSON.parse(await readFile(`${directory}/${name.replace('.json','.manifest.json')}`,'utf8'));
  if(meta.datasetSha256!==sha(raw)||meta.phase!=='DEVELOPMENT'||meta.nativeFlow!==true)throw Error('NATIVE_DATASET_HASH_OR_IDENTITY_INVALID');
  const part=JSON.parse(raw);if(part.length!==meta.rows)throw Error('SOURCE_COUNT_MISMATCH');rows.push(...part);sources.push({file:name,...meta});}
 if(rows.length!==(end-start)/900000||rows.some((r,i)=>Date.parse(r.open_time)!==start+i*900000))throw Error('DEVELOPMENT_INTERVAL_GAPPED');
 for(let i=109;i+p.maxBars<rows.length;i++){
  const at=new Date(Date.parse(rows[i].open_time)+900000).toISOString(),context={symbol,market:'crypto' as const,timeframe:'15m',candles:rows.slice(i-109,i+1),evaluated_at:at};
  let f;try{f=costAwareFeatures(context,totalBps,p.stopAtr)}catch(e){const reason=e instanceof Error?e.message:'INVALID';exclusions[reason]=(exclusions[reason]??0)+1;continue;}
  const future=rows.slice(i+1,i+1+p.maxBars),labels=[];
  for(const direction of [1,-1]){
   const entry=rows[i].close,candidate:ArbitrationCandidate={id:`training:${symbol}:${at}:${direction}`,strategyId:'crypto.cost-aware-15m',strategyVersion:'1.0.0',
    symbol,market:'crypto',timeframe:'15m',side:direction===1?'buy':'sell',confidence:80,grade:'A',score:.8,entry,stop:entry-direction*f.risk,
    targets:[entry+direction*f.risk*p.tp1R,entry+direction*f.risk*p.targetR],riskReward:p.targetR,expiry:at,fresh:true,lifecycle:'RESEARCH',publicationMode:'SHADOW',evidence:{},rejectionReasons:[]};
   const row=evaluateReplayOutcome(candidate,future,at,{entryTiming:'NEXT_OPEN',feeBps:costs.fees,spreadBps:costs.spread,slippageBps:costs.slippage,fundingBps:costs.fundingReserve,
    partialExitPct:.5,moveStopToBreakevenAfterTp1:false,trailingStopR:null,sameCandlePolicy:'STOP_FIRST',tp1StopPolicy:'CONSERVATIVE_SAME_BAR',maxBarsInTrade:p.maxBars,closeAtHorizon:true});
   labels.push(row?.netR===null||row?.netR===undefined?null:{netR:row.netR,costR:row.costR,exitTime:row.exitTime});
  }
  if(labels.some(x=>x===null)){exclusions.INVALID_LABEL=(exclusions.INVALID_LABEL??0)+1;continue;}
  samples.push({symbol,at,asOf:Date.parse(at),labelEnd:Date.parse(future.at(-1)!.open_time)+900000,features:f.values,long:labels[0],short:labels[1]});
 }
 console.log(JSON.stringify({symbol,samples:samples.length}));
}
await writeFile(output,JSON.stringify({schema:'cost-aware-training/v1',market:'crypto',timeframe:'15m',protocolHash:sha(protocolRaw),
 sources,exclusions,samples,publication:false,execution:false}));
