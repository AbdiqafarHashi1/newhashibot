import type {NativeExchangeSymbol} from './opportunity-universe.ts';

export interface CatalystHeadline {title:string;url:string;source:string;published_at:string;}
export interface CatalystCard {
 id:string;kind:'EXCHANGE_SCHEDULED_LISTING'|'REPORTED_CATALYST'|'OBSERVED_MOMENTUM';
 symbol:string|null;title:string;observedAt:string;publishedAt:string|null;expectedAt:string|null;
 sourceUrl:string;facts:string;watchFor:string;risk:string;tradeSignal:false;
}
export interface CatalystEvidence {observedAt:string;cards:CatalystCard[];exchangeStatus:'available'|'failed';tickerStatus:'available'|'failed';}
const EXCHANGE='https://fapi.binance.com/fapi/v1/exchangeInfo',TICKERS='https://fapi.binance.com/fapi/v1/ticker/24hr';
const symbol=(s:unknown):s is string=>typeof s==='string'&&/^[A-Z0-9]{2,20}USDT$/.test(s);
const clean=(s:string)=>Array.from(s.replace(/<[^>]*>/g,'')).map(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127?' ':c).join('').replace(/\s+/g,' ').trim().slice(0,220);
const iso=(n:number)=>new Date(n).toISOString();
const key=(s:string)=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16)};
const value=(x:unknown)=>x===null||x===undefined||x===''||typeof x==='boolean'?NaN:Number(x);

/** Source observations only. Scheduled listing != price forecast; a 24h move has already happened. */
export function buildCryptoCatalystCards(input:{now:number;exchange:readonly NativeExchangeSymbol[];tickers:readonly Record<string,unknown>[];headlines:readonly CatalystHeadline[];seenIds?:ReadonlySet<string>}):CatalystCard[]{
 if(!Number.isFinite(input.now))throw Error('INVALID_CATALYST_CLOCK');
 const now=input.now,observedAt=iso(now),cards:CatalystCard[]=[],seen=new Set(input.seenIds??[]);
 const push=(c:CatalystCard)=>{if(!seen.has(c.id)){cards.push(c);seen.add(c.id)}};
 const contracts=new Map<string,NativeExchangeSymbol>(),conflicts=new Set<string>();
 for(const row of input.exchange.slice(0,2000)){
  if(!symbol(row.symbol)||row.contractType!=='PERPETUAL'||row.quoteAsset!=='USDT')continue;
  if(contracts.has(row.symbol)){const previous=contracts.get(row.symbol)!;if(previous.status!==row.status||previous.onboardDate!==row.onboardDate)conflicts.add(row.symbol);continue;}
  contracts.set(row.symbol,row);
 }
 for(const [s,row]of contracts){
  if(conflicts.has(s)||row.status!=='PENDING_TRADING'||typeof row.onboardDate!=='number'||!Number.isSafeInteger(row.onboardDate)||row.onboardDate<=now||row.onboardDate>now+7*86400000)continue;
  push({id:`listing:${s}:${row.onboardDate}`,kind:'EXCHANGE_SCHEDULED_LISTING',symbol:s,title:`${s} · exchange-scheduled market opening`,observedAt,publishedAt:null,expectedAt:iso(row.onboardDate),sourceUrl:EXCHANGE,facts:'The exchange currently reports PENDING_TRADING and this future onboard time. Announcement publication time is not supplied by this endpoint.',watchFor:'Confirm the opening with the exchange. Observe actual spreads, depth and closed candles before considering an eligible setup.',risk:'Opening time can change. Gaps, thin liquidity and sharp reversals; no listing-return prediction.',tradeSignal:false});
 }
 for(const h of input.headlines.slice(0,40)){
  let u:URL;try{u=new URL(h.url)}catch{continue;}
  const published=Date.parse(h.published_at),title=clean(h.title),source=clean(h.source);
  if(u.protocol!=='https:'||u.username||u.password||!source||!title||!Number.isFinite(published)||published>now||now-published>86400000||!/(?:\blist(?:s|ing)?\b|upgrade|mainnet|airdrop|unlock|halving|\betf\b|regulat|\bsec\b)/i.test(title))continue;
  u.hash='';for(const param of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(param))u.searchParams.delete(param);
  const listing=/\blist(?:s|ing)?\b/i.test(title),upgrade=/upgrade|mainnet|halving/i.test(title);
  push({id:`news:${key(u.toString()+':'+published)}`,kind:'REPORTED_CATALYST',symbol:null,title:`Reported: ${title}`,observedAt,publishedAt:iso(published),expectedAt:null,sourceUrl:u.toString(),facts:`Headline supplied by ${source}. Event timing and claims are not independently verified from the article body.`,watchFor:listing?'Confirm the official listing notice and tradability; watch actual opening liquidity.':upgrade?'Check the project’s official schedule and rollout; watch liquidity and post-event reaction.':'Check the primary announcement and affected markets; wait for a qualified closed-candle setup.',risk:'A report is not advance knowledge or a buy recommendation. Rumours, delays and sell-the-news reversals are possible.',tradeSignal:false});
 }
 const tickerSeen=new Set<string>(),tickerConflicts=new Set<string>(),valid:Record<string,unknown>[]=[];
 const tickerRows=input.tickers.slice(0,2000);for(const t of tickerRows){const s=String(t.symbol??'');if(tickerSeen.has(s))tickerConflicts.add(s);tickerSeen.add(s);}
 for(const t of tickerRows){
  const s=String(t.symbol??''),contract=contracts.get(s),at=value(t.closeTime),quote=value(t.quoteVolume),change=value(t.priceChangePercent),last=value(t.lastPrice),low=value(t.lowPrice),high=value(t.highPrice);
  if(tickerConflicts.has(s)||conflicts.has(s)||!contract||contract.status!=='TRADING'||typeof contract.onboardDate!=='number'||!Number.isSafeInteger(contract.onboardDate)||contract.onboardDate<=0||now-contract.onboardDate<30*86400000||!Number.isFinite(at)||at>now||now-at>300000||![quote,change,last,low,high].every(Number.isFinite)||quote<25000000||Math.abs(change)<8||Math.abs(change)>50||low<=0||high<low||last<low||last>high)continue;
  valid.push(t);
 }
 valid.sort((a,b)=>value(b.quoteVolume)-value(a.quoteVolume)||String(a.symbol).localeCompare(String(b.symbol)));
 for(const t of valid.slice(0,3)){const s=String(t.symbol),change=value(t.priceChangePercent),bucket=Math.floor(now/86400000);push({id:`momentum:${s}:${bucket}`,kind:'OBSERVED_MOMENTUM',symbol:s,title:`${s} · ${change>=0?'+':''}${change.toFixed(2)}% observed over 24h`,observedAt,publishedAt:null,expectedAt:null,sourceUrl:TICKERS,facts:`Exchange 24h quote turnover: ${Math.round(value(t.quoteVolume)).toLocaleString('en-US')} USDT; ticker measured ${iso(value(t.closeTime))}. Turnover is a liquidity proxy, not measured depth or unusual-volume proof.`,watchFor:'Check spreads, order-book depth and the next closed-candle setup. This move is already underway, not an early-entry prediction.',risk:'Crowded moves can reverse sharply. No claim of social sentiment, insider knowledge, news causation or future return.',tradeSignal:false});}
 return cards.slice(0,6);
}

