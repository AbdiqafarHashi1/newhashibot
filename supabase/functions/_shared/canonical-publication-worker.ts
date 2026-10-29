/** Phase M server-only consumer of canonical truth. It never creates lifecycle facts. */
export type PublicationAudience = "free" | "vip" | "vip_forex_gold" | "vip_crypto" | "customer" | "admin" | "owner";
export type SendResult = { kind: "accepted"; messageId: string } | { kind: "retry"; retryAfterMs: number; reason: string } | { kind: "permanent"; reason: string } | { kind: "uncertain"; reason: string } | {kind:"missing_original";reason:string};
export interface PublicationClaim { id:string; entityType:string; entityId:string; eventType:string; eventVersion:number; destination:PublicationAudience; customerId:string|null; attemptCount:number; leaseToken:string }
export interface CanonicalPublicationTruth { entityType:string; entityId:string; eventType:string; eventVersion:number; occurredAt:string; customerId?:string|null; payload:Readonly<Record<string,unknown>> }
export interface PublicationPart { text:string; parseMode?:"HTML"|"MarkdownV2"|"Markdown" }
export interface PublicationStore {
  claim(input:{workerId:string;limit:number;leaseSeconds:number;maxAttempts:number}):Promise<PublicationClaim[]>;
  loadTruth(claim:PublicationClaim):Promise<CanonicalPublicationTruth|null>;
  reservePart(input:{claim:PublicationClaim;part:number;identity:string}):Promise<{state:"SEND"|"DELIVERED"|"UNCERTAIN";deliveryId:string;messageId?:string;operation?:"SEND"|"EDIT"|"FOLLOW_UP";previousMessageId?:string}>;
  finishPart(input:{deliveryId:string;state:"DELIVERED"|"RETRY"|"DEAD"|"UNCERTAIN";messageId?:string;reason?:string;nextAttemptAt?:string}):Promise<void>;
  finishClaim(input:{claim:PublicationClaim;state:"SENT"|"RETRY"|"DEAD"|"SUPPRESSED";reason?:string;nextAttemptAt?:string}):Promise<void>;
}
export interface PublicationTransport { send(input:{destination:PublicationAudience;customerId:string|null;text:string;parseMode?:"HTML"|"MarkdownV2"|"Markdown";identity:string}):Promise<SendResult>;edit?(input:{destination:PublicationAudience;customerId:string|null;text:string;parseMode?:"HTML"|"MarkdownV2"|"Markdown";identity:string;messageId:string}):Promise<SendResult> }
export type CanonicalRenderer=(truth:CanonicalPublicationTruth,audience:PublicationAudience)=>Promise<PublicationPart[]>|PublicationPart[];

const PUBLIC_EVENTS=new Set(["EDITORIAL","SIGNAL_QUALIFIED","SIGNAL_ACTIVATED","SIGNAL_EXPIRED","SIGNAL_CANCELLED","SIGNAL_OUTCOME","TP1","BREAKEVEN","PROFIT_LOCK","TRAILING","TP2","STOP","TERMINAL_CLOSURE"]);
const CUSTOMER_EVENTS=new Set(["SUBMISSION","SUBMISSION_UNCERTAIN","RECONCILIATION","FILL","PROTECTION_PENDING","PROTECTION_VERIFIED","PROTECTION_INCIDENT","SAFETY_CLOSE","TERMINAL_CLOSURE"]);
const ADMIN_EVENTS=new Set(["CERTIFICATION","OPERATIONAL_INCIDENT","PROTECTION_INCIDENT"]);
export function audienceAllows(claim:PublicationClaim,truth:CanonicalPublicationTruth):boolean {
  if(claim.entityId!==truth.entityId||claim.entityType!==truth.entityType||claim.eventType!==truth.eventType||claim.eventVersion!==truth.eventVersion)return false;
  if(claim.eventType==="CONDITIONAL_SETUP")return claim.destination==="vip_crypto"&&truth.entityType==="lifecycle_event"&&!truth.customerId&&!claim.customerId&&truth.payload.market_type==="crypto"&&truth.payload.policy==="conditional-signals/v1";
  if(claim.destination==="free"||claim.destination==="vip"||claim.destination==="vip_forex_gold"||claim.destination==="vip_crypto")return PUBLIC_EVENTS.has(claim.eventType)&&!truth.customerId&&!claim.customerId;
  if(claim.destination==="customer")return CUSTOMER_EVENTS.has(claim.eventType)&&!!claim.customerId&&claim.customerId===truth.customerId;
  if(claim.destination==="admin")return ADMIN_EVENTS.has(claim.eventType)||CUSTOMER_EVENTS.has(claim.eventType);
  return claim.destination==="owner";
}
export const publicationIdentity=(c:PublicationClaim,part:number)=>`${c.entityType}:${c.entityId}:v${c.eventVersion}:${c.destination}:p${part}`.toLowerCase();
const next=(ms:number)=>new Date(Date.now()+Math.min(Math.max(ms,1_000),3_600_000)).toISOString();

