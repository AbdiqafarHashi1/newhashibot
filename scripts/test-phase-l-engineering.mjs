import {readdirSync,mkdirSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildSync} from 'esbuild';
// Mission 1 engineering does not certify removed, frozen historical research archives.
// The original test:phase-l remains strict and unchanged for archival/qualification review.
const archiveAudits=new Set(['governorEvidence.test.ts','majorBreakoutEvidence.test.ts','nicheActivityEvidence.test.ts','spotSwingEvidence.test.ts','scannerParticipationEvidence.test.ts','cryptoTeamEvidence.test.ts','regimeGapEvidence.test.ts','literatureEvidence.test.ts','cryptoRoleEvidence.test.ts','altConnectedEvidence.test.ts']);
const files=readdirSync('tests/phaseL').filter(f=>f.endsWith('.test.ts')).sort(),directory='.tmp/phase-l-engineering';
mkdirSync(directory,{recursive:true});let passed=0;
try{
 for(const file of files){
  if(archiveAudits.has(file)){console.log(`DEFERRED_ARCHIVE_AUDIT: ${file} (Mission 2; requires authentic removed .gz inputs)`);continue;}
  const out=`${directory}/${file.replace(/\.ts$/,'.mjs')}`;
  buildSync({entryPoints:[`tests/phaseL/${file}`],bundle:true,platform:'node',format:'esm',outfile:out});
  execFileSync(process.execPath,[out],{stdio:'inherit'});passed++;
 }
 console.log(JSON.stringify({scope:'Mission 1 Phase L engineering; no historical qualification',passed,archiveAuditsDeferred:archiveAudits.size,fullArchiveAuditCommand:'npm run test:phase-l'}));
}finally{rmSync(directory,{recursive:true,force:true});}
