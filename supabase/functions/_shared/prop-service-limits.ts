/** HashiBot product limit; historical research can model larger accounts separately. */
export const PROP_SERVICE_MAX_INITIAL_USD=25000;
export function assertPropServiceCapital(initial:unknown,currency:unknown){
 if(currency!=='USD')throw Error('PROP_SERVICE_USD_ACCOUNT_REQUIRED');
 if(typeof initial!=='number'||!Number.isFinite(initial)||initial<=0||initial>PROP_SERVICE_MAX_INITIAL_USD)throw Error('PROP_SERVICE_MAX_INITIAL_USD_25000');
}
