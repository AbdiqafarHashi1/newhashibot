export const WATCH_TIMEFRAMES=['5m','15m','1h','4h','1d'] as const;
export type WatchTimeframe=typeof WATCH_TIMEFRAMES[number];
export type WatchTrack='SCALP'|'INTRADAY'|'SWING';
export const watchWidth=(tf:string)=>{const m=/^(\d+)(m|h|d)$/.exec(tf);return m&&Number(m[1])>0?Number(m[1])*(m[2]==='m'?60000:m[2]==='h'?3600000:86400000):NaN;};
export const watchTrack=(tf:string,id=''):WatchTrack=>/swing|daily/.test(id)?'SWING':/scalp/.test(id)||tf==='5m'?'SCALP':tf==='15m'?'INTRADAY':'SWING';
