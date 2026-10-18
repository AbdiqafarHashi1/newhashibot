type Requester=(method:'GET'|'POST',path:string,params:Record<string,string|number|boolean>)=>Promise<any>;
/** Verify native symbol configuration; a configuration ACK is never an order ACK. */
export async function applyBinanceCertifiedConfiguration(operation:string,payload:Readonly<Record<string,unknown>>,request:Requester){
 const symbol=String(payload.symbol??'');if(!/^[A-Z0-9]{3,32}$/.test(symbol))throw Error('BINANCE_CONFIGURATION_SYMBOL_REQUIRED');
 const observe=async()=>{const rows=await request('GET','/fapi/v2/positionRisk',{symbol});if(!Array.isArray(rows)||rows.length!==1||rows[0].symbol!==symbol||rows[0].positionSide!=='BOTH'||rows[0].positionAmt==null||!Number.isFinite(Number(rows[0].positionAmt))||Number(rows[0].positionAmt)!==0)throw Error('BINANCE_FLAT_ONE_WAY_CONFIGURATION_REQUIRED');return rows[0]};
 if(operation==='SET_MARGIN_MODE'||operation==='VERIFY_PRECONFIGURED_MARGIN_MODE'){
  const desired=String(payload.marginType??payload.requiredMarginMode??'').toUpperCase().replace('CROSSED','CROSS');if(!['CROSS','ISOLATED'].includes(desired))throw Error('BINANCE_MARGIN_MODE_UNSUPPORTED');
  const matches=(row:any)=>String(row.marginType??'').toUpperCase()===desired;
  if(matches(await observe()))return;
  if(operation==='VERIFY_PRECONFIGURED_MARGIN_MODE')throw Error('BINANCE_PRECONFIGURED_MARGIN_MISMATCH');
  try{await request('POST','/fapi/v1/marginType',{symbol,marginType:desired==='CROSS'?'CROSSED':'ISOLATED'})}catch{/* Source readback decides an uncertain result. */}
  if(!matches(await observe()))throw Error('BINANCE_MARGIN_MODE_NOT_CONFIRMED');return;
 }
 if(!['SET_LEVERAGE','VERIFY_PRECONFIGURED_LEVERAGE'].includes(operation))throw Error('BINANCE_CONFIGURATION_ACTION_UNSUPPORTED');
 const leverage=Number(payload.leverage??payload.requiredLeverage);if(!Number.isInteger(leverage)||leverage<1||leverage>125)throw Error('BINANCE_APPROVED_LEVERAGE_REQUIRED');
 if(Number((await observe()).leverage)===leverage)return;
 if(operation==='VERIFY_PRECONFIGURED_LEVERAGE')throw Error('BINANCE_PRECONFIGURED_LEVERAGE_MISMATCH');
 try{await request('POST','/fapi/v1/leverage',{symbol,leverage})}catch{/* Never treat an ACK/timeout as observed configuration. */}
 if(Number((await observe()).leverage)!==leverage)throw Error('BINANCE_LEVERAGE_NOT_CONFIRMED');
}
