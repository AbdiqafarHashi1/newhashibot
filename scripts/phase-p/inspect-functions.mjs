import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {closure} from './deployment-manifest.mjs';
import {hash} from './sql-inventory.mjs';
export function fingerprintFunction(root,name){
 if(!/^[a-z][a-z0-9-]+$/.test(name))throw Error('FUNCTION_NAME_INVALID');
 const result=closure(root,join(root,'supabase/functions',name,'index.ts'));
 if(result.missing.length||/\bimport\s*\(\s*[^'"\s]/.test(result.code))return {name,status:'AMBIGUOUS_SOURCE_CLOSURE',missing:result.missing};
 return {name,status:'CAPTURED_SOURCE_CLOSURE',closureSha256:hash(JSON.stringify(result.files)),files:result.files,externalImports:result.external};
}
async function main(){
 const args=process.argv.slice(2),get=flag=>args[args.indexOf(flag)+1];
 if(!args.includes('--online-read-only')||!args.includes('--observed')||!args.includes('--output'))throw Error('EXPLICIT_READ_ONLY_CAPTURE_FLAGS_REQUIRED');
 const observed=JSON.parse(readFileSync(get('--observed'),'utf8')),project=observed.projectRef;
 if(!/^[a-z]{20}$/.test(project)||!process.env.SUPABASE_ACCESS_TOKEN)throw Error('IDENTIFIED_PROJECT_AND_MANAGEMENT_CREDENTIAL_REQUIRED');
 const cli=process.env.SUPABASE_CLI??'supabase';
 if(execFileSync(cli,['--version'],{encoding:'utf8'}).trim()!=='2.120.0')throw Error('VERIFIED_CLI_2_120_0_REQUIRED');
 const readMetadata=async()=>{const response=await fetch(`https://api.supabase.com/v1/projects/${project}/functions`,{headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('FUNCTION_METADATA_READ_FAILED');return response.json();};
 const before=await readMetadata(),rows=[];
 for(const metadata of before){
  const name=metadata.slug??metadata.name;if(!/^[a-z][a-z0-9-]+$/.test(name))throw Error('FUNCTION_NAME_INVALID');if(metadata.version==null)throw Error('DEPLOYED_VERSION_UNKNOWN');
  // Separate directories prevent different deployed versions of shared modules
  // from overwriting each other or the repository source. No deploy command.
  const root=resolve('work/phase-p/online-function-source',project,name);mkdirSync(root,{recursive:true});
  execFileSync(cli,['functions','download',name,'--project-ref',project,'--use-api','--workdir',root],{cwd:root,stdio:['ignore','pipe','pipe']});
  rows.push({...fingerprintFunction(root,name),version:metadata.version,verifyJwt:typeof metadata.verify_jwt==='boolean'?metadata.verify_jwt:'UNKNOWN'});
 }
 const after=await readMetadata(),identity=items=>items.map(f=>[f.slug??f.name,f.version,f.verify_jwt??'UNKNOWN']).sort((a,b)=>a[0].localeCompare(b[0]));
 if(JSON.stringify(identity(before))!==JSON.stringify(identity(after)))throw Error('DEPLOYED_VERSION_CHANGED_DURING_CAPTURE');
 observed.deployedFunctions={status:rows.every(r=>r.status==='CAPTURED_SOURCE_CLOSURE')?'VERIFIED_ARTIFACT_FINGERPRINTS':'AMBIGUOUS_SOURCE_CLOSURES',capture:'CLI_DOWNLOAD_2_120_0_USE_API_METADATA_VERSIONS_STABLE',data:rows.sort((a,b)=>a.name.localeCompare(b.name))};
 mkdirSync(dirname(get('--output')),{recursive:true});writeFileSync(get('--output'),JSON.stringify(observed,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({status:observed.deployedFunctions.status,functions:rows.length,output:get('--output')}));
 if(observed.deployedFunctions.status!=='VERIFIED_ARTIFACT_FINGERPRINTS')process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('FUNCTION_CAPTURE_REFUSED: check pinned CLI, project identity, permissions, downloaded module layout and version stability. No deployment occurred; no credential values are logged.');process.exitCode=1;});
