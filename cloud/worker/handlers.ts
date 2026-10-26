import type {ValidationDecision} from '../../supabase/functions/_shared/phase-l-validation.ts';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {ReplayOutcome} from '../../supabase/functions/_shared/replay-outcomes.ts';
import {BinanceHistoricalAdapter,BybitHistoricalAdapter} from '../../src/lib/historicalData/adapters.ts';
import {normalizeAndValidate,TIMEFRAME_MS} from '../../src/lib/historicalData/validation.ts';
import {runMultiDatasetScannerReplay} from '../../supabase/functions/_shared/multi-dataset-scanner-replay.ts';
import {DEFAULT_REPLAY_ASSUMPTIONS,evaluateReplayOutcomeSteps,summarizeReplayOutcomes} from '../../supabase/functions/_shared/replay-outcomes.ts';
import {hashValidationDataset,validateDatasetIntegrity} from '../../supabase/functions/_shared/validation-dataset-integrity.ts';
import {deriveAccountSimulationAuthority,derivePropCampaignAuthority} from '../../supabase/functions/_shared/phase-m-authority-loader.ts';
import {simulateWithPhaseDSteps} from '../../supabase/functions/_shared/phase-m-account-adapter.ts';
import {prepareProfessionalPropCampaign,summarizeProfessionalPropCampaign} from '../../supabase/functions/_shared/professional-prop-validation-adapter.ts';
import {LIMITS,RESEARCH_LIMITS,WorkerFault,type PortableKind} from '../../supabase/functions/_shared/phase-p-contract.ts';
import {simulateFullChallengeSteps,type FullChallengeResult,type ChallengeWindow} from '../../src/lib/prop/professionalPropEngine.ts';
import {computationCheck,consumeSteps,ComputationYield} from './computation.ts';
import type {TaskHandler} from './runtime.ts';
import {loadValidationDataset} from '../../supabase/functions/_shared/validation-dataset-upload.ts';
export async function fingerprint(value:unknown){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function loadPortableCandles(db:SupabaseClient,datasetId:string){return loadValidationDataset(db,datasetId);}
async function loadNativeEvidence<T>(db:SupabaseClient,table:string,runId:string,order:string,maximum:number=LIMITS.cycles){
 const rows:T[]=[];
 for(let from=0;from<=maximum;from+=100){const {data,error}=await db.from(table).select('*').eq('run_id',runId).order(order).range(from,from+99);if(error)throw new WorkerFault('EVIDENCE_STORE_UNAVAILABLE');rows.push(...(data??[]) as T[]);if(rows.length>maximum)throw new WorkerFault('EVIDENCE_LIMIT_EXCEEDED',true);if(!data||data.length<100)return rows;}
 throw new WorkerFault('EVIDENCE_LIMIT_EXCEEDED',true);
}
export function createHandlers(db:SupabaseClient,fetcher:typeof fetch=fetch):Record<PortableKind,TaskHandler>{
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
        const width=TIMEFRAME_MS[data.timeframe as keyof typeof TIMEFRAME_MS],window=candles.filter(c=>Date.parse(c.open_time)>=Date.parse(p.start)-220*width&&Date.parse(c.open_time)<Date.parse(p.end));
        if(window.length>(p.extended?RESEARCH_LIMITS.candles:LIMITS.candles))throw new WorkerFault('REPLAY_WINDOW_TOO_LARGE_SELECT_SHORTER_DATES',true);
        if(window.length<55)throw new WorkerFault('REPLAY_WINDOW_INSUFFICIENT_HISTORY',true);
        datasets.push({id:item.id,hash:item.hash,configurationHash:job.configuration_hash!,source:data.source,symbol:data.symbol,market:(candles[0]?.market_type==='crypto'?'crypto':'forex') as 'forex'|'crypto',timeframe:data.timeframe,candles:window});
      }
      const evaluationEnd=new Date(Math.min(Date.parse(p.end)-1,...datasets.map(d=>Date.parse(d.candles.at(-1)!.open_time)))).toISOString();
      const assumptions=p.assumptions??DEFAULT_REPLAY_ASSUMPTIONS;
      if(job.checkpoint.cursor&&(!job.checkpoint.replay||job.checkpoint.replay.cursor!==job.checkpoint.cursor))throw new WorkerFault('CHECKPOINT_INVALID',true);
      const onEvidence:NonNullable<Parameters<typeof runMultiDatasetScannerReplay>[0]["onEvidence"]>=async(row,resume)=>{
        await computationCheck(context);
        const cycle=row.selection.cycle,key=cycle?.cycleId??`${row.event.symbol}:${row.event.timeframe}:${row.event.closedAt}`,winner=(cycle?.arbitration as ValidationDecision["arbitration"]|undefined)?.winner;
        let outcome:Record<string,unknown>|null=null;
        if(winner){
          const dataset=datasets.find(x=>x.id===cycle.datasetId)!;
          const strategy=p.configuration.strategies.find((s:{id:string;maxBarsInTrade:number})=>s.id===winner.strategyId);
          const frozenAssumptions={...assumptions,maxBarsInTrade:assumptions.maxBarsInTrade??strategy?.maxBarsInTrade};
          if(p.researchModelId&&dataset.market==='forex'){const width=TIMEFRAME_MS[dataset.timeframe as keyof typeof TIMEFRAME_MS],quote=dataset.candles.find(c=>Date.parse(c.open_time)+width===Date.parse(row.event.closedAt));if(!quote||!Number.isFinite(quote.ask_close)||quote.ask_close!<quote.close)throw new WorkerFault('RESEARCH_NATIVE_SPREAD_REQUIRED',true);frozenAssumptions.spreadBps+=(quote.ask_close!-quote.close)/quote.close*10000;}
          const computed=await consumeSteps(evaluateReplayOutcomeSteps(winner,dataset.candles.filter(c=>Date.parse(c.open_time)<Date.parse(p.end)),row.event.closedAt,frozenAssumptions),context);
          if(!computed)throw new WorkerFault('SCANNER_OUTCOME_MISSING',true);
          outcome={candidate_id:computed.candidateId,strategy_id:computed.strategyId,symbol:computed.symbol,timeframe:computed.timeframe,status:computed.status,entry_time:computed.entryTime,exit_time:computed.exitTime,entry_price:computed.entryPrice,exit_price:computed.exitPrice,gross_r:computed.grossR,net_r:computed.netR,cost_r:computed.costR,partial_exit:computed.partialExit,conservative:computed.conservative,exclusion_reason:computed.exclusionReason??null,cash_flow_events:computed.cashFlowEvents,assumptions:frozenAssumptions,configuration_hash:job.configuration_hash,dataset_hash:dataset.hash};
        }
        await context.check();
        await context.store.checkpoint(job,{cursor:resume.cursor,replay:resume},[{cycle_key:key,candle_close_time:row.event.closedAt,strategy_results:cycle?.candidates??[],arbitration:cycle?.arbitration??{winner:null,reasonCodes:row.selection.reasons},data_exclusions:[],outcome}]);
        if(context.remainingMs()<5000)throw new ComputationYield();
      };
      try{
        await runMultiDatasetScannerReplay({runId:job.run_id,datasets,configuration:p.configuration,configurationHash:job.configuration_hash!,start:p.start,end:evaluationEnd,cooldownMs:0,maxCycles:p.maxCycles,resume:job.checkpoint.replay,onEvidence,shouldCancel:async()=>{await computationCheck(context);if(context.remainingMs()<5000)throw new ComputationYield();return context.signal.aborted;}});
      }catch(e){if(e instanceof ComputationYield)return {done:false,summary:{}};throw e;}
      const cycles=Number(job.checkpoint.cursor??0);if(!cycles)throw new WorkerFault('SOURCE_RANGE_NOT_COVERED',true);
      const stored=await loadNativeEvidence<{candidate_id:string;strategy_id:string;symbol:string;timeframe:string;status:ReplayOutcome['status'];entry_time:string;exit_time:string|null;entry_price:number;exit_price:number|null;gross_r:number|null;net_r:number|null;cost_r:number;partial_exit:boolean;conservative:boolean;cash_flow_events:ReplayOutcome['cashFlowEvents']}>(db,'validation_outcomes',job.run_id,'entry_time',p.extended?RESEARCH_LIMITS.cycles:LIMITS.cycles);
      const outcomes=stored.map(o=>({candidateId:o.candidate_id,strategyId:o.strategy_id,symbol:o.symbol,timeframe:o.timeframe,status:o.status,entryTime:o.entry_time,exitTime:o.exit_time,entryPrice:Number(o.entry_price),exitPrice:o.exit_price===null?null:Number(o.exit_price),grossR:o.gross_r===null?null:Number(o.gross_r),netR:o.net_r===null?null:Number(o.net_r),costR:Number(o.cost_r),partialExit:o.partial_exit,conservative:o.conservative,cashFlowEvents:o.cash_flow_events}));
      return {done:true,summary:{cycles,outcomes:outcomes.length,overall:summarizeReplayOutcomes(outcomes),classification:p.researchModelId?'RESEARCH_MODEL_SIMULATION':'REPLAY',researchOnly:Boolean(p.researchModelId),evaluationEnd,requestedEnd:p.end,coverageReason:evaluationEnd<p.end?'FORWARD_CANDLE_REQUIRED':null,publication:false,execution:false}};
    },
    ACCOUNT:async context=>{
      await context.check();const authority=await deriveAccountSimulationAuthority(db,{...context.job.payload,actorId:context.job.customer_id,maxEvidenceRows:LIMITS.cycles} as Parameters<typeof deriveAccountSimulationAuthority>[1]);
      if(await fingerprint(authority)!==context.job.configuration_hash)throw new WorkerFault('SOURCE_NOT_CURRENT',true);
      if(authority.points.length>LIMITS.cycles)throw new WorkerFault('CYCLE_LIMIT_EXCEEDED',true);
      const total=authority.points.length;
      const resume=context.job.checkpoint.account;
      if(context.job.checkpoint.cursor&&(!resume||resume.cursor!==context.job.checkpoint.cursor||!Number.isInteger(resume.cursor)||resume.cursor<0||resume.cursor>total||![resume.balance,resume.equity].every(Number.isFinite)||typeof resume.locked!=='boolean'))throw new WorkerFault('CHECKPOINT_INVALID',true);
      const steps=simulateWithPhaseDSteps({initialCapital:authority.initialCapital,accountCurrency:authority.accountCurrency,points:authority.points,contracts:authority.contracts,resume:context.job.checkpoint.account});
      let step=steps.next();
      while(step.done===false){
        await computationCheck(context);
        const {state,evidence}=step.value;
        await context.store.checkpoint(context.job,{cursor:state.cursor,total,account:state},[{sequence:state.cursor-1,evidence}]);
        if(context.remainingMs()<5000)return {done:false,summary:{}};
        step=steps.next();
      }
      const result=step.value;
      if(!total)await context.store.checkpoint(context.job,{cursor:0,total:0},[]);
      return {done:true,summary:{initialCapital:result.initialCapital,endingBalance:result.endingBalance,endingEquity:result.endingEquity,metricDefinition:result.metricDefinition,status:'COMPLETED',classification:'HISTORICAL_SIMULATION'}};
    },
    PROP:async context=>{
      await context.check();const authority=await derivePropCampaignAuthority(db,{...context.job.payload,actorId:context.job.customer_id,maxEvidenceRows:LIMITS.cycles} as Parameters<typeof derivePropCampaignAuthority>[1]);
      if(await fingerprint(authority)!==context.job.configuration_hash)throw new WorkerFault('SOURCE_NOT_CURRENT',true);
      if(authority.trades.length>LIMITS.cycles)throw new WorkerFault('CYCLE_LIMIT_EXCEEDED',true);
      const {windows,unsupported}=prepareProfessionalPropCampaign({profile:authority.profile,config:authority.config,trades:authority.trades,configurationHash:authority.run.configuration_hash,unsupportedRequirements:[]});
      let cursor=Number(context.job.checkpoint.cursor??0);
      if(!Number.isInteger(cursor)||cursor<0||cursor>windows.length)throw new WorkerFault('CHECKPOINT_INVALID',true);
      for(;cursor<windows.length;cursor++){
        await computationCheck(context);
        if(context.remainingMs()<5000)return {done:false,summary:{}};
        const window=windows[cursor],result=unsupported.length?{status:'INCOMPLETE',reasonCodes:unsupported}:await consumeSteps(simulateFullChallengeSteps(authority.profile,authority.config,window.trades),context);
        await context.store.checkpoint(context.job,{cursor:cursor+1,total:windows.length},[{sequence:cursor,evidence:{window,result}}]);
      }
      if(!windows.length)await context.store.checkpoint(context.job,{cursor:0,total:0},[]);
      const stored=unsupported.length?[]:await loadNativeEvidence<{evidence:{window:ChallengeWindow;result:FullChallengeResult}}>(db,'validation_simulation_evidence',context.job.run_id,'sequence');
      const result=summarizeProfessionalPropCampaign(windows,unsupported,stored.map(row=>row.evidence as {window:ChallengeWindow;result:FullChallengeResult}),authority.run.configuration_hash);
      const challenge=result.challenge?{...result.challenge,results:undefined}:null;
      return {done:true,summary:{status:result.status==='PASS'?'COMPLETED':result.status==='INCOMPLETE'?'INCOMPLETE':'BLOCKED',campaignStatus:result.status,coverage:result.coverage,unsupported:result.unsupported,trials:windows.length,overlapDisclosure:result.overlapDisclosure,challenge,classification:'HISTORICAL_SIMULATION'}};
    }
  };
}
