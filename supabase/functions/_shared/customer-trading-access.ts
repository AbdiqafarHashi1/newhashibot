/** Customer reports remain readable; only Admin can change trading configuration. */
const CUSTOMER_ACTIONS=new Set(['load_onboarding','recommend_brain','account_detail','account_policy','pairing_status','refresh_readiness','create_support_request','request_additional_account']);
export function customerTradingActionAllowed(role:string|undefined,action:string):boolean{return role==='admin'||CUSTOMER_ACTIONS.has(action);}
