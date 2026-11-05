import type {DatasetCampaign} from './datasetCampaign';
import {historicalCandleChecksum,type CanonicalHistoricalDataset} from '../../../supabase/functions/_shared/canonical-historical-replay';
import {WATCH_TIMEFRAMES,type WatchTimeframe} from '../../../supabase/functions/_shared/conditional-contract';
/** Preserve native source/instrument evidence. CSV and midpoint quotes remain indicative. */
export async function mission2CampaignDatasets(campaign:DatasetCampaign):Promise<CanonicalHistoricalDataset[]>{
 const result:CanonicalHistoricalDataset[]=[];
 for(const d of campaign.datasets){
  const {metadata:m,bars}=d;
  if(!WATCH_TIMEFRAMES.includes(m.timeframe as WatchTimeframe))continue;
  const sources=new Set(bars.map(b=>b.source??m.provenance.sourceUrl??m.provider));
  if(sources.size!==1)throw Error('CAMPAIGN_MIXED_CANDLE_SOURCES');
  if(bars.some(b=>b.volume===undefined&&b.tickVolume===undefined&&b.realVolume===undefined))throw Error('CAMPAIGN_VOLUME_EVIDENCE_MISSING');
  const source=[...sources][0],candles=bars.map(b=>({symbol:m.symbol,market_type:/USDT$/.test(m.symbol)?'crypto':'forex',timeframe:m.timeframe,source,open_time:new Date(b.timestamp).toISOString(),open:b.open,high:b.high,low:b.low,close:b.close,volume:b.realVolume??b.volume??b.tickVolume!,...(b.instrument_type?{instrument_type:b.instrument_type}:{}),...(b.ask_close!==undefined?{ask_close:b.ask_close,ask_open:b.ask_open,ask_high:b.ask_high,ask_low:b.ask_low}:{}),...(b.quote_volume!==undefined?{quote_volume:b.quote_volume,trade_count:b.trade_count,taker_buy_volume:b.taker_buy_volume,taker_buy_quote_volume:b.taker_buy_quote_volume}:{})}));
  const nativePerpetual=bars.every(b=>b.instrument_type==='USDT_PERPETUAL'),nativeSpot=bars.every(b=>b.instrument_type==='SPOT');
  const broker=m.provider==='MT5_BRIDGE'&&bars.every(b=>b.ask_close!==undefined&&b.ask_open!==undefined);
  result.push({id:m.datasetKey,sha256:await historicalCandleChecksum(candles),symbol:m.symbol,timeframe:m.timeframe as WatchTimeframe,candles,provenance:{source,instrument:nativePerpetual?'PERPETUAL':nativeSpot?'SPOT':broker?'BROKER_BID_ASK':'INDICATIVE',limitations:[...(!nativePerpetual&&!nativeSpot&&!broker?['Instrument/venue execution evidence incomplete']:[]),'Signal lifecycle verification only; broker fills, account returns and profitability are not established']}});
 }
 if(!result.length)throw Error('CAMPAIGN_HAS_NO_PRODUCTION_WATCH_TIMEFRAMES');return result;
}
