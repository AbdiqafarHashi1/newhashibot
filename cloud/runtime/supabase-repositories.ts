import { SupabaseServerBoundary } from "../shared/supabase/index.ts";
import type { VersionedResult } from "./repositories.ts";
/** Server-only Phase 12 adapter. It uses existing REST/RPC contracts and is never instantiated by production routing. */
export class SupabaseRepositoryAdapter{
  constructor(private db:SupabaseServerBoundary){}
  async query<T>(path:string):Promise<VersionedResult<T>>{try{return{ok:true,value:await this.db.query<T>(path),errorCode:null};}catch(e){return{ok:false,value:null,errorCode:String(e).includes("TIMEOUT")?"TIMEOUT":"SUPABASE_READ_FAILED"};}}
  async rpc<TIn extends Record<string,unknown>,TOut>(name:string,input:TIn):Promise<VersionedResult<TOut>>{try{return{ok:true,value:await this.db.rpc<TIn,TOut>(name,input),errorCode:null};}catch(e){return{ok:false,value:null,errorCode:String(e).includes("409")?"STALE_VERSION":"SUPABASE_RPC_FAILED"};}}
}
