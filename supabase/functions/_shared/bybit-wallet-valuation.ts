import {observedFinancialNumber} from './provider-snapshot-admission.ts';
const positive=(v:unknown,name:string)=>{const n=observedFinancialNumber(v,name);if(n<=0)throw Error(`POSITIVE_${name}_REQUIRED`);return n};
/** USD account totals remain USD. The wallet itself supplies the USDT valuation. */
export function observedBybitQuoteConversion(raw:any){
 const accounts=raw?.wallet?.list;if(!Array.isArray(accounts)||accounts.length!==1||accounts[0].accountType!=='UNIFIED'||!Array.isArray(accounts[0].coin))throw Error('BYBIT_UNIFIED_WALLET_REQUIRED');
 const coins=accounts[0].coin,usdt=coins.filter((c:any)=>c.coin==='USDT');if(usdt.length!==1)throw Error('BYBIT_USDT_VALUATION_REQUIRED');
 for(const c of coins){if(c.coin==='USDT')continue;for(const field of ['equity','walletBalance','usdValue','borrowAmount'])if(observedFinancialNumber(c[field],field)!==0)throw Error('BYBIT_SINGLE_COLLATERAL_REQUIRED');}
 const coin=usdt[0],equity=positive(coin.equity,'USDT_EQUITY'),usd=positive(coin.usdValue,'USDT_USD_VALUE');
 if(Number(coin.walletBalance)!==equity||observedFinancialNumber(coin.unrealisedPnl,'USDT_UPL')!==0||observedFinancialNumber(coin.borrowAmount,'USDT_BORROW')!==0||observedFinancialNumber(coin.spotBorrow,'USDT_SPOT_BORROW')!==0||Math.abs(usd-positive(raw.account_wallet_balance,'WALLET_USD'))>1e-6||Math.abs(usd-positive(raw.account_equity,'EQUITY_USD'))>1e-6||observedFinancialNumber(raw.account_initial_margin,'INITIAL_MARGIN')!==0||observedFinancialNumber(raw.account_unrealized_pnl,'UPL')!==0)throw Error('BYBIT_UNENCUMBERED_FLAT_WALLET_REQUIRED');
 return usd/equity;
}
