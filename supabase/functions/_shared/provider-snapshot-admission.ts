/** A malformed or partial provider response must never become a flat account. */
export function admitProviderPositions(value: unknown, provider: 'binance'|'bybit') {
 if(!Array.isArray(value))throw new Error('PROVIDER_POSITIONS_MALFORMED');
 for(const row of value){
  const size=row?.[provider==='binance'?'positionAmt':'size'];
  if(!row||typeof row!=='object'||typeof row.symbol!=='string'||!row.symbol||size===null||size===undefined||size===''||!Number.isFinite(Number(size))||(provider==='bybit'&&Number(size)<0))throw new Error('PROVIDER_POSITION_MALFORMED');
 }
 return value as Record<string,unknown>[];
}
export function admitBinanceConditionalOrders(value:unknown){
 const rows=Array.isArray(value)?value:(value as {orders?:unknown}|null)?.orders;
 if(!Array.isArray(rows))throw new Error('PROVIDER_CONDITIONAL_ORDERS_MALFORMED');
 for(const row of rows)if(!row||typeof row!=='object'||typeof row.symbol!=='string'||!row.symbol)throw new Error('PROVIDER_CONDITIONAL_ORDER_MALFORMED');
 return rows;
}

/** Provider financial fields are observations; missing values must not coerce to zero. */
export function observedFinancialNumber(value:unknown,field:string,minimum=0){
 if(value===null||value===undefined||typeof value==='boolean'||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<minimum)throw Error(`PROVIDER_FINANCIAL_FIELD_REQUIRED:${field}`);
 return Number(value);
}
