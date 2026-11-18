export type PersonalRiskProfile='STANDARD'|'GROWTH_2'|'AGGRESSIVE_5';
export const PERSONAL_RISK_PROFILES={
 STANDARD:{risk:1,open:6,correlated:3,daily:4,peak:18},
 GROWTH_2:{risk:2,open:8,correlated:6,daily:8,peak:40},
 AGGRESSIVE_5:{risk:5,open:15,correlated:10,daily:15,peak:60},
} as const;
export function personalRiskProfile(value:unknown):PersonalRiskProfile{
 if(value===undefined)return 'STANDARD';
 if(typeof value!=='string'||!Object.hasOwn(PERSONAL_RISK_PROFILES,value))throw Error('INVALID_PERSONAL_RISK_PROFILE');
 return value as PersonalRiskProfile;
}
export function validatePersonalGrowthScope(profile:PersonalRiskProfile,accountType:string,environment:string){
 if(profile==='STANDARD')return;
 if(accountType!=='PERSONAL')throw Error('PERSONAL_RISK_PROFILE_FORBIDDEN_FOR_PROP');
 if(!['DEMO','TESTNET'].includes(environment.toUpperCase()))throw Error('PERSONAL_GROWTH_SANDBOX_REQUIRED');
}
