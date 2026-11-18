/** Preserve raw archives; remove recorded quotes during scheduled closed sessions. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {scheduledMarketClosed} from '../../../supabase/functions/_shared/conditional-market.ts';
const [source,destination]=process.argv.slice(2);if(!source||!destination)throw Error('Usage normalize-sessions.ts <raw-cache> <normalized-cache>');await mkdir(destination,{recursive:true});
const records=[];
for(const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','XAUUSD'])for(const tf of ['1h','15m']){
 let raw:Buffer;try{raw=await readFile(`${source}/${symbol}-${tf}.json`);}catch{continue;}
 const original=JSON.parse(raw.toString()),excluded=original.filter((b:any)=>b.market_type==='forex'&&scheduledMarketClosed(symbol,Date.parse(b.open_time))),rows=original.filter((b:any)=>!excluded.includes(b));
 const unexpected=excluded.filter((b:any)=>b.volume>0||b.high!==b.low);
 // Preserve and disclose vendor/session disagreement; do not invent or flatten bars.
 const payload=JSON.stringify(rows)+'\n',receipt={datasetSha256:createHash('sha256').update(payload).digest('hex'),source:rows[0].source,records:rows.length,first:rows[0].open_time,last:rows.at(-1).open_time,rawDatasetSha256:createHash('sha256').update(raw).digest('hex'),excludedClosedSessionRecords:excluded.length,nonFlatClosedSessionRecords:unexpected.length,calendar:'NY FX 17:00 weekly boundary, Gold Sunday 18:00 open and daily 17:00-18:00 break',calendarSource:'https://www.dukascopy.com/swiss/english/forex/forex-trading-accounts/link/'};
 await writeFile(`${destination}/${symbol}-${tf}.json`,payload);await writeFile(`${destination}/${symbol}-${tf}.manifest.json`,JSON.stringify(receipt,null,2)+'\n');records.push({symbol,tf,...receipt});
}
await writeFile(`${destination}/normalization.json`,JSON.stringify(records,null,2)+'\n');console.log(JSON.stringify(records.map(x=>({symbol:x.symbol,tf:x.tf,records:x.records,excluded:x.excludedClosedSessionRecords,nonFlatClosed:x.nonFlatClosedSessionRecords}))));
