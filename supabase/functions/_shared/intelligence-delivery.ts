import type {IntelligenceOutput} from './intelligence-engine.ts';
import {intelligencePublication} from './intelligence-publication.ts';

/** Failure evidence is operational content. It never becomes a Free/VIP editorial. */
export function intelligenceSourceFailures(output:IntelligenceOutput):string[] {
 const feeds=Array.isArray(output.metadata?.feed_health)?output.metadata.feed_health:[];
 const symbols=Array.isArray(output.metadata?.feed_failures)?output.metadata.feed_failures:[];
 return [...feeds.filter((f:any)=>f.status!=='available').map((f:any)=>`${f.feed_type}: ${f.error_message??f.failure_reason??'source unavailable'}`),
  ...symbols.filter((f:any)=>f.reason).map((f:any)=>`${f.symbol}: ${f.reason}`)];
}
export async function deliverIntelligenceOutput(output:IntelligenceOutput,deps:{route:(event:any)=>Promise<any>},now=Date.now()) {
 const failures=intelligenceSourceFailures(output),slot=Math.floor(now/1800000);
 const admin=async(reason:string)=>deps.route({event_id:`intelligence-source:${output.market}:${output.event_type}:${slot}`,event_type:'admin_intelligence_source_failure',
  text:`HashiBot sourcing report · ${output.market} · ${output.event_type}\nRecord: ${output.event_id}\n${reason}`,channels:['admin'],source:'intelligence-engine',dedupe:true});
 if(failures.length||output.status!=='generated')await admin(failures.length?failures.join('\n'):'Required source evidence incomplete; subscriber update held.');
 if(output.status!=='generated')return {state:'HELD_SOURCE_EVIDENCE',deliveries:[]};
 // Validate both audiences before queuing either one. Unsupported summaries stay admin-only.
 let publications;
 try{publications=(['free','vip'] as const).map(audience=>({audience,editorial:intelligencePublication(output,audience,now)}));}
 catch(e){if(!failures.length)await admin(e instanceof Error?e.message:'Required source evidence unavailable');return {state:'HELD_SOURCE_EVIDENCE',deliveries:[]};}
 const deliveries=[];
 for(const {audience,editorial} of publications)deliveries.push({audience,result:await deps.route({event_id:editorial.content_id,event_type:output.event_type,editorial,channels:[audience],source:'intelligence-engine',dedupe:true})});
 return {state:'QUEUED',deliveries};
}
