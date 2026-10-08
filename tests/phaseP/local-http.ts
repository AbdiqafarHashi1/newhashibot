import {request} from 'node:http';
/** HTTP transport confined to the disposable loopback test services. External traffic keeps session proxy policy. */
export const localFetch:typeof fetch=async(input,init)=>{
 const url=new URL(input instanceof Request?input.url:String(input));
 if(url.protocol!=='http:'||!['localhost','127.0.0.1','auth','rest'].includes(url.hostname))throw Error('LOCAL_TEST_HTTP_ONLY');
 const headers=Object.fromEntries(new Headers(init?.headers??(input instanceof Request?input.headers:undefined)));
 return new Promise((resolve,reject)=>{const req=request(url,{method:init?.method??(input instanceof Request?input.method:'GET'),headers,signal:init?.signal??undefined},res=>{const chunks:Buffer[]=[];res.on('data',c=>chunks.push(Buffer.from(c)));res.on('end',()=>resolve(new Response([204,205,304].includes(res.statusCode!)?null:Buffer.concat(chunks),{status:res.statusCode,headers:Object.fromEntries(Object.entries(res.headers).filter(([,v])=>v!==undefined).map(([k,v])=>[k,Array.isArray(v)?v.join(','):v!]))})));});req.on('error',reject);req.end(init?.body??undefined);});
};
