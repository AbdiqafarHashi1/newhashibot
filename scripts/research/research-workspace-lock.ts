import {openSync,writeFileSync,closeSync,readFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {writeFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
/** One writer per input workspace, including individual and combined campaign outputs. */
export function acquireResearchWorkspace(directory:string){
 mkdirSync(directory,{recursive:true});const path=join(directory,'.hashibot-research.lock'),owner=JSON.stringify({pid:process.pid,token:randomUUID()});let fd:number;
 try{fd=openSync(path,'wx',0o600);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw Error(`RESEARCH_WORKSPACE_BUSY:${path}; stop the existing writer before retrying. Remove a stale lock only after verifying its recorded PID is no longer running.`);throw error;}
 try{writeFileSync(fd,owner);}finally{closeSync(fd);}
 let released=false;const release=()=>{if(released)return;released=true;try{if(readFileSync(path,'utf8')===owner)unlinkSync(path);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}};
 process.once('exit',release);process.once('SIGINT',()=>{release();process.exit(130);});process.once('SIGTERM',()=>{release();process.exit(143);});return {path,release};
}
export async function writeResearchJson(path:string,value:unknown){const temporary=`${path}.writing-${process.pid}-${randomUUID()}`;try{await writeFile(temporary,JSON.stringify(value,null,2)+'\n');await rename(temporary,path);}finally{await rm(temporary,{force:true});}}
