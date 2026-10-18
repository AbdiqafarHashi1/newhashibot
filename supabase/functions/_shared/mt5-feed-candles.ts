const frames:Record<string,number>={'5m':300000,'15m':900000,'1h':3600000,'4h':14400000};
/** Store genuine completed bars only. Current mutable bars are discarded, never certified closed. */
export function closedMt5FeedCandles(value:unknown,now=Date.now()){
 if(!Array.isArray(value)||value.length>1000)throw Error('MT5_FEED_CANDLES_INVALID');
 const seen=new Set<string>(),closed:Record<string,any>[]=[];
 for(const c of value){const duration=frames[c?.timeframe],at=Date.parse(c?.open_time),prices=[c?.open,c?.high,c?.low,c?.close];
  if(!duration||!Number.isFinite(at)||at>now||!prices.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)||c.low>Math.min(c.open,c.close)||c.high<Math.max(c.open,c.close)||c.low>c.high||!Number.isFinite(c.tick_volume)||c.tick_volume<0)throw Error('MT5_FEED_CANDLE_INVALID');
  const key=c.timeframe+':'+at;if(seen.has(key))throw Error('MT5_FEED_CANDLE_DUPLICATE');seen.add(key);
  if(at+duration<=now)closed.push(c);
 }
 for(const tf of Object.keys(frames))if(closed.filter(c=>c.timeframe===tf).length<55)throw Error('MT5_FEED_CLOSED_HISTORY_INCOMPLETE');
 return closed;
}
