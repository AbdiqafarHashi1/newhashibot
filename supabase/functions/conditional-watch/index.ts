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
  const enabled=Deno.env.get('CONDITIONAL_SIGNALS_ENABLED')!=='FALSE';
  const result=await runConditionalWatch({store:new ConditionalSignalStore(db),
   discovery:{crypto:enabled&&cfg.data.signal_enable_crypto===true,forex:enabled&&cfg.data.signal_enable_forex===true},
   feed:async(symbol,tf,now)=>{
    const feed=await conditionalWatchFeed(db,symbol,tf,now,Deno.env.get('MT5_MARKET_DATA_FEED_ID'));
    if(!feed.error&&feed.candles.length){
     const since=Date.parse(watermarks.get(`${symbol}:${tf}`)??'');
     const rows=feed.candles.filter(b=>!Number.isFinite(since)||Date.parse(b.open_time)>=since).map(b=>({symbol:b.symbol,timeframe:b.timeframe,market_type:b.market_type,open_time:b.open_time,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume,source:b.source}));
     if(rows.length){const saved=await db.from('candles').upsert(rows,{onConflict:'symbol,timeframe,open_time'});if(saved.error)throw Error('WATCH_CANDLE_PERSIST_FAILED');}
    }
    return feed;
   },
   health:async(record)=>{if(!record.last_closed_at)record.last_closed_at=watermarks.get(`${record.symbol}:${record.timeframe}`)??null;const r=await db.rpc('record_conditional_watch_health',{p_record:record});if(r.error)throw Error('WATCH_HEALTH_WRITE_FAILED');}
  });
  return new Response(JSON.stringify({success:true,...result}),{headers});
 }catch(e){return new Response(JSON.stringify({success:false,error:e instanceof Error?e.message:'WATCH_FAILED'}),{status:500,headers});}
});
