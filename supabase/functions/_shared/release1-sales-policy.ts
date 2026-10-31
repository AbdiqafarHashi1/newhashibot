/** Product/price authority is server-owned. Activation is separate from credential presence. */
export function release1SaleDecision(input: {product:string;provider:string;currency:string;termDays?:number;amountMinor:number;salesEnabled:boolean;promotedStrategies:number;release2Enabled?:boolean;analysisServiceReady?:boolean}) {
 if(input.product==='FOUNDING_AUTO_EXECUTION'){if(!input.release2Enabled)return 'RELEASE2_NOT_AVAILABLE';if(input.provider==='MPESA'&&(input.currency!=='KES'||input.termDays!==30||input.amountMinor<=0))return 'APPROVED_EXECUTION_PRICE_REQUIRED';return ['WHOP','MPESA'].includes(input.provider)?null:'UNSUPPORTED_PROVIDER';}
 if(input.product!=='VIP_SIGNALS')return 'UNSUPPORTED_PRODUCT';
 if(!input.salesEnabled)return 'RELEASE1_SALES_PAUSED';
 if(!input.analysisServiceReady&&input.promotedStrategies<1)return 'STRATEGY_CERTIFICATION_REQUIRED';
 if(input.provider==='MPESA' && (input.currency!=='KES'||input.termDays!==30||input.amountMinor!==350000))return 'OFFICIAL_VIP_PRICE_REQUIRED';
 if(input.provider==='WHOP' && (input.currency!=='USD'||input.amountMinor!==2900))return 'OFFICIAL_VIP_PRICE_REQUIRED';
 return ['MPESA','WHOP'].includes(input.provider)?null:'UNSUPPORTED_PROVIDER';
}
