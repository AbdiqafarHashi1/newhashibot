import type { ExecutionCommand, ProviderReceipt } from "./types.ts";
export interface DemoProviderAdapter {readonly provider:"BINANCE"|"BYBIT"|"MT5";validate(command:ExecutionCommand):readonly string[];execute(command:ExecutionCommand):Promise<ProviderReceipt>;reconcile(command:ExecutionCommand):Promise<ProviderReceipt|null>;health():Promise<{healthy:boolean}>;}
export class DeterministicProviderAdapter implements DemoProviderAdapter{
  private receipts=new Map<string,ProviderReceipt>();constructor(readonly provider:"BINANCE"|"BYBIT"|"MT5",private mode:"fill"|"unknown"|"reject"="fill",private now=()=>new Date().toISOString()){}
  validate(c:ExecutionCommand){const e:string[]=[];if(c.provider!==this.provider)e.push("PROVIDER_MISMATCH");if(c.quantity<=0)e.push("INVALID_QUANTITY");if(c.stop<=0||c.tp1<=0||c.tp2<=0)e.push("INVALID_PROTECTION");return e;}
  async execute(c:ExecutionCommand){const prior=this.receipts.get(c.idempotencyKey);if(prior)return{...prior,status:"DUPLICATE" as const};const status=this.mode==="fill"?"FILLED":this.mode==="unknown"?"UNKNOWN":"REJECTED";const r:ProviderReceipt={commandId:c.commandId,provider:this.provider,status,providerOrderId:status==="FILLED"?`${this.provider}-${c.commandId}`:null,fillPrice:status==="FILLED"?c.entry:null,reason:status==="UNKNOWN"?"PROVIDER_RESULT_UNKNOWN":status==="REJECTED"?"TEST_REJECTION":null,at:this.now()};this.receipts.set(c.idempotencyKey,r);return r;}
  async reconcile(c:ExecutionCommand){return this.receipts.get(c.idempotencyKey)??null;}async health(){return{healthy:true};}
}
export class BinanceDemoAdapter extends DeterministicProviderAdapter{constructor(mode:"fill"|"unknown"|"reject"="fill"){super("BINANCE",mode);}}
export class BybitDemoAdapter extends DeterministicProviderAdapter{constructor(mode:"fill"|"unknown"|"reject"="fill"){super("BYBIT",mode);}}
export class MT5DemoAdapter extends DeterministicProviderAdapter{constructor(mode:"fill"|"unknown"|"reject"="fill"){super("MT5",mode);}}
