type Requester=(method:'GET'|'POST',path:string,params:Record<string,string|number|boolean>)=>Promise<any>;
/** Configuration instructions are not orders. Read native account/position state before acknowledging them. */
export async function applyBybitCertifiedConfiguration(operation:string,payload:Readonly<Record<string,unknown>>,request:Requester){
 const symbol=String(payload.symbol??'');if(!/^[A-Z0-9]{3,32}$/.test(symbol)||payload.category!=='linear')throw Error('BYBIT_CONFIGURATION_SYMBOL_REQUIRED');
 if(operation==='VERIFY_PRECONFIGURED_MARGIN_MODE'||operation==='SET_MARGIN_MODE'){
  const mode=payload.requiredMarginMode==='ISOLATED'?'ISOLATED_MARGIN':payload.requiredMarginMode==='CROSS'?'REGULAR_MARGIN':null;if(!mode)throw Error('BYBIT_MARGIN_MODE_UNSUPPORTED');
  const current=await request('GET','/v5/account/info',{});
  // A global margin-mode change can affect unrelated positions/assets. Require the owner to configure it explicitly.
  if(current?.marginMode!==mode)throw Error('BYBIT_ACCOUNT_MARGIN_MODE_REQUIRES_OWNER_CONFIGURATION');
  return;
 }
 if(operation!=='VERIFY_PRECONFIGURED_LEVERAGE'&&operation!=='SET_LEVERAGE')throw Error('BYBIT_CONFIGURATION_ACTION_UNSUPPORTED');
 const leverage=Number(payload.requiredLeverage??payload.leverage??payload.authorized_leverage);if(!Number.isFinite(leverage)||leverage<=0)throw Error('BYBIT_APPROVED_LEVERAGE_REQUIRED');
 const observe=async()=>{const response=await request('GET','/v5/position/list',{category:'linear',symbol});const rows=response?.list;
  if(!Array.isArray(rows)||rows.length!==1||rows[0].symbol!==symbol||Number(rows[0].positionIdx)!==0||rows[0].size==null||!Number.isFinite(Number(rows[0].size))||Number(rows[0].size)!==0)throw Error('BYBIT_FLAT_ONE_WAY_CONFIGURATION_REQUIRED');return rows[0]};
 const before=await observe();if(Number(before.leverage)===leverage)return;
 if(operation==='VERIFY_PRECONFIGURED_LEVERAGE')throw Error('BYBIT_PRECONFIGURED_LEVERAGE_MISMATCH');
 try{await request('POST','/v5/position/set-leverage',{category:'linear',symbol,buyLeverage:String(leverage),sellLeverage:String(leverage)})}catch{/* Only the source read below can confirm an uncertain setting. */}
 const after=await observe();if(Number(after.leverage)!==leverage)throw Error('BYBIT_LEVERAGE_NOT_CONFIRMED');
}
