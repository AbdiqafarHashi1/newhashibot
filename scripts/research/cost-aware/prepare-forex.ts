import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { costAwareFeatures } from '../../../supabase/functions/_shared/cost-aware-opportunities.ts';
import { evaluateReplayOutcome } from '../../../supabase/functions/_shared/replay-outcomes.ts';
import type { StrategyCandle } from '../../../supabase/functions/_shared/professional-strategies.ts';
import type { ArbitrationCandidate } from '../../../supabase/functions/_shared/arbitrator.ts';
const [root,output]=process.argv.slice(2);if(!root||!output)throw Error('Usage: prepare-forex.ts <paired-native-directory> <training.json>');
const sha=(s:string)=>createHash('sha256').update(s).digest('hex'),raw=await readFile('scripts/research/cost-aware/forex-protocol.json','utf8'),p=JSON.parse(raw),coverage=JSON.parse(await readFile(`${root}/coverage.json`,'utf8'));
const samples:unknown[]=[],sources=[],exclusions:Record<string,number>={};
for(const symbol of p.symbols){
 const content=await readFile(`${root}/${symbol}-1h.json`,'utf8'),meta=JSON.parse(await readFile(`${root}/${symbol}-1h.manifest.json`,'utf8'));
 if(sha(content)!==meta.datasetSha256)throw Error('BROKER_DATASET_HASH_MISMATCH');sources.push({file:`${symbol}-1h.json`,...meta});
 const rows=JSON.parse(content) as StrategyCandle[];
 for(let i=109;i+p.maxBars<rows.length;i++){
  const at=new Date(Date.parse(rows[i].open_time)+3600000).toISOString(),history=rows.slice(i-109,i+1),future=rows.slice(i+1,i+1+p.maxBars),context={symbol,market:'forex' as const,timeframe:'1h',candles:history,evaluated_at:at};
  if(future.some((r,j)=>Date.parse(r.open_time)!==Date.parse(at)+j*3600000)){exclusions.OUTCOME_QUOTE_GAP=(exclusions.OUTCOME_QUOTE_GAP??0)+1;continue;}
  const c=p.costsBps,baseCosts=c.fees+c.slippage+c.fundingReserve;
  let f;try{f=costAwareFeatures(context,baseCosts)}catch(e){const reason=e instanceof Error?e.message:'INVALID';exclusions[reason]=(exclusions[reason]??0)+1;continue;}
  const spread=(rows[i].ask_close!-rows[i].close)/rows[i].close*10000,labels=[];
  for(const sign of [1,-1]){
   const entry=rows[i].close,candidate:ArbitrationCandidate={id:`training:${symbol}:${at}:${sign}`,strategyId:'forex.cost-aware-hourly',strategyVersion:'1.0.0',symbol,market:'forex',timeframe:'1h',side:sign===1?'buy':'sell',
    confidence:80,grade:'A',score:.8,entry,stop:entry-sign*f.risk,targets:[entry+sign*f.risk,entry+sign*f.risk*2.5],riskReward:2.5,expiry:at,fresh:true,lifecycle:'RESEARCH',publicationMode:'SHADOW',evidence:{},rejectionReasons:[]};
   const result=evaluateReplayOutcome(candidate,future,at,{entryTiming:'NEXT_OPEN',feeBps:c.fees,spreadBps:spread,slippageBps:c.slippage,fundingBps:c.fundingReserve,partialExitPct:.5,
    moveStopToBreakevenAfterTp1:false,trailingStopR:null,sameCandlePolicy:'STOP_FIRST',maxBarsInTrade:32,closeAtHorizon:true});
   labels.push(result?.netR===null||result?.netR===undefined?null:{netR:result.netR,costR:result.costR,exitTime:result.exitTime});
  }
  if(labels.some(x=>x===null)){exclusions.INVALID_LABEL=(exclusions.INVALID_LABEL??0)+1;continue;}
  samples.push({symbol,at,asOf:Date.parse(at),labelEnd:Date.parse(future.at(-1)!.open_time)+3600000,features:f.values,long:labels[0],short:labels[1]});
 }
 console.log(JSON.stringify({symbol,samples:samples.length}));
}
await writeFile(output,JSON.stringify({schema:'cost-aware-training/v1',market:'forex',timeframe:'1h',protocolHash:sha(raw),sources,coverage,exclusions,samples,publication:false,execution:false}));
