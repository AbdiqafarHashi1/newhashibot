export const PERSONAL_CAPITAL_NOTICE='Personal Automated Execution costs $100/month per account. Recommended capital: $2,000+. Below $1,500, the flat fee can erode net returns. Consider VIP Telegram Signals or a firm challenge with $25k–$100k stated account capital; challenge fees and rules apply. HashiBot automated Prop onboarding currently supports up to $25k.';
export function personalCapitalSuitability(mode:string,equity:unknown,currency:unknown){
 if(mode!=='PERSONAL')return {warning:false,code:'NOT_PERSONAL',notice:null};
 if(!['USD','USDT','USDC'].includes(String(currency).toUpperCase())||typeof equity!=='number'||!Number.isFinite(equity))return {warning:false,code:'USD_EQUITY_UNAVAILABLE',notice:PERSONAL_CAPITAL_NOTICE};
 return {warning:equity<1500,code:equity<1500?'PERSONAL_CAPITAL_BELOW_1500':'PERSONAL_CAPITAL_OBSERVED',notice:PERSONAL_CAPITAL_NOTICE,monthlyFeePct:equity>0?100/equity*100:null,recommendedMinimum:2000};
}
