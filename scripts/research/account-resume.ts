/** One canonical identity for CLI strings, numeric scenarios and persisted checkpoints. */
export function researchAccountId(provider:string,capital:string|number,risk:string|number){
 const c=Number(capital),r=Number(risk);if(!provider||!Number.isFinite(c)||c<=0||!Number.isFinite(r)||r<=0)throw Error('RESEARCH_ACCOUNT_ID_INVALID');
 return `research:${provider}:${c}:${r}`;
}
export function researchAccountResume(saved:{accounts:{accountId:string;ledger:unknown}[]}|undefined,id:string){
 if(!saved)return undefined;
 const matches=saved.accounts.filter(a=>a.accountId===id);
 if(matches.length!==1||!matches[0].ledger)throw Error('RESEARCH_ACCOUNT_CHECKPOINT_BINDING_REQUIRED');
 return matches[0].ledger;
}
