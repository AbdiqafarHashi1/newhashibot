import type { IncomingMessage, ServerResponse } from "node:http";
export interface HealthMetadata { service:string; revision:string; buildId:string; image:string; contractVersions:Record<string,number>; environment?:"demo"; runtimeMode?:"shadow"; mutationAuthorized?:false; }
export interface Readiness { initialized:boolean; configurationValid:boolean; dependencies:Record<string,boolean>; }
const send=(res:ServerResponse,status:number,payload:unknown)=>{res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(payload));};
export function healthHandler(meta:HealthMetadata,ready:()=>Readiness){return(req:IncomingMessage,res:ServerResponse):boolean=>{
  if(req.method!=="GET")return false;
  if(req.url==="/health/live"){send(res,200,{status:"live",service:meta.service});return true;}
  if(req.url==="/health/ready"){const state=ready();const ok=state.initialized&&state.configurationValid&&Object.values(state.dependencies).every(Boolean);send(res,ok?200:503,{status:ok?"ready":"not_ready",service:meta.service,...state});return true;}
  if(req.url==="/health/version"){send(res,200,{service:meta.service,revision:meta.revision,build_id:meta.buildId,image:meta.image,contract_versions:meta.contractVersions,environment:meta.environment??"demo",runtime_mode:meta.runtimeMode??"shadow",mutation_authorized:meta.mutationAuthorized??false});return true;}
  return false;
};}
