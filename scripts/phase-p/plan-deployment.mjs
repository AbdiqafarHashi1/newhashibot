import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash} from './sql-inventory.mjs';
import {buildManifest} from './deployment-manifest.mjs';
import {schemaFingerprint,canonical} from './inspect-deployment.mjs';
export function plan(manifest,observed,reference){
 const blockers=[],add=x=>blockers.push(x),automatic=manifest.migrations.filter(m=>m.automaticCandidate);
 if(manifest.timestampCollisions.length)add('DUPLICATE_MIGRATION_IDENTITIES');
 if(!observed||!reference)add('OBSERVATION_AND_REHEARSED_REFERENCE_REQUIRED');
 if(reference?.fullChainStatus!=='PASSED')add('FULL_CHAIN_REHEARSAL_NOT_PASSED');
 if(reference?.reviewed!==true)add('REVIEWED_REFERENCE_REQUIRED');
 if(observed?.status!=='PASSED'||reference?.snapshot?.status!=='PASSED')add('INCOMPLETE_CATALOG_INSPECTION');
 if(observed?.consistency!=='SINGLE_REPEATABLE_READ_TRANSACTION'||reference?.snapshot?.consistency!=='SINGLE_REPEATABLE_READ_TRANSACTION')add('INCONSISTENT_CATALOG_SNAPSHOT');
 const history=observed?.sections?.history;
 if(history?.status!=='PRESENT'||!Array.isArray(history.data))add('MIGRATION_HISTORY_UNKNOWN');
 const rows=history?.data??[],byVersion=new Map(automatic.map(m=>[m.version,m]));
 const proof=new Map((reference?.historyProof??[]).map(p=>[p.version,p]));
 if(reference?.sourceRef!==manifest.sourceRef)add('REFERENCE_SOURCE_MISMATCH');
 if(reference?.sourceFingerprint!==manifest.sourceFingerprint)add('REFERENCE_SOURCE_BYTES_MISMATCH');
 if(reference?.projectRef!==observed?.projectRef)add('PROJECT_IDENTITY_MISMATCH');
 if(reference?.connectionBinding?.reviewed!==true||reference?.connectionBinding?.projectRef!==observed?.projectRef||reference?.connectionBinding?.schemaFingerprint!==observed?.schemaFingerprint)add('DATABASE_PROJECT_BINDING_UNVERIFIED');
 const seen=new Set();let last=-1;
 for(const row of rows){
  if(seen.has(row.version)){add(`DUPLICATE_REMOTE_VERSION:${row.version}`);continue;}seen.add(row.version);
  const migration=byVersion.get(row.version);if(!migration){add(`UNKNOWN_REMOTE_HISTORY:${row.version}`);continue;}
  const index=automatic.indexOf(migration);if(index!==last+1)add(`NON_PREFIX_HISTORY:${row.version}`);last=index;
  const evidence=proof.get(row.version);
  if(!row.statementsFingerprint||!evidence||evidence.sourceSha256!==migration.sha256||evidence.statementsFingerprint!==row.statementsFingerprint||evidence.reviewed!==true)add(`AMBIGUOUS_HISTORY_CONTENT:${row.version}`);
 }
 // A reference must reproduce this exact applied prefix, with proof of source
 // bytes and stored statements. A full-head snapshot cannot excuse prefix drift.
 if(reference?.appliedVersions&&JSON.stringify(reference.appliedVersions)!==JSON.stringify(rows.map(r=>r.version)))add('REFERENCE_PREFIX_MISMATCH');
 else if(!reference?.appliedVersions)add('REFERENCE_PREFIX_UNKNOWN');
 if(observed?.sections&&reference?.snapshot?.sections){
  for(const key of ['relations','columns','routines','constraints','indexes','policies','triggers','grants','roles','memberships','defaultGrants','configurationPresence','platform'])if(observed.sections[key]?.status!=='PRESENT'||reference.snapshot.sections[key]?.status!=='PRESENT')add(`MANDATORY_CATALOG_UNKNOWN:${key}`);
  const actual=schemaFingerprint(observed.sections),expected=schemaFingerprint(reference.snapshot.sections);
  if(observed.schemaFingerprint!==actual||reference.snapshot.schemaFingerprint!==expected)add('INVALID_SNAPSHOT_FINGERPRINT');
  if(actual!==expected)add('SCHEMA_DEFINITION_OR_ACL_DRIFT');
  if(JSON.stringify(canonical(observed.sections.platform))!==JSON.stringify(canonical(reference.snapshot.sections.platform)))add('PLATFORM_VERSION_OR_EXTENSION_DRIFT');
  for(const key of ['cron','storageBuckets','storageObjectCounts','vault'])if(JSON.stringify(canonical(observed.sections[key]))!==JSON.stringify(canonical(reference.snapshot.sections[key])))add(`METADATA_DRIFT_REVIEW_REQUIRED:${key}`);
 }
 if(observed?.deployedFunctions?.status!=='VERIFIED_ARTIFACT_FINGERPRINTS')add('DEPLOYED_FUNCTION_SOURCE_UNKNOWN');
 else{
  const deployed=observed.deployedFunctions.data;
  if(!Array.isArray(deployed)||deployed.some(f=>!f.closureSha256))add('DEPLOYED_FUNCTION_FINGERPRINTS_MISSING');
  if(deployed?.some(f=>typeof f.verifyJwt!=='boolean'))add('DEPLOYED_FUNCTION_JWT_POLICY_UNKNOWN');
  if(deployed?.some(f=>!manifest.functions.some(m=>m.name===f.name)))add('UNKNOWN_DEPLOYED_FUNCTION');
  // Changed/missing source is a planned deploy, but JWT-policy drift requires
  // explicit reconciliation rather than silently weakening authentication.
  if(deployed?.some(f=>manifest.functions.find(m=>m.name===f.name)?.verifyJwt!==f.verifyJwt))add('DEPLOYED_FUNCTION_JWT_POLICY_DRIFT');
 }
 const pending=automatic.filter(m=>!seen.has(m.version));
 return {schemaVersion:1,sourceFingerprint:manifest.sourceFingerprint,projectRef:observed?.projectRef??null,status:blockers.length?'REFUSED':'REVIEWABLE_DRY_RUN',executionAllowed:false,activationAllowed:false,blockers:[...new Set(blockers)],remoteStatus:blockers.length?'UNKNOWN_OR_DRIFT':'INSPECTED_CONTENT_VERIFIED',pending:blockers.length?null:pending.map(m=>({path:m.path,version:m.version,sha256:m.sha256})),batches:blockers.length?null:manifest.batches.map(b=>({...b,migrations:b.migrations.filter(p=>pending.some(m=>m.path===p))})).filter(b=>b.migrations.length),edgeChanges:blockers.length?null:manifest.functions.filter(f=>!observed.deployedFunctions.data.some(d=>d.name===f.name&&d.closureSha256===f.closureSha256)).map(f=>({name:f.name,closureSha256:f.closureSha256})),preparedAutomaticPromotion:false};
}
function main(){const args=process.argv.slice(2),get=flag=>args[args.indexOf(flag)+1],read=flag=>args.includes(flag)?JSON.parse(readFileSync(get(flag),'utf8')):null;
 const observed=read('--observed'),reference=read('--reference');
 const manifest=read('--manifest')??buildManifest('.',reference?.sourceRef??'WORKING_TREE');
 for(const item of [...manifest.migrations,...manifest.artifacts])if(hash(readFileSync(item.path))!==item.sha256)throw Error(`LOCAL_SOURCE_DRIFT:${item.path}`);
 const result=plan(manifest,observed,reference);
 if(args.includes('--output')){mkdirSync(dirname(get('--output')),{recursive:true});writeFileSync(get('--output'),JSON.stringify(result,null,2)+'\n');}
 console.log(JSON.stringify(result,null,2));if(result.status==='REFUSED')process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();

