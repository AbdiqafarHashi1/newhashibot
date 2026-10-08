import {BinanceHistoricalAdapter,BybitHistoricalAdapter} from '../../src/lib/historicalData/adapters.ts';
import {normalizeAndValidate,TIMEFRAME_MS} from '../../src/lib/historicalData/validation.ts';
import {runMultiDatasetScannerReplay} from '../../supabase/functions/_shared/multi-dataset-scanner-replay.ts';
import {DEFAULT_REPLAY_ASSUMPTIONS,evaluateReplayOutcome,summarizeReplayOutcomes} from '../../supabase/functions/_shared/replay-outcomes.ts';
import {hashValidationDataset,validateDatasetIntegrity} from '../../supabase/functions/_shared/validation-dataset-integrity.ts';
import {deriveAccountSimulationAuthority,derivePropCampaignAuthority} from '../../supabase/functions/_shared/phase-m-authority-loader.ts';
import {simulateWithPhaseD} from '../../supabase/functions/_shared/phase-m-account-adapter.ts';
import {runProfessionalPropCampaign} from '../../supabase/functions/_shared/professional-prop-validation-adapter.ts';
import {LIMITS,WorkerFault,type PortableKind} from '../../supabase/functions/_shared/phase-p-contract.ts';
import type {TaskContext,TaskHandler} from './runtime.ts';
export async function fingerprint(value:unknown){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function loadPortableCandles(db:any,datasetId:string){
  const rows:any[]=[];
  for(let from=0;from<=LIMITS.candles;from+=500){
    const {data,error}=await db.from('validation_dataset_candles').select('symbol,market_type,timeframe,open_time,open,high,low,close,volume,source').eq('dataset_id',datasetId).order('open_time').range(from,from+499);
    if(error)throw new WorkerFault('DATASET_STORE_UNAVAILABLE');
    rows.push(...(data??[]).map((x:any)=>({...x,open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume)})));
    if(rows.length>LIMITS.candles)throw new WorkerFault('CANDLE_LIMIT_EXCEEDED',true);
    if(!data||data.length<500)return rows;
  }
  throw new WorkerFault('CANDLE_LIMIT_EXCEEDED',true);
}
/** Evidence is committed in fenced batches. A restart recomputes bounded deterministic results and resumes at the durable cursor. */
async function persist(context:TaskContext,rows:unknown[],summary:unknown){
  let cursor=Number(context.job.checkpoint.cursor??0);
  if(!Number.isInteger(cursor)||cursor<0||cursor>rows.length)throw new WorkerFault('CHECKPOINT_INVALID',true);
  if(!rows.length){await context.check();await context.store.checkpoint(context.job,{cursor:0,total:0},[]);}
  while(cursor<rows.length){
    if(context.remainingMs()<5000)return {done:false,summary};
    await context.check();const batch=rows.slice(cursor,cursor+25);cursor+=batch.length;
    await context.store.checkpoint(context.job,{cursor,total:rows.length},batch);
  }
  return {done:true,summary};
}
export function createHandlers(db:any,fetcher:typeof fetch=fetch):Record<PortableKind,TaskHandler>{
  return {
    HISTORY:async context=>{
      const p=context.job.payload,width=TIMEFRAME_MS[p.timeframe as keyof typeof TIMEFRAME_MS];
      let cursor=Number(context.job.checkpoint.next??Date.parse(p.start)),pages=Number(context.job.checkpoint.pages??0);
      while(cursor<=Date.parse(p.end)){
        if(context.remainingMs()<10000)return {done:false,summary:{pages}};
        if(pages>=LIMITS.pages)throw new WorkerFault('PAGE_LIMIT_EXCEEDED',true);
        await context.check();const to=Math.min(Date.parse(p.end),cursor+width*249),http={maxAttempts:1,requestTimeoutMs:8000,retryBudgetMs:9000};
        const adapter=p.provider==='BINANCE'?new BinanceHistoricalAdapter(fetcher,http):new BybitHistoricalAdapter(fetcher,http);
        const result=await adapter.fetch({provider:p.provider,symbol:p.symbol,timeframe:p.timeframe,from:cursor,to,includeOpenCandle:false,signal:context.signal},{from:cursor,to});
        const validated=normalizeAndValidate(result.bars,p.timeframe,{from:cursor,to},'RESEARCH');
        if(!validated.bars.length||validated.quality.missingRanges.length)throw new WorkerFault('HISTORY_COVERAGE_INCOMPLETE',true);
        const rows=validated.bars.map(b=>({symbol:p.symbol,market_type:'crypto',timeframe:p.timeframe,open_time:new Date(b.timestamp).toISOString(),open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume??0,source:p.provider}));
        cursor=to+width;pages++;
        await context.store.checkpoint(context.job,{next:cursor,pages,cursor:Number(context.job.checkpoint.cursor??0)+rows.length},rows);
      }
      const candles=await loadPortableCandles(db,context.job.run_id);validateDatasetIntegrity(candles,{symbol:p.symbol,timeframe:p.timeframe});
      return {done:true,summary:{datasetHash:await hashValidationDataset(candles),rowCount:candles.length,first:candles[0]?.open_time,last:candles.at(-1)?.open_time,pages,classification:'RESEARCH'}};
    },
    REPLAY:async context=>{
      const job=context.job,p=job.payload,datasets=[];
      for(const item of p.datasets){
        await context.check();const {data,error}=await db.from('validation_datasets').select('*').eq('id',item.id).eq('created_by',job.customer_id).maybeSingle();
        if(error||!data||data.status!=='READY'||data.dataset_hash!==item.hash)throw new WorkerFault('SOURCE_NOT_CURRENT',true);
        const candles=await loadPortableCandles(db,item.id);validateDatasetIntegrity(candles,{symbol:data.symbol,timeframe:data.timeframe,rowCount:data.row_count});
        if(await hashValidationDataset(candles)!==item.hash)throw new WorkerFault('DATASET_HASH_MISMATCH',true);
        datasets.push({id:item.id,hash:item.hash,configurationHash:job.configuration_hash!,source:data.source,symbol:data.symbol,market:(candles[0]?.market_type==='crypto'?'crypto':'forex') as 'forex'|'crypto',timeframe:data.timeframe,candles});
      }
      let checks=0;
      const evaluationEnd=new Date(Math.min(Date.parse(p.end)-1,...datasets.map(d=>Date.parse(d.candles.at(-1)!.open_time)))).toISOString();
      const evidence=await runMultiDatasetScannerReplay({runId:job.run_id,datasets,configuration:p.configuration,configurationHash:job.configuration_hash!,start:p.start,end:evaluationEnd,cooldownMs:0,maxCycles:p.maxCycles,shouldCancel:async()=>{if(++checks%25===0)await context.check();return context.signal.aborted;}});
      if(!evidence.length)throw new WorkerFault('SOURCE_RANGE_NOT_COVERED',true);
      const assumptions=p.assumptions??DEFAULT_REPLAY_ASSUMPTIONS;
      const outcomes:any[]=[],rows=evidence.map(row=>{
        const cycle=row.selection.cycle,key=cycle?.cycleId??`${row.event.symbol}:${row.event.timeframe}:${row.event.closedAt}`,winner=(cycle?.arbitration as any)?.winner;
        let outcome:any=null;
        if(winner){const dataset=datasets.find(x=>x.id===cycle!.datasetId)!;const computed=evaluateReplayOutcome(winner,dataset.candles.filter(c=>Date.parse(c.open_time)<Date.parse(p.end)),row.event.closedAt,assumptions);if(!computed)throw new WorkerFault('SCANNER_OUTCOME_MISSING',true);outcomes.push(computed);outcome={candidate_id:computed.candidateId,strategy_id:computed.strategyId,symbol:computed.symbol,timeframe:computed.timeframe,status:computed.status,entry_time:computed.entryTime,exit_time:computed.exitTime,entry_price:computed.entryPrice,exit_price:computed.exitPrice,gross_r:computed.grossR,net_r:computed.netR,cost_r:computed.costR,partial_exit:computed.partialExit,conservative:computed.conservative,exclusion_reason:computed.exclusionReason??null,cash_flow_events:computed.cashFlowEvents,assumptions,configuration_hash:job.configuration_hash,dataset_hash:dataset.hash};}
        return {cycle_key:key,candle_close_time:row.event.closedAt,strategy_results:cycle?.candidates??[],arbitration:cycle?.arbitration??{winner:null,reasonCodes:row.selection.reasons},data_exclusions:[],outcome};
      });
      return persist(context,rows,{cycles:rows.length,outcomes:outcomes.length,overall:summarizeReplayOutcomes(outcomes),classification:'REPLAY',evaluationEnd,requestedEnd:p.end,coverageReason:evaluationEnd<p.end?'FORWARD_CANDLE_REQUIRED':null,publication:false,execution:false});
    },
    ACCOUNT:async context=>{
      await context.check();const authority=await deriveAccountSimulationAuthority(db,{...context.job.payload,actorId:context.job.customer_id,maxEvidenceRows:LIMITS.cycles} as any);
      if(await fingerprint(authority)!==context.job.configuration_hash)throw new WorkerFault('SOURCE_NOT_CURRENT',true);
      if(authority.points.length>LIMITS.cycles)throw new WorkerFault('CYCLE_LIMIT_EXCEEDED',true);
      const result=simulateWithPhaseD({initialCapital:authority.initialCapital,accountCurrency:authority.accountCurrency,points:authority.points,contracts:authority.contracts} as any);
      return persist(context,result.decisions.map((evidence,sequence)=>({sequence,evidence})),{initialCapital:result.initialCapital,endingBalance:result.endingBalance,endingEquity:result.endingEquity,metricDefinition:result.metricDefinition,status:'COMPLETED',classification:'HISTORICAL_SIMULATION'});
    },
    PROP:async context=>{
      await context.check();const authority=await derivePropCampaignAuthority(db,{...context.job.payload,actorId:context.job.customer_id,maxEvidenceRows:LIMITS.cycles} as any);
      if(await fingerprint(authority)!==context.job.configuration_hash)throw new WorkerFault('SOURCE_NOT_CURRENT',true);
      if(authority.trades.length>LIMITS.cycles)throw new WorkerFault('CYCLE_LIMIT_EXCEEDED',true);
      const result=runProfessionalPropCampaign({profile:authority.profile,config:authority.config,trades:authority.trades,configurationHash:authority.run.configuration_hash,unsupportedRequirements:[]});
      return persist(context,result.windows.map((window,sequence)=>({sequence,evidence:{window,result:result.challenge?.results[sequence]?.result??{status:'INCOMPLETE',reasonCodes:result.unsupported}}})),{status:result.status==='PASS'?'COMPLETED':result.status==='INCOMPLETE'?'INCOMPLETE':'BLOCKED',campaignStatus:result.status,coverage:result.coverage,unsupported:result.unsupported,trials:result.windows.length,overlapDisclosure:result.overlapDisclosure,challenge:result.challenge,classification:'HISTORICAL_SIMULATION'});
    }
  };
}
