import {hashValidationDataset,validateDatasetIntegrity} from './validation-dataset-integrity.ts';
import {MAX_STORED_CANDLES,VALIDATION_CANDLE_SELECT,nativeCandleEvidence,restoreValidationCandle,storedValidationCandle} from './native-candle-evidence.ts';
import type {StrategyCandle} from './professional-strategies.ts';
export const UPLOAD_ACTIONS=new Set(['begin_dataset','append_dataset','finish_dataset']);
export function normalizeUploadBars(metadata:Record<string,unknown>,bars:Record<string,unknown>[]):StrategyCandle[]{
 const provider=String(metadata.provider),symbol=String(metadata.symbol),timeframe=String(metadata.timeframe),match=/^(1m|5m|15m|30m|1h|4h|1d)$/.exec(timeframe);
 if(!match||!/^[A-Z0-9]{3,24}$/.test(symbol)||!['BINANCE','BINANCE_USDM','BYBIT','MT5_BRIDGE','CSV'].includes(provider))throw Error('UPLOAD_IDENTITY_INVALID');
 return bars.map(b=>{const volume=b.volume??b.realVolume??b.tickVolume??0,base={symbol,market_type:['BINANCE','BINANCE_USDM','BYBIT'].includes(provider)?'crypto' as const:'forex' as const,timeframe,open_time:new Date(Number(b.timestamp)).toISOString(),open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),volume:Number(volume),source:provider==='BINANCE_USDM'?'BINANCE_USDM_KLINES':provider==='MT5_BRIDGE'?'MT5_HASHIBRIDGE':provider};
  if(b.source!==undefined){if(typeof b.source!=='string'||b.source.length>160)throw Error('UPLOAD_SOURCE_INVALID');base.source=b.source;}
  const evidence=nativeCandleEvidence({...b,volume:base.volume});if(provider==='BINANCE_USDM'&&(evidence.instrument_type!=='USDT_PERPETUAL'||base.source!=='BINANCE_USDM_KLINES'))throw Error('UPLOAD_FUTURES_EVIDENCE_REQUIRED');
  return {...base,...evidence} as StrategyCandle;});
}
/** Concrete store loader shared by Edge Functions, browser acceptance tests and portable replay. */
export async function loadValidationDataset(db:any,id:string):Promise<StrategyCandle[]>{
 const out:StrategyCandle[]=[];for(let offset=0;offset<=MAX_STORED_CANDLES;offset+=1000){const {data,error}=await db.from('validation_dataset_candles').select(VALIDATION_CANDLE_SELECT).eq('dataset_id',id).order('open_time').range(offset,offset+999);if(error)throw error;
  out.push(...(data??[]).map(restoreValidationCandle));if(out.length>MAX_STORED_CANDLES)throw Error('DATASET_READ_BOUND_EXCEEDED');if(!data||data.length<1000)return out;}
 throw Error('DATASET_READ_BOUND_EXCEEDED');
}
export async function handleDatasetUpload(db:any,actor:string,body:Record<string,any>){
 if(body.action==='begin_dataset'){
  const m=body.metadata,expected=Number(body.rowCount);normalizeUploadBars(m??{},[]);
  if(!Number.isSafeInteger(expected)||expected<1||expected>MAX_STORED_CANDLES||!/^[a-f0-9]{64}$/.test(body.datasetHash??''))throw Error('UPLOAD_MANIFEST_INVALID');
  const start=new Date(body.firstOpenTime).toISOString(),last=new Date(body.lastOpenTime).toISOString();if(start>last)throw Error('UPLOAD_COVERAGE_INVALID');
  const identity={provider:m.provider,symbol:m.symbol,timeframe:m.timeframe,rowCount:expected,datasetHash:body.datasetHash,first:start,last};
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(identity))),key=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  const row={source:m.provider==='BINANCE_USDM'?'BINANCE':m.provider==='MT5_BRIDGE'?'MT5_HASHIBRIDGE':m.provider,status:'DOWNLOADING',symbol:m.symbol,timeframe:m.timeframe,starts_at:start,ends_at:new Date(Date.parse(last)+1).toISOString(),first_open_time:start,last_open_time:last,dataset_hash:body.datasetHash,row_count:expected,upload_key:key,upload_metadata:m,provenance:JSON.stringify(m.provenance??{}),coverage:{complete:false,uploadProtocol:'native-upload/v1'},created_by:actor};
  const {data,error}=await db.from('validation_datasets').insert(row).select('id,status').single();if(error&&error.code!=='23505')throw error;
  if(data)return{datasetId:data.id,status:data.status};const prior=await db.from('validation_datasets').select('id,status').eq('created_by',actor).eq('upload_key',key).single();if(prior.error)throw prior.error;return{datasetId:prior.data.id,status:prior.data.status};
 }
 const {data:dataset,error}=await db.from('validation_datasets').select('*').eq('id',body.datasetId).eq('created_by',actor).single();if(error||!dataset)throw Error('DATASET_NOT_OWNED');
 if(body.action==='append_dataset'){
  if(!Array.isArray(body.bars)||!body.bars.length||body.bars.length>500)throw Error('UPLOAD_CHUNK_BOUND_INVALID');const rows=normalizeUploadBars(dataset.upload_metadata,body.bars);validateDatasetIntegrity(rows,{symbol:dataset.symbol,timeframe:dataset.timeframe});
  const result=await db.rpc('append_validation_dataset_chunk',{p_actor:actor,p_dataset:dataset.id,p_rows:rows.map(storedValidationCandle)});if(result.error)throw result.error;return{datasetId:dataset.id,received:result.data};
 }
 const rows=await loadValidationDataset(db,dataset.id);validateDatasetIntegrity(rows,{symbol:dataset.symbol,timeframe:dataset.timeframe,rowCount:Number(dataset.row_count),startsAt:dataset.first_open_time,endsAt:dataset.last_open_time});
 if(await hashValidationDataset(rows)!==dataset.dataset_hash)throw Error('DATASET_HASH_MISMATCH');
 const width=Number(dataset.timeframe.slice(0,-1))*(dataset.timeframe.endsWith('m')?60000:dataset.timeframe.endsWith('h')?3600000:86400000),now=Date.now();
 if(rows.some(r=>Date.parse(r.open_time)%width||Date.parse(r.open_time)+width>now))throw Error('OPEN_OR_UNALIGNED_DATASET_CANDLE');
 // The browser cannot assert completeness. Expected FX weekend closures use New York session time.
 const clock=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',hourCycle:'h23'}),closed=(t:number)=>{const p=clock.formatToParts(new Date(t)),d=p.find(x=>x.type==='weekday')?.value,h=Number(p.find(x=>x.type==='hour')?.value);return d==='Sat'||d==='Sun'&&h<17||d==='Fri'&&h>=17;};
 const request=dataset.upload_metadata.requestedRange??{},from=Number.isFinite(request.from)?Math.ceil(request.from/width)*width:Date.parse(rows[0].open_time),to=Number.isFinite(request.to)?Math.min(Math.floor(request.to/width)*width,Math.floor(now/width)*width-width):Date.parse(rows.at(-1)!.open_time);
 if((to-from)/width>MAX_STORED_CANDLES||to<from)throw Error('REQUESTED_COVERAGE_BOUND_INVALID');
 const times=new Set(rows.map(r=>Date.parse(r.open_time)));let missing=0;for(let t=from;t<=to;t+=width)if(!times.has(t)&&(rows[0].market_type==='crypto'||!closed(t)))missing++;
 const finalStatus=missing?'PARTIAL':'READY',result=await db.rpc('finish_validation_dataset_upload',{p_actor:actor,p_dataset:dataset.id,p_status:finalStatus,p_coverage:{complete:missing===0,missingCandles:missing,requested:{from,to},actual:{from:rows[0].open_time,to:rows.at(-1)!.open_time},nativeFieldsPreserved:true}});if(result.error)throw result.error;
 return {datasetId:dataset.id,datasetHash:dataset.dataset_hash,status:finalStatus,bars:rows.length};
}
