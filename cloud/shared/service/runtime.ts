import { createServer, type Server } from "node:http";
import { loadConfig, type CloudConfig } from "../config/index.ts";
import { createLogger } from "../logging/index.ts";
import { healthHandler, type Readiness } from "../health/index.ts";

export interface ServiceRuntime { config:CloudConfig; server:Server; start():Promise<number>; shutdown(signal?:string):Promise<void>; readiness:Readiness; }
export function createService(service:string,env:Record<string,string|undefined>=process.env):ServiceRuntime{
  const config=loadConfig({...env,HASHIBOT_SERVICE:env.HASHIBOT_SERVICE||service});
  if(config.service!==service)throw new Error(`Service identity mismatch: expected ${service}`);
  const log=createLogger({service,revision:config.revision,environment:config.environment});
  const readiness:Readiness={initialized:false,configurationValid:true,dependencies:{}};
  const health=healthHandler({service,revision:config.revision,buildId:config.buildId,image:env.IMAGE_DIGEST||"local",contractVersions:{events:1}},()=>readiness);
  const server=createServer((req,res)=>{if(health(req,res))return;res.writeHead(404,{"content-type":"application/json"});res.end(JSON.stringify({error:"not_found"}));});
  return {config,server,readiness,async start(){
    // Phase 10 deliberately registers no workers or production dependencies.
    readiness.initialized=true;
    await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(config.port,"0.0.0.0",()=>resolve());});
    const address=server.address();const port=typeof address==="object"&&address?address.port:config.port;log("INFO","Service started",{outcome:"healthy",runtime_id:`${service}:${config.revision}`,port});return port;
  },async shutdown(signal="SIGTERM"){readiness.initialized=false;await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));log("NOTICE","Service stopped",{outcome:"graceful_shutdown",signal});}};
}

export async function runService(service:string){
  const runtime=createService(service);await runtime.start();
  let stopping=false;const stop=async(signal:string)=>{if(stopping)return;stopping=true;await runtime.shutdown(signal);};
  process.once("SIGTERM",()=>void stop("SIGTERM"));process.once("SIGINT",()=>void stop("SIGINT"));
  return runtime;
}
