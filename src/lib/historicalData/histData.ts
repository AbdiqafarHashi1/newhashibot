import { createHash } from "node:crypto";
import JSZip from "jszip";
import type { CanonicalCandle, HistoricalTimeframe } from "./types";
import { TIMEFRAME_MS } from "./validation";

export const HISTDATA_EVIDENCE = Object.freeze({
  provider: "HISTDATA" as const,
  evidenceClass: "INDEPENDENT_RESEARCH_MARKET_DATA" as const,
  priceType: "BID_OHLC" as const,
  sessionInterpretation: "EST_NO_DST" as const,
  utcOffsetMinutes: -300,
});
export const HISTDATA_SYMBOLS = Object.freeze(["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD"] as const);

/** HistData's wall clock is fixed EST (UTC-5), including during US daylight time. */
export function histDataEstToUtc(value:string):number {
  const match=/^(\d{4})(\d{2})(\d{2})[ ;,](\d{2})(\d{2})(\d{2})$/.exec(value.trim());
  if(!match) throw new Error(`INVALID_HISTDATA_TIMESTAMP:${value}`);
  const [,y,m,d,h,minute,s]=match;
  return Date.UTC(+y,+m-1,+d,+h+5,+minute,+s);
}

export function parseHistDataAscii(text:string):CanonicalCandle[]{
  const bars:CanonicalCandle[]=[];
  for(const [index,line] of text.replace(/^\uFEFF/,"").split(/\r?\n/).entries()){
    if(!line.trim())continue;
    const fields=line.trim().split(/[;,]/);
    if(fields.length<5)throw new Error(`INVALID_HISTDATA_ROW:${index+1}`);
    const timestamp=histDataEstToUtc(fields[0]),open=Number(fields[1]),high=Number(fields[2]),low=Number(fields[3]),close=Number(fields[4]),volume=fields[5]===undefined?undefined:Number(fields[5]);
    if(![timestamp,open,high,low,close,volume??0].every(Number.isFinite)||high<Math.max(open,close,low)||low>Math.min(open,close,high))throw new Error(`INVALID_HISTDATA_OHLC:${index+1}`);
    bars.push({timestamp,open,high,low,close,...(volume===undefined?{}:{volume})});
  }
  return bars;
}

/** UTC-aligned aggregation. Missing M1 rows are never manufactured or forward-filled. */
export function aggregateHistDataM1(input:CanonicalCandle[],timeframe:Exclude<HistoricalTimeframe,"1m"|"30m"|"1d">):CanonicalCandle[]{
  const width=TIMEFRAME_MS[timeframe],groups=new Map<number,CanonicalCandle[]>();
  for(const bar of [...input].sort((a,b)=>a.timestamp-b.timestamp)){const bucket=Math.floor(bar.timestamp/width)*width;groups.set(bucket,[...(groups.get(bucket)??[]),bar])}
  return [...groups.entries()].sort(([a],[b])=>a-b).map(([timestamp,bars])=>({timestamp,open:bars[0].open,high:Math.max(...bars.map(x=>x.high)),low:Math.min(...bars.map(x=>x.low)),close:bars.at(-1)!.close,volume:bars.some(x=>x.volume!==undefined)?bars.reduce((n,x)=>n+(x.volume??0),0):undefined}));
}

export interface HistDataDownload { bars:CanonicalCandle[]; rawHash:string; sourceUrl:string; filename:string; period:string; rawBytes:Uint8Array }
export class HistDataDownloader {
  constructor(private readonly http:typeof fetch=fetch,private readonly base="https://www.histdata.com"){}
  async download(symbol:string,period:string,signal?:AbortSignal):Promise<HistDataDownload>{
    if(!HISTDATA_SYMBOLS.includes(symbol as typeof HISTDATA_SYMBOLS[number]))throw new Error(`UNSUPPORTED_HISTDATA_SYMBOL:${symbol}`);
    if(!/^\d{4}(?:\d{2})?$/.test(period))throw new Error(`INVALID_HISTDATA_PERIOD:${period}`);
    const pageUrl=`${this.base}/download-free-forex-data/?/ascii/1-minute-bar-quotes/${symbol}/${period.slice(0,4)}${period.length===6?`/${Number(period.slice(4))}`:""}`;
    const page=await this.http(pageUrl,{signal,headers:{"user-agent":"Hashibot-Research/1.0"}});if(!page.ok)throw new Error(`HISTDATA_PAGE_HTTP_${page.status}`);
    const html=await page.text(),token=html.match(/name=["']tk["'][^>]*value=["']([^"']+)/i)?.[1]??html.match(/value=["']([^"']+)["'][^>]*name=["']tk["']/i)?.[1];
    if(!token)throw new Error("HISTDATA_FORM_TOKEN_MISSING");
    const time=`HISTDATA_COM_ASCII_${symbol}_M1${period}`,body=new URLSearchParams({tk:token,date:period.slice(0,4),datemonth:period,platform:"ASCII",time,fxpair:symbol});
    const cookie=page.headers.get("set-cookie")?.split(",").map(x=>x.split(";")[0]).join("; ");
    const response=await this.http(`${this.base}/get.php`,{method:"POST",signal,redirect:"follow",headers:{"content-type":"application/x-www-form-urlencoded","referer":pageUrl,"user-agent":"Hashibot-Research/1.0",...(cookie?{cookie}:{})},body});
    if(!response.ok)throw new Error(`HISTDATA_DOWNLOAD_HTTP_${response.status}`);const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length<4||bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error("HISTDATA_DOWNLOAD_NOT_ZIP");
    const zip=await JSZip.loadAsync(bytes),entry=Object.values(zip.files).find(x=>!x.dir&&/\.csv$/i.test(x.name));if(!entry)throw new Error("HISTDATA_ZIP_CSV_MISSING");
    return {bars:parseHistDataAscii(await entry.async("string")),rawHash:`sha256:${createHash("sha256").update(bytes).digest("hex")}`,sourceUrl:pageUrl,filename:entry.name,period,rawBytes:bytes};
  }
}
