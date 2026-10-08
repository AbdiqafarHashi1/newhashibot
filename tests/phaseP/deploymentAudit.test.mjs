import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fingerprintFunction} from '../../scripts/phase-p/inspect-functions.mjs';
import {buildManifest,walk} from '../../scripts/phase-p/deployment-manifest.mjs';
import {lex,statements,inspectSql,hash} from '../../scripts/phase-p/sql-inventory.mjs';
import {compatibleSql,compatibility,compatibilityRepairs} from '../../scripts/phase-p/compatibility.mjs';
import {inspectionSql,parseCapture,schemaFingerprint,catalogQueries} from '../../scripts/phase-p/inspect-deployment.mjs';
import {plan} from '../../scripts/phase-p/plan-deployment.mjs';
import {audit} from '../../scripts/phase-p/audit-dependencies.mjs';
const manifest=buildManifest('.', '93eee3e8c3f40a1b67a04a10a6827056b553e8e3');
test('SQL lexer preserves dollar bodies, nested comments, identifiers and overload identities',()=>{
 const sql=`/* CREATE TABLE fake(x int); /* nested */ */\nCREATE TABLE real_table (id uuid, value text);\nCREATE POLICY "Own rows" ON real_table USING (true);\nCREATE OR REPLACE FUNCTION f(p_names text[] DEFAULT ARRAY['a,b','c'], p_limit integer DEFAULT 500) RETURNS integer LANGUAGE sql AS $fn$ SELECT 1; $fn$;\nSELECT 'not; a statement';`;
 assert.equal(statements(sql).length,4);const result=inspectSql(sql,'fixture.sql');
 assert.ok(!result.objects.some(o=>o.name.includes('fake')));assert.equal(result.objects.find(o=>o.kind==='policy').name,'Own rows');
 assert.deepEqual(result.objects.find(o=>o.kind==='function').argumentTypes,['text[]','integer']);assert.equal(result.columns.length,2);
 assert.throws(()=>lex('/* missing'),/UNTERMINATED/);assert.throws(()=>lex('$fn$ missing'),/UNTERMINATED/);
});
test('complete repository SQL coverage and original identities remain separated by scope',()=>{
 const expected=[...walk('supabase/migrations'),...walk('supabase/migration_archive'),...walk('v2/supabase/migrations'),...walk('tests'),...walk('docs/phase-p')].filter(p=>p.endsWith('.sql')).sort();
 assert.deepEqual(manifest.migrations.map(m=>m.path),expected);assert.equal(manifest.migrations.filter(m=>m.automaticCandidate).length,175);assert.equal(manifest.migrations.filter(m=>m.scope==='PREPARED_MANUAL').length,14);
 const original=readdirSync('supabase/migrations').filter(p=>p.endsWith('.sql')).sort().map(p=>`supabase/migrations/${p}`);
 assert.deepEqual(manifest.batches.flatMap(b=>b.migrations),original);assert.equal(manifest.timestampCollisions.length,0);
 for(const file of [...manifest.migrations,...manifest.artifacts])assert.equal(file.sha256,hash(readFileSync(file.path)),file.path);
 assert.ok(manifest.migrations.some(m=>m.scope==='ARCHIVE_NOT_DEPLOYABLE'));assert.ok(manifest.migrations.some(m=>m.scope==='ALTERNATE_V2_PROJECT'));
 assert.ok(manifest.functions.every(f=>f.remoteDeployed==='UNKNOWN_NOT_RECONCILED'));assert.ok(manifest.migrations.every(m=>m.remoteApplied==='UNKNOWN_NOT_RECONCILED'));
});
test('Edge dependency closures and prepared cron targets retain deployed boundary',()=>{
 const entries=readdirSync('supabase/functions',{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name!=='_shared').filter(e=>walk(`supabase/functions/${e.name}`).includes(`supabase/functions/${e.name}/index.ts`)).map(e=>e.name).sort();
 assert.deepEqual(manifest.functions.map(f=>f.name),entries);assert.equal(entries.length,34);
 assert.ok(manifest.functions.find(f=>f.name==='phase-p-workers').rpcs.includes('enqueue_phase_p_job'));
 assert.ok(manifest.cronDefinitions.some(c=>c.scope==='PREPARED_MANUAL'&&c.jobNameExpression==='hashibot_prod_scanner_5m'));
 assert.equal(manifest.cronDefinitions.filter(c=>c.endpointStatus.some(e=>!e.present)).length,0);
 assert.equal(manifest.activation.cron,false);assert.equal(manifest.activation.execution,false);
});
test('compatibility changes are exact, hash-bound and opt-in; unknown source/paths refuse',()=>{
 for(const repair of compatibilityRepairs){const source=readFileSync(repair.path,'utf8'),changed=compatibleSql(repair.path,source,compatibility.id);
  assert.equal(changed.sourceSha256,repair.sourceSha256);assert.equal(changed.sql,source.replaceAll(repair.original,repair.replacement));assert.equal(changed.identity,repair.path);
  assert.throws(()=>compatibleSql(repair.path,source+'\n',compatibility.id),/HASH_MISMATCH/);
 }
 assert.throws(()=>compatibleSql(compatibility.path,'', 'unknown'),/UNKNOWN/);
 const unchanged=manifest.migrations.find(m=>m.automaticCandidate&&!compatibilityRepairs.some(r=>r.path===m.path));const source=readFileSync(unchanged.path,'utf8');assert.deepEqual(compatibleSql(unchanged.path,source,compatibility.id),{sql:source,changed:false});
 assert.ok(!compatibilityRepairs.some(r=>r.replacement.includes('CASCADE')));
});
function planningFixture(){
 const m={...manifest,migrations:manifest.migrations.filter(x=>x.automaticCandidate).slice(0,3),functions:[manifest.functions[0]],batches:[{id:'one',migrations:manifest.migrations.filter(x=>x.automaticCandidate).slice(0,3).map(x=>x.path)}]};
 const sections=Object.fromEntries(Object.keys(catalogQueries).map(k=>[k,{status:'PRESENT',data:[]}]));
 sections.history={status:'PRESENT',data:[{version:m.migrations[0].version,name:'name alone is not authority',statementsFingerprint:'stored-definition-fingerprint'}]};
 for(const key of ['cron','storageBuckets','storageObjectCounts','vault'])sections[key]={status:'PRESENT',data:[]};
 const observed={status:'PASSED',consistency:'SINGLE_REPEATABLE_READ_TRANSACTION',projectRef:'fixture',sections,schemaFingerprint:schemaFingerprint(sections),deployedFunctions:{status:'VERIFIED_ARTIFACT_FINGERPRINTS',data:[{name:m.functions[0].name,closureSha256:m.functions[0].closureSha256,verifyJwt:m.functions[0].verifyJwt}]}};
 const reference={reviewed:true,fullChainStatus:'PASSED',sourceRef:m.sourceRef,sourceFingerprint:m.sourceFingerprint,projectRef:'fixture',connectionBinding:{reviewed:true,projectRef:'fixture',schemaFingerprint:observed.schemaFingerprint},appliedVersions:sections.history.data.map(r=>r.version),snapshot:structuredClone(observed),historyProof:[{version:m.migrations[0].version,sourceSha256:m.migrations[0].sha256,statementsFingerprint:sections.history.data[0].statementsFingerprint,reviewed:true}]};
 return {m,observed,reference};
}
test('planner only returns a non-executable review plan after all independent evidence agrees',()=>{
 const {m,observed,reference}=planningFixture(),result=plan(m,observed,reference);assert.equal(result.status,'REVIEWABLE_DRY_RUN');assert.equal(result.pending.length,2);assert.equal(result.executionAllowed,false);assert.equal(result.activationAllowed,false);assert.equal(result.preparedAutomaticPromotion,false);
 assert.equal(plan(m,null,null).status,'REFUSED');assert.equal(plan(m,null,null).pending,null);
});
test('planner rejects name-only history, unknown/duplicate/non-prefix identities and source drift',()=>{
 for(const mutate of [
  ({observed})=>observed.sections.history.data[0].statementsFingerprint=null,
  ({observed})=>observed.sections.history.data[0].version='unknown',
  ({observed})=>observed.sections.history.data.push({...observed.sections.history.data[0]}),
  ({m,observed})=>observed.sections.history.data[0].version=m.migrations[1].version,
  ({reference})=>reference.historyProof[0].sourceSha256='different-source',
  ({reference})=>reference.sourceFingerprint='changed-closure',
  ({reference})=>reference.reviewed=false,
 ]){const fixture=planningFixture();mutate(fixture);assert.equal(plan(fixture.m,fixture.observed,fixture.reference).status,'REFUSED');}
});
test('planner rejects grant/RLS/RPC definition drift, partial rehearsals and function source unknown',()=>{
 for(const key of ['relations','routines','grants','policies','constraints']){const {m,observed,reference}=planningFixture();observed.sections[key].data.push({drift:key});observed.schemaFingerprint=schemaFingerprint(observed.sections);assert.ok(plan(m,observed,reference).blockers.includes('SCHEMA_DEFINITION_OR_ACL_DRIFT'));}
 const fixture=planningFixture();fixture.reference.fullChainStatus='BLOCKED';fixture.observed.deployedFunctions.status='PRESENT_METADATA_ONLY';const result=plan(fixture.m,fixture.observed,fixture.reference);assert.ok(result.blockers.includes('FULL_CHAIN_REHEARSAL_NOT_PASSED'));assert.ok(result.blockers.includes('DEPLOYED_FUNCTION_SOURCE_UNKNOWN'));
});
test('inspection is one read-only catalog transaction and never exports plaintext secrets or bodies',()=>{
 const sql=inspectionSql();assert.ok(sql.startsWith('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;'));assert.ok(sql.endsWith('COMMIT;'));
 assert.ok(!/decrypted_secret|vault\.decrypted_secrets|SELECT\s+\*|\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(sql));
 assert.ok(sql.includes('md5(pg_get_functiondef'));assert.ok(sql.includes('md5(command)'));assert.ok(sql.includes("to_regclass('vault.secrets')"));
 const output=Object.keys(catalogQueries).map(key=>JSON.stringify({key,status:'PRESENT',data:[]})).join('\n');assert.equal(parseCapture(output).consistency,'SINGLE_REPEATABLE_READ_TRANSACTION');
});
test('each overlap has source classification; genuine return change differs from explicit compatibility',()=>{
 const result=audit(manifest),reset=result.overlaps.find(o=>o.identity==='function::public.admin_reset_trading_history:[]');assert.ok(reset.transitions.some(t=>t.classification==='GENUINE_RETURN_TYPE_DEFECT'));
 const onboarding=result.overlaps.find(o=>o.identity.startsWith('function::public.onboard_execution_account:'));assert.ok(onboarding.transitions.some(t=>t.classification==='INTENTIONAL_REPLACEMENT'));
 assert.ok(result.overlaps.every(o=>o.transitions.every(t=>t.classification&&t.explanation&&t.next.sha256)));
 assert.ok(result.findings.some(f=>f.id==='M050_STATUS_CONSTRAINT'));assert.equal(result.remoteAppliedPending,'UNKNOWN');
});
test('deployed-function fingerprint includes shared imports and refuses missing/dynamic modules',()=>{
 const root=mkdtempSync(join(tmpdir(),'hashibot-function-fingerprint-'));
 try{const dir=join(root,'supabase/functions/test-function'),shared=join(root,'supabase/functions/_shared');mkdirSync(dir,{recursive:true});mkdirSync(shared,{recursive:true});writeFileSync(join(dir,'index.ts'),"import {value} from '../_shared/value.ts'; export {value};");writeFileSync(join(shared,'value.ts'),'export const value=1;');
  const first=fingerprintFunction(root,'test-function');assert.equal(first.status,'CAPTURED_SOURCE_CLOSURE');assert.equal(first.files.length,2);
  writeFileSync(join(shared,'value.ts'),'export const value=2;');assert.notEqual(fingerprintFunction(root,'test-function').closureSha256,first.closureSha256);
  rmSync(join(shared,'value.ts'));assert.equal(fingerprintFunction(root,'test-function').status,'AMBIGUOUS_SOURCE_CLOSURE');
  writeFileSync(join(dir,'index.ts'),'export async function load(name){return import(name)}');assert.equal(fingerprintFunction(root,'test-function').status,'AMBIGUOUS_SOURCE_CLOSURE');
 }finally{rmSync(root,{recursive:true,force:true});}
});
