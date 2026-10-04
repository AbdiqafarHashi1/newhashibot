export interface CertificationDispatchTransport{dispatch(input:{provider:string;accountId:string;plan:Record<string,unknown>;idempotencyKey:string}):Promise<{accepted:boolean;canonicalId?:string;state:string}>}
/** Disabled-by-default adapter into existing Phase E/F boundaries. */
export async function dispatchPhaseNCertification(input:{enabled:boolean;provider:string;accountId:string;plan:Record<string,unknown>|null;idempotencyKey:string;transport:CertificationDispatchTransport}){
 if(!input.enabled)throw new Error("CERTIFICATION_DEMO_DISPATCH_DISABLED");if(!input.plan)throw new Error("IMMUTABLE_EXECUTION_PLAN_REQUIRED");
 if(String(input.plan.execution_account_id??input.plan.account_id)!==input.accountId)throw new Error("EXECUTION_PLAN_ACCOUNT_MISMATCH");
 const decision=String(input.plan.phase_d_decision??input.plan.decision??"");if(!["ALLOW","REDUCE"].includes(decision))throw new Error("PHASE_D_DECISION_NOT_EXECUTABLE");
 const result=await input.transport.dispatch({provider:input.provider,accountId:input.accountId,plan:input.plan,idempotencyKey:input.idempotencyKey});if(!result.accepted)throw new Error(`CERTIFICATION_DISPATCH_REJECTED:${result.state}`);return Object.freeze(result);
}
