export function verifyBridgeAccountEvidence(input:{account:Record<string,unknown>|null;registry:Record<string,unknown>|null;accountId:string;ownerId:string;bridgeId:string;workerId:string;credentialRef?:string;allowStarting?:boolean;now:number}) {
 const {account:a,registry:r}=input;
 if(!a||!r||!input.accountId||!input.ownerId||!input.bridgeId||!input.workerId||a.id!==input.accountId||a.user_id!==input.ownerId||a.bridge_id!==input.bridgeId||r.bridge_id!==input.bridgeId||r.worker_id!==input.workerId||r.revoked_at!=null||!(['online','healthy',...(input.allowStarting?['starting']:[])]).includes(String(r.status)))throw new Error('BRIDGE_ACCOUNT_SCOPE_MISMATCH');
 const expiry=Date.parse(String(r.lease_expires_at??''));
 if(!Number.isFinite(expiry)||expiry<=input.now)throw new Error('BRIDGE_LEASE_EXPIRED');
 if(input.credentialRef!==undefined&&(!input.credentialRef||a.credential_ref!==input.credentialRef))throw new Error('CREDENTIAL_REF_MISMATCH');
 return a;
}
export function validateMt5ProviderSnapshot(body:Record<string,unknown>) {
 const s=body.snapshot as Record<string,unknown>|undefined;
 if(!s||s.environment!=='demo'||s.terminal_authenticated!==true||!['balance','equity','margin','free_margin'].every(k=>typeof s[k]==='number'&&Number.isFinite(s[k])&&Number(s[k])>=0)||typeof s.floating_pnl!=='number'||!Number.isFinite(s.floating_pnl)||typeof s.currency!=='string'||!s.currency||!Array.isArray(body.positions)||!Array.isArray(body.orders))throw new Error('MT5_PROVIDER_SNAPSHOT_INVALID');
 const reads=body.reads as Record<string,unknown>|undefined;
 if(reads?.positions!==true||reads?.orders!==true)throw new Error('MT5_PROVIDER_READS_INCOMPLETE');
 return s;
}
