/** Broader observation, bounded scans. Inclusion never confers strategy qualification. */
export interface ObservedUniverseRow {symbol:string;market_type:'crypto';is_active:true;universe_rank:number;
  universe_reason:string;quote_volume:number|null;price_change_pct:number|null;volatility_proxy:number|null;}
export interface NativeExchangeSymbol {symbol?:string;status?:string;contractType?:string;quoteAsset?:string;baseAsset?:string;onboardDate?:number;}
export const CORE_CRYPTO_SYMBOLS=['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','LINKUSDT','AVAXUSDT','LTCUSDT'];
const STABLE=new Set(['USDC','FDUSD','TUSD','BUSD','DAI','USDP','USDE','SUSDE','EUR','TRY','BRL']);
export function unverifiedCoreRows():ObservedUniverseRow[]{return CORE_CRYPTO_SYMBOLS.map((symbol,i)=>({symbol,market_type:'crypto',is_active:true,
  universe_rank:100-i,universe_reason:'static_core_liquidity_unverified',quote_volume:null,price_change_pct:null,volatility_proxy:null}));}
export function chooseObservedUniverse(input:{exchange:readonly NativeExchangeSymbol[];tickers:readonly Record<string,unknown>[];
  asOf:number;limit:number;poolSize:number;minQuoteVolume:number;include?:readonly string[];exclude?:readonly string[];stableExclusions?:readonly string[]}){
  if(!Number.isFinite(input.asOf)||!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>25||!Number.isSafeInteger(input.poolSize)||input.poolSize<input.limit||input.poolSize>200||!Number.isFinite(input.minQuoteVolume)||input.minQuoteVolume<0)throw Error('UNSAFE_OBSERVED_UNIVERSE_LIMIT');
  const excluded=new Set(input.exclude??[]),included=new Set(input.include??[]),stable=new Set([...STABLE,...(input.stableExclusions??[])]);
  const contracts=new Map(input.exchange.filter(s=>s.status==='TRADING'&&s.contractType==='PERPETUAL'&&s.quoteAsset==='USDT'&&
    /^[A-Z0-9]{2,20}USDT$/.test(s.symbol??'')&&!stable.has(s.baseAsset??'')).map(s=>[s.symbol!,s]));
  const rejected:Record<string,number>={},seen=new Set<string>();
  const rows=input.tickers.flatMap(t=>{
    const symbol=String(t.symbol??''),contract=contracts.get(symbol);
    const omit=(reason:string)=>{rejected[reason]=(rejected[reason]??0)+1;return [];};
    if(!contract||excluded.has(symbol)||seen.has(symbol))return omit('NOT_ELIGIBLE_OR_DUPLICATE');seen.add(symbol);
    const number=(key:string)=>t[key]===null||t[key]===''||t[key]===undefined?NaN:Number(t[key]);
    const quote=number('quoteVolume'),change=number('priceChangePercent'),high=number('highPrice'),low=number('lowPrice'),last=number('lastPrice');
    const closeTime=number('closeTime');
    if(!Number.isFinite(closeTime)||closeTime>input.asOf+60000||input.asOf-closeTime>300000)return omit('STALE_OR_MISSING_TICKER_TIME');
    if(![quote,change,high,low,last].every(Number.isFinite)||quote<input.minQuoteVolume||low<=0||high<low||last<low||last>high)return omit('LIQUIDITY_OR_PRICE_INVALID');
    // A fresh listing is an observation candidate, not an immediately tradable strategy universe member.
    if(!Number.isFinite(contract.onboardDate)||contract.onboardDate!<=0||contract.onboardDate!>input.asOf||input.asOf-contract.onboardDate!<30*86400000)return omit('LISTING_HISTORY_UNVERIFIED_OR_TOO_SHORT');
    if(Math.abs(change)>50)return omit('EXTREME_24H_MOVE_RESEARCH_ONLY');
    const range=(high-low)/last*100,score=Math.log10(Math.max(quote,1))*18+Math.min(range,15);
    return [{symbol,market_type:'crypto' as const,is_active:true as const,universe_rank:score,
      universe_reason:'observed_liquid_mature_perpetual',quote_volume:quote,price_change_pct:change,volatility_proxy:range}];
  }).sort((a,b)=>Number(included.has(b.symbol))-Number(included.has(a.symbol))||b.universe_rank-a.universe_rank||a.symbol.localeCompare(b.symbol)).slice(0,input.poolSize);
  const anchors=rows.filter(r=>['BTCUSDT','ETHUSDT'].includes(r.symbol)).slice(0,Math.min(2,input.limit)),rest=rows.filter(r=>!anchors.some(a=>a.symbol===r.symbol));
  const capacity=input.limit-anchors.length,slot=Math.floor(input.asOf/300000),offset=rest.length&&capacity?(slot*capacity)%rest.length:0;
  const selected=[...anchors,...Array.from({length:Math.min(capacity,rest.length)},(_,i)=>rest[(offset+i)%rest.length])];
  return{symbols:selected,pool:rows,coverage:{poolSize:rows.length,selectedCount:selected.length,slot,offset,
    approximateSweepMinutes:capacity?Math.ceil(rest.length/capacity)*5:null,observationMode:'ROTATING_SAMPLED_COVERAGE',allSymbolsEvaluatedEveryClose:false,qualificationExpanded:false},rejected};
}
export interface ListingObservation {symbol:string;listedAt:string;observedAt:string;source:string;classification:'NEW_LISTING_RESEARCH_ONLY';}
export function freshListingObservations(exchange:readonly NativeExchangeSymbol[],asOf:number):ListingObservation[]{
  if(!Number.isFinite(asOf))throw Error('INVALID_LISTING_OBSERVATION_TIME');
  const seen=new Set<string>();return exchange.flatMap(s=>{
    if(s.status!=='TRADING'||s.contractType!=='PERPETUAL'||s.quoteAsset!=='USDT'||!s.symbol||seen.has(s.symbol)||!/^[A-Z0-9]{2,20}USDT$/.test(s.symbol)||
       !Number.isFinite(s.onboardDate)||s.onboardDate!<=0||s.onboardDate!>asOf||asOf-s.onboardDate!>7*86400000)return [];
    seen.add(s.symbol);return [{symbol:s.symbol,listedAt:new Date(s.onboardDate!).toISOString(),observedAt:new Date(asOf).toISOString(),
      source:'https://fapi.binance.com/fapi/v1/exchangeInfo',classification:'NEW_LISTING_RESEARCH_ONLY' as const}];
  }).sort((a,b)=>b.listedAt.localeCompare(a.listedAt)||a.symbol.localeCompare(b.symbol)).slice(0,10);
}
