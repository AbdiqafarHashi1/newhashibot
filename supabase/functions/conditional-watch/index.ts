import {watchedHistoryBars} from '../_shared/strategy-runtime-parameters.ts';
import {frozenStrategyConfirmation,currentWatchQualification} from '../_shared/frozen-strategy-confirmation.ts';
import {loadPaperLearning} from '../_shared/paper-learning.ts';
import {watchedStrategyCatalog} from '../_shared/watched-strategy-catalog.ts';
import {discoverWatchedStrategies} from '../_shared/watched-strategy-discovery.ts';
import {watchedMarketContext} from '../_shared/watched-market-context.ts';
import {WATCH_TIMEFRAMES,type WatchTimeframe} from '../_shared/conditional-contract.ts';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';
import {authorizeInternalOrAdmin,authJsonResponse} from '../_shared/internal-auth.ts';
import {runConditionalWatch} from '../_shared/conditional-watch.ts';
import {conditionalWatchFeed} from '../_shared/conditional-watch-feed.ts';
import {ConditionalSignalStore} from '../_shared/conditional-signal-runtime.ts';
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-hashibot-cron-token'};
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 const db=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'');
 const auth=await authorizeInternalOrAdmin(req,db);if(!auth.ok)return authJsonResponse(auth,headers);
 try{
  const cfg=await db.from('scanner_config').select('signal_enable_crypto,signal_enable_forex').eq('id',1).single();
  if(cfg.error||!cfg.data)throw Error('SCANNER_CONFIGURATION_UNAVAILABLE');
  const prior=await db.from('conditional_asset_watch').select('symbol,timeframe,last_closed_at');
  if(prior.error)throw Error('WATCH_HEALTH_READ_FAILED');
  const watermarks=new Map<string,string>((prior.data??[]).map((r:any)=>[`${r.symbol}:${r.timeframe}`,r.last_closed_at]));
  const [configs,releases,sources,open,learning]=await Promise.all([
   db.from('strategy_configs').select('*'),db.from('strategy_release_candidates').select('id,strategy_id,state,immutable_configuration').eq('state','PROMOTED'),
   db.from('intelligence_events').select('event_id,market,created_at,metadata,data_sources').gte('created_at',new Date(Date.now()-1800000).toISOString()).order('created_at',{ascending:false}).limit(100),
   db.from('conditional_signal_setups').select('symbol,timeframe').in('status',['WAITING','ARMED','ACTIVE']),loadPaperLearning(db)
  ]);
  if(configs.error||releases.error||open.error)throw Error('WATCH_STRATEGY_CONFIGURATION_UNAVAILABLE');
  const definitions=watchedStrategyCatalog(configs.data??[],releases.data??[]),evidence=(sources.error?[]:sources.data??[]).map((r:any)=>({...r,id:r.event_id}));
  const frames=new Set<WatchTimeframe>(['5m','15m','1h']);
  for(const d of definitions.filter(d=>d.lifecycle==='ENABLED'&&d.config.enabled))for(const tf of d.config.allowed_timeframes)if(WATCH_TIMEFRAMES.includes(tf as WatchTimeframe))frames.add(tf as WatchTimeframe);
  const enabled=Deno.env.get('CONDITIONAL_SIGNALS_ENABLED')!=='FALSE';
  const result=await runConditionalWatch({store:new ConditionalSignalStore(db),timeframes:[...frames],additionalTasks:(open.data??[]).map((r:any)=>({symbol:r.symbol,tf:r.timeframe})),
   assess:async({symbol,tf,rows,now,feed,load})=>{
    const higherTf:WatchTimeframe=tf==='5m'?'15m':tf==='15m'?'1h':tf==='1h'?'4h':'1d';
    const [higher,anchor]=await Promise.all([load(symbol,higherTf).catch(()=>({candles:[]})),symbol.endsWith('USDT')&&symbol!=='BTCUSDT'?load('BTCUSDT',tf).catch(()=>({candles:[]})):Promise.resolve(undefined)]);
    const options={higher:higher.candles,anchor:anchor?.candles,spreadPrice:feed.spreadPrice,spreadObservedAt:feed.spreadObservedAt,sources:evidence};
    const assessment=discoverWatchedStrategies({definitions,symbol,tf,rows,now,learning,...options});
    const saved=await db.rpc('record_watched_strategy_observations',{p_rows:assessment.observations});if(saved.error)throw Error('STRATEGY_OBSERVATIONS_WRITE_FAILED');
    return {setups:assessment.setups,qualification:s=>currentWatchQualification(s,definitions),confirmation:(s,prefix,at)=>frozenStrategyConfirmation(s,prefix,at,options),intelligence:(prefix,at)=>watchedMarketContext(prefix,at,options)};
   },
   discovery:{crypto:enabled&&cfg.data.signal_enable_crypto===true,forex:enabled&&cfg.data.signal_enable_forex===true},
   feed:async(symbol,tf,now)=>{
    const feed=await conditionalWatchFeed(db,symbol,tf,now,Deno.env.get('MT5_MARKET_DATA_FEED_ID'),fetch,watchedHistoryBars(definitions,symbol,tf));
    if(!feed.error&&feed.candles.length){
     const since=Date.parse(watermarks.get(`${symbol}:${tf}`)??'');
     const rows=feed.candles.filter(b=>!Number.isFinite(since)||Date.parse(b.open_time)>=since).map(b=>({symbol:b.symbol,timeframe:b.timeframe,market_type:b.market_type,open_time:b.open_time,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume,source:b.source}));
     if(rows.length){const saved=await db.from('candles').upsert(rows,{onConflict:'symbol,timeframe,open_time'});if(saved.error)throw Error('WATCH_CANDLE_PERSIST_FAILED');}
    }
    return feed;
   },
   health:async(record)=>{if(!record.last_closed_at)record.last_closed_at=watermarks.get(`${record.symbol}:${record.timeframe}`)??null;const r=await db.rpc('record_conditional_watch_health',{p_record:record});if(r.error)throw Error('WATCH_HEALTH_WRITE_FAILED');}
  });
  return new Response(JSON.stringify({success:true,learning:{available:learning.available,asOf:new Date(learning.asOf).toISOString(),reason:learning.reason},...result}),{headers});
 }catch(e){return new Response(JSON.stringify({success:false,error:e instanceof Error?e.message:'WATCH_FAILED'}),{status:500,headers});}
});