/** A reserved part is never blindly resent after an uncertain response: operator reconciliation is required. */
export async function processCanonicalPublicationBatch(input:{store:PublicationStore;transport:PublicationTransport;render:CanonicalRenderer;workerId:string;limit?:number;leaseSeconds?:number;maxAttempts?:number}){
 const claims=await input.store.claim({workerId:input.workerId,limit:Math.min(input.limit??25,100),leaseSeconds:Math.min(input.leaseSeconds??300,300),maxAttempts:Math.min(input.maxAttempts??5,10)}),results=[];
 for(const claim of claims){
  const truth=await input.store.loadTruth(claim);
  if(!truth||!audienceAllows(claim,truth)){await input.store.finishClaim({claim,state:"SUPPRESSED",reason:truth?"AUDIENCE_OR_VERSION_MISMATCH":"CANONICAL_TRUTH_MISSING"});results.push({id:claim.id,state:"SUPPRESSED"});continue}
  let parts:PublicationPart[];try{parts=await input.render(truth,claim.destination)}catch(error){await input.store.finishClaim({claim,state:"SUPPRESSED",reason:`PUBLICATION_HELD:${error instanceof Error?error.message:String(error)}`});results.push({id:claim.id,state:"SUPPRESSED"});continue}
  let failed:false|"RETRY"|"DEAD"|"UNCERTAIN"=false,reason="",retryAt:string|undefined;
  for(let i=0;i<parts.length;i++){
   const identity=publicationIdentity(claim,i),reservation=await input.store.reservePart({claim,part:i,identity});
   if(reservation.state==="DELIVERED")continue;
   if(reservation.state==="UNCERTAIN"){failed="UNCERTAIN";reason="PREVIOUS_SUBMISSION_UNCERTAIN";break}
   const request={destination:claim.destination,customerId:claim.customerId,text:parts[i].text,parseMode:parts[i].parseMode,identity};let sent:SendResult;try{sent=reservation.operation==="EDIT"&&reservation.previousMessageId&&input.transport.edit?await input.transport.edit({...request,messageId:reservation.previousMessageId}):await input.transport.send(request);if(sent.kind==="missing_original")sent=await input.transport.send(request)}catch(error){sent={kind:"uncertain",reason:`TRANSPORT_THROW:${error instanceof Error?error.message:String(error)}`}}
   if(sent.kind==="accepted")await input.store.finishPart({deliveryId:reservation.deliveryId,state:"DELIVERED",messageId:sent.messageId});
   else if(sent.kind==="retry"){failed="RETRY";reason=sent.reason;retryAt=next(sent.retryAfterMs);await input.store.finishPart({deliveryId:reservation.deliveryId,state:"RETRY",reason,nextAttemptAt:retryAt});break}
   else if(sent.kind==="permanent"){failed="DEAD";reason=sent.reason;await input.store.finishPart({deliveryId:reservation.deliveryId,state:"DEAD",reason});break}
   else {failed="UNCERTAIN";reason=sent.reason;await input.store.finishPart({deliveryId:reservation.deliveryId,state:"UNCERTAIN",reason});break}
  }
  const state=failed==="DEAD"?"DEAD":failed?"RETRY":"SENT";await input.store.finishClaim({claim,state,reason:reason||undefined,nextAttemptAt:failed==="UNCERTAIN"?undefined:retryAt});results.push({id:claim.id,state,detail:failed||undefined});
 }
 return results;
}
