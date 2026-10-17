import {build} from 'esbuild';import {readdir,access} from 'node:fs/promises';
let passed=0,failed=0;
for(const entry of await readdir('supabase/functions',{withFileTypes:true})){if(!entry.isDirectory()||entry.name.startsWith('_'))continue;const path=`supabase/functions/${entry.name}/index.ts`;try{await access(path)}catch{continue}try{await build({entryPoints:[path],bundle:true,platform:'neutral',format:'esm',write:false,external:['npm:*','jsr:*','https:*','node:*'],logLevel:'silent'});passed++}catch(error){failed++;console.error('FAIL',path,error.message)}}
console.log(JSON.stringify({passed,failed,scope:'local dependency bundling; external runtime imports are not executed'}));if(failed)process.exitCode=1;
