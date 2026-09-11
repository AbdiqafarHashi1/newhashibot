import type { HistoricalRange } from './types';
export type SessionClassification='EXPECTED_CLOSURE'|'EXPECTED_WEEKEND'|'MISSING_DATA'|'UNKNOWN_SESSION';
export type InstrumentSession='CRYPTO'|'FOREX'|'METALS';
export interface SessionCalendar {kind:InstrumentSession;isExpected(timestamp:number):boolean;classify(timestamp:number):SessionClassification}
export function createSessionCalendar(kind:InstrumentSession,override?:(timestamp:number)=>boolean):SessionCalendar{return {kind,isExpected(t){if(override)return override(t);if(kind==='CRYPTO')return true;const day=new Date(t).getUTCDay();return day!==0&&day!==6;},classify(t){if(override)return override(t)?'MISSING_DATA':'EXPECTED_CLOSURE';if(kind==='CRYPTO')return 'MISSING_DATA';const day=new Date(t).getUTCDay();return day===0||day===6?'EXPECTED_WEEKEND':kind==='METALS'?'UNKNOWN_SESSION':'MISSING_DATA';}};}
export function classifyMissingRanges(ranges:HistoricalRange[],step:number,calendar:SessionCalendar){return ranges.flatMap(range=>{const out:Array<{timestamp:number;classification:SessionClassification}>=[];for(let t=range.from;t<=range.to;t+=step)out.push({timestamp:t,classification:calendar.classify(t)});return out;});}
