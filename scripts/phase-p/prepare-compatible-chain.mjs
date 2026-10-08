import {mkdirSync,readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {compatibleSql,compatibility} from './compatibility.mjs';
import {hash} from './sql-inventory.mjs';
const output=process.argv[2];
if(!output||!resolve(output).startsWith(resolve('work')+'/')||existsSync(output))throw Error('NEW_IGNORED_WORK_DIRECTORY_REQUIRED');
mkdirSync(output,{recursive:true});
const files=[];
for(const name of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
 const identity=`supabase/migrations/${name}`,source=readFileSync(identity,'utf8'),result=compatibleSql(identity,source,compatibility.id);
 writeFileSync(`${output}/${name}`,result.sql);
 files.push({identity,sourceSha256:hash(source),executedSha256:hash(result.sql),compatibility:result.changed});
}
writeFileSync(`${output}/execution-ledger.json`,JSON.stringify({status:'PREPARED_ONLY_NOT_EXECUTED',compatibilityId:compatibility.id,orderedFiles:files,preparedManualIncluded:false,historyWrites:false,activationAllowed:false},null,2)+'\n');
console.log(JSON.stringify({status:'PREPARED_ONLY_NOT_EXECUTED',directory:output,files:files.length}));
