export interface SupabaseBoundaryOptions { url:string; serverCredential:string; timeoutMs:number; retryLimit:number; correlationId:()=>string; log:(severity:"INFO"|"WARNING"|"ERROR",message:string,fields?:Record<string,unknown>)=>void; fetch?:typeof globalThis.fetch; }
export class SupabaseServerBoundary {
  private fetcher: typeof globalThis.fetch;
  constructor(private options: SupabaseBoundaryOptions) { this.fetcher=options.fetch ?? globalThis.fetch; if (!options.serverCredential) throw new Error("server credential required"); }
  async rpc<TIn extends Record<string,unknown>, TOut>(name:string,input:TIn):Promise<TOut>{ return this.request(`/rest/v1/rpc/${encodeURIComponent(name)}`,"POST",input); }
  async query<T>(path:string):Promise<T>{ if (!path.startsWith("/rest/v1/")) throw new Error("query path must target REST boundary"); return this.request(path,"GET"); }
  private async request<T>(path:string,method:string,body?:unknown):Promise<T>{
    for(let attempt=0;;attempt++) try {
      const correlationId=this.options.correlationId(); const response=await this.fetcher(`${this.options.url}${path}`,{method,headers:{apikey:this.options.serverCredential,Authorization:`Bearer ${this.options.serverCredential}`,"Content-Type":"application/json","x-hashibot-correlation-id":correlationId},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(this.options.timeoutMs)});
      if(!response.ok){const error=new Error(`SUPABASE_HTTP_${response.status}`); if(response.status>=500&&(attempt<this.options.retryLimit)) throw error; throw error;}
      this.options.log("INFO","Supabase request completed",{correlation_id:correlationId,path,status:response.status}); return await response.json() as T;
    } catch(error) { const retryable=/timeout|SUPABASE_HTTP_5|ECONN/i.test(String(error)); if(!retryable||attempt>=this.options.retryLimit) throw error; this.options.log("WARNING","Retrying Supabase request",{attempt,error_code:"SUPABASE_RETRY"}); }
  }
}
