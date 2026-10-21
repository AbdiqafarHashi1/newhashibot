/** Nairobi has a stable UTC+3 offset. Each slot stays eligible for 30 minutes to recover outages. */
export function dueIntelligenceKinds(at = new Date()): Array<'morning_brief'|'watchlist_pattern_update'|'news_digest'|'market_wrap'> {
 if(!Number.isFinite(at.getTime()))throw Error('INVALID_SCHEDULE_TIME');
 const eat=new Date(at.getTime()+3*3600000);if(eat.getUTCMinutes()>=30)return [];
 return eat.getUTCHours()===8?['morning_brief']:[10,16].includes(eat.getUTCHours())?['watchlist_pattern_update']:[12,18].includes(eat.getUTCHours())?['news_digest']:eat.getUTCHours()===22?['market_wrap']:[];
}