/** Exactly two bounded public market-data GETs; injected in tests, no account or execution API. */
export async function fetchCryptoCatalystEvidence(headlines:readonly CatalystHeadline[],now:number,fetcher:typeof fetch=fetch,seenIds?:ReadonlySet<string>,clock:()=>number=Date.now):Promise<CatalystEvidence>{
 if(!Number.isFinite(now))throw Error('INVALID_CATALYST_CLOCK');
 async function read(url:string){const response=await fetcher(url,{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('CATALYST_PROVIDER_HTTP');const reader=response.body?.getReader();if(!reader)throw Error('CATALYST_BODY_REQUIRED');let bytes=0;const chunks:Uint8Array[]=[];try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>4000000)throw Error('CATALYST_BODY_BOUND');chunks.push(part.value);}}finally{await reader.cancel();}const body=new Uint8Array(bytes);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(body));}
 const [ex,tick]=await Promise.allSettled([read(EXCHANGE),read(TICKERS)]),exchange=ex.status==='fulfilled'&&Array.isArray(ex.value?.symbols)?ex.value.symbols:[],tickers=tick.status==='fulfilled'&&Array.isArray(tick.value)?tick.value:[];
 const receivedAt=clock();if(!Number.isFinite(receivedAt)||receivedAt<now)throw Error('CATALYST_CLOCK_REVERSED');
 return{observedAt:iso(receivedAt),cards:buildCryptoCatalystCards({now:receivedAt,exchange,tickers,headlines,seenIds}),exchangeStatus:exchange.length?'available':'failed',tickerStatus:tickers.length?'available':'failed'};
}

export function renderCryptoCatalystCards(cards:readonly CatalystCard[]):string{
 if(!cards.length)return '';
 const time=(s:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Nairobi',dateStyle:'medium',timeStyle:'short',hour12:true}).format(new Date(s))+' EAT';
 return '\n\nCrypto catalyst & opportunity watch · analysis only\n'+cards.map(c=>[c.title,c.expectedAt?`Exchange-reported opening: ${time(c.expectedAt)}`:c.publishedAt?`Report published: ${time(c.publishedAt)}; event timing unverified.`:'Observed price move; no future event time.',c.facts,`Watch: ${c.watchFor}`,`Risk: ${c.risk}`,`Source: ${c.sourceUrl}`,`Observed: ${time(c.observedAt)}`].join('\n')).join('\n\n');
}
