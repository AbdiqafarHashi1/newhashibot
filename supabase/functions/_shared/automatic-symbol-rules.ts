/** Refresh only sandbox contract metadata; never use live rules for a demo order. */
export async function currentBinanceSandboxRule(db:any,symbol:string,now=Date.now(),request:typeof fetch=fetch){
 if(!/^[A-Z0-9]{2,32}$/.test(symbol))throw Error('INVALID_PROVIDER_SYMBOL');
 const existing=await db.from('provider_symbol_cache').select('*').eq('provider','binance').eq('environment','testnet').eq('symbol',symbol).maybeSingle();
 if(existing.error)throw Error('SYMBOL_RULE_UNAVAILABLE');
 const at=Date.parse(existing.data?.last_synced_at);
 if(existing.data&&Number.isFinite(at)&&at<=now&&now-at<=300000)return existing.data;
 const response=await request('https://demo-fapi.binance.com/fapi/v1/exchangeInfo',{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('SANDBOX_SYMBOL_REFRESH_UNAVAILABLE');
 const payload=await response.json(),matches=Array.isArray(payload.symbols)?payload.symbols.filter((r:any)=>r.symbol===symbol):[];
 if(matches.length!==1)throw Error('SANDBOX_SYMBOL_NOT_UNIQUE');
 const raw=matches[0];
 if(raw.status!=='TRADING'||raw.quoteAsset!=='USDT'||raw.contractType!=='PERPETUAL'||!Array.isArray(raw.filters))throw Error('SANDBOX_SYMBOL_NOT_TRADABLE');
 for(const [type,fields] of [['MARKET_LOT_SIZE',['stepSize','minQty','maxQty']],['PRICE_FILTER',['tickSize']],['MIN_NOTIONAL',['notional']]] as const){
  const values=raw.filters.filter((f:any)=>f.filterType===type);
  if(values.length!==1||fields.some(f=>!Number.isFinite(Number(values[0][f]))||Number(values[0][f])<=0))throw Error('SANDBOX_SYMBOL_LIMITS_REQUIRED');
 }
 const stamp=new Date(now).toISOString(),row={provider:'binance',environment:'testnet',symbol,status:raw.status,base_asset:raw.baseAsset??null,quote_asset:raw.quoteAsset,raw_exchange_info:raw,last_synced_at:stamp,updated_at:stamp};
 const saved=await db.from('provider_symbol_cache').upsert(row,{onConflict:'provider,symbol'});
 if(saved.error)throw Error('SANDBOX_SYMBOL_RULE_PERSISTENCE_FAILED');
 return row;
}
