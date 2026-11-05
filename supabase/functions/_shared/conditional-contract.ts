export const WATCH_TIMEFRAMES=['5m','15m','1h','4h','1d'] as const;
export type WatchTimeframe=typeof WATCH_TIMEFRAMES[number];
export type WatchTrack='SCALP'|'INTRADAY'|'SWING';
export const watchWidth=(tf:string)=>({ '5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000 }[tf]??NaN);
export const watchTrack=(tf:string,id=''):WatchTrack=>/swing|daily/.test(id)?'SWING':/scalp/.test(id)||tf==='5m'?'SCALP':tf==='15m'?'INTRADAY':'SWING';
