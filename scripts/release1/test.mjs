import {build} from 'esbuild';
import {mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
mkdirSync('.tmp/release1',{recursive:true});
const engineering=process.argv.includes('--engineering');
for(const name of ['publication','journey','whop','regime','intraday15','opportunityRuntime','catalystWatch','labPersistence','diagnosisEvidence']){
 if(engineering&&name==='diagnosisEvidence'){console.log('DEFERRED_ARCHIVE_AUDIT: diagnosisEvidence (Mission 2; strict npm run test:release1 remains unchanged)');continue;}
 const output=`.tmp/release1/${name}.mjs`;
 await build({entryPoints:[`tests/release1/${name}.test.ts`],bundle:true,platform:'node',format:'esm',packages:'external',alias:{'npm:standardwebhooks@1.0.0':'standardwebhooks'},outfile:output});
 const result=spawnSync(process.execPath,[output],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
}
