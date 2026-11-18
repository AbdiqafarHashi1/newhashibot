export type CanonicalPersonalRiskProfile='STANDARD'|'SMART_GROWTH'|'GROWTH_2PCT'|'AGGRESSIVE_5PCT';
export type PersonalRiskProfile=CanonicalPersonalRiskProfile|'GROWTH_2'|'AGGRESSIVE_5';
export const PERSONAL_RISK_PROFILES={
 STANDARD:{risk:1,open:6,correlated:3,daily:4,peak:18},
 SMART_GROWTH:{risk:1.5,open:7,correlated:4.5,daily:6,peak:14},
 GROWTH_2PCT:{risk:2,open:8,correlated:6,daily:8,peak:40},
 AGGRESSIVE_5PCT:{risk:5,open:15,correlated:10,daily:15,peak:60},
} as const;
export function personalRiskProfile(value:unknown):CanonicalPersonalRiskProfile{
 if(value===undefined)return 'STANDARD';
 if(value==='GROWTH_2')return 'GROWTH_2PCT';if(value==='AGGRESSIVE_5')return 'AGGRESSIVE_5PCT';
 if(typeof value!=='string'||!Object.hasOwn(PERSONAL_RISK_PROFILES,value))throw Error('INVALID_PERSONAL_RISK_PROFILE');
 return value as CanonicalPersonalRiskProfile;
}
export function validatePersonalGrowthScope(profile:PersonalRiskProfile,accountType:string,environment:string){
 const selected=personalRiskProfile(profile);if(selected==='STANDARD')return;
 if(accountType!=='PERSONAL')throw Error('PERSONAL_RISK_PROFILE_FORBIDDEN_FOR_PROP');
 if(!['DEMO','TESTNET',...(selected==='SMART_GROWTH'?['LIVE']:[])].includes(environment.toUpperCase()))throw Error('PERSONAL_GROWTH_SANDBOX_REQUIRED');
}
const cryptoSymbol=(symbol:string)=>/USDT$/.test(symbol)||/^(BTC|ETH|SOL)USD(?:[._-].*)?$/.test(symbol);
/** Apply before capacity checks. Second and later concurrent Crypto entries share half-size risk. */
export function concurrentCryptoRiskMultiplier(symbol:string,positions:readonly {symbol:string}[]){return cryptoSymbol(symbol)&&positions.some(p=>cryptoSymbol(p.symbol))?.5:1;}
export interface ForwardHistoryEvidence {customerId:string;accountId:string;provider:string;observedAt:string;verifiedDays:number;closedTradeCount:number;historyComplete:boolean;}
export function assertSmartGrowthHistory(e:ForwardHistoryEvidence|undefined,customerId:string,accountId:string,provider:string,now:string){
 const age=Date.parse(now)-Date.parse(e?.observedAt??'');
 if(!e||e.customerId!==customerId||e.accountId!==accountId||e.provider!==provider||!Number.isFinite(age)||age<0||age>60000||e.historyComplete!==true||!Number.isInteger(e.verifiedDays)||e.verifiedDays<30||!Number.isInteger(e.closedTradeCount)||e.closedTradeCount<1)throw Error('SMART_GROWTH_30_VERIFIED_DAYS_REQUIRED');
}
export function assertPersonalProfileAssignment(profile:PersonalRiskProfile,role:unknown){if(personalRiskProfile(profile)!=='STANDARD'&&role!=='admin')throw Error('ADMIN_REQUIRED');}
/** Database returns coverage from immutable provider evidence, never caller-submitted age. */
export async function loadSmartGrowthHistory(db:any,customerId:string,accountId:string,provider:string,now:string):Promise<ForwardHistoryEvidence>{
 const r=await db.rpc('observe_personal_forward_history',{p_customer:customerId,p_account:accountId,p_now:now});if(r.error||!r.data)throw Error('SMART_GROWTH_30_VERIFIED_DAYS_REQUIRED');
 assertSmartGrowthHistory(r.data,customerId,accountId,provider,now);return r.data;
}

export function personalCryptoGuardEnabled(profile:PersonalRiskProfile|undefined,requested=false){const p=personalRiskProfile(profile);return p==='SMART_GROWTH'||p==='GROWTH_2PCT'&&requested;}
